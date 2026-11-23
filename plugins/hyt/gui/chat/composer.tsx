import type { Context } from "@opencode/plugin/gui"
import { For, Show, createMemo, createSignal } from "solid-js"
import type { MemberRow, SendState } from "./contract.js"
import { text } from "./i18n.js"
import { Avatar } from "./avatar.js"
import { modKey } from "./util.js"

const EMOJI = ["👍", "😄", "😂", "🙏", "✅", "🎉", "❤️", "😅", "🤝", "👀", "🔧", "⚠️"] as const

/**
 * 输入区：上排工具行（表情、图片、文件、@、@AI），下排输入 + 快捷键提示 + 发送键。
 *
 * 排版照设计图 `hyt-chat.html`：卡片 88 高、圆角 16，工具行 36 在上。发送是 ⌘/Ctrl + Enter，
 * Enter 留给换行——图上的键位提示就写在输入行右侧，说了什么就必须按什么工作。
 * 发送走真实消息通道；图片与文件还没有协议支持，点了直接说明原因。
 */
export function Composer(props: {
  ctx: Context
  value: string
  onInput: (value: string) => void
  send: SendState
  sending: boolean
  members: readonly MemberRow[]
  onSend: (body: string, at: readonly string[]) => void
  onNotice: (message: string, tone: "muted" | "warning" | "danger") => void
  notice: { readonly tone: "muted" | "warning" | "danger"; readonly message: string } | undefined
  onReady: (element: HTMLTextAreaElement) => void
}) {
  const ctx = props.ctx
  const [emojiOpen, setEmojiOpen] = createSignal(false)
  const [mentioned, setMentioned] = createSignal<readonly MemberRow[]>([])
  let textarea: HTMLTextAreaElement | undefined

  const query = createMemo(() => {
    const value = props.value
    const index = value.lastIndexOf("@")
    if (index < 0) return undefined
    const tail = value.slice(index + 1)
    if (/[\s\n]/.test(tail)) return undefined
    return tail
  })

  const candidates = createMemo(() => {
    const needle = query()
    if (needle === undefined) return []
    const lower = needle.toLowerCase()
    return props.members
      .filter((member) => {
        if (lower.length === 0) return true
        return member.name.toLowerCase().includes(lower) || member.account.toLowerCase().includes(lower)
      })
      .slice(0, 6)
  })

  const insert = (value: string) => {
    props.onInput(value)
    textarea?.focus()
  }

  const pickEmoji = (emoji: string) => {
    insert(`${props.value}${emoji}`)
    setEmojiOpen(false)
  }

  const pickMember = (member: MemberRow) => {
    const value = props.value
    const index = value.lastIndexOf("@")
    const head = index < 0 ? value : value.slice(0, index)
    insert(`${head}@${member.name} `)
    setMentioned((current) => (current.some((item) => item.account === member.account) ? current : [...current, member]))
  }

  const accounts = () => {
    const fromText = props.members
      .filter((member) => props.value.includes(`@${member.name}`))
      .map((member) => member.account)
    return [...new Set([...mentioned().map((item) => item.account), ...fromText])]
  }

  const submit = () => {
    if (!props.send.enabled || props.sending) return
    if (props.value.trim().length === 0) {
      props.onNotice(text(ctx, "hyt.chat.composer.empty"), "muted")
      return
    }
    props.onSend(props.value, accounts())
  }

  // 消息通道只接受文本，图片与文件得先有协议支持；点了就说明，不让用户白选文件。
  const attach = () => {
    props.onNotice(text(ctx, "hyt.chat.composer.notWired"), "warning")
  }

  const disabledReason = () => (props.send.enabled ? "" : text(ctx, "hyt.chat.composer.disabled.no-session"))

  return (
    <div class="hyt-chat-composer">
      <div class="hyt-chat-composer-card">
        <Show when={candidates().length > 0}>
          <div class="hyt-chat-mentions">
            <For each={candidates()}>
              {(member) => (
                <button type="button" class="hyt-chat-mention-row" onClick={() => pickMember(member)}>
                  <Avatar name={member.name} members={[]} avatars={{}} size="mention" />
                  <span class="hyt-chat-mention-name">{member.name}</span>
                  <span class="hyt-chat-mention-dept">{member.department || member.account}</span>
                </button>
              )}
            </For>
          </div>
        </Show>

        <div class="hyt-chat-composer-tools">
          <button
            type="button"
            class="hyt-chat-icon"
            aria-label={text(ctx, "hyt.chat.composer.emoji")}
            title={text(ctx, "hyt.chat.composer.emoji")}
            aria-pressed={emojiOpen() ? "true" : "false"}
            onClick={() => setEmojiOpen(!emojiOpen())}
          >
            <FaceGlyph />
          </button>
          <button
            type="button"
            class="hyt-chat-icon"
            aria-label={text(ctx, "hyt.chat.composer.image")}
            title={text(ctx, "hyt.chat.composer.image")}
            onClick={attach}
          >
            <ctx.ui.Icon name="outline-photo" size="small" />
          </button>
          <button
            type="button"
            class="hyt-chat-icon"
            aria-label={text(ctx, "hyt.chat.composer.attach")}
            title={text(ctx, "hyt.chat.composer.attach")}
            onClick={attach}
          >
            <ctx.ui.Icon name="file-document" size="small" />
          </button>
          <button
            type="button"
            class="hyt-chat-icon"
            aria-label={text(ctx, "hyt.chat.composer.mention")}
            title={text(ctx, "hyt.chat.composer.mention")}
            onClick={() => insert(`${props.value}@`)}
          >
            <AtGlyph />
          </button>
          <button
            type="button"
            class="hyt-ai-chip"
            aria-label={text(ctx, "hyt.chat.composer.ai")}
            title={text(ctx, "hyt.chat.composer.ai")}
            onClick={() => insert(`${props.value}@AI `)}
          >
            <ctx.ui.Icon name="outline-brain" size="small" />
            @AI
          </button>
        </div>

        <div class="hyt-chat-composer-row">
          <textarea
            ref={(element) => {
              textarea = element
              props.onReady(element)
            }}
            rows={1}
            value={props.value}
            placeholder={text(ctx, "hyt.chat.composer.placeholder")}
            aria-label={text(ctx, "hyt.chat.composer.placeholder")}
            onInput={(event) => {
              props.onInput(event.currentTarget.value)
              const element = event.currentTarget
              element.style.height = "auto"
              element.style.height = `${Math.min(element.scrollHeight, 140)}px`
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.isComposing) return
              if (!(event.metaKey || event.ctrlKey)) return
              event.preventDefault()
              submit()
            }}
          />
          <span class="hyt-chat-composer-hint">
            <kbd>{modKey()}</kbd> + <kbd>Enter</kbd> {text(ctx, "hyt.chat.composer.send")}
          </span>
          <button
            type="button"
            class="hyt-chat-send"
            aria-label={text(ctx, "hyt.chat.composer.send")}
            title={sendTitle(ctx, props.send, props.sending)}
            aria-busy={props.sending ? "true" : undefined}
            disabled={!props.send.enabled || props.sending || props.value.trim().length === 0}
            onClick={() => submit()}
          >
            <PlaneGlyph />
          </button>
        </div>

        <Show when={emojiOpen()}>
          <div class="hyt-chat-emoji">
            <For each={EMOJI}>
              {(emoji) => (
                <button type="button" class="hyt-chat-icon" aria-label={emoji} onClick={() => pickEmoji(emoji)}>
                  {emoji}
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show when={props.notice !== undefined}>
        <p class="hyt-chat-composer-note" data-tone={props.notice?.tone}>
          {props.notice?.message}
        </p>
      </Show>
      <Show when={disabledReason().length > 0}>
        <p class="hyt-chat-composer-note" data-tone="warning">
          {disabledReason()}
        </p>
      </Show>
    </div>
  )
}

function sendTitle(ctx: Context, send: SendState, sending: boolean) {
  if (sending) return text(ctx, "hyt.chat.composer.disabled.pending")
  if (!send.enabled) return text(ctx, "hyt.chat.composer.disabled.no-session")
  return text(ctx, "hyt.chat.composer.send")
}

/* 表情与 @ 在宿主图标库里没有对应图形，按设计图的线稿就地画：形状、1.75 描边与图上其余图标一致。 */
function FaceGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.8 14.2a4 4 0 0 0 6.4 0M9.5 9.8v.2M14.5 9.8v.2" />
    </svg>
  )
}

function AtGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v4.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5" />
    </svg>
  )
}

function PlaneGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M20 4 3.5 10.5l6 2.5 2.5 6L20 4Z" />
      <path d="m9.5 13 4-4" />
    </svg>
  )
}
