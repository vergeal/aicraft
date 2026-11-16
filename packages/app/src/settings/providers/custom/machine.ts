import { detailsValid, draftValid, emptyDraft, type CustomProviderDraft } from "./draft"

export type DiscoveryModel = { readonly id: string; readonly name?: string }

export type Discovery =
  | { readonly type: "idle" }
  | { readonly type: "loading" }
  | { readonly type: "ready"; readonly models: readonly DiscoveryModel[] }
  | { readonly type: "failed" }

export type CustomProviderMode = "create" | "edit"

/**
 * The custom-provider editor and its delete confirmation as one lifecycle. The state is the single source of truth:
 * the dialog's step, its busy flags, its error line and its button labels all read from here rather than from
 * component-local flags.
 */
export type CustomProviderState =
  | { readonly type: "closed" }
  | {
      readonly type: "editing"
      readonly attempt: number
      readonly mode: CustomProviderMode
      readonly step: "details" | "models"
      readonly draft: CustomProviderDraft
      readonly discovery: Discovery
      /** A request failed; the message stays above the footer until the next attempt. */
      readonly error?: string
    }
  | {
      readonly type: "saving"
      readonly attempt: number
      readonly mode: CustomProviderMode
      readonly draft: CustomProviderDraft
      /** Carried through the request so the model list, and the sheet's height, survive it. */
      readonly discovery: Discovery
    }
  | { readonly type: "confirmingDelete"; readonly attempt: number; readonly providerID: string; readonly name: string }
  | { readonly type: "deleting"; readonly attempt: number; readonly providerID: string; readonly name: string }

export type CustomProviderEvent =
  | { readonly type: "open.create"; readonly attempt: number }
  | {
      readonly type: "open.edit"
      readonly attempt: number
      readonly provider: { id: string; name?: string; baseURL?: string; models: readonly string[] }
    }
  | { readonly type: "close" }
  | { readonly type: "draft.changed"; readonly patch: Partial<CustomProviderDraft> }
  | { readonly type: "step.next" }
  | { readonly type: "step.back" }
  | { readonly type: "discover.start" }
  | { readonly type: "discover.succeeded"; readonly attempt: number; readonly models: readonly DiscoveryModel[] }
  | { readonly type: "discover.failed"; readonly attempt: number }
  | { readonly type: "submit.requested" }
  | { readonly type: "submit.succeeded"; readonly attempt: number }
  | { readonly type: "submit.failed"; readonly attempt: number; readonly message: string }
  | { readonly type: "delete.requested"; readonly attempt: number; readonly providerID: string; readonly name: string }
  | { readonly type: "delete.confirmed" }
  | { readonly type: "delete.cancelled" }
  | { readonly type: "delete.succeeded"; readonly attempt: number }
  | { readonly type: "delete.failed"; readonly attempt: number; readonly message: string }

export type CustomProviderEffect =
  | { readonly type: "discover.run"; readonly attempt: number; readonly baseURL: string; readonly apiKey?: string }
  | {
      readonly type: "save.run"
      readonly attempt: number
      readonly mode: CustomProviderMode
      readonly draft: CustomProviderDraft
    }
  | { readonly type: "delete.run"; readonly attempt: number; readonly providerID: string; readonly name: string }
  | { readonly type: "toast.created"; readonly providerName: string }
  | { readonly type: "toast.saved"; readonly providerName: string }
  | { readonly type: "toast.deleted"; readonly providerName: string }

export type CustomProviderTransition = {
  readonly state: CustomProviderState
  readonly effects: readonly CustomProviderEffect[]
}

/** Provider IDs already in the configuration, so a new provider cannot shadow one. */
export type CustomProviderContext = { readonly taken: readonly string[] }

export const closed: CustomProviderState = { type: "closed" }

const none: readonly CustomProviderEffect[] = []

function unchanged(state: CustomProviderState): CustomProviderTransition {
  return { state, effects: none }
}

function toast(name: string): CustomProviderEffect[] {
  return [{ type: "toast.created", providerName: name }]
}

export function transition(
  state: CustomProviderState,
  event: CustomProviderEvent,
  context: CustomProviderContext,
): CustomProviderTransition {
  switch (event.type) {
    case "open.create":
      return {
        state: {
          type: "editing",
          attempt: event.attempt,
          mode: "create",
          step: "details",
          draft: emptyDraft(),
          discovery: { type: "idle" },
        },
        effects: none,
      }
    case "open.edit":
      return {
        state: {
          type: "editing",
          attempt: event.attempt,
          mode: "edit",
          step: "details",
          draft: {
            id: event.provider.id,
            name: event.provider.name ?? event.provider.id,
            baseURL: event.provider.baseURL ?? "",
            apiKey: "",
            models: [...event.provider.models],
          },
          discovery: { type: "idle" },
        },
        effects: none,
      }
    case "close":
      return { state: closed, effects: none }
    case "delete.requested":
      // Deletion starts from the provider row, not from the editor.
      return {
        state: {
          type: "confirmingDelete",
          attempt: event.attempt,
          providerID: event.providerID,
          name: event.name,
        },
        effects: none,
      }
  }

  switch (state.type) {
    case "closed":
      return unchanged(state)

    case "editing": {
      // A result for an earlier attempt belongs to a dialog the user already left.
      if ("attempt" in event && event.attempt !== state.attempt) return unchanged(state)

      if (event.type === "draft.changed")
        return {
          state: { ...state, draft: { ...state.draft, ...event.patch }, error: undefined },
          effects: none,
        }
      if (event.type === "discover.start") {
        if (state.discovery.type === "loading") return unchanged(state)
        return { state: { ...state, discovery: { type: "loading" }, error: undefined }, effects: [
          {
            type: "discover.run",
            attempt: state.attempt,
            baseURL: state.draft.baseURL.trim(),
            apiKey: state.draft.apiKey || undefined,
          },
        ] }
      }
      if (event.type === "discover.succeeded")
        return { state: { ...state, discovery: { type: "ready", models: event.models } }, effects: none }
      if (event.type === "discover.failed") return { state: { ...state, discovery: { type: "failed" } }, effects: none }
      if (event.type === "step.next") {
        if (state.step === "models") return unchanged(state)
        if (!detailsValid(state.draft, context.taken, state.mode)) return unchanged(state)
        return { state: { ...state, step: "models", error: undefined }, effects: none }
      }
      if (event.type === "step.back") {
        if (state.step === "details") return unchanged(state)
        return { state: { ...state, step: "details", discovery: { type: "idle" }, error: undefined }, effects: none }
      }
      if (event.type === "submit.requested") {
        if (!draftValid(state.draft, context.taken, state.mode)) return unchanged(state)
        // Entering `saving` here, before the first await, is what stops a second Enter from creating two providers.
        return {
          state: {
            type: "saving",
            attempt: state.attempt,
            mode: state.mode,
            draft: state.draft,
            discovery: state.discovery,
          },
          effects: [{ type: "save.run", attempt: state.attempt, mode: state.mode, draft: state.draft }],
        }
      }
      return unchanged(state)
    }

    case "saving": {
      if (event.type === "submit.succeeded" && event.attempt === state.attempt)
        return { state: closed, effects: toast(state.draft.name.trim() || state.draft.id) }
      if (event.type === "submit.failed" && event.attempt === state.attempt)
        return {
          state: {
            type: "editing",
            attempt: state.attempt,
            mode: state.mode,
            // A failed save leaves the user where the failing request started: the models step, with the list the
            // request never replaced.
            step: "models",
            draft: state.draft,
            discovery: state.discovery,
            error: event.message,
          },
          effects: none,
        }
      return unchanged(state)
    }

    case "confirmingDelete": {
      if (event.type === "delete.cancelled") return { state: closed, effects: none }
      if (event.type === "delete.confirmed")
        return {
          state: { type: "deleting", attempt: state.attempt, providerID: state.providerID, name: state.name },
          effects: [
            { type: "delete.run", attempt: state.attempt, providerID: state.providerID, name: state.name },
          ],
        }
      return unchanged(state)
    }

    case "deleting": {
      if (event.type === "delete.succeeded" && event.attempt === state.attempt)
        return { state: closed, effects: [{ type: "toast.deleted", providerName: state.name }] }
      if (event.type === "delete.failed" && event.attempt === state.attempt)
        return {
          state: { type: "confirmingDelete", attempt: state.attempt, providerID: state.providerID, name: state.name },
          effects: none,
        }
      return unchanged(state)
    }
  }
}

/** True while a request owns the dialog, so the footer's primary action is disabled and busy. */
export function busy(state: CustomProviderState) {
  return state.type === "saving" || state.type === "deleting"
}

/** Whether the details step may advance, including the field errors the dialog shows. */
export function canContinue(state: CustomProviderState, context: CustomProviderContext) {
  return state.type === "editing" && state.step === "details" && detailsValid(state.draft, context.taken, state.mode)
}

export function canSubmit(state: CustomProviderState, context: CustomProviderContext) {
  return state.type === "editing" && state.step === "models" && draftValid(state.draft, context.taken, state.mode)
}
