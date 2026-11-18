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
