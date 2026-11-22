import type { Context } from "@opencode/plugin/gui"
import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { Avatar } from "./avatar.js"
import type { ChatStatus, DraftRow, MemberRow, MergeItemRow, MessageRow, SessionRow } from "./contract.js"
import { text } from "./i18n.js"
import { dayBucket, formatClock, formatDay, formatSize, reuseRows, splitMentions } from "./util.js"

export interface MergeResult {
  readonly items: readonly MergeItemRow[]
  readonly error: string
}

/**
 * 中栏：会话头、消息流（最新在底部）、AI 草稿卡、图片查看器。
 *
 * 滚动策略：切换会话或收到新消息时，只要不在往回翻，就贴住最新一条；
 * 往回翻超过一屏时露出一颗「回到最新」。
 */
export function MessageStream(props: {
  ctx: Context
  status: ChatStatus
  session: SessionRow | undefined
  messages: readonly MessageRow[]
  members: readonly MemberRow[]
  draft: DraftRow | undefined
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  /** 从搜索结果进来的目标消息 id：滚到它并短暂高亮。 */
  focusId?: number
  onUseDraft: (body: string) => void
  onRefresh: () => void
  onFocusSearch: () => void
  infoOpen: boolean
  onToggleInfo: () => void
  avatars: Readonly<Record<string, string>>
  onMedia: (path: string) => Promise<{ dataUrl: string; error: string }>
  onMerge: (path: string) => Promise<MergeResult>
}) {
  const ctx = props.ctx
  const [viewer, setViewer] = createSignal<string | undefined>()
  const [away, setAway] = createSignal(false)
  let scroller: HTMLDivElement | undefined
  let observer: IntersectionObserver | undefined
  // 宿主可以重新求值 bundle 并销毁旧的 owner，而已经排队的 observer 回调仍会跑一次。这时的 props 已不是这份
  // 组件实例的，读取到的回调可能不存在，所以既要在销毁后停手，也不能假定回调一定在。
  let disposed = false
  // 相邻同内容系统通知合并成一条，避免连续通知把中栏淹掉。
  // 轮询每次推新对象，内容没变就复用旧引用，否则整段消息会重建、图片重新加载（闪屏）。
  let stableEntries: readonly { message: MessageRow; repeat: number }[] = []
  const entries = createMemo(() => {
    stableEntries = reuseRows(stableEntries, collapseSystem(props.messages), (entry) => entry.message.id)
    return stableEntries
  })
  const todayCount = () => props.messages.filter((message) => dayBucket(message.createdAt) === "today").length

  const scrollToEnd = (smooth: boolean) => {
    requestAnimationFrame(() => {
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? "smooth" : "auto" })
    })
  }

  let lastSession = ""
  createEffect(() => {
    const id = props.session?.id ?? ""
    const count = props.messages.length
    if (id !== lastSession) {
      lastSession = id
      setAway(false)
      scrollToEnd(false)
      return
    }
    if (count > 0 && !away()) scrollToEnd(false)
  })

  // 从搜索结果进来时滚到命中的那条。目标不在已加载范围就继续往前翻，最多 12 次，避免无限加载。
  let focused = -1
  let focusTries = 0
  createEffect(() => {
    const id = props.focusId
    if (id === undefined || id === focused) return
    const rows = props.messages
    if (rows.length === 0 || props.session === undefined || scroller === undefined) return
    const target = scroller.querySelector<HTMLElement>(`[data-message-id="${id}"]`)
    if (target !== null) {
      focused = id
      focusTries = 0
      target.scrollIntoView({ block: "center", behavior: "smooth" })
      target.setAttribute("data-focus", "true")
      window.setTimeout(() => target.removeAttribute("data-focus"), 1800)
      return
    }
    if (props.hasMore && !props.loadingMore && focusTries < 12) {
      focusTries += 1
      props.onLoadMore()
    }
  })

  const attachSentinel = (element: HTMLDivElement) => {
    observer?.disconnect()
    observer = new IntersectionObserver(
      (records) => {
        if (disposed) return
        if (records.some((record) => record.isIntersecting) && props.hasMore && !props.loadingMore) props.onLoadMore?.()
      },
      { root: element.closest(".hyt-chat-messages"), rootMargin: "160px 0px 0px 0px" },
    )
    observer.observe(element)
  }
  onCleanup(() => {
    disposed = true
    observer?.disconnect()
  })

  const onScroll = (element: HTMLDivElement) => {
    setAway(element.scrollHeight - element.scrollTop - element.clientHeight > 480)
  }

  const department = (account: string) => {
    const member = props.members.find((item) => item.account === account)
    return member?.department ?? ""
  }

  return (
    <>
      <header class="hyt-chat-head">
        <div class="hyt-chat-head-id">
          <div class="hyt-chat-head-title">
            <span class="hyt-chat-head-name">{props.session?.name ?? text(ctx, "hyt.chat.title")}</span>
            <Show when={props.session !== undefined}>
              <span class="hyt-chat-pill">
                {props.session!.group ? text(ctx, "hyt.chat.sessions.groups") : text(ctx, "hyt.chat.sessions.direct")}
              </span>
            </Show>
            <Show when={props.status.autopilot}>
              <span class="hyt-chat-ai-inline">
                <ctx.ui.Icon name="brain" size="small" />
                {text(ctx, "hyt.chat.head.ai")}
              </span>
            </Show>
          </div>
          <div class="hyt-chat-head-sub">
            <Show
              when={props.session !== undefined}
              fallback={<span>{text(ctx, "hyt.chat.messages.pick")}</span>}
            >
              <span class="hyt-chat-live-dot" aria-hidden="true" />
              <span>{text(ctx, "hyt.chat.head.messages", { count: todayCount() })}</span>
              <Show when={props.status.bridge === "missing"}>
                <span>·</span>
                <span>{text(ctx, "hyt.chat.status.bridge.missing")}</span>
              </Show>
            </Show>
          </div>
        </div>
        <div class="hyt-chat-head-actions">
          <button
            type="button"
            class="hyt-icon-button"
            aria-label={text(ctx, "hyt.chat.head.info")}
            title={text(ctx, "hyt.chat.head.info")}
            aria-expanded={props.infoOpen ? "true" : "false"}
            onClick={() => props.onToggleInfo()}
          >
            <ctx.ui.Icon name="info" size="small" />
          </button>
          <button
            type="button"
            class="hyt-icon-button"
            aria-label={text(ctx, "hyt.chat.search.label")}
            title={text(ctx, "hyt.chat.search.label")}
            onClick={() => props.onFocusSearch()}
          >
            <ctx.ui.Icon name="magnifying-glass" size="small" />
          </button>
          <button
            type="button"
            class="hyt-icon-button"
            aria-label={text(ctx, "hyt.chat.action.refresh")}
            title={text(ctx, "hyt.chat.action.refresh")}
            onClick={() => props.onRefresh()}
          >
            <ctx.ui.Icon name="refresh" size="small" />
          </button>
        </div>
      </header>

      <Show
        when={props.session !== undefined}
        fallback={
          <div class="hyt-chat-empty">
            <div class="hyt-chat-empty-card">
              <span class="hyt-chat-empty-glyph">
                <ctx.ui.Icon name="bubble-5" size="large" />
              </span>
              <span class="hyt-chat-empty-title">{text(ctx, "hyt.chat.title")}</span>
              <span class="hyt-chat-empty-body">{text(ctx, "hyt.chat.messages.pick")}</span>
            </div>
          </div>
        }
      >
        <div class="hyt-chat-messages" ref={scroller} onScroll={(event) => onScroll(event.currentTarget)}>
          <div class="hyt-chat-flow">
            <div ref={attachSentinel} aria-hidden="true" style={{ height: "1px" }} />
            <Show when={props.hasMore}>
              <div class="hyt-chat-day">
                <span>{props.loadingMore ? text(ctx, "hyt.chat.messages.loadingMore") : text(ctx, "hyt.chat.messages.loadMore")}</span>
              </div>
            </Show>

            <Show
              when={props.messages.length > 0}
              fallback={<p class="hyt-chat-hint">{text(ctx, "hyt.chat.messages.empty")}</p>}
            >
              <For each={entries()}>
                {(entry, index) => {
                  const previous = () => entries()[index() - 1]?.message
                  const first = () => isGroupStart(entry.message, previous())
                  return (
                    <>
                      <Show when={previous() === undefined || !sameDay(entry.message.createdAt, previous()!.createdAt)}>
                        <div class="hyt-chat-day">
                          <span>{dayLabel(ctx, entry.message.createdAt)}</span>
                        </div>
                      </Show>
                      <MessageItem
                        ctx={ctx}
                        message={entry.message}
                        repeat={entry.repeat}
                        first={first()}
                        role={entry.message.outgoing ? text(ctx, "hyt.chat.msg.self") : department(entry.message.sender)}
                        avatars={props.avatars}
                        onOpenImage={setViewer}
                        onMedia={props.onMedia}
                        onMerge={props.onMerge}
                      />
                    </>
                  )
                }}
              </For>
            </Show>

            <Show when={props.draft !== undefined}>
              <div class="hyt-chat-draft">
                <span class="hyt-chat-draft-mark" aria-hidden="true">
                  <ctx.ui.Icon name="brain" size="normal" />
                </span>
                <div class="hyt-chat-draft-body">
                  <div class="hyt-chat-draft-head">
                    <span class="hyt-chat-draft-name">{text(ctx, "hyt.chat.ai.title")}</span>
                    <span class="hyt-chat-draft-tag">{text(ctx, "hyt.chat.ai.tag")}</span>
                    <span class="hyt-chat-draft-meta">
                      {(props.draft?.note ?? "").length > 0 ? props.draft?.note : text(ctx, "hyt.chat.ai.draft.basis")}
                    </span>
                  </div>
                  <div class="hyt-chat-draft-text">{props.draft?.text}</div>
                  <div class="hyt-chat-draft-actions">
                    <button type="button" class="hyt-chat-draft-btn" onClick={() => props.onUseDraft(props.draft?.text ?? "")}>
                      {text(ctx, "hyt.chat.ai.drafts.use")}
                    </button>
                    <button type="button" class="hyt-chat-draft-btn" data-ghost="true" onClick={() => props.onRefresh()}>
                      {text(ctx, "hyt.chat.ai.drafts.refresh")}
                    </button>
                  </div>
                </div>
              </div>
            </Show>
          </div>
        </div>

        <Show when={away()}>
          <button
            type="button"
            class="hyt-chat-to-end"
            onClick={() => {
              scrollToEnd(true)
              setAway(false)
            }}
          >
            <ctx.ui.Icon name="arrow-down-to-line" size="small" />
            {text(ctx, "hyt.chat.messages.toEnd")}
          </button>
        </Show>

        <Show when={viewer()}>
          {(source) => (
            <button
              type="button"
              class="hyt-chat-viewer"
              aria-label={text(ctx, "hyt.chat.msg.image.open")}
              onClick={() => setViewer(undefined)}
            >
              <img src={source()} alt="" />
            </button>
          )}
        </Show>
      </Show>
    </>
  )
}

function MessageItem(props: {
  ctx: Context
  message: MessageRow
  repeat: number
  first: boolean
  role: string
  avatars: Readonly<Record<string, string>>
  onOpenImage: (source: string) => void
  onMedia: (path: string) => Promise<{ dataUrl: string; error: string }>
  onMerge: (path: string) => Promise<MergeResult>
}) {
  const ctx = props.ctx
  const message = () => props.message
  const system = () => isSystemMessage(message())
  const senderName = () => message().senderNick || message().sender

  return (
    <Show
      when={!system()}
      fallback={
        <div class="hyt-chat-system">
          <span>
            {systemLabel(ctx, message())}
            {props.repeat > 1 ? ` ×${props.repeat}` : ""}
          </span>
        </div>
      }
    >
      <div
        class="hyt-chat-item"
        data-first={props.first ? "true" : "false"}
        data-outgoing={message().outgoing ? "true" : "false"}
        data-message-id={String(message().id)}
      >
        <Avatar
          name={senderName()}
          members={
            message().senderHead.length > 0
              ? [{ name: senderName(), headPath: message().senderHead }]
              : []
          }
          avatars={props.avatars}
          size="bubble"
        />
        <div class="hyt-chat-item-body">
          <Show when={props.first}>
            <div class="hyt-chat-item-meta">
              <span class="hyt-chat-item-name">{senderName()}</span>
              <Show when={props.role.length > 0}>
                <span class="hyt-chat-msg-role" data-you={message().outgoing ? "true" : undefined} title={props.role}>
                  {props.role}
                </span>
              </Show>
              <Show when={message().atMe}>
                <span class="hyt-chat-at-mark">{text(ctx, "hyt.chat.msg.atMe")}</span>
              </Show>
              <span class="hyt-chat-item-time">{formatClock(ctx.locale.locale(), message().createdAt)}</span>
            </div>
          </Show>
          <MessageBody ctx={ctx} message={message()} onOpenImage={props.onOpenImage} onMedia={props.onMedia} onMerge={props.onMerge} />
        </div>
      </div>
    </Show>
  )
}

function MessageBody(props: {
  ctx: Context
  message: MessageRow
  onOpenImage: (source: string) => void
  onMedia: (path: string) => Promise<{ dataUrl: string; error: string }>
  onMerge: (path: string) => Promise<MergeResult>
}) {
  const ctx = props.ctx
  const body = () => {
    switch (props.message.kind) {
      case "text":
        return <Bubble ctx={ctx} message={props.message} />
      case "image":
        return <ImageBody ctx={ctx} message={props.message} onOpenImage={props.onOpenImage} onMedia={props.onMedia} />
      case "file":
        return <FileBody ctx={ctx} message={props.message} />
      case "merge":
        return <MergeBody ctx={ctx} message={props.message} onMerge={props.onMerge} />
      case "voice":
        return (
          <MediaPlaceholder
            ctx={ctx}
            icon="outline-wave-audio"
            title={text(ctx, "hyt.chat.msg.voice")}
            hint={text(ctx, "hyt.chat.msg.voice.hint")}
          />
        )
      case "video":
        return (
          <MediaPlaceholder
            ctx={ctx}
            icon="outline-video"
            title={text(ctx, "hyt.chat.msg.video")}
            hint={text(ctx, "hyt.chat.msg.video.hint")}
          />
        )
      default:
        return <MediaPlaceholder ctx={ctx} icon="file-document" title={text(ctx, "hyt.chat.msg.other")} hint="" />
    }
  }
  return <>{body()}</>
}

function Bubble(props: { ctx: Context; message: MessageRow }) {
  const parts = () => splitMentions(props.message.text, props.message.atNames)
  return (
    <div class="hyt-chat-bubble">
      <For each={parts()}>{(part) => (part.at ? <span class="hyt-chat-mention">{part.text}</span> : part.text)}</For>
    </div>
  )
}

function ImageBody(props: {
  ctx: Context
  message: MessageRow
  onOpenImage: (source: string) => void
  onMedia: (path: string) => Promise<{ dataUrl: string; error: string }>
}) {
  const [media] = createResource(
    () => props.message.filePath,
    (path) => (path.length > 0 ? props.onMedia(path) : Promise.resolve({ dataUrl: "", error: "" })),
  )
  return (
    <Show
      when={media()?.dataUrl}
      fallback={
        <div class="hyt-chat-media-missing">
          {media.loading ? <props.ctx.ui.Loader size="small" /> : text(props.ctx, "hyt.chat.msg.image.missing")}
        </div>
      }
    >
      {(source) => (
        <button
          type="button"
          class="hyt-chat-media"
          aria-label={text(props.ctx, "hyt.chat.msg.image.open")}
          onClick={() => props.onOpenImage(source())}
        >
          <img src={source()} alt={text(props.ctx, "hyt.chat.msg.image.open")} loading="lazy" />
        </button>
      )}
    </Show>
  )
}

function FileBody(props: { ctx: Context; message: MessageRow }) {
  const ctx = props.ctx
  const open = () => {
    if (props.message.filePath.length > 0) void ctx.desktop?.reveal(props.message.filePath)
  }
  return (
    <button type="button" class="hyt-chat-file" onClick={open} title={props.message.filePath}>
      <span class="hyt-chat-file-glyph">
        <ctx.ui.Icon name="file-document" size="normal" />
      </span>
      <span class="hyt-chat-file-body">
        <span class="hyt-chat-file-name">{props.message.fileName || text(ctx, "hyt.chat.msg.other")}</span>
        <span class="hyt-chat-file-size">{formatSize(props.message.fileSize)}</span>
      </span>
    </button>
  )
}

function MergeBody(props: { ctx: Context; message: MessageRow; onMerge: (path: string) => Promise<MergeResult> }) {
  const ctx = props.ctx
  const [open, setOpen] = createSignal(false)
  const [items, setItems] = createSignal<readonly MergeItemRow[] | undefined>()
  const [error, setError] = createSignal("")
  const [loading, setLoading] = createSignal(false)

  const toggle = async () => {
    if (open()) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (items() !== undefined) return
    setLoading(true)
    const result = await props.onMerge(props.message.filePath).catch(() => ({ items: [], error: "读取失败" }))
    setItems(result.items)
    setError(result.error)
    setLoading(false)
  }

  return (
    <div class="hyt-chat-merge">
      <div class="hyt-chat-merge-head">
        <span class="hyt-chat-merge-title">{props.message.fileName || text(ctx, "hyt.chat.msg.merge")}</span>
        <span class="hyt-chat-merge-note">{text(ctx, "hyt.chat.msg.merge")}</span>
        <button type="button" class="hyt-chat-merge-toggle" onClick={() => void toggle()}>
          {open() ? text(ctx, "hyt.chat.msg.merge.collapse") : text(ctx, "hyt.chat.msg.merge.expand")}
        </button>
      </div>
      <Show when={open()}>
        <div class="hyt-chat-merge-items">
          <Show when={!loading()} fallback={<ctx.ui.Loader size="small" />}>
            <Show
              when={(items()?.length ?? 0) > 0}
              fallback={<span class="hyt-chat-merge-note">{error() || text(ctx, "hyt.chat.msg.merge.empty")}</span>}
            >
              <For each={items()}>
                {(item) => (
                  <div class="hyt-chat-merge-item">
                    <span class="hyt-chat-merge-item-name">{item.account}</span>
                    <span class="hyt-chat-merge-item-text">
                      {item.kind === "image" ? text(ctx, "hyt.chat.msg.merge.image") : item.title || item.content}
                    </span>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  )
}

function MediaPlaceholder(props: {
  ctx: Context
  icon: "outline-wave-audio" | "outline-video" | "file-document"
  title: string
  hint: string
}) {
  return (
    <div class="hyt-chat-placeholder">
      <props.ctx.ui.Icon name={props.icon} size="large" />
      <span>
        <strong>{props.title}</strong>
        <Show when={props.hint.length > 0}>
          <br />
          {props.hint}
        </Show>
      </span>
    </div>
  )
}

function systemLabel(ctx: Context, message: MessageRow) {
  if (message.kind === "recall") return text(ctx, "hyt.chat.msg.recall")
  if (message.kind === "call") return withBody(ctx, message, "hyt.chat.msg.call")
  return withBody(ctx, message, "hyt.chat.msg.notice")
}

function withBody(ctx: Context, message: MessageRow, key: string) {
  const body = message.text.trim()
  return body.length > 0 ? `${text(ctx, key)}：${body}` : text(ctx, key)
}

function dayLabel(ctx: Context, at: number) {
  const bucket = dayBucket(at)
  if (bucket === "today") return [text(ctx, "hyt.chat.day.today"), formatDay(ctx.locale.locale(), at)].join(" · ")
  if (bucket === "yesterday") return [text(ctx, "hyt.chat.day.yesterday"), formatDay(ctx.locale.locale(), at)].join(" · ")
  return formatDay(ctx.locale.locale(), at)
}

function sameDay(a: number, b: number) {
  const left = new Date(a)
  const right = new Date(b)
  return (
    left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
  )
}

function isSystemMessage(message: MessageRow) {
  return message.kind === "recall" || message.kind === "notice" || message.kind === "call"
}

/** 是否开启新的发言组：跨人、跨 5 分钟或系统消息都另起一组，组内不再重复头像与名字。 */
function isGroupStart(message: MessageRow, previous: MessageRow | undefined) {
  if (previous === undefined) return true
  if (isSystemMessage(message) || isSystemMessage(previous)) return true
  if (message.sender !== previous.sender) return true
  return Math.abs(message.createdAt - previous.createdAt) > 5 * 60_000
}

/** 相邻同内容系统消息合并为一条，repeat 记次数。 */
function collapseSystem(messages: readonly MessageRow[]) {
  const list: { message: MessageRow; repeat: number }[] = []
  for (const message of messages) {
    const last = list[list.length - 1]
    if (
      last !== undefined &&
      isSystemMessage(last.message) &&
      isSystemMessage(message) &&
      last.message.kind === message.kind &&
      last.message.text === message.text &&
      last.message.sender === message.sender
    ) {
      list[list.length - 1] = { message: last.message, repeat: last.repeat + 1 }
      continue
    }
    list.push({ message, repeat: 1 })
  }
  return list
}
