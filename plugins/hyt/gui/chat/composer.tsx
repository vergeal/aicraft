import type { Context } from "@opencode/plugin/gui"
import { For, Show, createMemo, createSignal } from "solid-js"
import type { MemberRow, SendState } from "./contract.js"
import { text } from "./i18n.js"
import { initials } from "./util.js"

const EMOJI = ["👍", "😄", "😂", "🙏", "✅", "🎉", "❤️", "😅", "🤝", "👀", "🔧", "⚠️"] as const

/**
 * 输入区：文本、@AI、表情、@ 选人、附件、发送。
 *
 * 排版沿用设计稿：单行起高，左侧一个「+」，右侧工具条与发送键。
 * 发送走真实消息通道；附件通道还没接，按钮会说明原因。
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

  // 消息通道只接受文本，发文件得先有协议支持；点了就说明，不让用户白选文件。
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
                  <span class="hyt-chat-avatar" data-tone="gray" data-size="mention" aria-hidden="true">
                    {initials(member.name)}
                  </span>
                  <span class="hyt-chat-mention-name">{member.name}</span>
                  <span class="hyt-chat-mention-dept">{member.department || member.account}</span>
                </button>
              )}
            </For>
          </div>
        </Show>

        <div class="hyt-chat-composer-row">
          <button
            type="button"
            class="hyt-chat-tool"
            aria-label={text(ctx, "hyt.chat.composer.attach")}
            title={text(ctx, "hyt.chat.composer.attach")}
            onClick={attach}
          >
            <ctx.ui.Icon name="plus" size="small" />
          </button>

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
              element.style.height = `${Math.min(element.scrollHeight, 120)}px`
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                event.preventDefault()
                submit()
              }
            }}
          />

          <div class="hyt-chat-composer-tools">
            <button
              type="button"
              class="hyt-ai-chip"
              aria-label={text(ctx, "hyt.chat.composer.ai")}
              title={text(ctx, "hyt.chat.composer.ai")}
              onClick={() => insert(`${props.value}@AI `)}
            >
              <ctx.ui.Icon name="brain" size="small" />
              @AI
            </button>

            <button
              type="button"
              class="hyt-chat-tool"
              aria-label={text(ctx, "hyt.chat.composer.emoji")}
              title={text(ctx, "hyt.chat.composer.emoji")}
              aria-pressed={emojiOpen() ? "true" : "false"}
              onClick={() => setEmojiOpen(!emojiOpen())}
            >
              <span aria-hidden="true">🙂</span>
            </button>
            <button
              type="button"
              class="hyt-chat-tool"
              aria-label={text(ctx, "hyt.chat.composer.mention")}
              title={text(ctx, "hyt.chat.composer.mention")}
              onClick={() => insert(`${props.value}@`)}
            >
              <span aria-hidden="true" style={{ "font-size": "var(--font-size-small)", "font-weight": "var(--font-weight-bold)" }}>
                @
              </span>
            </button>
            <button
              type="button"
              class="hyt-chat-send"
              aria-label={text(ctx, "hyt.chat.composer.send")}
              title={text(ctx, "hyt.chat.composer.send")}
              aria-busy={props.sending ? "true" : undefined}
              disabled={!props.send.enabled || props.sending}
              onClick={() => submit()}
            >
              <ctx.ui.Icon name="arrow-up" size="normal" />
            </button>
          </div>
        </div>

        <Show when={emojiOpen()}>
          <div class="hyt-chat-emoji">
            <For each={EMOJI}>
              {(emoji) => (
                <button type="button" class="hyt-chat-tool" aria-label={emoji} onClick={() => pickEmoji(emoji)}>
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
