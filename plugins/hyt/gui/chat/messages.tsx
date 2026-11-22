import type { Context } from "@opencode/plugin/gui"
import { For, Show, createResource, createSignal, onCleanup } from "solid-js"
import { Avatar } from "./avatar.js"
import type { MergeItemRow, MessageRow, SessionRow } from "./contract.js"
import { text } from "./i18n.js"
import { dayBucket, formatClock, formatDay, formatSize, splitMentions, toneOf } from "./util.js"

export interface MergeResult {
  readonly items: readonly MergeItemRow[]
  readonly error: string
}

/** 通信块：中栏的会话头、消息流、加载更早的哨兵与图片查看器。 */
export function MessageStream(props: {
  ctx: Context
  account: string
  session: SessionRow | undefined
  messages: readonly MessageRow[]
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
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
  const entries = () => collapseSystem(reversed(props.messages))

  const attachSentinel = (element: HTMLDivElement) => {
    observer?.disconnect()
    observer = new IntersectionObserver(
      (entries) => {
        if (disposed) return
        if (entries.some((entry) => entry.isIntersecting) && props.hasMore && !props.loadingMore) props.onLoadMore?.()
      },
      { root: element.closest(".hyt-chat-messages"), rootMargin: "160px" },
    )
    observer.observe(element)
  }
  onCleanup(() => {
    disposed = true
    observer?.disconnect()
  })

  return (
    <>
      <header class="hyt-chat-pane-head hyt-chat-pane-head-main">
        <div class="hyt-chat-heading-lead">
          <Show when={props.session !== undefined}>
            <Avatar
              ctx={ctx}
              name={props.session!.name}
              tone={props.session!.tone}
              paths={props.session!.headPaths}
              avatars={props.avatars}
              size="head"
            />
          </Show>
          <div class="hyt-chat-heading">
            <span class="hyt-chat-heading-title">{props.session?.name ?? text(ctx, "hyt.chat.title")}</span>
            <span class="hyt-chat-heading-sub">
              {props.session === undefined
                ? text(ctx, "hyt.chat.messages.pick")
                : props.session.group
                  ? text(ctx, "hyt.chat.sessions.group")
                  : props.session.id}
            </span>
          </div>
        </div>
        <Show when={props.session !== undefined}>
          <div class="hyt-chat-heading-actions">
            <Show when={props.messages.length > 0}>
              <span class="hyt-chat-heading-sub">{props.messages.length}</span>
            </Show>
          </div>
        </Show>
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
        <div class="hyt-chat-messages" ref={scroller} onScroll={(event) => setAway(event.currentTarget.scrollTop > 400)}>
          <div class="hyt-chat-flow">
            <Show
              when={props.messages.length > 0}
              fallback={<p class="hyt-chat-hint">{text(ctx, "hyt.chat.messages.empty")}</p>}
            >
              <For each={entries()}>
                {(entry, index) => {
                  const older = () => entries()[index() + 1]?.message
                  const first = () => isGroupStart(entry.message, older())
                  return (
                    <>
                      <MessageItem
                        ctx={ctx}
                        message={entry.message}
                        repeat={entry.repeat}
                        first={first()}
                        avatars={props.avatars}
                        onOpenImage={setViewer}
                        onMedia={props.onMedia}
                        onMerge={props.onMerge}
                      />
                      <Show when={older() === undefined || !sameDay(entry.message.createdAt, older()!.createdAt)}>
                        <div class="hyt-chat-day">
                          <span>{dayLabel(ctx, entry.message.createdAt)}</span>
                        </div>
                      </Show>
                    </>
                  )
                }}
              </For>
            </Show>
            <div ref={attachSentinel} aria-hidden="true" style={{ height: "1px" }} />
            <Show when={props.hasMore}>
              <div class="hyt-chat-day">
                <span>{props.loadingMore ? text(ctx, "hyt.chat.messages.loadingMore") : text(ctx, "hyt.chat.messages.loadMore")}</span>
              </div>
            </Show>
          </div>
        </div>

        <Show when={away()}>
          <button
            type="button"
            class="hyt-chat-to-end"
            onClick={() => {
              scroller?.scrollTo({ top: 0, behavior: "smooth" })
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
        class="hyt-chat-item hyt-chat-message"
        data-first={props.first ? "true" : "false"}
        data-outgoing={message().outgoing ? "true" : "false"}
        data-at={message().atMe ? "true" : "false"}
      >
        <Avatar
          ctx={ctx}
          name={senderName()}
          tone={toneOf(message().sender)}
          paths={message().senderHead.length > 0 ? [message().senderHead] : []}
          avatars={props.avatars}
          size="bubble"
        />
        <div class="hyt-chat-item-body">
          <div class="hyt-chat-item-meta">
            <span class="hyt-chat-item-name">{senderName()}</span>
            <Show when={message().atMe}>
              <span class="hyt-chat-at-mark">{text(ctx, "hyt.chat.msg.atMe")}</span>
            </Show>
            <span>{formatClock(ctx.locale.locale(), message().createdAt)}</span>
          </div>
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
          data-outgoing={props.message.outgoing ? "true" : "false"}
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
  if (bucket === "today") return text(ctx, "hyt.chat.day.today")
  if (bucket === "yesterday") return text(ctx, "hyt.chat.day.yesterday")
  return formatDay(ctx.locale.locale(), at)
}

function sameDay(a: number, b: number) {
  const left = new Date(a)
  const right = new Date(b)
  return (
    left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
  )
}

function reversed(messages: readonly MessageRow[]) {
  return messages.slice().reverse()
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
