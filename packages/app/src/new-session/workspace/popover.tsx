import { Popover } from "@kobalte/core/popover"
import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode/ui/icon"
import { Keybind } from "@opencode/ui/keybind"
import { MenuScroll } from "@opencode/ui/menu-scroll"
import { Tooltip } from "@opencode/ui/tooltip"
import { getFilename } from "@opencode/util/path"
import { useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import type { NewSessionWorkspaceController } from "./controller"
import "../popover.css"

/** The workspace picker attached to the draft's worktree chip: the local checkout, a new worktree, or an existing one. */
export function NewSessionWorkspacePopover(props: {
  workspace: NewSessionWorkspaceController
  triggerClass: string
  onboarding: boolean
  onDone: () => void
  onSelect?: (value: string) => void
}) {
  const language = useLanguage()
  const command = useCommand()

  const [state, setState] = createStore({ open: false })

  const value = () => props.workspace.selection.value()

  const label = () => {
    const current = value()

    if (current === "main") return language.t("session.new.workspace.triggerLocal")
    if (current === "create") return language.t("workspace.new")
    return getFilename(current)
  }

  const icon = () => {
    const current = value()

    if (current === "main") return "monitor"
    if (current === "create") return "plus"
    return "outline-worktree"
  }

  const entries = () => [
    { value: "main", label: language.t("session.new.workspace.triggerLocal") },
    { value: "create", label: language.t("workspace.new") },
    ...props.workspace.project.workspaces().map((directory) => ({ value: directory, label: getFilename(directory) })),
  ]

  const choose = (selection: string) => {
    props.workspace.selection.set(selection)
    props.onSelect?.(selection)
    setState("open", false)
  }

  command.register("new-session-worktree", () => [
    {
      id: "session.location.select",
      title: language.t("session.location.worktree"),
      category: language.t("command.category.workspace"),
      keybind: "mod+alt+o",
      onSelect: () => setState("open", true),
    },
  ])

  return (
    <Tooltip
      appearance={props.onboarding ? "large" : undefined}
      placement="top"
      openDelay={800}
      value={
        <div class="flex flex-col gap-1 text-start">
          <Show when={props.onboarding}>
            <div class="flex items-center gap-1.5 font-[530] text-v2-text-text-base">
              <Icon name="outline-worktree" size="small" class="shrink-0 text-v2-text-text-accent" />
              <span>{language.t("workspace.onboarding.title")}</span>
            </div>
            <span class="font-[400] text-v2-text-text-muted">{language.t("workspace.onboarding.description")}</span>
          </Show>
          <span
            class="flex items-center justify-between gap-2"
            classList={{ "font-[400] text-v2-text-text-muted": props.onboarding }}
          >
            {language.t("session.location.worktree")}
            <Show when={command.keybindParts("session.location.select").length}>
              <Keybind keys={command.keybindParts("session.location.select")} variant="neutral" />
            </Show>
          </span>
        </div>
      }
      contentClass={props.onboarding ? "max-w-[280px]" : undefined}
      class="flex min-w-12 shrink-[1000]"
    >
      <Popover open={state.open} onOpenChange={(open) => setState("open", open)} placement="top-start" gutter={6}>
        <Popover.Trigger
          class={props.triggerClass}
          aria-description={language.t("session.location.worktree")}
          data-action="prompt-worktree"
          aria-haspopup="listbox"
        >
          <Icon name={icon()} size="small" class="shrink-0 text-v2-icon-icon-muted" />
          <span class="min-w-0 truncate">{label()}</span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            data-component="new-session-popover"
            class="w-[220px] overflow-hidden rounded-xl bg-v2-background-bg-layer-01 p-1 shadow-[var(--v2-elevation-floating)] focus:outline-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              props.onDone()
            }}
          >
            <MenuScroll>
              <div class="flex flex-col gap-1">
                <For each={entries()}>
                  {(entry) => (
                    <button
                      type="button"
                      class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-[13px] font-[400] leading-[var(--line-height-compact)] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none"
                      classList={{
                        "bg-v2-overlay-simple-overlay-hover text-v2-text-text-base": value() === entry.value,
                      }}
                      onClick={() => choose(entry.value)}
                    >
                      <Icon
                        name={entry.value === "main" ? "monitor" : entry.value === "create" ? "plus" : "outline-worktree"}
                        size="small"
                        class="shrink-0 text-v2-icon-icon-muted"
                      />
                      <span class="min-w-0 flex-1 truncate">{entry.label}</span>
                      <Show when={value() === entry.value}>
                        <Icon name="check" size="small" class="shrink-0 text-v2-icon-icon-base" />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </MenuScroll>
          </Popover.Content>
        </Popover.Portal>
      </Popover>
    </Tooltip>
  )
}
