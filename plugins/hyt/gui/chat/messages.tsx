import type { Context } from "@opencode/plugin/gui"
import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js"
import type { MergeItemRow, MessageRow, ReceiptPerson, ReceiptView } from "./contract.js"
import { text } from "./i18n.js"
import type { MenuTarget } from "./menu.js"
import { Face } from "./avatar.js"
import { CLAMP_AT, clockOf, dayLabel, sizeOf } from "./util.js"

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "system"; key: string; body: string }
  | { kind: "divider"; key: string; label: string }
  | { kind: "message"; key: string; message: MessageRow; grouped: boolean; self: boolean }

/**
 * 消息流。
 *
 * 三条设计约束：
 * - 默认贴底，用户往上翻的时候不抢滚动位置；只有原本就在底部才跟随新消息。
 * - 连续同一个人 5 分钟内的消息并成一组，头像与名字只出现一次。
 * - 进入会话时的第一条未读前面画一道分界，之后 4 秒轮询不会把它重算掉。
 */
export function MessageStream(props: {
  ctx: Context
  messages: readonly MessageRow[]
  hasMore: boolean
  newMessageId: number
  loadingMore: boolean
  focusId: number | undefined
  onFocusDone: () => void
  onLatest: () => void
  onLoadMore: () => void
  avatars: Record<string, string>
  /** 当前会话 id：取回执名单要用。 */
  sessionId: string
  /** 回执版本号：收到新回执就变，弹窗据此重新取名单。 */
  receiptVersion: number
  onReceipts: (input: { sessionId: string; msgId: string; createdAt: number; retry?: boolean }) => Promise<ReceiptView>
  onMedia: (path: string) => Promise<string>
  onMerge: (path: string) => Promise<{ items: readonly MergeItemRow[]; error: string }>
  onOpenFile: (path: string) => void
  onOpenImage: (path: string) => void
  /** 右键消息：复制、看发送者资料。 */
  onMenu: (message: MessageRow, target: MenuTarget) => void
  /** 点发送者头像：资料卡片。 */
  onProfile: (message: MessageRow, element: HTMLElement) => void
  /** 右键发送者头像：资料 / 发消息 / 复制账号。 */
  onPersonMenu: (message: MessageRow, target: MenuTarget) => void
}) {
  let stream: HTMLDivElement | undefined
  const [atBottom, setAtBottom] = createSignal(true)
  /** 打开回执弹窗的那条消息；空表示弹窗关闭。 */
  const [receiptOf, setReceiptOf] = createSignal<MessageRow>()
  // 换了会话，原来那条消息的回执名单就不再属于当前视图，直接关掉弹窗。
  let lastSession = props.sessionId
  createEffect(() => {
    if (props.sessionId === lastSession) return
    lastSession = props.sessionId
    setReceiptOf(undefined)
  })

  const scrollToBottom = () => {
    if (stream === undefined) return
    stream.scrollTop = stream.scrollHeight
    setAtBottom(true)
  }

  const nearBottom = () => {
    if (stream === undefined) return true
    return stream.scrollHeight - stream.scrollTop - stream.clientHeight < 48
  }

  onMount(() => {
    scrollToBottom()
  })

  // 只认「首尾 id + 条数」：轮询每次都推来新对象，按数组身份会一直重滚。
  const signature = createMemo(() => {
    const list = props.messages
    return `${list.length}:${list[0]?.id ?? 0}:${list[list.length - 1]?.id ?? 0}:${props.hasMore}`
  })

  createEffect(() => {
    signature()
    if (atBottom()) scrollToBottom()
  })

  createEffect(() => {
    const id = props.focusId
    if (id === undefined) return
    const target = stream?.querySelector<HTMLElement>(`[data-mid="${id}"]`)
    if (target !== null && target !== undefined) {
      target.scrollIntoView({ block: "center" })
      target.dataset.flash = "true"
      window.setTimeout(() => {
        target.dataset.flash = "false"
      }, 1_700)
      setAtBottom(false)
    }
    props.onFocusDone()
  })

  const rows = createMemo(() => {
    const out: Row[] = []
    let lastDay = ""
    let previous: MessageRow | undefined
    for (const message of props.messages) {
      const day = dayLabel(props.ctx, message.createdAt)
      if (day !== lastDay) {
        out.push({ kind: "day", key: `day:${message.createdAt}`, label: day })
        lastDay = day
        previous = undefined
      }

      if (props.newMessageId > 0 && message.id === props.newMessageId) {
        const count = props.messages.filter((item) => item.id >= props.newMessageId).length
        out.push({
          kind: "divider",
          key: `divider:${message.id}`,
          label: text(props.ctx, "hyt.chat.messages.divider", { count }),
        })
        previous = undefined
      }

      if (message.kind === "recall" || message.kind === "notice") {
        out.push({ kind: "system", key: `sys:${message.id}`, body: systemLine(props.ctx, message) })
        previous = undefined
        continue
      }

      const grouped =
        previous !== undefined &&
        !message.outgoing &&
        previous.sender === message.sender &&
        message.createdAt - previous.createdAt <= 5 * 60_000
      out.push({ kind: "message", key: `msg:${message.id}`, message, grouped, self: message.outgoing })
      previous = message
    }
    return out
  })

  return (
    <>
      <div class="stream-wrap">
        <div
          class="stream"
          ref={stream}
          role="log"
          aria-live="polite"
          aria-label={text(props.ctx, "hyt.chat.side.title")}
          onScroll={() => setAtBottom(nearBottom())}
        >
          <div class="flow">
            <Show when={props.hasMore}>
              <button class="more" type="button" disabled={props.loadingMore} onClick={() => props.onLoadMore()}>
                {props.loadingMore
                  ? text(props.ctx, "hyt.chat.messages.loadingMore")
                  : text(props.ctx, "hyt.chat.messages.loadMore")}
              </button>
            </Show>

            <Show when={props.messages.length === 0}>
              <p class="system">{text(props.ctx, "hyt.chat.messages.empty")}</p>
            </Show>

            <For each={rows()}>
              {(row) => {
                if (row.kind === "day") return <div class="stamp">{row.label}</div>
                if (row.kind === "divider") return <div class="divider">{row.label}</div>
                if (row.kind === "system") return <p class="system">{row.body}</p>
                return (
                  <Message
                    ctx={props.ctx}
                    message={row.message}
                    grouped={row.grouped}
                    self={row.self}
                    avatars={props.avatars}
                    onMedia={props.onMedia}
                    onMerge={props.onMerge}
                    onOpenFile={props.onOpenFile}
                    onOpenImage={props.onOpenImage}
                    onMenu={props.onMenu}
                    onProfile={props.onProfile}
                    onPersonMenu={props.onPersonMenu}
                    onReceipt={() => setReceiptOf(row.message)}
                  />
                )
              }}
            </For>
          </div>
        </div>

        <Show when={!atBottom()}>
          <button
            class="jump"
            type="button"
            onClick={() => {
              scrollToBottom()
              props.onLatest()
            }}
          >
            {text(props.ctx, "hyt.chat.jump.latest")}
          </button>
        </Show>
      </div>

      <Show when={receiptOf()}>
        {(message) => (
          <ReceiptDialog
            ctx={props.ctx}
            sessionId={props.sessionId}
            message={message()}
            version={props.receiptVersion}
            onFetch={props.onReceipts}
            onClose={() => setReceiptOf(undefined)}
          />
        )}
      </Show>
    </>
  )
}

/** 一条消息：按类型挑气泡、胶囊、文件卡或合并转发。 */
function Message(props: {
  ctx: Context
  message: MessageRow
  grouped: boolean
  self: boolean
  avatars: Record<string, string>
  onMedia: (path: string) => Promise<string>
  onMerge: (path: string) => Promise<{ items: readonly MergeItemRow[]; error: string }>
  onOpenFile: (path: string) => void
  onOpenImage: (path: string) => void
  onMenu: (message: MessageRow, target: MenuTarget) => void
  onProfile: (message: MessageRow, element: HTMLElement) => void
  onPersonMenu: (message: MessageRow, target: MenuTarget) => void
  /** 打开这条消息的已读回执弹窗。 */
  onReceipt: () => void
}) {
  const [expanded, setExpanded] = createSignal(false)
  const [merge, setMerge] = createSignal<{ items: readonly MergeItemRow[]; error: string } | undefined>()
  const [merging, setMerging] = createSignal(false)

  const body = () => props.message.text.trim()
  const clamped = () => body().length > CLAMP_AT && !expanded()
  const long = () => body().length > CLAMP_AT

  const openMerge = async () => {
    if (merging()) return
    if (merge() !== undefined) {
      setMerge(undefined)
      return
    }
    setMerging(true)
    setMerge(await props.onMerge(props.message.filePath))
    setMerging(false)
  }

  return (
    <div
      class="msg"
      data-mid={props.message.id}
      data-grouped={props.grouped ? "true" : undefined}
      data-self={props.self ? "true" : undefined}
      tabIndex={0}
      onContextMenu={(event) => props.onMenu(props.message, event)}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault()
          props.onMenu(props.message, event.currentTarget)
        }
      }}
    >
      <Show when={!props.self}>
        {/* 头像单独响应点击与右键；键盘用户先聚焦它，再按 Shift+F10。 */}
        <button
          class="msg-face-btn"
          type="button"
          aria-label={props.message.senderNick || props.message.sender}
          onClick={(event) => props.onProfile(props.message, event.currentTarget)}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            props.onPersonMenu(props.message, event)
          }}
          onKeyDown={(event) => {
            if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
              event.preventDefault()
              event.stopPropagation()
              props.onPersonMenu(props.message, event.currentTarget)
            }
          }}
        >
          <Face
            class="msg-face"
            name={props.message.senderNick || props.message.sender}
            src={avatarOf(props.avatars, props.message.senderHead)}
          />
        </button>
      </Show>
      <div class="msg-body">
        <Show when={!props.grouped}>
          <div class="msg-meta">
            <span class="msg-name">
              {props.self
                ? text(props.ctx, "hyt.chat.msg.self")
                : props.message.senderNick || props.message.sender}
            </span>
            <span class="msg-time">{clockOf(props.message.createdAt)}</span>
          </div>
        </Show>

        <Show when={props.message.kind === "text"}>
          <div
            class="bubble"
            classList={{ "bubble--block": long(), "bubble--prose": long() }}
          >
            <span class="bubble-text" data-clamped={clamped() ? "true" : undefined}>
              <Rich ctx={props.ctx} body={body()} names={props.message.atNames} atMe={props.message.atMe} />
            </span>
            <Show when={long()}>
              <button class="expand" type="button" onClick={() => setExpanded(!expanded())}>
                {expanded()
                  ? text(props.ctx, "hyt.chat.msg.collapse")
                  : text(props.ctx, "hyt.chat.msg.expandLong", { count: body().length })}
              </button>
            </Show>
          </div>
        </Show>

        <Show when={props.message.kind === "image"}>
          <div class="bubble bubble--block bubble--w">
            <Show when={body().length > 0}>
              <Rich ctx={props.ctx} body={body()} names={props.message.atNames} atMe={props.message.atMe} />
            </Show>
            <div class="shots">
              <Shot
                ctx={props.ctx}
                path={props.message.filePath}
                onMedia={props.onMedia}
                onOpen={props.onOpenImage}
              />
            </div>
          </div>
        </Show>

        <Show when={props.message.kind === "file"}>
          <div class="bubble bubble--block bubble--w">
            <Show when={body().length > 0}>
              <Rich ctx={props.ctx} body={body()} names={props.message.atNames} atMe={props.message.atMe} />
            </Show>
            <div class="file">
              <span class="file-mark" aria-hidden="true">
                {fileMark(props.message.fileName)}
              </span>
              <span class="file-text">
                <span class="file-name">{props.message.fileName || body() || text(props.ctx, "hyt.chat.msg.file.open")}</span>
                <span class="file-size">{fileMeta(props.ctx, props.message)}</span>
              </span>
            </div>
          </div>
        </Show>

        <Show when={props.message.kind === "voice" || props.message.kind === "video" || props.message.kind === "call"}>
          <div class="capsule">
            <Show when={props.message.kind === "voice"}>
              <span class="wave" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
            </Show>
            <span>{capsuleLabel(props.ctx, props.message.kind)}</span>
            <Show
              when={props.message.filePath.length > 0}
              fallback={<span class="hint">{text(props.ctx, "hyt.chat.msg.clientOnly")}</span>}
            >
              <button type="button" onClick={() => props.onOpenFile(props.message.filePath)}>
                {text(props.ctx, "hyt.chat.msg.reveal")}
              </button>
            </Show>
          </div>
        </Show>

        <Show when={props.message.kind === "merge"}>
          <button class="merge-card" type="button" onClick={() => void openMerge()}>
            <span class="merge-title">
              {merging()
                ? text(props.ctx, "hyt.chat.messages.loadingMore")
                : merge() === undefined
                  ? text(props.ctx, "hyt.chat.msg.merge")
                  : text(props.ctx, "hyt.chat.msg.merge.count", { count: merge()!.items.length })}
            </span>
            <span class="merge-text">{props.message.text || props.message.fileName}</span>
          </button>
          <Show when={merge()}>
            {(value) => (
              <Show when={value().error.length === 0} fallback={<p class="merge-error">{value().error}</p>}>
                <div class="merge-list">
                  <Show
                    when={value().items.length > 0}
                    fallback={<span class="merge-error">{text(props.ctx, "hyt.chat.msg.merge.empty")}</span>}
                  >
                    <For each={value().items}>
                      {(item) => (
                        <div class="merge-item">
                          <b>{item.account}</b>
                          <span>
                            {item.kind === "image" ? text(props.ctx, "hyt.chat.msg.merge.image") : item.content}
                          </span>
                        </div>
                      )}
                    </For>
                  </Show>
                </div>
              </Show>
            )}
          </Show>
        </Show>

        <Show when={props.message.kind === "other"}>
          <div class="unknown">
            {text(props.ctx, "hyt.chat.msg.unsupported")}
            <Show when={body().length > 0}>
              <b> · {body()}</b>
            </Show>
          </div>
        </Show>

        {/* 回执：只有自己发出的消息挂一行；它是常驻说明，不是悬浮工具栏。 */}
        <Show when={props.message.receipt}>
          {(receipt) => (
            <button
              class="receipt-line"
              type="button"
              disabled={!receipt().available}
              title={receipt().available ? text(props.ctx, "hyt.chat.receipt.title") : text(props.ctx, "hyt.chat.receipt.unavailable.hint")}
              onClick={() => props.onReceipt()}
            >
              <ReceiptLabel ctx={props.ctx} value={receipt()} />
            </button>
          )}
        </Show>
      </div>
    </div>
  )
}

/** 回执入口的一行文案：群聊报人数，单聊报状态，拿不到就直说拿不到。 */
function ReceiptLabel(props: {
  ctx: Context
  value: { available: boolean; group: boolean; read: number; unread: number }
}) {
  return (
    <Show
      when={props.value.available}
      fallback={<>{text(props.ctx, "hyt.chat.receipt.unavailable")}</>}
    >
      <Show
        when={props.value.group}
        fallback={
          <>{text(props.ctx, props.value.read > 0 ? "hyt.chat.receipt.direct.read" : "hyt.chat.receipt.direct.unread")}</>
        }
      >
        <Show
          when={props.value.read > 0}
          fallback={
            <>
              {text(props.ctx, "hyt.chat.receipt.none")}
              {props.value.unread > 0
                ? ` · ${text(props.ctx, "hyt.chat.receipt.unread", { count: props.value.unread })}`
                : ""}
            </>
          }
        >
          <b>{text(props.ctx, "hyt.chat.receipt.read", { count: props.value.read })}</b>
          {props.value.unread > 0
            ? ` · ${text(props.ctx, "hyt.chat.receipt.unread", { count: props.value.unread })}`
            : ""}
        </Show>
      </Show>
    </Show>
  )
}

/**
 * 已读回执弹窗：未读在上、已读在下，都带头像与名字；已读区带时间。
 *
 * 打开期间收到新回执只合并、不重排：同账号的人沿用上一次的对象，
 * `For` 不会重建已经渲染的行，未读的人挪到已读段时也只会移动这一条。
 */
function ReceiptDialog(props: {
  ctx: Context
  sessionId: string
  message: MessageRow
  /** 回执版本号：变一次就重新取一次名单。 */
  version: number
  onFetch: (input: { sessionId: string; msgId: string; createdAt: number; retry?: boolean }) => Promise<ReceiptView>
  onClose: () => void
}) {
  const [data, setData] = createSignal<ReceiptView>()
  const [query, setQuery] = createSignal("")
  const [error, setError] = createSignal("")
  const [retrying, setRetrying] = createSignal(false)
  let dialog: HTMLDivElement | undefined

  const apply = (next: ReceiptView) => {
    const previous = data()
    if (previous === undefined) {
      setData(next)
      return
    }
    const known = new Map([...previous.read, ...previous.unread].map((person) => [person.account, person]))
    const keep = (list: readonly ReceiptPerson[]) => list.map((person) => known.get(person.account) ?? person)
    setData({ ...next, read: keep(next.read), unread: keep(next.unread) })
  }

  const fetch = (retry: boolean) => {
    setRetrying(true)
    void props.onFetch({
      sessionId: props.sessionId,
      msgId: props.message.msgId,
      createdAt: props.message.createdAt,
      retry,
    })
      .then((next) => {
        apply(next)
        setError("")
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .then(() => setRetrying(false))
  }

  createEffect(() => {
    // 只依赖版本号与消息 id：轮询推来的新对象不该让弹窗重新请求。
    void props.version
    void props.message.msgId
    fetch(false)
  })

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose()
    }
    window.addEventListener("keydown", onKey)
    onCleanup(() => window.removeEventListener("keydown", onKey))
    dialog?.focus()
  })

  const matches = (person: ReceiptPerson) => {
    const needle = query().trim().toLowerCase()
    if (needle.length === 0) return true
    return person.name.toLowerCase().includes(needle) || person.account.toLowerCase().includes(needle)
  }

  const people = (list: readonly ReceiptPerson[], unread: boolean) => (
    <ul class="people">
      <For each={list}>
        {(person) => (
          <li data-unread={unread ? "true" : undefined}>
            <Face class="pface" name={person.name} />
            <span class="pname">{person.name}</span>
            <span class="pside">
              {unread ? text(props.ctx, "hyt.chat.receipt.unreadTag") : clockOf(person.at)}
            </span>
          </li>
        )}
      </For>
    </ul>
  )

  return (
    <div
      class="receipt-veil"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <div
        class="receipt"
        role="dialog"
        aria-modal="true"
        aria-label={text(props.ctx, "hyt.chat.receipt.title")}
        tabIndex={-1}
        ref={dialog}
      >
        <div class="receipt-head">
          <strong>{text(props.ctx, "hyt.chat.receipt.title")}</strong>
          <Show when={data()}>
            {(view) => (
              <span class="sum">
                <ReceiptLabel
                  ctx={props.ctx}
                  value={{
                    available: view().available,
                    group: view().group,
                    read: view().read.length,
                    unread: view().unread.length,
                  }}
                />
              </span>
            )}
          </Show>
          <button class="x" type="button" aria-label={text(props.ctx, "hyt.chat.receipt.close")} onClick={props.onClose}>
            ×
          </button>
        </div>

        <Show
          when={data()}
          fallback={
            <p class="receipt-state">
              {error().length > 0 ? error() : text(props.ctx, "hyt.chat.receipt.loading")}
            </p>
          }
        >
          {(view) => (
            <Show
              when={view().available}
              fallback={
                <div class="receipt-state">
                  <p>{text(props.ctx, "hyt.chat.receipt.unavailable.hint")}</p>
                  <button class="receipt-retry" type="button" disabled={retrying()} onClick={() => fetch(true)}>
                    {retrying() ? text(props.ctx, "hyt.chat.receipt.loading") : text(props.ctx, "hyt.chat.receipt.retry")}
                  </button>
                </div>
              }
            >
              <Show when={view().group && view().read.length + view().unread.length > 6}>
                <input
                  class="receipt-search"
                  type="search"
                  value={query()}
                  placeholder={text(props.ctx, "hyt.chat.receipt.search")}
                  aria-label={text(props.ctx, "hyt.chat.receipt.search")}
                  onInput={(event) => setQuery(event.currentTarget.value)}
                />
              </Show>

              <div class="receipt-body">
                <Show when={view().unread.filter(matches).length > 0}>
                  <p class="pgroup">{text(props.ctx, "hyt.chat.receipt.group.unread", { count: view().unread.length })}</p>
                  {people(view().unread.filter(matches), true)}
                </Show>
                <Show when={view().read.filter(matches).length > 0}>
                  <p class="pgroup">{text(props.ctx, "hyt.chat.receipt.group.read", { count: view().read.length })}</p>
                  {people(view().read.filter(matches), false)}
                </Show>
                <Show when={view().read.filter(matches).length + view().unread.filter(matches).length === 0}>
                  <p class="receipt-state">
                    {query().trim().length > 0
                      ? text(props.ctx, "hyt.chat.receipt.noMatch")
                      : text(props.ctx, "hyt.chat.receipt.empty")}
                  </p>
                </Show>
              </div>

              <p class="receipt-foot">
                {view().group
                  ? text(props.ctx, "hyt.chat.receipt.foot")
                  : text(props.ctx, "hyt.chat.receipt.direct.foot")}
              </p>
            </Show>
          )}
        </Show>
      </div>
    </div>
  )
}

/** 正文里的 @ 高亮：@我 的整块先涂红，其余按 atNames 逐个匹配。 */
function Rich(props: { ctx: Context; body: string; names: readonly string[]; atMe: boolean }) {
  const parts = createMemo(() => {
    const names = props.names.filter((name) => name.length > 0)
    const needles = names.map((name) => `@${name}`)
    if (props.atMe && !needles.some((needle) => props.body.includes(needle))) needles.push("@所有人")
    if (needles.length === 0) return [{ body: props.body, at: false }]
    const pattern = new RegExp(`(${needles.map(escapeRegExp).join("|")})`, "g")
    return props.body
      .split(pattern)
      .filter((part) => part.length > 0)
      .map((part) => ({ body: part, at: needles.includes(part) }))
  })

  return (
    <>
      <For each={parts()}>
        {(part) => (part.at ? <span class="at">{part.body}</span> : <>{part.body}</>)}
      </For>
    </>
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** 图片格子：读本地文件，读不到就退回设计稿里的色块占位。 */
function Shot(props: {
  ctx: Context
  path: string
  onMedia: (path: string) => Promise<string>
  onOpen: (path: string) => void
}) {
  const [src] = createResource(() => props.path, props.onMedia)
  /** 读到了地址但解码失败：一样退回色块，不要浏览器默认的破图图标。 */
  const [broken, setBroken] = createSignal(false)
  createEffect(() => {
    src()
    setBroken(false)
  })

  return (
    <button
      class="shot"
      type="button"
      aria-label={text(props.ctx, "hyt.chat.msg.image.open")}
      data-hue="a"
      disabled={props.path.length === 0}
      onClick={() => props.onOpen(props.path)}
    >
      <Show when={src() !== undefined && !broken()} fallback={text(props.ctx, "hyt.chat.msg.image.missing")}>
        <img src={src()} alt="" onError={() => setBroken(true)} />
      </Show>
    </button>
  )
}

function avatarOf(map: Record<string, string>, path: string) {
  if (path.length === 0) return undefined
  const value = map[path]
  return value === undefined || value.length === 0 ? undefined : value
}

function fileMark(name: string) {
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : ""
  if (extension.length === 0) return "件"
  const labels: Readonly<Record<string, string>> = {
    xlsx: "表",
    xls: "表",
    csv: "表",
    doc: "文",
    docx: "文",
    pdf: "PDF",
    ppt: "演",
    pptx: "演",
    zip: "包",
    rar: "包",
    png: "图",
    jpg: "图",
    jpeg: "图",
  }
  return labels[extension] ?? extension.slice(0, 3).toUpperCase()
}

function fileMeta(ctx: Context, message: MessageRow) {
  const size = sizeOf(message.fileSize)
  const sender = message.outgoing ? text(ctx, "hyt.chat.msg.self") : message.senderNick
  return [size, sender, clockOf(message.createdAt)].filter((part) => part.length > 0).join(" · ")
}

function capsuleLabel(ctx: Context, kind: MessageRow["kind"]) {
  if (kind === "voice") return text(ctx, "hyt.chat.msg.voice.short")
  if (kind === "video") return text(ctx, "hyt.chat.msg.video.short")
  return text(ctx, "hyt.chat.msg.call.short")
}

function systemLine(ctx: Context, message: MessageRow) {
  if (message.kind === "notice") return message.text
  const name = message.outgoing ? text(ctx, "hyt.chat.msg.self") : message.senderNick || message.sender
  return text(ctx, "hyt.chat.msg.recallBy", { name })
}
