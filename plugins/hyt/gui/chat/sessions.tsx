import type { Context } from "@opencode/plugin/gui"
import { For, Show, createMemo } from "solid-js"
import type { DraftRow, SearchHit, SessionRow } from "./contract.js"
import { text } from "./i18n.js"
import { Face } from "./avatar.js"
import { dayLabel, rowTime } from "./util.js"

/**
 * 左栏：品牌、搜索、会话台账。
 *
 * 台账按天分组，未读会话的摘要用荧光笔划过；搜索有查询词时整栏换成命中列表，
 * 这是设计稿里「台账 / 命中」二选一的真实行为，不是两个页面。
 */
export function Rail(props: {
  ctx: Context
  sessions: readonly SessionRow[]
  selected: string
  unread: number
  query: string
  hits: readonly SearchHit[]
  searching: boolean
  drafts: readonly DraftRow[]
  avatars: Record<string, string>
  today: string
  onSelect: (sessionId: string, messageId?: number) => void
  onSearch: (query: string) => void
  onMarkAllRead: () => void
  onEscape: () => void
}) {
  const searching = () => props.query.trim().length > 0
  const draftSessions = createMemo(() => new Set(props.drafts.map((draft) => draft.sessionId)))

  /** 按天插入日期行：相邻两条会话跨天时才插，不重复写同一个日期。 */
  const rows = createMemo(() => {
    const rows: ({ kind: "day"; label: string } | { kind: "entry"; session: SessionRow })[] = []
    let current = ""
    for (const session of props.sessions) {
      const label = dayLabel(props.ctx, session.lastAt)
      if (label !== current) {
        rows.push({ kind: "day", label })
        current = label
      }
      rows.push({ kind: "entry", session })
    }
    return rows
  })

  const label = (session: SessionRow) => {
    const parts = [session.name, session.group ? text(props.ctx, "hyt.chat.sessions.group") : text(props.ctx, "hyt.chat.sessions.direct")]
    if (session.unread > 0) parts.push(text(props.ctx, "hyt.chat.entry.unread", { count: session.unread }))
    if (session.atMe) parts.push(text(props.ctx, "hyt.chat.entry.atMe"))
    if (draftSessions().has(session.id)) parts.push(text(props.ctx, "hyt.chat.entry.draft"))
    parts.push(rowTime(props.ctx, session.lastAt))
    return parts.filter((part) => part.length > 0).join("，")
  }

  return (
    <aside class="rail" aria-label={text(props.ctx, "hyt.chat.rail.label")}>
      <div class="brand">
        <div class="brand-text">
          <h1 class="brand-name">{text(props.ctx, "hyt.chat.brand.name")}</h1>
          <div class="brand-sub">{props.today}</div>
        </div>
        <Show when={props.unread > 0}>
          <button
            class="brand-unread"
            type="button"
            title={text(props.ctx, "hyt.chat.action.readAll")}
            onClick={() => props.onMarkAllRead()}
          >
            {text(props.ctx, "hyt.chat.unread.total", { count: props.unread })}
          </button>
        </Show>
      </div>

      <div class="search">
        <input
          type="search"
          placeholder={text(props.ctx, "hyt.chat.search.placeholder")}
          aria-label={text(props.ctx, "hyt.chat.search.placeholder")}
          value={props.query}
          onInput={(event) => props.onSearch(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return
            event.currentTarget.blur()
            props.onEscape()
          }}
        />
        <kbd>{text(props.ctx, "hyt.chat.search.shortcut")}</kbd>
      </div>

      <div class="hits" hidden={!searching()}>
        <div class="hits-head">
          <span>
            {searching() && !props.searching
              ? text(props.ctx, "hyt.chat.search.result", { count: props.hits.length })
              : text(props.ctx, "hyt.chat.search.searching")}
          </span>
          <span>{text(props.ctx, "hyt.chat.search.esc")}</span>
        </div>

        <Show when={!props.searching}>
          <For each={props.hits}>
            {(hit) => (
              <button class="hit" type="button" onClick={() => props.onSelect(hit.sessionId, hit.message.id)}>
                <span class="hit-head">
                  <span class="hit-name">{hit.sessionName}</span>
                  <span class="hit-time">{rowTime(props.ctx, hit.message.createdAt)}</span>
                </span>
                <span class="hit-text">
                  <Snippet text={snippetOf(props.ctx, hit)} query={props.query} />
                </span>
              </button>
            )}
          </For>

          <Show when={props.hits.length === 0 && props.query.trim().length > 0}>
            <div class="search-empty">
              <strong>{text(props.ctx, "hyt.chat.search.empty")}</strong>
              {text(props.ctx, "hyt.chat.search.noMore.hint")}
            </div>
          </Show>
          <Show when={props.hits.length > 0}>
            <div class="search-empty">
              <strong>{text(props.ctx, "hyt.chat.search.noMore")}</strong>
              {text(props.ctx, "hyt.chat.search.noMore.hint")}
            </div>
          </Show>
        </Show>
      </div>

      <div class="ledger" hidden={searching()}>
        <Show
          when={props.sessions.length > 0}
          fallback={
            <div class="search-empty">
              <strong>{text(props.ctx, "hyt.chat.sessions.empty")}</strong>
            </div>
          }
        >
          <For each={rows()}>
            {(row) =>
              row.kind === "day" ? (
                <div class="day">{row.label}</div>
              ) : (
                <button
                  class="entry"
                  type="button"
                  aria-current={row.session.id === props.selected ? "true" : undefined}
                  data-unread={row.session.unread > 0 ? "true" : undefined}
                  aria-label={label(row.session)}
                  onClick={() => props.onSelect(row.session.id)}
                >
                  <Face
                    name={row.session.members[0]?.name ?? row.session.name}
                    src={avatarOf(props.avatars, row.session.members[0]?.headPath)}
                  />
                  <span class="entry-text">
                    <span class="entry-head">
                      {row.session.group ? <GroupGlyph /> : <DirectGlyph />}
                      <span class="entry-name">{row.session.name}</span>
                      <span class="entry-time">{rowTime(props.ctx, row.session.lastAt)}</span>
                    </span>
                    <span class="entry-line">
                      <span class="entry-preview">
                        <Show when={draftSessions().has(row.session.id)}>
                          <span class="draft-mark">{text(props.ctx, "hyt.chat.ai.drafts")}</span>
                        </Show>
                        <Show when={row.session.unread > 0} fallback={row.session.preview}>
                          <span class="hl">{row.session.preview}</span>
                        </Show>
                      </span>
                      <Show when={row.session.atMe}>
                        <span class="badge" aria-hidden="true">
                          @
                        </span>
                      </Show>
                      <Show when={!row.session.atMe && row.session.unread > 0}>
                        <span class="badge badge--count" aria-hidden="true">
                          {row.session.unread > 99 ? "99+" : row.session.unread}
                        </span>
                      </Show>
                    </span>
                  </span>
                </button>
              )
            }
          </For>
        </Show>
      </div>

      <div class="rail-foot">
        {text(props.ctx, "hyt.chat.rail.foot")}
        <Show when={draftSessions().size > 0}>
          {" · "}
          <strong>{text(props.ctx, "hyt.chat.rail.drafts", { count: draftSessions().size })}</strong>
        </Show>
      </div>
    </aside>
  )
}

function avatarOf(map: Record<string, string>, path: string | undefined) {
  if (path === undefined || path.length === 0) return undefined
  const value = map[path]
  return value === undefined || value.length === 0 ? undefined : value
}

/** 命中的一行：正文优先，附件退到文件名，再退到类型说明。 */
function snippetOf(ctx: Context, hit: SearchHit) {
  const message = hit.message
  const body = message.text.trim()
  if (body.length > 0) return `${message.senderNick}：${body}`
  if (message.fileName.length > 0) return `${message.senderNick}：${message.fileName}`
  const labels: Readonly<Record<string, string>> = {
    image: text(ctx, "hyt.chat.msg.image.short"),
    voice: text(ctx, "hyt.chat.msg.voice.short"),
    video: text(ctx, "hyt.chat.msg.video.short"),
    call: text(ctx, "hyt.chat.msg.call.short"),
    recall: text(ctx, "hyt.chat.msg.recall"),
    merge: text(ctx, "hyt.chat.msg.merge"),
    notice: text(ctx, "hyt.chat.msg.notice"),
    other: text(ctx, "hyt.chat.msg.unsupported"),
    file: text(ctx, "hyt.chat.msg.file.short"),
  }
  return `${message.senderNick}：${labels[message.kind] ?? ""}`
}

/** 命中片段里把查询词包进 `<mark>`，大小写不敏感。 */
function Snippet(props: { text: string; query: string }) {
  const parts = createMemo(() => {
    const body = props.text
    const needle = props.query.trim()
    if (needle.length === 0) return [{ body, hit: false }]
    const lower = body.toLowerCase()
    const target = needle.toLowerCase()
    const out: { body: string; hit: boolean }[] = []
    let at = 0
    for (;;) {
      const found = lower.indexOf(target, at)
      if (found < 0) {
        if (at < body.length) out.push({ body: body.slice(at), hit: false })
        break
      }
      if (found > at) out.push({ body: body.slice(at, found), hit: false })
      out.push({ body: body.slice(found, found + target.length), hit: true })
      at = found + target.length
    }
    return out
  })

  return (
    <>
      <For each={parts()}>
        {(part) => (part.hit ? <mark>{part.body}</mark> : part.body)}
      </For>
    </>
  )
}

function GroupGlyph() {
  return (
    <svg class="entry-kind" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <circle cx="6" cy="5.5" r="2.3" />
      <path d="M2 13c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5" />
      <circle cx="11.6" cy="6" r="1.8" />
      <path d="M13.9 13c0-1.7-1-2.7-2.6-2.9" />
    </svg>
  )
}

function DirectGlyph() {
  return (
    <svg class="entry-kind" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.6" />
      <path d="M3.2 13.5c0-2.6 2.1-4.2 4.8-4.2s4.8 1.6 4.8 4.2" />
    </svg>
  )
}
