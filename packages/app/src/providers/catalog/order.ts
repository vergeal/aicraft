export const popularProviders = ["openai", "deepseek"]

/**
 * Providers the connect pickers and the settings list offer. This client ships only the OpenAI and DeepSeek catalog
 * providers; anything else a user needs is added as a custom provider from configuration. `connected` no longer
 * bypasses the list: a provider that was configured earlier is not offered anymore, and its credentials stay
 * manageable through the custom-provider flow.
 */
export const visibleProviders = ["openai", "deepseek"]

/** Whether a provider row belongs in the connect list. */
export function showsProvider(id: string) {
  return visibleProviders.includes(id)
}

/**
 * Whether a row belongs in a list of providers to connect. `showsProvider` alone is not enough: a custom
 * OpenAI-compatible provider the user declared in their own configuration is the only route to a model this
 * allowlist cannot carry, so hiding it leaves that model unreachable from every picker.
 */
export function offersProvider(id: string, customIDs: ReadonlySet<string>) {
  return showsProvider(id) || customIDs.has(id)
}
