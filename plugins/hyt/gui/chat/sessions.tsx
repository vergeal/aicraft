import type { Context } from "@opencode/plugin/gui"
import { For, Show, createSignal } from "solid-js"
import { Avatar } from "./avatar.js"
import type { ChatStatus, SearchHit, SessionRow } from "./contract.js"
import { text } from "./i18n.js"
import { dayBucket, formatClock, formatListTime } from "./util.js"

type Filter = "all" | "unread" | "at"

/**
 * 左栏：品牌、搜索、AI 入口、分组会话列表、当前用户。
 *
 * 分组全部由真实数据推出来：未读与 @我 是筛选入口，单聊 / 群聊按 `session.group` 分。
 * 没有任何会话时不留空白，直接用一句说明占位。
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
  onSelect: (id: string) => void
  onSearch: (query: string) => void
  onAi: () => void
  onRefresh: () => void
}) {
  const ctx = props.ctx
  const [filter, setFilter] = createSignal<Filter>("all")
  const searching = () => props.query.trim().length > 0
  const atCount = () => props.sessions.filter((session) => session.atMe).length
  const direct = () => visible(props.sessions.filter((session) => !session.group))
  const groups = () => visible(props.sessions.filter((session) => session.group))

  const visible = (rows: readonly SessionRow[]) => {
    const current = filter()
    if (current === "unread") return rows.filter((session) => session.unread > 0)
    if (current === "at") return rows.filter((session) => session.atMe)
    return rows
  }

  const toggle = (next: Filter) => setFilter((current) => (current === next ? "all" : next))

  return (
    <>
      <div class="hyt-side-brand">
        <span class="hyt-side-logo" aria-hidden="true">
          <ctx.ui.Icon name="bubble-5" size="normal" />
        </span>
        <span class="hyt-side-name">{text(ctx, "hyt.chat.nav")}</span>
        <span class="hyt-side-badge">{text(ctx, "hyt.chat.brand.badge")}</span>
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

      <button type="button" class="hyt-ai-entry" onClick={() => props.onAi()}>
        <span class="hyt-ai-entry-mark" aria-hidden="true">
          <ctx.ui.Icon name="brain" size="normal" />
        </span>
        <span class="hyt-ai-entry-body">
          <span class="hyt-ai-entry-name">{text(ctx, "hyt.chat.ai.title")}</span>
          <span class="hyt-ai-entry-sub">
            {text(ctx, "hyt.chat.ai.entry.sub", { drafts: props.draftCount, knowledge: props.knowledgeCount })}
          </span>
        </span>
        <span class="hyt-ai-entry-go" aria-hidden="true">
          <ctx.ui.Icon name="chevron-right" size="small" />
        </span>
      </button>

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
          <div class="hyt-side-section">
            <ctx.ui.Icon name="notifications" size="small" />
            {text(ctx, "hyt.chat.sessions.notice")}
          </div>

          <div class="hyt-chat-sessions">
            <button
              type="button"
              class="hyt-chat-session hyt-chat-filter"
              aria-pressed={filter() === "unread" ? "true" : "false"}
              onClick={() => toggle("unread")}
            >
              <span class="hyt-chat-filter-icon" aria-hidden="true">
                <ctx.ui.Icon name="bubble-5" size="small" />
              </span>
              <span class="hyt-chat-session-body">
                <span class="hyt-chat-session-top">
                  <span class="hyt-chat-session-name">{text(ctx, "hyt.chat.sessions.filter.unread")}</span>
                </span>
                <span class="hyt-chat-session-bottom">
                  <span class="hyt-chat-session-preview">{text(ctx, "hyt.chat.sessions.filter.unread.hint")}</span>
                </span>
              </span>
              <Show when={props.unread > 0}>
                <span class="hyt-chat-session-badge">{props.unread > 99 ? "99+" : props.unread}</span>
              </Show>
            </button>

            <button
              type="button"
              class="hyt-chat-session hyt-chat-filter"
              aria-pressed={filter() === "at" ? "true" : "false"}
              onClick={() => toggle("at")}
            >
              <span class="hyt-chat-filter-icon" aria-hidden="true">
                <ctx.ui.Icon name="comment" size="small" />
              </span>
              <span class="hyt-chat-session-body">
                <span class="hyt-chat-session-top">
                  <span class="hyt-chat-session-name">{text(ctx, "hyt.chat.sessions.filter.at")}</span>
                </span>
                <span class="hyt-chat-session-bottom">
                  <span class="hyt-chat-session-preview">{text(ctx, "hyt.chat.sessions.filter.at.hint")}</span>
                </span>
              </span>
              <Show when={atCount() > 0}>
                <span class="hyt-chat-session-badge">{atCount()}</span>
              </Show>
            </button>
          </div>

          <Show when={props.sessions.length > 0} fallback={<p class="hyt-chat-hint">{text(ctx, "hyt.chat.sessions.empty")}</p>}>
            <SessionGroup
              ctx={ctx}
              label={text(ctx, "hyt.chat.sessions.direct")}
              icon="comment"
              rows={direct()}
              total={props.sessions.filter((session) => !session.group).length}
              selected={props.selected}
              avatars={props.avatars}
              onSelect={props.onSelect}
            />
            <SessionGroup
              ctx={ctx}
              label={text(ctx, "hyt.chat.sessions.groups")}
              icon="bubble-5"
              rows={groups()}
              total={props.sessions.filter((session) => session.group).length}
              selected={props.selected}
              avatars={props.avatars}
              onSelect={props.onSelect}
            />
            <Show when={filter() !== "all" && direct().length === 0 && groups().length === 0}>
              <p class="hyt-chat-hint">{text(ctx, "hyt.chat.sessions.filter.empty")}</p>
            </Show>
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

function SessionGroup(props: {
  ctx: Context
  label: string
  icon: "comment" | "bubble-5"
  rows: readonly SessionRow[]
  total: number
  selected: string
  avatars: Readonly<Record<string, string>>
  onSelect: (id: string) => void
}) {
  const ctx = props.ctx
  return (
    <Show when={props.total > 0}>
      <div class="hyt-side-section">
        <ctx.ui.Icon name={props.icon} size="small" />
        {props.label}
        <span class="hyt-side-section-count">{props.total}</span>
      </div>
      <div class="hyt-chat-sessions">
        <For each={props.rows}>
          {(session) => (
            <SessionRowView
              ctx={ctx}
              session={session}
              current={session.id === props.selected}
              avatars={props.avatars}
              onSelect={props.onSelect}
            />
          )}
        </For>
      </div>
    </Show>
  )
}

function SessionRowView(props: {
  ctx: Context
  session: SessionRow
  current: boolean
  avatars: Readonly<Record<string, string>>
  onSelect: (id: string) => void
}) {
  const ctx = props.ctx
  return (
    <button
      type="button"
      class="hyt-chat-session"
      data-unread={props.session.unread > 0 ? "true" : "false"}
      aria-current={props.current ? "true" : undefined}
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
  onSelect: (id: string) => void
}) {
  const ctx = props.ctx
  const body = () => props.hit.message.text.replace(/\s+/g, " ").trim() || props.hit.message.fileName
  return (
    <button type="button" class="hyt-chat-session" onClick={() => props.onSelect(props.hit.sessionId)}>
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
          <span class="hyt-chat-session-preview">{body()}</span>
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
