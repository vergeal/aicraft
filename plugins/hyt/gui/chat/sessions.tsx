import type { Context } from "@opencode/plugin/gui"
import { For, Show } from "solid-js"
import { Avatar } from "./avatar.js"
import type { SearchHit, SessionRow } from "./contract.js"
import { text } from "./i18n.js"
import { dayBucket, formatClock, formatListTime } from "./util.js"

/** 左栏：搜索框 + 会话列表（或被搜索结果替换）。 */
export function SessionList(props: {
  ctx: Context
  sessions: readonly SessionRow[]
  selected: string
  query: string
  hits: readonly SearchHit[]
  searching: boolean
  avatars: Readonly<Record<string, string>>
  onSelect: (id: string) => void
  onSearch: (query: string) => void
}) {
  const ctx = props.ctx
  const searching = () => props.query.trim().length > 0

  return (
    <>
      <div class="hyt-chat-pane-head">
        <div class="hyt-chat-heading">
          <span class="hyt-chat-heading-title">{text(ctx, "hyt.chat.title")}</span>
          <span class="hyt-chat-heading-sub">
            {text(ctx, "hyt.chat.sessions.title")}
            <Show when={props.sessions.length > 0}>{` · ${props.sessions.length}`}</Show>
          </span>
        </div>
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

      <div class="hyt-chat-scroll">
        <Show
          when={!searching()}
          fallback={
            <div class="hyt-chat-sessions">
              <Show when={props.hits.length > 0} fallback={<p class="hyt-chat-hint">{text(ctx, "hyt.chat.search.empty")}</p>}>
                <p class="hyt-chat-hint">{text(ctx, "hyt.chat.search.count", { count: props.hits.length })}</p>
                <For each={props.hits}>{(hit) => <HitRow ctx={ctx} hit={hit} avatars={props.avatars} onSelect={props.onSelect} />}</For>
              </Show>
            </div>
          }
        >
          <Show
            when={props.sessions.length > 0}
            fallback={<p class="hyt-chat-hint">{text(ctx, "hyt.chat.sessions.empty")}</p>}
          >
            <div class="hyt-chat-sessions">
              <For each={props.sessions}>
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
        </Show>
      </div>
    </>
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
      aria-current={props.current ? "true" : undefined}
      onClick={() => props.onSelect(props.session.id)}
    >
      <Avatar
        ctx={ctx}
        name={props.session.name}
        tone={props.session.tone}
        paths={props.session.headPaths}
        avatars={props.avatars}
        size="row"
      />
      <span class="hyt-chat-session-body">
        <span class="hyt-chat-session-top">
          <Show when={props.session.group}>
            <span class="hyt-chat-group-mark" title={text(ctx, "hyt.chat.sessions.group")}>
              <ctx.ui.Icon name="comment" size="small" />
            </span>
          </Show>
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
        ctx={ctx}
        name={props.hit.sessionName}
        tone="gray"
        paths={props.hit.message.senderHead.length > 0 ? [props.hit.message.senderHead] : []}
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
