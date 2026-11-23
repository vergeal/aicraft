import type { Context } from "@opencode/plugin/gui"
import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { Avatar } from "./avatar.js"
import type { ChatStatus, DraftRow, MemberRow, MergeItemRow, MessageRow, SessionRow } from "./contract.js"
import { text } from "./i18n.js"
import { dayBucket, formatClock, formatDay, formatSize, reuseRows, splitMentions } from "./util.js"

/**
 * 每个会话上次停下的滚动位置。放在模块级：切走时由 `rememberCurrentScroll()` 在点击那一刻记录，
 * 不能靠 scroll 事件——切会话时内容被替换，浏览器会把 scrollTop clamp 到 0 并触发一次 scroll，
 * 那一次会把旧会话的位置覆盖成 0。
 */
const savedTops = new Map<string, number>()
let lastScroll = { id: "", top: 0 }

/** 切换会话前调用：此刻 DOM 里还是旧会话，位置才是准的。 */
export function rememberCurrentScroll() {
  if (lastScroll.id.length > 0) savedTops.set(lastScroll.id, lastScroll.top)
}

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
  /** 定位高亮放完（约 1.8s）后通知宿主清掉 focusId，下次搜索同一条才会再高亮。 */
  onFocusDone?: () => void
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

  // 非平滑时必须立刻落位：切会话时内容在同一帧换掉，若等下一帧再滚，浏览器会先把新会话画在顶部
  // （scrollTop 仍是 0），再跳到底部——那就是「像 F5」的观感。effect 阶段 DOM 已是新内容，同步设置有效。
  const scrollToEnd = (smooth: boolean) => {
    if (!smooth) {
      if (scroller !== undefined) scroller.scrollTop = scroller.scrollHeight
      return
    }
    requestAnimationFrame(() => {
      scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" })
    })
  }

  // 切回旧会话时内容刚换上来，高度还没算完就先尝试一次，之后每帧校正直到布局有高度。
  const restoreTo = (target: number) => {
    const apply = (tries: number) => {
      if (disposed || scroller === undefined) return
      const max = scroller.scrollHeight - scroller.clientHeight
      if (max <= 24 && tries < 6) {
        requestAnimationFrame(() => apply(tries + 1))
        return
      }
      scroller.scrollTop = Math.min(target, Math.max(0, max))
      setAway(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 32)
    }
    apply(0)
  }

  let lastSession = ""
  createEffect(() => {
    const id = props.session?.id ?? ""
    const count = props.messages.length
    if (id !== lastSession) {
      lastSession = id
      const saved = savedTops.get(id)
      if (saved !== undefined) {
        restoreTo(saved)
        return
      }
      setAway(false)
      scrollToEnd(false)
      return
    }
    if (count > 0 && (!away() || props.messages[count - 1]?.outgoing)) scrollToEnd(false)
  })

  // 从搜索结果进来时跳到命中的那条。目标不在已加载范围就继续往前翻，最多 12 次，避免无限加载。
  let focused = -1
  let focusTries = 0
  // 目标行会被异步落地的图片/头像推高：只在定位窗口内跟着重新对中，用户自己滚动后就不再抢。
  let focusTarget: HTMLElement | null = null
  let focusDeadline = 0
  const centerOn = () => {
    if (scroller === undefined || focusTarget === null) return
    const box = scroller.getBoundingClientRect()
    const rect = focusTarget.getBoundingClientRect()
    scroller.scrollTop += rect.top - box.top - (box.height - rect.height) / 2
  }
  createEffect(() => {
    const id = props.focusId
    if (id === undefined) {
      focused = -1
      focusTries = 0
      focusTarget = null
      return
    }
    if (id === focused) return
    const rows = props.messages
    if (rows.length === 0 || props.session === undefined || scroller === undefined) return
    const target = scroller.querySelector<HTMLElement>(`[data-message-id="${id}"]`)
    if (target !== null) {
      focused = id
      focusTries = 0
      // 瞬时定位：平滑滚动会被随后的贴底和行重建打断，最后停在半路。
      focusTarget = target
      focusDeadline = Date.now() + 1500
      centerOn()
      // 目标常在往前翻页之后才出现，那一页落进 DOM 还会把内容推高一次，所以隔两帧再对一次中。
      requestAnimationFrame(() => requestAnimationFrame(centerOn))
      // 定位完就离开底部：否则下一次轮询会把用户拉回最新一条。
      setAway(true)
      window.setTimeout(() => {
        focusTarget = null
        props.onFocusDone?.()
      }, 1800)
      return
    }
    if (props.hasMore && !props.loadingMore && focusTries < 12) {
      focusTries += 1
      props.onLoadMore()
    }
  })

  // 消息里的图片是异步取回来的：图片落进 DOM 后内容变高，滚动位置不会自己跟着走，
  // 于是「刚进会话停在底部」会变成停在半截——看起来既丢滚动又抽一下。
  // 只要用户本来贴底，高度一变就重新贴底。
  let flowObserver: ResizeObserver | undefined
  const attachFlow = (element: HTMLDivElement) => {
    flowObserver?.disconnect()
    flowObserver = new ResizeObserver(() => {
      if (disposed || scroller === undefined) return
      // 命中行还在定位窗口内：图片、头像落地把内容撑高时跟着重新对中。
      if (focusTarget !== null && Date.now() < focusDeadline) {
        centerOn()
        return
      }
      if (!away()) scroller.scrollTop = scroller.scrollHeight
    })
    flowObserver.observe(element)
  }

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
    flowObserver?.disconnect()
  })

  // 贴底容差 32px：比这更远就算「用户在往回翻」。
  // 之前是 480px，往上翻一小段仍被判为贴底，下一次轮询或收消息就把视口拉回最底部，看起来就是「丢滚动」。
  const onScroll = (element: HTMLDivElement) => {
    const id = props.session?.id
    if (id !== undefined && id.length > 0) lastScroll = { id, top: element.scrollTop }
    setAway(element.scrollHeight - element.scrollTop - element.clientHeight > 32)
  }

  const department = (account: string) => {
    const member = props.members.find((item) => item.account === account)
    return member?.department ?? ""
  }

  return (
    <>
      <header class="hyt-chat-head">
        <Show when={props.session !== undefined}>
          <Avatar
            name={props.session!.name}
            members={props.session!.members}
            avatars={props.avatars}
            size="head"
            group={props.session!.group}
          />
        </Show>
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
          <div class="hyt-chat-flow" ref={attachFlow}>
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
                        focus={props.focusId !== undefined && props.focusId === entry.message.id}
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
  /** 搜索定位到的那一条：由信号驱动高亮，行重建时不会丢。 */
  focus: boolean
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
        data-focus={props.focus ? "true" : undefined}
      >
        <Show when={!message().outgoing}>
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
        </Show>
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
  // 同上：直接读 media() 会让图片加载期间整个页面进 Suspense（切到有新图的会话时会闪一下）。
  const source = () => {
    const state = media.state
    return state === "ready" || state === "refreshing" ? (media.latest?.dataUrl ?? "") : ""
  }
  return (
    <Show
      when={source()}
      fallback={
        <div class="hyt-chat-media-missing">
          {media.loading ? <props.ctx.ui.Loader size="small" /> : text(props.ctx, "hyt.chat.msg.image.missing")}
        </div>
      }
    >
      {(image) => (
        <button
          type="button"
          class="hyt-chat-media"
          aria-label={text(props.ctx, "hyt.chat.msg.image.open")}
          onClick={() => props.onOpenImage(image())}
        >
          <img src={image()} alt={text(props.ctx, "hyt.chat.msg.image.open")} loading="lazy" />
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
        <span class="hyt-chat-merge-title">{text(ctx, "hyt.chat.msg.merge")}</span>
        <Show when={open() && (items()?.length ?? 0) > 0}>
          <span class="hyt-chat-merge-note">{text(ctx, "hyt.chat.msg.merge.count", { count: items()?.length ?? 0 })}</span>
        </Show>
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
