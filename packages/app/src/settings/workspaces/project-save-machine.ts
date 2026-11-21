/**
 * The project page edits a draft and writes it on request, so the page has three observable phases: editing a draft
 * (possibly just saved), a write in flight, and a failed write that still holds the draft. The draft and the last
 * saved values live in every phase because the fields stay rendered throughout; only the phase-specific fields
 * (`notice`, `message`, `attempt`) determine what the header shows.
 */
export type ProjectDraft = {
  readonly name: string
  readonly prompt: string
  readonly startup: string
}

/** The subset of a project write the page can produce; `model` maps it onto the SDK's input shape. */
export type ProjectSavePatch = {
  name?: string
  prompt?: string
  commands?: { readonly start: string }
}

type Base = {
  readonly draft: ProjectDraft
  readonly saved: ProjectDraft
  /** The write this page most recently started, so a late answer cannot settle a newer one. */
  readonly attempt: number
}

export type ProjectSaveState =
  | (Base & { readonly type: "editing"; readonly notice?: "saved" })
  | (Base & { readonly type: "saving" })
  | (Base & { readonly type: "failed"; readonly message: string })

export type ProjectSaveEvent =
  | { readonly type: "draft"; readonly field: keyof ProjectDraft; readonly value: string }
  | { readonly type: "discard" }
  | { readonly type: "save"; readonly patch: ProjectSavePatch }
  | { readonly type: "saved"; readonly attempt: number; readonly saved: ProjectDraft }
  | { readonly type: "failed"; readonly attempt: number; readonly message: string }
  | { readonly type: "dismiss" }

export type ProjectSaveEffect = {
  readonly type: "persist"
  readonly attempt: number
  readonly draft: ProjectDraft
  readonly patch: ProjectSavePatch
}

export type ProjectSaveTransition = {
  readonly state: ProjectSaveState
  readonly effects: readonly ProjectSaveEffect[]
}

export type ProjectSaveStatus = "idle" | "saving" | "saved" | "failed"

const unchanged = (state: ProjectSaveState): ProjectSaveTransition => ({ state, effects: [] })

const editing = (base: Base, notice?: "saved"): ProjectSaveState => ({ type: "editing", ...base, notice })

const sameDraft = (a: ProjectDraft, b: ProjectDraft) =>
  a.name === b.name && a.prompt === b.prompt && a.startup === b.startup

export function projectSaveTransition(state: ProjectSaveState, event: ProjectSaveEvent): ProjectSaveTransition {
  switch (event.type) {
    case "draft": {
      if (state.type === "saving") return unchanged(state)

      if (state.draft[event.field] === event.value) return unchanged(state)

      return {
        state: editing({ draft: { ...state.draft, [event.field]: event.value }, saved: state.saved, attempt: state.attempt }),
        effects: [],
      }
    }

    case "discard": {
      if (state.type === "saving") return unchanged(state)

      if (state.type === "editing" && !state.notice && sameDraft(state.draft, state.saved)) return unchanged(state)

      return { state: editing({ draft: state.saved, saved: state.saved, attempt: state.attempt }), effects: [] }
    }

    case "save": {
      if (state.type === "saving") return unchanged(state)

      if (Object.keys(event.patch).length === 0) {
        if (state.type === "editing" && !state.notice) return unchanged(state)

        return { state: editing(state), effects: [] }
      }

      const attempt = state.attempt + 1

      return {
        state: { type: "saving", draft: state.draft, saved: state.saved, attempt },
        effects: [{ type: "persist", attempt, draft: state.draft, patch: event.patch }],
      }
    }

    case "saved": {
      if (state.type !== "saving" || state.attempt !== event.attempt) return unchanged(state)

      return {
        state: editing({ draft: state.draft, saved: event.saved, attempt: state.attempt }, "saved"),
        effects: [],
      }
    }

    case "failed": {
      if (state.type !== "saving" || state.attempt !== event.attempt) return unchanged(state)

      return {
        state: {
          type: "failed",
          draft: state.draft,
          saved: state.saved,
          attempt: state.attempt,
          message: event.message,
        },
        effects: [],
      }
    }

    case "dismiss": {
      if (state.type !== "editing" || state.notice !== "saved") return unchanged(state)

      return { state: editing({ draft: state.draft, saved: state.saved, attempt: state.attempt }), effects: [] }
    }
  }
}

export function projectSaveStatus(state: ProjectSaveState): ProjectSaveStatus {
  if (state.type === "saving") return "saving"

  if (state.type === "failed") return "failed"

  return state.notice === "saved" ? "saved" : "idle"
}

export function projectSaveBusy(state: ProjectSaveState) {
  return state.type === "saving"
}

export function projectSaveMessage(state: ProjectSaveState) {
  return state.type === "failed" ? state.message : undefined
}
