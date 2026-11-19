import { Popover } from "@kobalte/core/popover"
import { For, Show, createMemo, createEffect } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode/ui/icon"
import { MenuScroll } from "@opencode/ui/menu-scroll"
import { displayName } from "@opencode/ui/project-avatar"
import { ProjectFolder } from "@opencode/ui/project-folder"
import { useLanguage } from "@/runtime/i18n/language"
import type { PromptProject, PromptProjectController } from "./selector"
import "../popover.css"

/** The project picker attached to the draft's project chip: search, switch project, or add one. */
export function NewSessionProjectPopover(props: {
  project: PromptProject
  controller: PromptProjectController
  triggerClass: string
  tooltip: string
  onDone: () => void
}) {
  const language = useLanguage()
  const [state, setState] = createStore({ open: false, query: "" })

  let input: HTMLInputElement | undefined

  const items = createMemo(() => {
    const query = state.query.trim().toLowerCase()
    const projects = props.controller.projects()

    if (!query) return projects
    return projects.filter(
      (project) =>
        displayName(project).toLowerCase().includes(query) || project.worktree.toLowerCase().includes(query),
    )
  })

  const choose = (project: PromptProject) => {
    props.controller.select(project)
    setState({ open: false, query: "" })
  }

  createEffect(() => {
    if (!state.open) return
    requestAnimationFrame(() => input?.focus())
  })

  return (
    <Popover
      open={state.open}
      onOpenChange={(open) => setState({ open, query: "" })}
      placement="top-start"
      gutter={6}
    >
      <Popover.Trigger
        class={props.triggerClass}
        aria-description={props.tooltip}
        data-action="prompt-project"
        aria-haspopup="listbox"
      >
        <ProjectFolder class="shrink-0" />
        <span class="min-w-0 truncate">{displayName(props.project)}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-component="new-session-popover"
          class="w-[264px] overflow-hidden rounded-xl bg-v2-background-bg-layer-01 shadow-[var(--v2-elevation-floating)] focus:outline-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            props.onDone()
          }}
        >
          <div class="flex h-9 items-center gap-1.5 px-2.5">
            <Icon name="magnifying-glass" size="small" class="shrink-0 text-v2-icon-icon-muted" />
            <input
              ref={input}
              value={state.query}
              autocomplete="off"
              spellcheck={false}
              aria-label={language.t("session.new.project.search")}
              placeholder={language.t("session.new.project.search")}
              class="min-w-0 flex-1 bg-transparent text-[13px] font-[400] leading-[var(--line-height-compact)] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
              onInput={(event) => setState("query", event.currentTarget.value)}
            />
          </div>
          <Show
            when={items().length > 0}
            fallback={
              <div class="flex h-8 items-center px-2.5 text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-faint">
                {language.t("palette.empty")}
              </div>
            }
          >
            <MenuScroll class="max-h-[260px]" viewportClass="p-1">
              <div class="flex flex-col gap-1">
                <For each={items()}>
                  {(project) => (
                    <button
                      type="button"
                      class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-[13px] font-[400] leading-[var(--line-height-compact)] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none"
                      classList={{ "bg-v2-overlay-simple-overlay-hover text-v2-text-text-base": props.controller.isSelected(project) }}
                      onClick={() => choose(project)}
                    >
                      <ProjectFolder class="shrink-0" />
                      <span class="min-w-0 flex-1 truncate">{displayName(project)}</span>
                      <Show when={props.controller.isSelected(project)}>
                        <Icon name="check" size="small" class="shrink-0 text-v2-icon-icon-base" />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </MenuScroll>
          </Show>
          <div class="border-t-[0.5px] border-v2-border-border-muted p-1">
            <button
              type="button"
              class="flex h-8 w-full items-center gap-2 rounded-md px-2 text-start text-[13px] font-[400] leading-[var(--line-height-compact)] text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none"
              onClick={() => {
                setState("open", false)
                props.controller.add()
              }}
            >
              <Icon name="plus" size="small" class="shrink-0 text-v2-icon-icon-muted" />
              <span class="min-w-0 flex-1 truncate">{language.t("session.new.project.new")}</span>
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}
