import type { Context } from "@opencode/plugin/gui"
import { For, Show } from "solid-js"
import type { KnowledgeHit, MemberRow } from "./contract.js"
import { text } from "./i18n.js"
import { initials, toneOf } from "./util.js"

/** 右栏：当前会话的成员与 AI 快捷指令。点成员或指令都把文本插进输入框，不直接发送。 */
export function AiPanel(props: {
  ctx: Context
  members: readonly MemberRow[]
  knowledge: readonly KnowledgeHit[]
  onMention: (name: string) => void
  onCommand: (value: string) => void
  onClose: () => void
}) {
  const ctx = props.ctx
  return (
    <>
      <div class="hyt-ctx-head">
        <span>{text(ctx, "hyt.chat.members.title")}</span>
        <div class="hyt-ctx-head-tools">
          <span class="hyt-ctx-head-count">{text(ctx, "hyt.chat.members.count", { count: props.members.length })}</span>
          <button
            type="button"
            class="hyt-icon-button"
            aria-label={text(ctx, "hyt.chat.panel.close")}
            title={text(ctx, "hyt.chat.panel.close")}
            onClick={() => props.onClose()}
          >
            <ctx.ui.Icon name="close" size="small" />
          </button>
        </div>
      </div>

      <div class="hyt-ctx-scroll">
        <div class="hyt-ctx-group">
          <i class="hyt-ctx-group-dot" aria-hidden="true" />
          {text(ctx, "hyt.chat.members.group", { count: props.members.length })}
        </div>

        <Show
          when={props.members.length > 0}
          fallback={<p class="hyt-ctx-empty">{text(ctx, "hyt.chat.members.empty")}</p>}
        >
          <For each={props.members}>
            {(member) => (
              <button type="button" class="hyt-ctx-member" onClick={() => props.onMention(member.name)}>
                <span class="hyt-chat-avatar" data-tone={toneOf(member.account)} data-size="member" aria-hidden="true">
                  {initials(member.name)}
                </span>
                <span class="hyt-ctx-member-name">{member.name}</span>
                <span class="hyt-ctx-member-role" title={member.department}>
                  {member.department || member.account}
                </span>
              </button>
            )}
          </For>
        </Show>

        <Show when={props.knowledge.length > 0}>
          <div class="hyt-ctx-card">
            <div class="hyt-ctx-card-title">
              <ctx.ui.Icon name="brain" size="small" />
              {text(ctx, "hyt.chat.ai.knowledge")}
            </div>
            <For each={props.knowledge}>
              {(hit) => (
                <div class="hyt-ctx-kb-item">
                  <span class="hyt-ctx-kb-title">{hit.title}</span>
                  <span class="hyt-ctx-kb-snippet">{hit.snippet}</span>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div class="hyt-ctx-card">
          <div class="hyt-ctx-card-title">
            <ctx.ui.Icon name="brain" size="small" />
            {text(ctx, "hyt.chat.ai.commands")}
          </div>
          <For each={COMMANDS}>
            {(command) => (
              <button
                type="button"
                class="hyt-ctx-cmd"
                title={text(ctx, command.hint)}
                onClick={() => props.onCommand(command.value)}
              >
                <kbd>/{text(ctx, command.label)}</kbd>
                {text(ctx, command.hint)}
              </button>
            )}
          </For>
        </div>
      </div>
    </>
  )
}

const COMMANDS = [
  { label: "hyt.chat.ai.cmd.summary", hint: "hyt.chat.ai.cmd.summary.hint", value: "@AI 总结一下这个会话的要点" },
  { label: "hyt.chat.ai.cmd.todo", hint: "hyt.chat.ai.cmd.todo.hint", value: "@AI 从这个会话里提取待办" },
  { label: "hyt.chat.ai.cmd.translate", hint: "hyt.chat.ai.cmd.translate.hint", value: "@AI 翻译选中的消息" },
  { label: "hyt.chat.ai.cmd.draft", hint: "hyt.chat.ai.cmd.draft.hint", value: "@AI 按我的语气起草一条回复" },
] as const
