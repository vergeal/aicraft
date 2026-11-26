/**
 * A custom provider as the editor holds it. The API key never leaves the credential store: the draft only carries the
 * value the user just typed, and it is written through `integration.connect.key`, never through the configuration.
 */
export type CustomProviderDraft = {
  id: string
  name: string
  baseURL: string
  apiKey: string
  models: readonly string[]
}

/** The package a custom OpenAI-compatible provider is registered with. */
export const CUSTOM_PROVIDER_PACKAGE = "@aicraft/ai/providers/openai-compatible"

export const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export const emptyDraft = (): CustomProviderDraft => ({ id: "", name: "", baseURL: "", apiKey: "", models: [] })

/** The saved shape: a provider-level object, so the caller can send it as `providers.<id>` in a config patch. */
export function providerConfig(draft: CustomProviderDraft, existing?: { models?: Readonly<Record<string, unknown>> }) {
  // The key is never part of this object: it goes to the credential store. Settings are merged server-side from the
  // document's raw JSONC, so only the endpoint the user typed is sent. A model that already exists is sent as `{}`,
  // which keeps the document's own entry instead of re-encoding a decoded one.
  const models: Record<string, unknown> = {}
  for (const id of draft.models) models[id] = existing?.models?.[id] === undefined ? { name: id } : {}

  return {
    name: draft.name.trim() || draft.id,
    package: CUSTOM_PROVIDER_PACKAGE,
    settings: { baseURL: draft.baseURL.trim() },
    models,
  }
}

/** Field errors, as keys the dialog resolves through i18n. */
export function idError(draft: CustomProviderDraft, taken: readonly string[], mode: "create" | "edit") {
  if (!draft.id.trim()) return "settings.providers.custom.id.required" as const
  if (!PROVIDER_ID_PATTERN.test(draft.id)) return "settings.providers.custom.id.invalid" as const
  if (mode === "create" && taken.includes(draft.id)) return "settings.providers.custom.id.taken" as const
  return undefined
}

export function baseURLError(draft: CustomProviderDraft) {
  const value = draft.baseURL.trim()
  if (!value || !URL.canParse(value)) return "settings.providers.custom.baseURL.invalid" as const
  const protocol = new URL(value).protocol
  if (protocol !== "http:" && protocol !== "https:") return "settings.providers.custom.baseURL.invalid" as const
  return undefined
}

export function modelsError(draft: CustomProviderDraft) {
  return draft.models.length === 0 ? ("settings.providers.custom.models.required" as const) : undefined
}

export function detailsValid(draft: CustomProviderDraft, taken: readonly string[], mode: "create" | "edit") {
  return !idError(draft, taken, mode) && !baseURLError(draft)
}

export function draftValid(draft: CustomProviderDraft, taken: readonly string[], mode: "create" | "edit") {
  return detailsValid(draft, taken, mode) && !modelsError(draft)
}
/** Whether two drafts would save to the same provider, so the page can tell an untouched form from one in progress. */
export function sameDraft(a: CustomProviderDraft, b: CustomProviderDraft) {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.baseURL === b.baseURL &&
    a.apiKey === b.apiKey &&
    a.models.length === b.models.length &&
    a.models.every((id, index) => id === b.models[index])
  )
}

/**
 * A provider ID an endpoint suggests: its host without the usual `api.`/`www.` prefix, so pasting a base URL fills
 * the identity fields and the user only has to correct them when the guess is wrong.
 */
export function suggestProviderID(baseURL: string) {
  const value = baseURL.trim()

  if (!value || !URL.canParse(value)) return ""

  const label = new URL(value).hostname
    .toLowerCase()
    .replace(/^(api|www)\./, "")
    .split(".")
    .at(0)
  const id = (label ?? "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

  return PROVIDER_ID_PATTERN.test(id) ? id : ""
}

/** The readable name a suggested ID implies: `my-gateway` becomes `My Gateway`. */
export function suggestProviderName(id: string) {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/(^|\s)([a-z0-9])/g, (_match, space: string, letter: string) => space + letter.toUpperCase())
    .trim()
}
