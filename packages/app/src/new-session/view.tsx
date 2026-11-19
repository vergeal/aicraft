import { useDialog } from "@opencode/ui/context/dialog"
import { Tooltip } from "@opencode/ui/tooltip"
import { Icon } from "@opencode/ui/icon"
import { Show, createMemo, createSignal, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
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
import { NewSessionProjectPopover } from "@/new-session/project/popover"
import { useLanguage } from "@/runtime/i18n/language"
import { useWorkspaceLocation } from "@/workspaces/location"
import { useProviders } from "@/providers/catalog/providers"
import { NEW_SESSION_CONTENT_WIDTH } from "@/new-session/layout"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { Persistence } from "@/runtime/persistence/schema"
import { useSettings } from "@/settings/model"
import type { NewSessionWorkspaceController } from "./workspace/controller"
import { NewSessionBranch } from "./workspace/selector"
import { NewSessionWorkspacePopover } from "./workspace/popover"
import { NewSessionBrickBreaker } from "./brick-breaker"
import { NewSessionPinBoard, type PinBoardHandle } from "./pin-board"
import { NewSessionWordmark, type LodgerBall } from "./wordmark"

const providerTipDismissalDuration = 30 * 24 * 60 * 60 * 1000

export const WorkspaceOnboardingSchema = Persistence.struct({
  used: Schema.Boolean,
})

export const ProviderTipSchema = Persistence.struct({
  dismissedAt: Schema.Finite,
})

type WordmarkState = {
  box?: HTMLDivElement
  mode: "flat" | "open" | "closing"
  game: boolean
}

type BrickBreakerHandles = {
  board?: PinBoardHandle
  ball?: LodgerBall
}

export function NewSessionView(props: {
  composer: ComposerModel
  project: PromptProjectController
  workspace: NewSessionWorkspaceController
}) {
  const [onboarding, setOnboarding, , onboardingReady] = persisted(
    Persist.global("workspace-onboarding"),
    WorkspaceOnboardingSchema,
    { used: false },
  )

  const settings = useSettings()

  const [wordmark, setWordmark] = createStore<WordmarkState>({ mode: "flat", game: false })

  // Imperative handles for the brick breaker; they are not reactive state.
  const handles: BrickBreakerHandles = {}
  let panel!: HTMLDivElement

  return (
    <div class="@container relative flex flex-col min-h-0 h-full flex-1">
      <div
        ref={panel}
        data-component="new-session"
        class="relative isolate flex-1 min-h-0 overflow-hidden rounded-[var(--shell-panel-radius,10px)] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]"
      >
        <ComposerDropzone
          active={props.composer.state.drag === "active"}
          input={props.composer.model.selection.current()?.capabilities.input}
        />
        <div class="absolute inset-0 flex items-center justify-center px-6">
          <div class={NEW_SESSION_CONTENT_WIDTH}>
            <NewSessionWordmark
              ref={(box) => setWordmark("box", box)}
              sound={settings.sounds.interfaceEnabled}
              onOpen={() => setWordmark("mode", "open")}
              onClose={() => setWordmark("mode", "closing")}
              onFlat={() => setWordmark("mode", "flat")}
              onPlay={(ball) => {
                handles.ball = ball
                setWordmark("game", true)
              }}
            />
            <div class="mt-8 flex flex-col gap-3">
              <div data-slot="new-session-composer" class="relative z-10">
                <Composer
                  model={props.composer}
                  header={
                    <Show when={props.project.selected()}>
                      {(project) => (
                        <NewSessionLocation
                          project={project()}
                          controller={props.project}
                          workspace={props.workspace}
                          branch={
                            <NewSessionBranch workspace={props.workspace} onDone={props.composer.restoreFocus} />
                          }
                          onboarding={onboardingReady() && !onboarding.used && props.workspace.bar.visible()}
                          onDone={props.composer.restoreFocus}
                          onSelectWorkspace={(value) => {
                            if (value !== "main") setOnboarding("used", true)
                          }}
                        />
                      )}
                    </Show>
                  }
                />
              </div>
              <Show when={props.project.empty()}>
                <PromptProjectAddButton controller={props.project} />
              </Show>
            </div>
          </div>
        </div>
        <Show when={wordmark.mode !== "flat" && wordmark.box}>
          {(logo) => (
            <NewSessionPinBoard
              logo={logo()}
              sound={settings.sounds.interfaceEnabled}
              entrance="chain"
              closing={wordmark.mode === "closing"}
              ref={(board) => (handles.board = board)}
            />
          )}
        </Show>
        <Show when={wordmark.game && handles.board && handles.ball && { board: handles.board, ball: handles.ball }}>
          {(game) => (
            <NewSessionBrickBreaker
              panel={panel}
              board={game().board}
              ball={game().ball}
              sound={settings.sounds.interfaceEnabled}
              onDone={() => {
                setWordmark("game", false)
                props.composer.restoreFocus()
              }}
            />
          )}
        </Show>
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
  "flex h-7 items-center gap-1.5 rounded-full text-start ps-1.5 pe-2 text-v2-text-text-muted transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none"

/** The composer tray: project and worktree pickers plus the session's Git context. */
function NewSessionLocation(props: {
  project: PromptProject
  controller: PromptProjectController
  workspace: NewSessionWorkspaceController
  branch?: JSX.Element
  onboarding: boolean
  onDone: () => void
  /** A workspace other than the local checkout marks the onboarding tip as seen. */
  onSelectWorkspace?: (value: string) => void
}) {
  const language = useLanguage()

  return (
    <div class="relative flex h-full w-full min-w-0 items-center gap-3 text-[13px] font-[400] leading-[var(--line-height-compact)] tracking-[-0.04px]">
      <div class="flex min-w-0 max-w-full flex-wrap items-center gap-x-1 gap-y-1">
        <NewSessionProjectPopover
          project={props.project}
          controller={props.controller}
          triggerClass={`${TRIGGER} min-w-0`}
          tooltip={language.t("session.new.project.trigger.tooltip")}
          onDone={props.onDone}
        />
        <Show when={props.workspace.bar.visible()}>
          <NewSessionWorkspacePopover
            workspace={props.workspace}
            triggerClass={`${TRIGGER} min-w-0`}
            onboarding={props.onboarding}
            onDone={props.onDone}
            onSelect={props.onSelectWorkspace}
          />
        </Show>
        {props.branch}
      </div>
    </div>
  )
}


