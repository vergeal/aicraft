import { For } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import type { IconName } from "@opencode/ui/icons/catalog"

const NAMES: readonly IconName[] = [
  "answer-thinking",
  "answer-console",
  "answer-read",
  "answer-edit",
  "answer-search",
  "answer-list",
  "answer-browse",
  "answer-web-search",
  "answer-subagent",
  "answer-skill",
  "answer-tool",
  "answer-context",
  "answer-analysis",
  "answer-running",
  "answer-success",
  "answer-failure",
  "answer-interrupted",
]

export default {
  title: "OpenCode/Conversation/Answer icons",
  id: "answer-icons",
  parameters: { layout: "fullscreen" },
}

export const Grids = {
  render: () => (
    <div
      data-slot="answer-icons"
      class="flex min-h-dvh flex-wrap content-start gap-4 bg-v2-background-bg-base p-6 text-v2-text-text-base"
    >
      <For each={NAMES}>
        {(name) => (
          <div class="flex w-40 min-w-0 items-center gap-1.5">
            <span class="flex h-[22px] shrink-0 items-center">
              <Icon aria-hidden="true" name={name} size="small" />
            </span>
            <span class="min-w-0 truncate text-[13px] leading-[18px]">{name}</span>
          </div>
        )}
      </For>
    </div>
  ),
}
