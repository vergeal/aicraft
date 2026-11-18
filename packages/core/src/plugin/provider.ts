import { OpenAIPlugin } from "./provider/openai.js"
import { OpenAIContextCapsPlugin } from "./provider/openai-context-caps.js"
import type { PluginInternal } from "./internal.js"

/**
 * The catalog providers this client supports. Every other provider in the models.dev catalogue is dropped before it
 * reaches the Provider service, so a special-case plugin for one of them would have nothing to act on. OpenAI keeps
 * its plugin because it configures the Responses API and the reasoning effort the catalog does not describe; DeepSeek
 * needs none and runs through the shared OpenAI-compatible path.
 *
 * The other provider plugins are kept in `./provider/` on disk but not registered here. To bring one back, import it,
 * add it to this array, and add its provider ID to `CATALOG_PROVIDERS` in `./models-dev.ts`; both are needed because the
 * catalog filter runs before any plugin sees a provider.
 */
export const ProviderPlugins: PluginInternal.InternalPlugin[] = [OpenAIPlugin, OpenAIContextCapsPlugin]
