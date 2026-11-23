import type { Context } from "@opencode/plugin/gui"
import { For, Show, createEffect, createMemo, createResource, createSignal, onMount } from "solid-js"
import type { MergeItemRow, MessageRow } from "./contract.js"
import { text } from "./i18n.js"
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
  onMedia: (path: string) => Promise<string>
  onMerge: (path: string) => Promise<{ items: readonly MergeItemRow[]; error: string }>
  onOpenFile: (path: string) => void
  onOpenImage: (path: string) => void
}) {
  let stream: HTMLDivElement | undefined
  const [atBottom, setAtBottom] = createSignal(true)

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
}) {
  const [expanded, setExpanded] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [merge, setMerge] = createSignal<{ items: readonly MergeItemRow[]; error: string } | undefined>()
  const [merging, setMerging] = createSignal(false)

  const body = () => props.message.text.trim()
  const clamped = () => body().length > CLAMP_AT && !expanded()
  const long = () => body().length > CLAMP_AT

  const copy = () => {
    const value = body().length > 0 ? body() : props.message.fileName
    if (value.length === 0) return
    void props.ctx.system.copy(value).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_400)
    })
  }

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
    >
      <Show when={!props.self}>
        <Face
          class="msg-face"
          name={props.message.senderNick || props.message.sender}
          src={avatarOf(props.avatars, props.message.senderHead)}
        />
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

        <div class="message-tools">
          <Show when={props.message.kind === "image" && props.message.filePath.length > 0}>
            <button type="button" onClick={() => props.onOpenImage(props.message.filePath)}>
              {text(props.ctx, "hyt.chat.msg.enlarge")}
            </button>
          </Show>
          <Show when={body().length > 0 || props.message.fileName.length > 0}>
            <button type="button" onClick={copy}>
              {copied() ? text(props.ctx, "hyt.chat.msg.copied") : text(props.ctx, "hyt.chat.msg.copy")}
            </button>
          </Show>
          <Show when={props.message.filePath.length > 0}>
            <button type="button" onClick={() => props.onOpenFile(props.message.filePath)}>
              {text(props.ctx, "hyt.chat.msg.reveal")}
            </button>
          </Show>
        </div>
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

  return (
    <button
      class="shot"
      type="button"
      aria-label={text(props.ctx, "hyt.chat.msg.image.open")}
      data-hue="a"
      disabled={props.path.length === 0}
      onClick={() => props.onOpen(props.path)}
    >
      <Show when={src()} fallback={text(props.ctx, "hyt.chat.msg.image.missing")}>
        <img src={src()} alt="" />
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
