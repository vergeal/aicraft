import type { Context, IpcClient } from "@opencode/plugin/gui"
import { Show, createEffect, createResource, createSignal, onCleanup, onMount } from "solid-js"
import { AiPanel } from "./ai-panel.js"
import { Composer } from "./composer.js"
import { ChatIpc } from "./contract.js"
import type { ChatState, MergeItemRow } from "./contract.js"
import { text } from "./i18n.js"
import { MessageStream, rememberCurrentScroll } from "./messages.js"
import { SessionList } from "./sessions.js"

type Snapshot = ChatState
type Notice = { readonly tone: "muted" | "warning" | "danger"; readonly message: string }

const POLL_MS = 4_000

/**
 * 聊天主页。
 *
 * 只读本地库：进入时刷新一次，之后窗口可见时每 4 秒刷新一次（切到后台就停）。
 * 所有写操作都走 Ipc，主进程改完立刻推送新 state，因此这里不需要本地副本。
 */
export function ChatPage(props: { ctx: Context; client: IpcClient<typeof ChatIpc.spec> }) {
  const ctx = props.ctx
  const state = () => props.client.state()
  // 外层 Show 用布尔条件，避免每次轮询拿到新 state 对象就重建整棵树（输入框失焦、滚动跳回顶部都由它引起）。
  const snapshot = () => {
    const current = state()
    if (current === undefined) throw new Error("ChatPage rendered without state")
    return current
  }

  // 头像按路径集合批量取：key 只含路径，轮询推同样一组会话时不会重复请求。
  const avatarKey = () => {
    const current = state()
    if (current === undefined) return ""
    const paths = new Set<string>()
    for (const session of current.sessions)
      for (const member of session.members) if (member.headPath.length > 0) paths.add(member.headPath)
    for (const message of current.messages) if (message.senderHead.length > 0) paths.add(message.senderHead)
    return [...paths].slice(0, 200).sort().join("\n")
  }
  const [avatars] = createResource(avatarKey, async (key) => {
    const paths = key.length === 0 ? [] : key.split("\n")
    if (paths.length === 0) return {}
    const rows = await props.client.avatars({ paths }).catch(() => [])
    return Object.fromEntries(
      rows.flatMap((row) => (row.dataUrl.length > 0 ? [[row.path, row.dataUrl] as const] : [])),
    )
  })
  // 不要直接读 resource 的值：重新取头像时会挂起，而最近的 Suspense 是整页，切会话时页面会被移出约 80ms，
  // 看起来就是闪一下。读 state 不挂起，取回来之前先不画头像。
  const avatarMap = () => {
    const state = avatars.state
    return state === "ready" || state === "refreshing" ? (avatars.latest ?? {}) : {}
  }
  const [text_, setDraft] = createSignal("")
  const [sending, setSending] = createSignal(false)
  // 右栏是「会话信息」，按需打开：默认不占宽度，需要看成员或指令时从会话头部开关。
  const [infoOpen, setInfoOpen] = createSignal(false)
  const [notice, setNotice] = createSignal<Notice | undefined>()
  const [error, setError] = createSignal<string | undefined>()
  const [query, setQuery] = createSignal("")
  const [searching, setSearching] = createSignal(false)
  const [loadingMore, setLoadingMore] = createSignal(false)
  let searchTimer: number | undefined
  let searchToken = 0
  let composer: HTMLTextAreaElement | undefined

  const run = async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    try {
      setError(undefined)
      return await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      return undefined
    }
  }

  onMount(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void run(() => props.client.refresh())
    }
    tick()
    const timer = window.setInterval(tick, POLL_MS)
    document.addEventListener("visibilitychange", tick)
    onCleanup(() => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
      if (searchTimer !== undefined) window.clearTimeout(searchTimer)
    })
  })

  // 正盯着某个会话时，轮询带回来的新未读直接标已读，否则自己的角标会越积越多。
  createEffect(() => {
    const current = state()
    if (current === undefined || document.visibilityState !== "visible") return
    const active = current.sessions.find((item) => item.id === current.selected)
    if (active === undefined || active.unread === 0) return
    void props.client.markRead({ sessionId: active.id }).catch(() => undefined)
  })

  // 搜索命中某条消息时记住它的 id：切到会话后由消息流负责滚到那一条。
  const [focusId, setFocusId] = createSignal<number | undefined>()

  const select = (id: string, messageId?: number) => {
    // 先记下当前会话停在哪，再切——切走之后位置就取不到了。
    rememberCurrentScroll()
    if (searchTimer !== undefined) window.clearTimeout(searchTimer)
    setQuery("")
    setNotice(undefined)
    setSearching(false)
    setFocusId(messageId)
    void run(async () => {
      await props.client.selectSession({ sessionId: id })
      await props.client.markRead({ sessionId: id })
    })
  }

  const search = (value: string) => {
    setQuery(value)
    setSearching(true)
    if (searchTimer !== undefined) window.clearTimeout(searchTimer)
    const token = ++searchToken
    searchTimer = window.setTimeout(() => {
      void run(() => props.client.search({ query: value })).then(() => {
        if (token === searchToken) setSearching(false)
      })
    }, 180)
  }

  const loadMore = () => {
    if (loadingMore() || state()?.hasMore !== true) return
    setLoadingMore(true)
    void run(() => props.client.loadMore()).then(() => setLoadingMore(false))
  }

  const send = (body: string, at: readonly string[]) => {
    const sessionId = state()?.selected ?? ""
    setSending(true)
    void run(() => props.client.send({ sessionId, text: body, at: [...at] })).then((result) => {
      setSending(false)
      if (result === undefined) return
      if (result.ok) {
        setDraft("")
        setNotice(undefined)
        return
      }
      if (result.reason === "not-wired") {
        setNotice({ tone: "warning", message: text(ctx, "hyt.chat.composer.notWired") })
        return
      }
      setNotice({ tone: "danger", message: text(ctx, "hyt.chat.composer.rejected", { reason: reasonLabel(ctx, result.reason) }) })
    })
  }

  const media = async (path: string): Promise<{ dataUrl: string; error: string }> => {
    try {
      return await props.client.media({ path })
    } catch (cause) {
      return { dataUrl: "", error: cause instanceof Error ? cause.message : String(cause) }
    }
  }

  const merge = async (path: string): Promise<{ items: readonly MergeItemRow[]; error: string }> => {
    try {
      return await props.client.merge({ path })
    } catch (cause) {
      return { items: [], error: cause instanceof Error ? cause.message : String(cause) }
    }
  }

  const currentDraft = () => {
    const current = state()
    if (current === undefined) return undefined
    const rows = current.drafts.filter((draft) => draft.sessionId === current.selected)
    return rows.slice().sort((left, right) => right.createdAt - left.createdAt)[0]
  }

  const insertComposer = (value: string) => {
    setDraft(value)
    composer?.focus()
  }

  return (
    <Show when={state() !== undefined} fallback={<ChatEmpty state={undefined} error={error()} onRetry={() => void run(() => props.client.refresh())} ctx={ctx} />}>
      <Show
        when={state()?.status.phase === "ready"}
        fallback={
          <ChatEmpty
            state={state()}
            error={error()}
            onRetry={() => void run(() => props.client.refresh())}
            ctx={ctx}
          />
        }
      >
          <div class="hyt-chat">
            <aside class="hyt-chat-side">
              <SessionList
                ctx={ctx}
                status={snapshot().status}
                sessions={snapshot().sessions}
                selected={snapshot().selected}
                query={query()}
                hits={snapshot().search.hits}
                searching={searching()}
                avatars={avatarMap()}
                draftCount={currentDraft() === undefined ? 0 : 1}
                knowledgeCount={snapshot().knowledge.length}
                unread={snapshot().unread}
                onSelect={select}
                onSearch={search}
                onMarkAllRead={() => void run(() => props.client.markAllRead())}
                onRefresh={() => void run(() => props.client.refresh())}
              />
            </aside>

            <section class="hyt-chat-main">
              <MessageStream
                ctx={ctx}
                status={snapshot().status}
                session={snapshot().sessions.find((item) => item.id === snapshot().selected)}
                messages={snapshot().messages}
                members={snapshot().members}
                draft={currentDraft()}
                hasMore={snapshot().hasMore}
                loadingMore={loadingMore()}
                onLoadMore={loadMore}
                focusId={focusId()}
                onUseDraft={insertComposer}
                onRefresh={() => void run(() => props.client.refresh())}
                onFocusSearch={() => document.querySelector<HTMLInputElement>(".hyt-chat-search input")?.focus()}
                infoOpen={infoOpen()}
                onToggleInfo={() => setInfoOpen(!infoOpen())}
                avatars={avatarMap()}
                onMedia={media}
                onMerge={merge}
              />
              <Composer
                ctx={ctx}
                value={text_()}
                onInput={setDraft}
                send={snapshot().send}
                sending={sending()}
                members={snapshot().members}
                onSend={send}
                onNotice={(message, tone) => setNotice({ message, tone })}
                notice={notice()}
                onReady={(element) => {
                  composer = element
                }}
              />
            </section>

            <Show when={infoOpen()}>
              <aside class="hyt-chat-ai">
                <AiPanel
                  ctx={ctx}
                  members={snapshot().members}
                  knowledge={snapshot().knowledge}
                  onMention={(name) => insertComposer(`${text_()}@${name} `)}
                  onCommand={insertComposer}
                  onClose={() => setInfoOpen(false)}
                />
              </aside>
            </Show>
          </div>
      </Show>
    </Show>
  )
}

/** 空态：标题、说明、连接状态、读取位置与重试。没有数据或未登录时也给出完整页面，不留白屏。 */
function ChatEmpty(props: { ctx: Context; state: Snapshot | undefined; error: string | undefined; onRetry: () => void }) {
  const ctx = props.ctx
  const phase = () => props.state?.status.phase ?? "loading"
  const title = () => {
    if (phase() === "no-account") return text(ctx, "hyt.chat.state.title.no-account")
    if (phase() === "no-data") return text(ctx, "hyt.chat.state.title.no-data")
    if (phase() === "error") return text(ctx, "hyt.chat.state.title.error")
    if (phase() === "ready") return text(ctx, "hyt.chat.state.title.empty")
    return text(ctx, "hyt.chat.title")
  }
  const body = () => {
    if (phase() === "no-account") return text(ctx, "hyt.chat.state.body.no-account")
    if (phase() === "no-data") return text(ctx, "hyt.chat.state.body.no-data")
    if (phase() === "error") return text(ctx, "hyt.chat.state.body.error")
    if (phase() === "ready") return text(ctx, "hyt.chat.state.body.empty")
    return text(ctx, "hyt.chat.state.loading")
  }
  const detail = () => props.error ?? props.state?.status.detail ?? ""
  const bridge = () => props.state?.status.bridge

  return (
    <div class="hyt-chat">
      <div class="hyt-chat-empty">
        <div class="hyt-chat-empty-card">
          <span class="hyt-chat-empty-glyph">
            <Show when={phase() === "loading"} fallback={<ctx.ui.Icon name="bubble-5" size="large" />}>
              <ctx.ui.Loader size="large" />
            </Show>
          </span>
          <span class="hyt-chat-empty-title">{title()}</span>
          <span class="hyt-chat-empty-body">{body()}</span>

          <Show when={bridge()}>
            {(value) => (
              <span class="hyt-chat-status" data-tone={value() === "ready" ? "ready" : "warning"}>
                <span class="hyt-chat-status-dot" aria-hidden="true" />
                {value() === "ready" ? text(ctx, "hyt.chat.status.bridge.ready") : text(ctx, "hyt.chat.status.bridge.missing")}
              </span>
            )}
          </Show>

          <Show when={detail().length > 0}>
            <span class="hyt-chat-empty-detail">
              <Show when={detail().length > 0}>{`${text(ctx, "hyt.chat.state.detail")}：${detail()}`}</Show>
            </span>
          </Show>

          <div class="hyt-chat-empty-actions">
            <ctx.ui.Button variant="contrast" size="small" onClick={() => props.onRetry()}>
              {text(ctx, "hyt.chat.action.retry")}
            </ctx.ui.Button>
            <Show when={phase() === "loading"}>
              <span class="hyt-chat-heading-sub">{text(ctx, "hyt.chat.state.loading")}</span>
            </Show>
          </div>
        </div>
      </div>
    </div>
  )
}

function reasonLabel(ctx: Context, reason: string) {
  if (reason === "not-allowed") return text(ctx, "hyt.chat.composer.disabled.no-session")
  if (reason === "empty") return text(ctx, "hyt.chat.composer.empty")
  return reason
}
