import { useDialog } from "@opencode/ui/context/dialog"
import { Tooltip } from "@opencode/ui/tooltip"
import { Icon } from "@opencode/ui/icon"
import { Keybind } from "@opencode/ui/keybind"
import { useCommand } from "@/shell/commands/command"
import { Show, createMemo, createSignal, type JSX } from "solid-js"
import { getFilename } from "@opencode/util/path"
import { displayName } from "@opencode/ui/project-avatar"
import { ProjectFolder } from "@opencode/ui/project-folder"
import { Schema } from "effect"
import { createPresence } from "@/runtime/presence"
import { Composer } from "@/composer/composer"
import { ComposerDropzone } from "@/composer/dropzone"
import type { ComposerModel } from "@/composer/model"
import {
  PromptProjectAddButton,
  type PromptProject,
  type PromptProjectController,
} from "@/new-session/project/selector"
import type { useNewSessionLocationDialog } from "@/new-session/location/dialog"
import { useLanguage } from "@/runtime/i18n/language"
import { useWorkspaceLocation } from "@/workspaces/location"
import { useProviders } from "@/providers/catalog/providers"
import { NEW_SESSION_CONTENT_WIDTH } from "@/new-session/layout"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { Persistence } from "@/runtime/persistence/schema"
import type { NewSessionWorkspaceController } from "./workspace/controller"
import { NewSessionBranch } from "./workspace/selector"

const providerTipDismissalDuration = 30 * 24 * 60 * 60 * 1000

export const WorkspaceOnboardingSchema = Persistence.struct({
  used: Schema.Boolean,
})

export const ProviderTipSchema = Persistence.struct({
  dismissedAt: Schema.Finite,
})

export function NewSessionView(props: {
  composer: ComposerModel
  project: PromptProjectController
  workspace: NewSessionWorkspaceController
  location: ReturnType<typeof useNewSessionLocationDialog>
}) {
  const [onboarding, setOnboarding, , onboardingReady] = persisted(
    Persist.global("workspace-onboarding"),
    WorkspaceOnboardingSchema,
    { used: false },
  )

  const language = useLanguage()

  const location = (project?: PromptProject) =>
    props.location({
      project,
      onWorkspace: (value) => {
        if (value !== "main") setOnboarding("used", true)
      },
    })

  return (
    <div class="@container relative flex flex-col min-h-0 h-full flex-1">
      <div
        data-component="new-session"
        class="relative isolate flex-1 min-h-0 overflow-hidden rounded-[var(--shell-panel-radius,10px)] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]"
      >
        <ComposerDropzone
          active={props.composer.state.drag === "active"}
          input={props.composer.model.selection.current()?.capabilities.input}
        />
        <div class="absolute inset-0 flex items-center justify-center px-6">
          <div class={NEW_SESSION_CONTENT_WIDTH}>
            {/* The welcome header sits centered so the empty state opens like a hero, not a left-aligned form.
                The title runs 26/32 at weight 500: one step larger and lighter than the old 24/600, which read
                as a control label rather than the product's name. */}
            <div data-slot="new-session-welcome" class="mb-3 flex items-center justify-center gap-3">
              <img
                src="/assets/product-mark.png"
                alt=""
                aria-hidden="true"
                width="30"
                height="30"
                class="size-[30px] shrink-0"
              />
              <span class="min-w-0 truncate text-[26px] leading-[32px] font-[500] text-[var(--v2-text-text-base)]">
                {language.t("replica.rail.product")}
              </span>
              <span class="shrink-0 rounded-full bg-[var(--v2-background-bg-layer-02)] px-2 text-[12px] leading-[18px] text-[var(--v2-text-text-muted)] shadow-[inset_0_0_0_0.5px_var(--v2-border-border-base)]">
                {language.t("replica.rail.preview")}
              </span>
            </div>
            <p
              data-slot="new-session-subtitle"
              class="mb-6 text-center text-[14px] leading-[22px] text-[var(--v2-text-text-muted)]"
            >
              {language.t("session.new.welcome.subtitle")}
            </p>
            <div class="flex flex-col">
              {/* The card is the prompt and nothing else. Which project and branch it writes into sits above it as a
                  single quiet line, and the recent-project shortcuts live in the location dialog instead of
                  competing with the input. */}
              <div data-slot="new-session-context" class="mb-2 flex min-w-0 flex-col gap-1">
                <Show when={props.project.selected()}>
                  {(project) => (
                    <NewSessionLocation
                      project={project()}
                      workspace={props.workspace.bar.visible() ? props.workspace.selection.value() : "main"}
                      root={props.workspace.project.root()}
                      branch={<NewSessionBranch workspace={props.workspace} onDone={props.composer.restoreFocus} />}
                      onboarding={onboardingReady() && !onboarding.used && props.workspace.bar.visible()}
                      onClick={() => location()}
                      onWorktree={project().id && project().vcs === "git" ? () => location(project()) : undefined}
                    />
                  )}
                </Show>
                <Show when={props.project.empty()}>
                  <PromptProjectAddButton controller={props.project} />
                </Show>
              </div>
              <div data-slot="new-session-composer" class="relative z-10 -mx-4">
                <Composer model={props.composer} />
              </div>
            </div>
          </div>
        </div>
        <NewSessionTips selection={props.composer.model.selection} onDone={props.composer.restoreFocus} />
      </div>
    </div>
  )
}

function NewSessionTips(props: { selection: ComposerModel["model"]["selection"]; onDone: () => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const sdk = useWorkspaceLocation()
  const providers = useProviders(() => sdk().directory)

  const [providerState, setProviderState, , providerReady] = persisted(
    Persist.global("new-session.provider-tip"),
    ProviderTipSchema,
    { dismissedAt: 0 },
  )

  const providerVisible = createMemo(
    () =>
      providerReady() &&
      providers.anyConnection() === false &&
      Date.now() - providerState.dismissedAt >= providerTipDismissalDuration,
  )

  const tip = providerVisible
  const [ref, setRef] = createSignal<HTMLDivElement>()

  const presence = createPresence({
    show: tip,
    element: () => ref() ?? null,
  })

  const open = () => {
    if (!tip()) return

    void import("@/providers/connect/dialog").then(({ DialogConnectProvider }) => {
      void dialog.show(() => (
        <DialogConnectProvider directory={sdk().directory} selection={props.selection} onDone={props.onDone} />
      ))
    })
  }

  const dismiss = () => {
    if (!tip()) return

    setProviderState("dismissedAt", Date.now())
  }

  return (
    <Show when={presence.present()}>
      <div class="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-10">
        <div
          ref={setRef}
          data-component="new-session-tip"
          data-visible={tip()}
          class="group/new-session-tip pointer-events-auto relative flex h-6 max-w-full items-center transition-[opacity,transform] duration-[250ms] ease-[cubic-bezier(0.215,0.61,0.355,1)] motion-reduce:transition-none"
          classList={{ "data-[visible=false]:animate-out fade-out slide-out-to-bottom-4": true }}
        >
          <button
            type="button"
            class="flex h-6 min-w-0 items-center rounded-full ps-2 text-[13px] leading-[var(--line-height-compact)] tracking-[-0.04px] text-v2-text-text-faint transition-[background-color,color] duration-150 ease-in-out hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-muted focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-muted focus-visible:outline-none"
            onClick={open}
          >
            <span class="truncate">{language.t("home.providerTip")}</span>
            <span class="flex size-6 shrink-0 items-center justify-center" aria-hidden="true">
              <Icon name="chevron-down" size="small" class="-rotate-90" />
            </span>
          </button>
          <Tooltip
            class="hover-reveal absolute left-full top-0 flex h-6 w-7 items-center justify-end delay-0 duration-0 group-hover/new-session-tip:delay-[250ms] group-hover/new-session-tip:duration-150 group-hover/new-session-tip:opacity-100 focus-within:delay-0 focus-within:duration-0 focus-within:opacity-100"
            placement="top"
            openDelay={800}
            value={language.t("common.dismiss")}
          >
            <button
              type="button"
              class="flex size-6 items-center justify-center rounded-full text-v2-icon-icon-muted transition-[background-color,color] duration-150 ease-in-out hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-icon-icon-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-icon-icon-base focus-visible:outline-none"
              aria-label={language.t("common.dismiss")}
              onClick={dismiss}
            >
              <Icon name="xmark-small" />
            </button>
          </Tooltip>
        </div>
      </div>
    </Show>
  )
}

const TRIGGER =
  "flex h-[30px] items-center gap-1.5 rounded-full text-start ps-2.5 pe-2 text-[13px] text-v2-text-text-tertiary transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none"

/** The project chip is the only filled pill in the context row: it names where the session writes. */
const PROJECT_TRIGGER =
  "flex h-[30px] items-center gap-1.5 rounded-full bg-v2-background-bg-layer-02 ps-3 pe-2.5 text-[13px] text-v2-text-text-secondary shadow-[inset_0_0_0_0.5px_var(--v2-border-border-subtle)] transition-colors hover:bg-v2-background-bg-layer-03 hover:text-v2-text-text-base focus-visible:bg-v2-background-bg-layer-03 focus-visible:text-v2-text-text-base focus-visible:outline-none"

/** The composer tray: project and worktree pickers, Git context, and the session's directory. */
function NewSessionLocation(props: {
  project: PromptProject
  /** "main", "create", or a worktree directory. */
  workspace: string
  root: string
  branch?: JSX.Element
  onboarding: boolean
  onClick: () => void
  /** Opens the project's worktree step; without it the project has no worktrees to choose. */
  onWorktree?: () => void
}) {
  const language = useLanguage()
  const command = useCommand()
  command.register("new-session-worktree", () => [
    {
      id: "session.location.select",
      title: language.t("session.location.worktree"),
      category: language.t("command.category.workspace"),
      keybind: "mod+alt+o",
      disabled: !props.onWorktree,
      onSelect: props.onWorktree,
    },
  ])

  const worktree = () => {
    if (props.workspace === "main") return

    if (props.workspace === "create") return language.t("workspace.new")

    return getFilename(props.workspace)
  }

  return (
    <div class="relative flex min-h-[30px] min-w-0 items-center gap-3 text-[13px] font-[400] leading-[var(--line-height-compact)] tracking-[-0.04px]">
      <div class="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1">
        <div class="flex min-w-0 max-w-full items-center gap-3">
          <Show when={props.onWorktree}>
            {(onWorktree) => (
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
                      <span class="font-[400] text-v2-text-text-muted">
                        {language.t("workspace.onboarding.description")}
                      </span>
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
                class="flex min-w-0 shrink-[1000]"
              >
                <button
                  type="button"
                  data-action="prompt-worktree"
                  aria-haspopup="dialog"
                  aria-description={language.t("session.location.worktree")}
                  class={`${TRIGGER} min-w-0`}
                  onClick={onWorktree()}
                >
                  <Icon
                    name={props.workspace === "create" ? "plus" : worktree() ? "outline-worktree" : "monitor"}
                    size="small"
                    class="shrink-0 text-v2-icon-icon-muted"
                  />
                  <span class="min-w-0 truncate">
                    {worktree() ?? language.t("session.new.workspace.triggerLocal")}
                  </span>
                  <Show when={props.onboarding}>
                    <span
                      data-slot="workspace-onboarding-dot"
                      aria-hidden="true"
                      class="size-1.5 shrink-0 rounded-full bg-v2-text-text-accent"
                    />
                  </Show>
                </button>
              </Tooltip>
            )}
          </Show>
          <Tooltip
            placement="top"
            openDelay={800}
            value={
              <span class="flex items-center gap-2">
                {language.t("session.new.project.trigger.tooltip")}
                <Show when={command.keybindParts("project.select").length}>
                  <Keybind keys={command.keybindParts("project.select")} variant="neutral" />
                </Show>
              </span>
            }
            class="flex min-w-0"
          >
            <button
              type="button"
              data-action="prompt-project"
              aria-haspopup="dialog"
              aria-description={language.t("session.new.project.trigger.tooltip")}
              class={`${PROJECT_TRIGGER} min-w-0`}
              onClick={props.onClick}
            >
              <ProjectFolder class="shrink-0" />
              <span class="min-w-0 truncate">{displayName(props.project)}</span>
            </button>
          </Tooltip>
        </div>
        {props.branch}
      </div>
    </div>
  )
}
