import { getFilename } from "@opencode/util/path"
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { useServer } from "@/runtime/server/current"
import { useLanguage } from "@/runtime/i18n/language"
import type { LocalProject } from "@/shell/state/layout"
import type { ServerConnection } from "@/runtime/server/registry"
import { showToast } from "@/shell/notifications/toast"
import {
  projectSaveBusy,
  projectSaveMessage,
  projectSaveStatus,
  projectSaveTransition,
  type ProjectDraft,
  type ProjectSaveEffect,
  type ProjectSaveEvent,
  type ProjectSavePatch,
  type ProjectSaveState,
} from "./project-save-machine"

// The page edits a draft; one project write carries every changed field, so the server sees one update per save
// instead of one per blurred field. The machine owns the phase, and this module only turns its effects into calls.
export function createEditProjectModel(props: { project: LocalProject; server: ServerConnection.Any }) {
  const language = useLanguage()
  const serverCtx = useServer().ctx
  const folderName = createMemo(() => getFilename(props.project.worktree))
  const defaultName = createMemo(() => props.project.name || folderName())

  const saved: ProjectDraft = {
    name: props.project.name?.trim() ?? "",
    prompt: props.project.prompt?.trim() ?? "",
    startup: props.project.commands?.start?.trim() ?? "",
  }

  const [state, setState] = createSignal<ProjectSaveState>({
    type: "editing",
    draft: { name: defaultName(), prompt: saved.prompt, startup: saved.startup },
    saved,
    attempt: 0,
  })

  let noticeTimer: ReturnType<typeof setTimeout> | undefined

  // An empty name means "use the folder name", so comparing the field to the folder name keeps that case clean.
  const normalize = (draft: ProjectDraft): ProjectDraft => ({
    name: draft.name.trim() === folderName() ? "" : draft.name.trim(),
    prompt: draft.prompt.trim(),
    startup: draft.startup.trim(),
  })

  const changes = (draft: ProjectDraft, previous: ProjectDraft): ProjectSavePatch => {
    const next = normalize(draft)
    const patch: ProjectSavePatch = {}

    if (next.name !== previous.name) patch.name = next.name

    if (next.prompt !== previous.prompt) patch.prompt = next.prompt

    if (next.startup !== previous.startup) patch.commands = { start: next.startup }

    return patch
  }

  const persist = async (effect: ProjectSaveEffect) => {
    try {
      if (props.project.id && props.project.id !== "global") {
        const project = await serverCtx.sdk.api.project.update({
          projectID: props.project.id,
          ...effect.patch,
        })

        serverCtx.sync.project.update(project)
      } else {
        serverCtx.sync.project.meta(props.project.worktree, effect.patch)
      }

      dispatch({ type: "saved", attempt: effect.attempt, saved: normalize(effect.draft) })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : language.t("common.requestFailed")
      showToast({ variant: "error", title: language.t("common.requestFailed"), description: message })
      dispatch({ type: "failed", attempt: effect.attempt, message })
    }
  }

  const dispatch = (event: ProjectSaveEvent) => {
    const next = projectSaveTransition(state(), event)
    setState(next.state)
    next.effects.forEach((effect) => void persist(effect))
  }

  // The check mark is a short receipt, not a state the page lingers in.
  createEffect(() => {
    if (projectSaveStatus(state()) !== "saved") return
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => dispatch({ type: "dismiss" }), 1600)
  })
  onCleanup(() => clearTimeout(noticeTimer))

  return {
    state,
    draft: () => state().draft,
    folderName,
    defaultName,
    dirty: () => Object.keys(changes(state().draft, state().saved)).length > 0,
    saving: () => projectSaveBusy(state()),
    status: () => projectSaveStatus(state()),
    error: () => projectSaveMessage(state()),
    setField: (field: keyof ProjectDraft, value: string) => dispatch({ type: "draft", field, value }),
    save: () => {
      const current = state()
      dispatch({ type: "save", patch: changes(current.draft, current.saved) })
    },
    discard: () => dispatch({ type: "discard" }),
  }
}
