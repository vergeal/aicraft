import type { Context, IpcClient } from "@opencode/plugin/gui"
import { Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js"
import { Blank } from "./blank.js"
import { Composer } from "./composer.js"
import { ChatIpc } from "./contract.js"
import type { MergeItemRow, MessageRow, SessionRow } from "./contract.js"
import { text } from "./i18n.js"
import { InfoPanel } from "./info.js"
import { MessageStream } from "./messages.js"
import { Rail } from "./sessions.js"
import { rowTime } from "./util.js"

const POLL_MS = 4_000
const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const

/**
 * 聊天主页。
 *
 * 只读本地库：进入时刷新一次，之后窗口可见时每 4 秒刷新一次（切到后台就停）。
 * 所有写操作都走 Ipc，主进程改完立刻推送新 state，因此这里不维护数据副本；
 * 只保留真正属于窗口的东西：输入草稿、搜索词、面板开合、正在发送与临时提示。
 */
export function ChatPage(props: { ctx: Context; client: IpcClient<typeof ChatIpc.spec> }) {
  const ctx = props.ctx
  const state = () => props.client.state()

  const phase = () => state()?.status.phase ?? "loading"
  /**
   * 轮询每次推来新数组与新对象，内容却常常没变。按内容保住旧引用，
   * 消息组件才不会每 4 秒重建一次（展开的长文、展开的合并转发会被重置）。
   */
  const sessions = createMemo((previous?: readonly SessionRow[]) => {
    const next = state()?.sessions ?? []
    if (previous === undefined || previous.length !== next.length) return next
    for (let index = 0; index < next.length; index += 1)
      if (sessionKey(previous[index]!) !== sessionKey(next[index]!)) return next
    return previous
  })
  const selectedId = () => state()?.selected ?? ""
  const selected = () => sessions().find((session) => session.id === selectedId())
  const messages = createMemo((previous?: readonly MessageRow[]) => {
    const next = state()?.messages ?? []
    if (previous === undefined || previous.length !== next.length) return next
    for (let index = 0; index < next.length; index += 1)
      if (messageKey(previous[index]!) !== messageKey(next[index]!)) return next
    return previous
  })
  /** 没有数据、读取失败、或者一条会话都没有时整页走空态，不画空三栏。 */
  const blank = () => phase() !== "ready" || sessions().length === 0

  const [query, setQuery] = createSignal("")
  const [searching, setSearching] = createSignal(false)
  const [loadingMore, setLoadingMore] = createSignal(false)
  const [sending, setSending] = createSignal(false)
  const [notice, setNotice] = createSignal<string | undefined>()
  const [focusId, setFocusId] = createSignal<number | undefined>()
  const [infoOpen, setInfoOpen] = createSignal(false)
  const [ignoredDraft, setIgnoredDraft] = createSignal("")
  const [draftText, setDraftText] = createSignal("")

  /** 每个会话各自的未发送草稿：切走再切回来还在，也不会串到别的会话。 */
  const localDrafts = new Map<string, string>()
  let lastSelected = ""
  let searchTimer: number | undefined
  let searchToken = 0
  /** 当前这一页是不是被搜索或「定位」锚到某条旧消息上。 */
  let anchored = false

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
    if (paths.length === 0) return {} as Record<string, string>
    const rows = await props.client.avatars({ paths }).catch(() => [])
    return Object.fromEntries(
      rows.flatMap((row) => (row.dataUrl.length > 0 ? [[row.path, row.dataUrl] as const] : [])),
    ) as Record<string, string>
  })

  // 不要直接读 resource 的值：重新取头像时会挂起，切会话时整页会被移出约 80ms。
  const avatarMap = () => {
    const status = avatars.state
    return status === "ready" || status === "refreshing" ? (avatars.latest ?? {}) : {}
  }

  const fail = (cause: unknown) => {
    setNotice(cause instanceof Error ? cause.message : String(cause))
  }

  const refresh = () => {
    void props.client.refresh().catch(fail)
  }

  onMount(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return
      void props.client.refresh().catch(() => undefined)
    }
    tick()
    const timer = window.setInterval(tick, POLL_MS)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        focusSearch()
        return
      }
      if (event.key === "Escape" && infoOpen()) setInfoOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    document.addEventListener("visibilitychange", tick)
    onCleanup(() => {
      window.clearInterval(timer)
      window.removeEventListener("keydown", onKeyDown)
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

  // 会话切换时把输入框内容存回旧会话、取出新会话的草稿。
  createEffect(() => {
    const id = selectedId()
    if (id === lastSelected) return
    if (lastSelected.length > 0) localDrafts.set(lastSelected, draftText())
    lastSelected = id
    setDraftText(localDrafts.get(id) ?? "")
  })

  const focusSearch = () => {
    document.querySelector<HTMLInputElement>(".hyt-shell .search input")?.focus()
  }

  const select = (sessionId: string, messageId?: number) => {
    if (searchTimer !== undefined) window.clearTimeout(searchTimer)
    setQuery("")
    setSearching(false)
    setNotice(undefined)
    anchored = messageId !== undefined
    setFocusId(messageId)
    void props.client.selectSession({ sessionId, messageId }).catch(fail)
  }

  /** 停在旧消息那一页时，「回到最新」要把最新一页重新载回来，光滚到底没有新内容。 */
  const latest = () => {
    if (!anchored) return
    anchored = false
    const sessionId = selectedId()
    if (sessionId.length === 0) return
    void props.client.selectSession({ sessionId }).catch(fail)
  }

  const search = (value: string) => {
    setQuery(value)
    setSearching(true)
    if (searchTimer !== undefined) window.clearTimeout(searchTimer)
    const token = ++searchToken
    searchTimer = window.setTimeout(() => {
      void props.client
        .search({ query: value })
        .catch(fail)
        .then(() => {
          if (token === searchToken) setSearching(false)
        })
    }, 180)
  }

  const loadMore = () => {
    if (loadingMore() || state()?.hasMore !== true) return
    setLoadingMore(true)
    void props.client.loadMore().catch(fail).then(() => setLoadingMore(false))
  }

  const writeDraft = (value: string) => {
    const id = selectedId()
    if (id.length > 0) localDrafts.set(id, value)
    setDraftText(value)
  }

  const send = (body: string, at: readonly string[]) => {
    const sessionId = selectedId()
    if (sessionId.length === 0) return
    setSending(true)
    setNotice(undefined)
    void props.client
      .send({ sessionId, text: body, at: [...at] })
      .then((result) => {
        if (!result.ok) {
          setNotice(text(ctx, "hyt.chat.composer.rejected", { reason: reasonLabel(ctx, result.reason) }))
          return
        }
        localDrafts.delete(sessionId)
        setDraftText("")
        if (result.reason.length > 0) setNotice(result.reason)
      })
      .catch(fail)
      .then(() => setSending(false))
  }

  const mediaCache = new Map<string, Promise<string>>()
  const onMedia = (path: string) => {
    if (path.length === 0) return Promise.resolve("")
    const cached = mediaCache.get(path)
    if (cached !== undefined) return cached
    const request = props.client
      .media({ path })
      .then((result) => (result.error.length > 0 ? "" : result.dataUrl))
      .catch(() => "")
    mediaCache.set(path, request)
    return request
  }

  const mergeCache = new Map<string, Promise<{ items: readonly MergeItemRow[]; error: string }>>()
  const onMerge = (path: string) => {
    const cached = mergeCache.get(path)
    if (cached !== undefined) return cached
    const request = props.client.merge({ path }).catch((cause: unknown) => ({
      items: [] as readonly MergeItemRow[],
      error: cause instanceof Error ? cause.message : String(cause),
    }))
    mergeCache.set(path, request)
    return request
  }

  const reveal = (path: string) => {
    if (path.length === 0) return
    if (ctx.desktop !== undefined) {
      void ctx.desktop.reveal(path)
      return
    }
    ctx.system.openExternal(fileUrl(path))
  }

  const openImage = (path: string) => {
    if (path.length === 0) return
    ctx.system.openExternal(fileUrl(path))
  }

  const currentDraft = () => {
    const current = state()
    if (current === undefined || current.selected.length === 0) return undefined
    const rows = current.drafts
      .filter((draft) => draft.sessionId === current.selected && draft.id !== ignoredDraft())
      .sort((left, right) => right.createdAt - left.createdAt)
    return rows[0]
  }

  const useDraft = (value: string) => {
    writeDraft(value)
    queueMicrotask(() => document.querySelector<HTMLTextAreaElement>(".hyt-shell .box textarea")?.focus())
  }

  const today = () => {
    const date = new Date()
    const account = state()?.status.displayName || state()?.status.account || ""
    const stamp = `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]!}`
    return account.length > 0 ? text(ctx, "hyt.chat.brand.meta", { account, date: stamp }) : stamp
  }

  const headKind = () => {
    const session = selected()
    if (session === undefined) return ""
    if (!session.group) return text(ctx, "hyt.chat.head.direct")
    return session.members.length > 0 && session.members.length < 9
      ? text(ctx, "hyt.chat.head.group", { count: session.members.length })
      : text(ctx, "hyt.chat.sessions.group")
  }

  const headMeta = () => {
    const session = selected()
    if (session === undefined) return { live: "", updated: "" }
    return {
      live:
        state()?.status.bridge === "ready"
          ? text(ctx, "hyt.chat.head.live")
          : text(ctx, "hyt.chat.head.readonly"),
      updated: session.lastAt > 0 ? text(ctx, "hyt.chat.head.updated", { time: rowTime(ctx, session.lastAt) }) : "",
    }
  }

  return (
    <div
      class="hyt-shell"
      data-theme={ctx.appearance.mode()}
      data-panel={infoOpen() && !blank() ? "open" : "closed"}
      data-blank={blank() ? "true" : "false"}
    >
      <Show
        when={!blank()}
        fallback={
          <Blank
            ctx={ctx}
            phase={phase()}
            detail={state()?.status.detail ?? ""}
            onRetry={refresh}
            onSettings={() => ctx.layout.settings()}
          />
        }
      >
        <Rail
          ctx={ctx}
          sessions={sessions()}
          selected={selectedId()}
          unread={state()?.unread ?? 0}
          query={query()}
          hits={state()?.search.hits ?? []}
          searching={searching()}
          drafts={state()?.drafts ?? []}
          avatars={avatarMap()}
          today={today()}
          onSelect={select}
          onSearch={search}
          onMarkAllRead={() => void props.client.markAllRead().catch(fail)}
          onEscape={() => {
            setQuery("")
            setSearching(false)
            void props.client.search({ query: "" }).catch(() => undefined)
          }}
        />

        <section class="desk" aria-label={text(ctx, "hyt.chat.side.title")}>
          <header class="head">
            <Show when={selected()}>
              <span class="head-face" aria-hidden="true">
                <Show
                  when={headAvatar()}
                  fallback={(selected()?.members[0]?.name ?? selected()?.name ?? "").slice(0, 2)}
                >
                  <img src={headAvatar()} alt="" />
                </Show>
              </span>
              <div class="head-text">
                <h2 class="head-name">
                  <span>{selected()?.name}</span>
                  <span class="pill">{headKind()}</span>
                </h2>
                <div class="head-meta">
                  <span>{headMeta().live}</span>
                  <Show when={headMeta().updated.length > 0}>
                    <span>{headMeta().updated}</span>
                  </Show>
                </div>
              </div>
            </Show>
            <div class="head-actions">
              <button class="icon-btn" type="button" aria-label={text(ctx, "hyt.chat.head.search")} onClick={focusSearch}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" />
                </svg>
              </button>
              <button class="icon-btn" type="button" aria-label={text(ctx, "hyt.chat.head.refresh")} onClick={refresh}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                  <path d="M20 12a8 8 0 1 1-2.4-5.7" />
                  <path d="M20 4v4h-4" />
                </svg>
              </button>
              <button
                class="icon-btn"
                type="button"
                aria-label={text(ctx, "hyt.chat.head.info")}
                aria-expanded={infoOpen() ? "true" : "false"}
                onClick={() => setInfoOpen(!infoOpen())}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 11v5M12 8.2v.2" />
                </svg>
              </button>
            </div>
          </header>

          <MessageStream
            ctx={ctx}
            messages={messages()}
            hasMore={state()?.hasMore ?? false}
            newMessageId={state()?.newMessageId ?? 0}
            loadingMore={loadingMore()}
            focusId={focusId()}
            onFocusDone={() => setFocusId(undefined)}
            onLatest={latest}
            onLoadMore={loadMore}
            avatars={avatarMap()}
            onMedia={onMedia}
            onMerge={onMerge}
            onOpenFile={reveal}
            onOpenImage={openImage}
          />

          <Composer
            ctx={ctx}
            sessionName={selected()?.name ?? ""}
            value={draftText()}
            send={state()?.send ?? { enabled: false, reason: "" }}
            bridge={state()?.status.bridge ?? "missing"}
            sending={sending()}
            members={state()?.members ?? []}
            draft={currentDraft()}
            basis={messages().length}
            notice={notice()}
            onInput={writeDraft}
            onSend={send}
            onUseDraft={useDraft}
            onIgnoreDraft={() => {
              const draft = currentDraft()
              if (draft !== undefined) setIgnoredDraft(draft.id)
            }}
            onRefresh={refresh}
          />
        </section>

        <InfoPanel
          ctx={ctx}
          session={selected()}
          directory={state()?.members ?? []}
          messages={messages()}
          avatars={avatarMap()}
          open={infoOpen()}
          onClose={() => setInfoOpen(false)}
          onOpenFile={reveal}
        />
      </Show>
    </div>
  )

  function headAvatar() {
    const session = selected()
    const path = session?.members[0]?.headPath ?? ""
    if (path.length === 0) return undefined
    const value = avatarMap()[path]
    return value === undefined || value.length === 0 ? undefined : value
  }
}

/** 渲染用得到的全部字段：只要这些没变，就沿用上一份数组。 */
function messageKey(message: MessageRow) {
  return [
    message.id,
    message.kind,
    message.createdAt,
    message.sender,
    message.senderNick,
    message.outgoing ? 1 : 0,
    message.atMe ? 1 : 0,
    message.atNames.join("/"),
    message.text,
    message.fileName,
    message.fileSize,
    message.filePath,
  ].join("\u0001")
}

function sessionKey(session: SessionRow) {
  return [
    session.id,
    session.name,
    session.preview,
    session.lastAt,
    session.unread,
    session.atMe ? 1 : 0,
    session.group ? 1 : 0,
    session.online ? 1 : 0,
    session.members.map((member) => `${member.name}\u0000${member.headPath}`).join("/"),
  ].join("\u0001")
}

function reasonLabel(ctx: Context, reason: string) {
  if (reason === "empty") return text(ctx, "hyt.chat.composer.empty")
  if (reason === "not-allowed") return text(ctx, "hyt.chat.composer.disabled.notAllowed")
  if (reason === "whitelist-empty") return text(ctx, "hyt.chat.composer.disabled.whitelist")
  if (reason === "bridge-missing") return text(ctx, "hyt.chat.composer.bridge.missing")
  if (reason === "pending") return text(ctx, "hyt.chat.composer.disabled.pending")
  if (reason === "not-wired") return text(ctx, "hyt.chat.composer.notWired")
  return reason
}

/** 本地文件用默认应用打开；`file://` 下保留盘符的冒号，只转义空格与中文。 */
function fileUrl(path: string) {
  const normalized = path.replace(/\\/g, "/")
  return encodeURI(normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`)
}
