import type { Context } from "@opencode/plugin/gui"
import { For, Show, createMemo, createSignal, onMount } from "solid-js"
import type { DraftRow, MemberRow, SendState } from "./contract.js"
import { text } from "./i18n.js"

/**
 * 输入区。
 *
 * 桥接就绪时就是一个普通的发送框；未就绪时保持同样的布局但整块锁定，并说明原因，
 * 不做「隐藏输入框」这种布局跳变。AI 草稿块在输入框上方，插入只改草稿、不直接发送。
 */
export function Composer(props: {
  ctx: Context
  sessionName: string
  value: string
  send: SendState
  bridge: "ready" | "missing"
  sending: boolean
  members: readonly MemberRow[]
  draft: DraftRow | undefined
  basis: number
  notice: string | undefined
  onInput: (value: string) => void
  onSend: (body: string, at: readonly string[]) => void
  onUseDraft: (value: string) => void
  onIgnoreDraft: () => void
  onRefresh: () => void
}) {
  let box: HTMLTextAreaElement | undefined
  const [mentionOpen, setMentionOpen] = createSignal(false)
  const [mentionQuery, setMentionQuery] = createSignal("")
  const [active, setActive] = createSignal(0)
  const mentioned = new Map<string, string>()

  const locked = () => !props.send.enabled
  const canSend = () => props.send.enabled && !props.sending && props.value.trim().length > 0

  const candidates = createMemo(() => {
    const query = mentionQuery().trim().toLowerCase()
    const list = props.members.filter((member) => {
      if (query.length === 0) return true
      return member.name.toLowerCase().includes(query) || member.account.toLowerCase().includes(query)
    })
    return list.slice(0, 8)
  })

  const resize = () => {
    if (box === undefined) return
    box.style.height = "auto"
    box.style.height = `${Math.min(box.scrollHeight, 148)}px`
  }

  onMount(resize)

  /** 输入时盯着光标前那个 @：还在同一个词里就继续过滤，遇到空格就收起。 */
  const syncMention = () => {
    if (box === undefined) return
    const caret = box.selectionStart ?? props.value.length
    const before = props.value.slice(0, caret)
    const at = before.lastIndexOf("@")
    if (at < 0) {
      setMentionOpen(false)
      return
    }
    const word = before.slice(at + 1)
    if (/[\s，。,.！？!?]/.test(word)) {
      setMentionOpen(false)
      return
    }
    setMentionQuery(word)
    setMentionOpen(true)
    setActive(0)
  }

  const insertMention = (member: MemberRow) => {
    if (box === undefined) return
    const caret = box.selectionStart ?? props.value.length
    const before = props.value.slice(0, caret)
    const at = before.lastIndexOf("@")
    const head = at >= 0 ? before.slice(0, at) : before
    const tail = props.value.slice(caret)
    const next = `${head}@${member.name} ${tail}`
    mentioned.set(member.name, member.account)
    props.onInput(next)
    setMentionOpen(false)
    queueMicrotask(() => {
      if (box === undefined) return
      const position = head.length + member.name.length + 2
      box.focus()
      box.setSelectionRange(position, position)
      resize()
    })
  }

  const submit = () => {
    if (!canSend()) return
    const body = props.value
    const at = [...mentioned.entries()]
      .filter(([name]) => body.includes(`@${name}`))
      .map(([, account]) => account)
    mentioned.clear()
    setMentionOpen(false)
    props.onSend(body, at)
  }

  const reason = () => {
    const state = props.send
    if (state.reason === "whitelist-empty") return text(props.ctx, "hyt.chat.composer.disabled.whitelist")
    if (state.reason === "not-allowed") return text(props.ctx, "hyt.chat.composer.disabled.notAllowed")
    if (state.reason === "pending") return text(props.ctx, "hyt.chat.composer.disabled.pending")
    return ""
  }

  return (
    <div class="composer">
      <Show when={props.draft !== undefined}>
        <div class="ai-draft">
          <div class="ai-draft-head">
            {text(props.ctx, "hyt.chat.ai.suggestion")}
            <span>{text(props.ctx, "hyt.chat.ai.basis", { count: props.basis })}</span>
          </div>
          <p class="ai-draft-text">{props.draft?.text}</p>
          <div class="ai-draft-actions">
            <button class="draft-btn" type="button" data-primary="true" onClick={() => props.onUseDraft(props.draft?.text ?? "")}>
              {text(props.ctx, "hyt.chat.ai.insert")}
            </button>
            <button class="draft-btn" type="button" onClick={() => props.onRefresh()}>
              {text(props.ctx, "hyt.chat.ai.drafts.refresh")}
            </button>
            <button class="draft-btn" type="button" onClick={() => props.onIgnoreDraft()}>
              {text(props.ctx, "hyt.chat.ai.ignore")}
            </button>
          </div>
        </div>
      </Show>

      <Show when={props.bridge === "missing"}>
        <div class="send-note">
          <b>{text(props.ctx, "hyt.chat.composer.bridge.missing")}</b>
          {text(props.ctx, "hyt.chat.composer.bridge.hint")}
          <button type="button" onClick={() => props.onRefresh()}>
            {text(props.ctx, "hyt.chat.composer.retry")}
          </button>
          <span class="send-note-extra">{text(props.ctx, "hyt.chat.composer.markNote")}</span>
        </div>
      </Show>

      <Show when={props.bridge === "ready" && reason().length > 0}>
        <div class="send-note">{reason()}</div>
      </Show>

      <Show when={props.notice !== undefined}>
        <div class="send-note">{props.notice}</div>
      </Show>

      <div class="box" data-locked={locked() ? "true" : undefined}>
        <Show when={mentionOpen()}>
          <div class="mention-pop" role="listbox" aria-label={text(props.ctx, "hyt.chat.ai.members")}>
            <Show
              when={candidates().length > 0}
              fallback={<div class="mention-empty">{text(props.ctx, "hyt.chat.composer.mentionEmpty")}</div>}
            >
              <For each={candidates()}>
                {(member, index) => (
                  <button
                    class="mention-item"
                    type="button"
                    role="option"
                    aria-selected={index() === active()}
                    data-active={index() === active() ? "true" : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertMention(member)}
                  >
                    {member.name}
                    <small>{member.department || member.account}</small>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Show>

        <textarea
          ref={box}
          rows={2}
          value={props.value}
          disabled={locked()}
          placeholder={
            props.sessionName.length > 0
              ? text(props.ctx, "hyt.chat.composer.replyPlaceholder", { name: props.sessionName })
              : text(props.ctx, "hyt.chat.composer.placeholder")
          }
          onInput={(event) => {
            props.onInput(event.currentTarget.value)
            syncMention()
            resize()
          }}
          onKeyDown={(event) => {
            if (mentionOpen() && candidates().length > 0) {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setActive((active() + 1) % candidates().length)
                return
              }
              if (event.key === "ArrowUp") {
                event.preventDefault()
                setActive((active() - 1 + candidates().length) % candidates().length)
                return
              }
              if (event.key === "Enter" && !event.isComposing) {
                event.preventDefault()
                insertMention(candidates()[active()]!)
                return
              }
              if (event.key === "Escape") {
                event.preventDefault()
                setMentionOpen(false)
                return
              }
            }
            if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
            event.preventDefault()
            submit()
          }}
        />

        <div class="tools">
          <button class="tool" type="button" disabled aria-label={text(props.ctx, "hyt.chat.composer.image")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="m5 17 4.5-4 3.5 3 2.5-2 3.5 3" />
            </svg>
          </button>
          <button class="tool" type="button" disabled aria-label={text(props.ctx, "hyt.chat.composer.attach")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
              <path d="M13.5 6.5 8 12a3.5 3.5 0 0 0 5 5l6-6a2.5 2.5 0 0 0-3.5-3.5l-5.5 5.5" />
            </svg>
          </button>
          <button
            class="tool"
            type="button"
            aria-label={text(props.ctx, "hyt.chat.composer.mention")}
            aria-expanded={mentionOpen() ? "true" : "false"}
            onClick={() => {
              setMentionQuery("")
              setMentionOpen(!mentionOpen())
              setActive(0)
              box?.focus()
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.6 7.2" />
            </svg>
          </button>
          <span class="tools-hint">{text(props.ctx, "hyt.chat.composer.hint")}</span>
          <button class="send" type="button" disabled={!canSend()} onClick={submit}>
            {props.sending ? text(props.ctx, "hyt.chat.composer.sending") : text(props.ctx, "hyt.chat.composer.send")}
          </button>
        </div>
      </div>
    </div>
  )
}
