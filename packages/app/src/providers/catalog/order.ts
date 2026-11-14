export const popularProviders = [
  "opencode-go",
  "opencode",
  "anthropic",
  "github-copilot",
  "openai",
  "google",
  "openrouter",
  "vercel",
]

/**
 * Providers the connect pickers and the settings list offer. Everything else stays hidden unless it is already
 * connected or configured, which keeps the catalogue readable while leaving every existing setup reachable. Order
 * is the display order.
 */
export const visibleProviders = [
  "opencode",
  "opencode-go",
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "github-copilot",
  "vercel",
  "ollama",
  "lmstudio",
  "claude-agent",
  "chatgpt",
]

/** Whether a provider row belongs in the connect list: the offered set, or anything already connected. */
export function showsProvider(id: string, connected: boolean) {
  return connected || visibleProviders.includes(id)
}
