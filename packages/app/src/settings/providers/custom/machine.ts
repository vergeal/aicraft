import { draftValid, emptyDraft, sameDraft, type CustomProviderDraft } from "./draft"

export type DiscoveryModel = { readonly id: string; readonly name?: string }

/**
 * Reading the endpoint's model list. A failure carries the sentence the reader has to see, so the phase stays the one
 * place the form asks whether the list can be trusted.
 */
export type Discovery =
  | { readonly type: "idle" }
  | { readonly type: "loading" }
  | { readonly type: "ready"; readonly models: readonly DiscoveryModel[] }
  | { readonly type: "failed"; readonly message: string }

export type CustomProviderMode = "create" | "edit"

/** The provider the editor opened on, so an unchanged form can close without asking. */
export type CustomProviderSnapshot = {
  readonly id: string
  readonly name: string
  readonly baseURL: string
  readonly models: readonly string[]
}

/**
 * The custom-provider editor and its delete confirmation as one lifecycle. The state is the single source of truth:
 * the form's busy flags, its error line, its button labels and its leave guard all read from here rather than from
 * component-local flags.
 */
export type CustomProviderState =
  | { readonly type: "closed" }
  | {
      readonly type: "editing"
      readonly attempt: number
      readonly mode: CustomProviderMode
      readonly draft: CustomProviderDraft
      /** The values the page opened with: leaving with a difference asks first. */
      readonly original: CustomProviderDraft
      readonly discovery: Discovery
      /** A request failed; the message stays above the action bar until the next attempt. */
      readonly error?: string
    }
  | {
      readonly type: "saving"
      readonly attempt: number
      readonly mode: CustomProviderMode
      readonly draft: CustomProviderDraft
      readonly original: CustomProviderDraft
      /** Carried through the request so the model list, and the page's height, survive it. */
      readonly discovery: Discovery
    }
  | {
      readonly type: "confirmingDelete"
      readonly attempt: number
      readonly providerID: string
      readonly name: string
      /** The last delete attempt's failure, shown inside the dialog that owns the action. */
      readonly error?: string
    }
  | { readonly type: "deleting"; readonly attempt: number; readonly providerID: string; readonly name: string }

export type CustomProviderEvent =
  | { readonly type: "open.create"; readonly attempt: number }
  | { readonly type: "open.edit"; readonly attempt: number; readonly provider: CustomProviderSnapshot }
  | { readonly type: "close" }
  | { readonly type: "draft.changed"; readonly patch: Partial<CustomProviderDraft> }
  | { readonly type: "discover.start" }
  | { readonly type: "discover.succeeded"; readonly attempt: number; readonly models: readonly DiscoveryModel[] }
  | { readonly type: "discover.failed"; readonly attempt: number; readonly message: string }
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

function snapshot(draft: CustomProviderDraft): CustomProviderDraft {
  return { ...draft, models: [...draft.models] }
}

export function transition(
  state: CustomProviderState,
  event: CustomProviderEvent,
  context: CustomProviderContext,
): CustomProviderTransition {
  switch (event.type) {
    case "open.create": {
      const draft = emptyDraft()

      return {
        state: {
          type: "editing",
          attempt: event.attempt,
          mode: "create",
          draft,
          original: snapshot(draft),
          discovery: { type: "idle" },
        },
        effects: none,
      }
    }
    case "open.edit": {
      const draft: CustomProviderDraft = {
        id: event.provider.id,
        name: event.provider.name ?? event.provider.id,
        baseURL: event.provider.baseURL ?? "",
        apiKey: "",
        models: [...event.provider.models],
      }

      return {
        state: {
          type: "editing",
          attempt: event.attempt,
          mode: "edit",
          draft,
          original: snapshot(draft),
          discovery: { type: "idle" },
        },
        effects: none,
      }
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
      // A result for an earlier attempt belongs to a page the user already left.
      if ("attempt" in event && event.attempt !== state.attempt) return unchanged(state)

      if (event.type === "draft.changed") {
        const draft = { ...state.draft, ...event.patch }
        // A list read from one endpoint says nothing about another, so editing the address retires it.
        const retired = event.patch.baseURL !== undefined && draft.baseURL.trim() !== state.draft.baseURL.trim()

        return {
          state: {
            ...state,
            draft,
            discovery: retired ? { type: "idle" } : state.discovery,
            error: undefined,
          },
          effects: none,
        }
      }
      if (event.type === "discover.start") {
        if (state.discovery.type === "loading") return unchanged(state)

        return {
          state: { ...state, discovery: { type: "loading" }, error: undefined },
          effects: [
            {
              type: "discover.run",
              attempt: state.attempt,
              baseURL: state.draft.baseURL.trim(),
              apiKey: state.draft.apiKey || undefined,
            },
          ],
        }
      }
      if (event.type === "discover.succeeded")
        return { state: { ...state, discovery: { type: "ready", models: event.models } }, effects: none }
      if (event.type === "discover.failed")
        return { state: { ...state, discovery: { type: "failed", message: event.message } }, effects: none }
      if (event.type === "submit.requested") {
        if (!draftValid(state.draft, context.taken, state.mode)) return unchanged(state)

        // Entering `saving` here, before the first await, is what stops a second Enter from creating two providers.
        return {
          state: {
            type: "saving",
            attempt: state.attempt,
            mode: state.mode,
            draft: state.draft,
            original: state.original,
            discovery: state.discovery,
          },
          effects: [{ type: "save.run", attempt: state.attempt, mode: state.mode, draft: state.draft }],
        }
      }

      return unchanged(state)
    }

    case "saving": {
      if (event.type === "submit.succeeded" && event.attempt === state.attempt)
        return {
          state: closed,
          effects: [
            state.mode === "create"
              ? { type: "toast.created", providerName: state.draft.name.trim() || state.draft.id }
              : { type: "toast.saved", providerName: state.draft.name.trim() || state.draft.id },
          ],
        }
      if (event.type === "submit.failed" && event.attempt === state.attempt)
        return {
          state: {
            type: "editing",
            attempt: state.attempt,
            mode: state.mode,
            // A failed save leaves the form as the user left it, with the model list the request never replaced.
            draft: state.draft,
            original: state.original,
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
          effects: [{ type: "delete.run", attempt: state.attempt, providerID: state.providerID, name: state.name }],
        }

      return unchanged(state)
    }

    case "deleting": {
      if (event.type === "delete.succeeded" && event.attempt === state.attempt)
        return { state: closed, effects: [{ type: "toast.deleted", providerName: state.name }] }
      if (event.type === "delete.failed" && event.attempt === state.attempt)
        return {
          state: {
            type: "confirmingDelete",
            attempt: state.attempt,
            providerID: state.providerID,
            name: state.name,
            error: event.message,
          },
          effects: none,
        }

      return unchanged(state)
    }
  }
}

/** True while a request owns the page, so the action bar's primary is disabled and busy. */
export function busy(state: CustomProviderState) {
  return state.type === "saving" || state.type === "deleting"
}

export function canSubmit(state: CustomProviderState, context: CustomProviderContext) {
  return state.type === "editing" && draftValid(state.draft, context.taken, state.mode)
}

/** Whether leaving the page would throw away work the user typed. */
export function dirty(state: CustomProviderState) {
  return state.type === "editing" && !sameDraft(state.draft, state.original)
}
