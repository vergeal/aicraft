import type { Context } from "@opencode/plugin/gui"
import { For, Show, createMemo, createSignal } from "solid-js"
import { Avatar } from "./avatar.js"
import type { ChatStatus, SearchHit, SessionRow } from "./contract.js"
import { text } from "./i18n.js"
import { dayBucket, formatClock, formatListTime, reuseRows } from "./util.js"

type Filter = "all" | "unread" | "at" | "direct" | "groups"

/**
 * 左栏：品牌、搜索、AI 入口、筛选、会话时间线、当前用户。
 *
 * 列表按最近消息时间混排，和飞书一样——分成单聊、群聊两大块时，
 * 「最近谁找过我」要在两处找。单聊与群聊靠头像和行内的「群」标记区分。
 */
export function SessionList(props: {
  ctx: Context
  status: ChatStatus
  sessions: readonly SessionRow[]
  selected: string
  query: string
  hits: readonly SearchHit[]
  searching: boolean
  avatars: Readonly<Record<string, string>>
  draftCount: number
  knowledgeCount: number
  unread: number
  onSelect: (id: string, messageId?: number) => void
  onSearch: (query: string) => void
  /** 一键阅读：把所有会话的未读标为已读。 */
  onMarkAllRead: () => void
  onRefresh: () => void
}) {
  const ctx = props.ctx
  const [filter, setFilter] = createSignal<Filter>("all")
  const searching = () => props.query.trim().length > 0

  // 轮询每 4 秒推一批新对象；内容没变就复用旧引用，For 才不会整列重建（闪屏、图片重载都出自这里）。
  let stable: readonly SessionRow[] = []
  const rows = createMemo(() => {
    stable = reuseRows(stable, props.sessions, (row) => row.id)
    return stable
  })

  const atCount = () => rows().filter((session) => session.atMe).length
  const visible = () => {
    const mode = filter()
    if (mode === "unread") return rows().filter((session) => session.unread > 0)
    if (mode === "at") return rows().filter((session) => session.atMe)
    if (mode === "direct") return rows().filter((session) => !session.group)
    if (mode === "groups") return rows().filter((session) => session.group)
    return rows()
  }

  return (
    <>
      <div class="hyt-side-brand">
        <span class="hyt-side-name">{text(ctx, "hyt.chat.side.title")}</span>
        <button
          type="button"
          class="hyt-side-read"
          aria-label={text(ctx, "hyt.chat.action.readAll")}
          title={text(ctx, "hyt.chat.action.readAll")}
          disabled={props.unread === 0}
          onClick={() => props.onMarkAllRead()}
        >
          <ctx.ui.Icon name="check" size="small" />
        </button>
      </div>

      <label class="hyt-chat-search">
        <span class="hyt-chat-search-icon">
          <ctx.ui.Icon name="magnifying-glass" size="small" />
        </span>
        <input
          type="search"
          value={props.query}
          placeholder={text(ctx, "hyt.chat.search.placeholder")}
          aria-label={text(ctx, "hyt.chat.search.label")}
          onInput={(event) => props.onSearch(event.currentTarget.value)}
        />
      </label>

      <div class="hyt-chat-filters" role="group" aria-label={text(ctx, "hyt.chat.sessions.filter.label")}>
        <button
          type="button"
          class="hyt-chat-filter-chip"
          aria-pressed={filter() === "all" ? "true" : "false"}
          onClick={() => setFilter("all")}
        >
          {text(ctx, "hyt.chat.sessions.filter.all")}
        </button>
        <button
          type="button"
          class="hyt-chat-filter-chip"
          aria-pressed={filter() === "unread" ? "true" : "false"}
          onClick={() => setFilter("unread")}
        >
          {text(ctx, "hyt.chat.sessions.filter.unread")}
          <Show when={props.unread > 0}>
            <span class="hyt-chat-filter-dot" aria-hidden="true" />
          </Show>
        </button>
        <button
          type="button"
          class="hyt-chat-filter-chip"
          aria-pressed={filter() === "at" ? "true" : "false"}
          onClick={() => setFilter("at")}
        >
          {text(ctx, "hyt.chat.sessions.filter.at")}
          <Show when={atCount() > 0}>
            <span class="hyt-chat-filter-dot" aria-hidden="true" />
          </Show>
        </button>
        <button
          type="button"
          class="hyt-chat-filter-chip"
          aria-pressed={filter() === "direct" ? "true" : "false"}
          onClick={() => setFilter("direct")}
        >
          {text(ctx, "hyt.chat.sessions.direct")}
        </button>
        <button
          type="button"
          class="hyt-chat-filter-chip"
          aria-pressed={filter() === "groups" ? "true" : "false"}
          onClick={() => setFilter("groups")}
        >
          {text(ctx, "hyt.chat.sessions.groups")}
        </button>
      </div>

      <div class="hyt-side-scroll">
        <Show
          when={!searching()}
          fallback={
            <div class="hyt-chat-sessions">
              <Show
                when={props.hits.length > 0}
                fallback={<p class="hyt-chat-hint">{props.searching ? text(ctx, "hyt.chat.search.searching") : text(ctx, "hyt.chat.search.empty")}</p>}
              >
                <p class="hyt-chat-hint">{text(ctx, "hyt.chat.search.count", { count: props.hits.length })}</p>
                <For each={props.hits}>{(hit) => <HitRow ctx={ctx} hit={hit} avatars={props.avatars} onSelect={props.onSelect} />}</For>
              </Show>
            </div>
          }
        >
          <Show
            when={visible().length > 0}
            fallback={
              <p class="hyt-chat-hint">
                {filter() === "all" ? text(ctx, "hyt.chat.sessions.empty") : text(ctx, "hyt.chat.sessions.filter.empty")}
              </p>
            }
          >
            <div class="hyt-chat-sessions">
              <For each={visible()}>
                {(session) => (
                  <SessionRowView
                    ctx={ctx}
                    session={session}
                    selected={props.selected}
                    avatars={props.avatars}
                    onSelect={props.onSelect}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      <div class="hyt-side-user">
        <Avatar
          name={props.status.displayName || props.status.account || text(ctx, "hyt.chat.msg.self")}
          members={[]}
          avatars={props.avatars}
          size="head"
        />
        <span class="hyt-side-user-info">
          <span class="hyt-side-user-name">{props.status.displayName || props.status.account || text(ctx, "hyt.chat.msg.self")}</span>
          <span class="hyt-side-user-sub">
            {props.status.bridge === "ready" ? text(ctx, "hyt.chat.user.online") : text(ctx, "hyt.chat.user.offline")}
            <Show when={props.status.account.length > 0}>{` · ${props.status.account}`}</Show>
          </span>
        </span>
        <div class="hyt-side-user-tools">
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
      </div>
    </>
  )
}

function SessionRowView(props: {
  ctx: Context
  session: SessionRow
  selected: string
  avatars: Readonly<Record<string, string>>
  onSelect: (id: string) => void
}) {
  const ctx = props.ctx
  return (
    <button
      type="button"
      class="hyt-chat-session"
      data-unread={props.session.unread > 0 ? "true" : "false"}
      data-group={props.session.group ? "true" : "false"}
      aria-current={props.session.id === props.selected ? "true" : undefined}
      onClick={() => props.onSelect(props.session.id)}
    >
      <Avatar
        name={props.session.name}
        members={props.session.members}
        avatars={props.avatars}
        size="session"
        group={props.session.group}
      />
      <span class="hyt-chat-session-body">
        <span class="hyt-chat-session-top">
          <span class="hyt-chat-session-name">{props.session.name}</span>
          <Show when={props.session.group}>
            <span class="hyt-chat-session-tag">{text(ctx, "hyt.chat.sessions.groupTag")}</span>
          </Show>
          <span class="hyt-chat-session-time">{timeLabel(ctx, props.session.lastAt)}</span>
        </span>
        <span class="hyt-chat-session-bottom">
          <span class="hyt-chat-session-preview">{props.session.preview}</span>
          <Show when={props.session.atMe}>
            <span class="hyt-chat-session-at">{text(ctx, "hyt.chat.sessions.at")}</span>
          </Show>
          <Show when={props.session.unread > 0}>
            <span class="hyt-chat-session-badge">{props.session.unread > 99 ? "99+" : props.session.unread}</span>
          </Show>
          <Show when={props.session.unread === 0 && props.session.atMe}>
            <span class="hyt-chat-session-dot" aria-hidden="true" />
          </Show>
        </span>
      </span>
    </button>
  )
}

function HitRow(props: {
  ctx: Context
  hit: SearchHit
  avatars: Readonly<Record<string, string>>
  onSelect: (id: string, messageId?: number) => void
}) {
  const ctx = props.ctx
  const body = () => props.hit.message.text.replace(/\s+/g, " ").trim() || props.hit.message.fileName
  const sender = () => props.hit.message.senderNick || props.hit.message.sender
  return (
    <button type="button" class="hyt-chat-session" onClick={() => props.onSelect(props.hit.sessionId, props.hit.message.id)}>
      <Avatar
        name={props.hit.sessionName}
        members={
          props.hit.message.senderHead.length > 0
            ? [{ name: props.hit.sessionName, headPath: props.hit.message.senderHead }]
            : []
        }
        avatars={props.avatars}
        size="row"
      />
      <span class="hyt-chat-session-body">
        <span class="hyt-chat-session-top">
          <span class="hyt-chat-session-name">{props.hit.sessionName}</span>
          <span class="hyt-chat-session-time">{formatClock(ctx.locale.locale(), props.hit.message.createdAt)}</span>
        </span>
        <span class="hyt-chat-session-bottom">
          <span class="hyt-chat-session-preview" data-hit="true">
            {props.hit.sessionName === sender() ? "" : `${sender()}：`}
            {body()}
          </span>
        </span>
      </span>
    </button>
  )
}

function timeLabel(ctx: Context, at: number) {
  if (at <= 0) return ""
  const bucket = dayBucket(at)
  if (bucket === "yesterday") return text(ctx, "hyt.chat.day.yesterday")
  return formatListTime(ctx.locale.locale(), at)
}
