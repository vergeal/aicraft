import type { Context } from "@opencode/plugin/gui"
import { For, Show } from "solid-js"
import type { ChatStatus, DraftRow, KnowledgeHit } from "./contract.js"
import { text } from "./i18n.js"
import { formatClock } from "./util.js"

/** 右栏：AI 托管的只读状态、草稿与知识库命中。写入方是后台助手，这里不提供编辑。 */
export function AiPanel(props: {
  ctx: Context
  status: ChatStatus
  drafts: readonly DraftRow[]
  knowledge: readonly KnowledgeHit[]
  onUseDraft: (body: string) => void
  onRefresh: () => void
}) {
  const ctx = props.ctx
  return (
    <>
      <div class="hyt-chat-pane-head">
        <div class="hyt-chat-heading">
          <span class="hyt-chat-heading-title">
            <ctx.ui.Icon name="brain" size="normal" />
            {text(ctx, "hyt.chat.ai.title")}
          </span>
          <span class="hyt-chat-heading-sub">{text(ctx, "hyt.chat.ai.readonly")}</span>
        </div>
      </div>

      <div class="hyt-chat-scroll">
        <div class="hyt-chat-ai-body">
          <div class="hyt-chat-ai-block">
            <span class="hyt-chat-ai-label">{text(ctx, "hyt.chat.ai.runtime")}</span>
            <div class="hyt-chat-ai-card">
              <div class="hyt-chat-ai-row">
                <span class="hyt-chat-ai-row-title">{text(ctx, "hyt.chat.ai.autopilot")}</span>
                <span class="hyt-chat-pill" data-on={props.status.autopilot ? "true" : "false"}>
                  {props.status.autopilot ? text(ctx, "hyt.chat.ai.autopilot.on") : text(ctx, "hyt.chat.ai.autopilot.off")}
                </span>
              </div>
              <span class="hyt-chat-ai-note">{text(ctx, "hyt.chat.ai.autopilot.hint")}</span>
            </div>
          </div>

          <div class="hyt-chat-ai-block">
            <span class="hyt-chat-ai-label">{text(ctx, "hyt.chat.ai.drafts")}</span>
            <Show
              when={props.drafts.length > 0}
              fallback={
                <EmptyCard
                  title={text(ctx, "hyt.chat.ai.drafts.empty.title")}
                  body={text(ctx, "hyt.chat.ai.drafts.empty.body")}
                  action={text(ctx, "hyt.chat.ai.drafts.empty.action")}
                  onAction={props.onRefresh}
                />
              }
            >
              <For each={props.drafts}>
                {(draft) => (
                  <div class="hyt-chat-draft">
                    <span class="hyt-chat-draft-text">{draft.text}</span>
                    <div class="hyt-chat-draft-foot">
                      <span class="hyt-chat-draft-note">
                        {draft.note}
                        <Show when={draft.createdAt > 0}>{` · ${formatClock(ctx.locale.locale(), draft.createdAt)}`}</Show>
                      </span>
                      <button type="button" class="hyt-chat-link" onClick={() => props.onUseDraft(draft.text)}>
                        {text(ctx, "hyt.chat.ai.drafts.use")}
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>

          <div class="hyt-chat-ai-block">
            <span class="hyt-chat-ai-label">{text(ctx, "hyt.chat.ai.knowledge")}</span>
            <Show
              when={props.knowledge.length > 0}
              fallback={
                <EmptyCard
                  title={text(ctx, "hyt.chat.ai.knowledge.empty.title")}
                  body={text(ctx, "hyt.chat.ai.knowledge.empty.body")}
                  action={text(ctx, "hyt.chat.ai.drafts.empty.action")}
                  onAction={props.onRefresh}
                />
              }
            >
              <For each={props.knowledge}>
                {(hit) => (
                  <div class="hyt-chat-ai-card">
                    <span class="hyt-chat-ai-row-title">{hit.title}</span>
                    <span class="hyt-chat-ai-note">{hit.snippet}</span>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </>
  )
}

/** 三段式空态：标题说这里是什么，副文说怎么让它有东西，按钮说现在做什么。 */
function EmptyCard(props: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <div class="hyt-chat-ai-empty">
      <span class="hyt-chat-ai-empty-title">{props.title}</span>
      <span class="hyt-chat-ai-empty-body">{props.body}</span>
      <button type="button" class="hyt-chat-link" onClick={() => props.onAction()}>
        {props.action}
      </button>
    </div>
  )
}
