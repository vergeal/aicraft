import type { Context } from "@opencode/plugin/gui"
import { For, Show, createMemo, createSignal } from "solid-js"
import { Avatar } from "./avatar.js"
import type { ChatStatus, SearchHit, SessionRow } from "./contract.js"
import { text } from "./i18n.js"
import { dayBucket, formatClock, formatListTime, modKey, reuseRows } from "./util.js"

type Filter = "all" | "unread" | "at" | "direct" | "groups"

/**
 * 左栏：常驻搜索、「会话」标题行、群会话与「私人会话」两段列表。
 *
 * 分组照设计图：群在上、单聊在下，两段内部各按最近消息时间倒序；筛选与搜索在两段之上生效。
 * 「最近谁找过我」因此要在两段里各看一次——这是设计图选的结构，混排版本已按图替换。
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
  const [filterOpen, setFilterOpen] = createSignal(false)
  const filterOptions = () => [
    { id: "all" as const, label: text(ctx, "hyt.chat.sessions.filter.all"), count: rows().length },
    { id: "unread" as const, label: text(ctx, "hyt.chat.sessions.filter.unread"), count: props.unread },
    { id: "at" as const, label: text(ctx, "hyt.chat.sessions.filter.at"), count: atCount() },
    { id: "direct" as const, label: text(ctx, "hyt.chat.sessions.direct"), count: rows().filter((session) => !session.group).length },
    { id: "groups" as const, label: text(ctx, "hyt.chat.sessions.groups"), count: rows().filter((session) => session.group).length },
  ]
  const shown = () => {
    const mode = filter()
    if (mode === "unread") return rows().filter((session) => session.unread > 0)
    if (mode === "at") return rows().filter((session) => session.atMe)
    if (mode === "direct") return rows().filter((session) => !session.group)
    if (mode === "groups") return rows().filter((session) => session.group)
    return rows()
  }
  const groups = () => shown().filter((session) => session.group)
  const personals = () => shown().filter((session) => !session.group)

  // 标题行右侧只有一个计数位：桥接没起来时它比未读数更要紧，因为那时发消息不会成功。
  const countLabel = () => {
    if (props.status.bridge !== "ready") return text(ctx, "hyt.chat.side.readonly")
    return props.unread > 0 ? text(ctx, "hyt.chat.sessions.unread", { count: props.unread }) : ""
  }

  return (
    <>
      <div class="hyt-chat-searcher">
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
            onKeyDown={(event) => {
              if (event.key !== "Escape") return
              props.onSearch("")
              event.currentTarget.blur()
            }}
          />
          <kbd class="hyt-chat-search-key">{modKey() + text(ctx, "hyt.chat.search.shortcut")}</kbd>
        </label>
      </div>

      <div class="hyt-chat-side-head">
        <span class="hyt-chat-side-title">{text(ctx, "hyt.chat.sessions.title")}</span>
        <Show when={countLabel().length > 0}>
          <span class="hyt-chat-side-count" data-tone={props.status.bridge === "ready" ? "muted" : "warning"}>
            {countLabel()}
          </span>
        </Show>
        <div class="hyt-side-filter">
          <button
            type="button"
            class="hyt-chat-icon"
            aria-label={text(ctx, "hyt.chat.sessions.filter.label")}
            title={text(ctx, "hyt.chat.sessions.filter.label")}
            aria-haspopup="menu"
            aria-expanded={filterOpen() ? "true" : "false"}
            onClick={() => setFilterOpen(!filterOpen())}
          >
            <ctx.ui.Icon name="outline-sliders" size="small" />
            <Show when={filter() !== "all"}>
              <span class="hyt-chat-icon-dot" aria-hidden="true" />
            </Show>
          </button>
          <Show when={filterOpen()}>
            <div class="hyt-side-filter-scrim" onClick={() => setFilterOpen(false)} />
            <div class="hyt-side-filter-menu" role="menu" aria-label={text(ctx, "hyt.chat.sessions.filter.label")}>
              <For each={filterOptions()}>
                {(item) => (
                  <button
                    type="button"
                    class="hyt-side-filter-item"
                    role="menuitemradio"
                    aria-checked={filter() === item.id ? "true" : "false"}
                    onClick={() => {
                      setFilter(item.id)
                      setFilterOpen(false)
                    }}
                  >
                    <span class="hyt-side-filter-label">{item.label}</span>
                    <span class="hyt-side-filter-count">{item.count}</span>
                  </button>
                )}
              </For>
              <div class="hyt-side-filter-sep" />
              <button
                type="button"
                class="hyt-side-filter-item"
                role="menuitem"
                disabled={props.unread === 0}
                onClick={() => {
                  props.onMarkAllRead()
                  setFilterOpen(false)
                }}
              >
                <span class="hyt-side-filter-label">{text(ctx, "hyt.chat.action.readAll")}</span>
                <span class="hyt-side-filter-count">{props.unread}</span>
              </button>
            </div>
          </Show>
        </div>
      </div>

      <div class="hyt-chat-side-list">
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
            when={shown().length > 0}
            fallback={
              <p class="hyt-chat-hint">
                {filter() === "all" ? text(ctx, "hyt.chat.sessions.empty") : text(ctx, "hyt.chat.sessions.filter.empty")}
              </p>
            }
          >
            <Show when={groups().length > 0}>
              <div class="hyt-chat-sessions">
                <For each={groups()}>
                  {(session) => <SessionRowView ctx={ctx} session={session} selected={props.selected} avatars={props.avatars} onSelect={props.onSelect} />}
                </For>
              </div>
            </Show>
            <Show when={personals().length > 0}>
              <div class="hyt-chat-side-label">{text(ctx, "hyt.chat.sessions.personal")}</div>
              <div class="hyt-chat-sessions">
                <For each={personals()}>
                  {(session) => <SessionRowView ctx={ctx} session={session} selected={props.selected} avatars={props.avatars} onSelect={props.onSelect} />}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </>
  )
}

/** 一行会话：头像在左，名字与预览同列，时间与未读另起一列贴右。 */
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
      <span class="hyt-chat-face" data-status={props.session.online ? "online" : "offline"}>
        <Avatar
          name={props.session.name}
          members={props.session.members}
          avatars={props.avatars}
          size="session"
          group={props.session.group}
        />
        <Show when={props.session.online}>
          <span class="hyt-chat-face-dot" aria-hidden="true" />
        </Show>
      </span>
      <span class="hyt-chat-session-text">
        <span class="hyt-chat-session-name">{props.session.name}</span>
        <span class="hyt-chat-session-preview">{props.session.preview}</span>
      </span>
      <span class="hyt-chat-session-side">
        <span class="hyt-chat-session-time">{timeLabel(ctx, props.session.lastAt)}</span>
        <Show when={props.session.unread > 0}>
          <span class="hyt-chat-badge">{props.session.unread > 99 ? "99+" : props.session.unread}</span>
        </Show>
        <Show when={props.session.unread === 0 && props.session.atMe}>
          <span class="hyt-chat-badge" data-tone="mention" title={text(ctx, "hyt.chat.sessions.at")}>@</span>
        </Show>
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
        size="session"
      />
      <span class="hyt-chat-session-text">
        <span class="hyt-chat-session-name">{props.hit.sessionName}</span>
        <span class="hyt-chat-session-preview">
          {props.hit.sessionName === sender() ? "" : `${sender()}：`}
          {body()}
        </span>
      </span>
      <span class="hyt-chat-session-side">
        <span class="hyt-chat-session-time">{formatClock(ctx.locale.locale(), props.hit.message.createdAt)}</span>
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
