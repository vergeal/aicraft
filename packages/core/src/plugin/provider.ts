import { AmazonBedrockPlugin } from "./provider/amazon-bedrock.js"
import { AzurePlugin } from "./provider/azure.js"
import { CerebrasPlugin } from "./provider/cerebras.js"
import { ChatGPTPlugin } from "./provider/chatgpt.js"
import { ClaudeAgentPlugin } from "./provider/claude-agent/index.js"
import { CloudflareAIGatewayPlugin } from "./provider/cloudflare-ai-gateway.js"
import { CloudflareWorkersAIPlugin } from "./provider/cloudflare-workers-ai.js"
import { DatabricksPlugin } from "./provider/databricks.js"
import { DigitalOceanPlugin } from "./provider/digitalocean.js"
import { GithubCopilotPlugin } from "./provider/github-copilot.js"
import { GitLabPlugin } from "./provider/gitlab.js"
import { GoogleVertexPlugin } from "./provider/google-vertex.js"
import { KiloPlugin } from "./provider/kilo.js"
import { LLMGatewayPlugin } from "./provider/llmgateway.js"
import { LMStudioPlugin } from "./provider/lmstudio.js"
import { ModalPlugin } from "./provider/modal.js"
import { NeonPlugin } from "./provider/neon.js"
import { NvidiaPlugin } from "./provider/nvidia.js"
import { OllamaPlugin } from "./provider/ollama.js"
import { OpenAIPlugin } from "./provider/openai.js"
import { OpenAIContextCapsPlugin } from "./provider/openai-context-caps.js"
import { SnowflakeCortexPlugin } from "./provider/snowflake-cortex.js"
import { OpencodePlugin } from "./provider/opencode.js"
import { OpenRouterPlugin } from "./provider/openrouter.js"
import { PoePlugin } from "./provider/poe.js"
import { PromptCacheKeyPlugin } from "./provider/prompt-cache-key.js"
import { SapAICorePlugin } from "./provider/sap-ai-core.js"
import { VLLMPlugin } from "./provider/vllm.js"
import { XAIPlugin } from "./provider/xai.js"
import { ZenmuxPlugin } from "./provider/zenmux.js"
import type { PluginInternal } from "./internal.js"

/**
 * Mainstream providers, registered on every start. The rest of the catalog ships in this package but stays dormant
 * until the user names it in config, holds a stored credential for it, or exports its environment variable, so a
 * fresh install does not pay for twenty provider plugins it will never use.
 */
export const CoreProviderPlugins: PluginInternal.InternalPlugin[] = [
  ChatGPTPlugin,
  ClaudeAgentPlugin,
  GithubCopilotPlugin,
  LMStudioPlugin,
  OllamaPlugin,
  OpenAIContextCapsPlugin,
  OpenAIPlugin,
  OpenRouterPlugin,
  OpencodePlugin,
  PromptCacheKeyPlugin,
]

/** One dormant provider: the plugin, the provider id it answers to, and the variables that enable it. */
export type OptionalProviderPlugin = {
  readonly plugin: PluginInternal.InternalPlugin
  readonly provider: string
  readonly env: readonly string[]
}

export const OptionalProviderPlugins: readonly OptionalProviderPlugin[] = [
  {
    plugin: AmazonBedrockPlugin,
    provider: "amazon-bedrock",
    env: ["AWS_ACCESS_KEY_ID", "AWS_PROFILE", "AWS_REGION", "AWS_DEFAULT_REGION"],
  },
  {
    plugin: AzurePlugin,
    provider: "azure",
    env: ["AZURE_RESOURCE_NAME", "AZURE_COGNITIVE_SERVICES_RESOURCE_NAME"],
  },
  { plugin: CerebrasPlugin, provider: "cerebras", env: ["CEREBRAS_API_KEY"] },
  {
    plugin: CloudflareAIGatewayPlugin,
    provider: "cloudflare-ai-gateway",
    env: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_GATEWAY_ID", "CLOUDFLARE_API_TOKEN"],
  },
  {
    plugin: CloudflareWorkersAIPlugin,
    provider: "cloudflare-workers-ai",
    env: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_KEY"],
  },
  { plugin: DatabricksPlugin, provider: "databricks", env: ["DATABRICKS_HOST", "DATABRICKS_TOKEN"] },
  { plugin: DigitalOceanPlugin, provider: "digitalocean", env: ["DIGITALOCEAN_ACCESS_TOKEN"] },
  { plugin: GitLabPlugin, provider: "gitlab", env: ["GITLAB_TOKEN", "GITLAB_INSTANCE_URL"] },
  {
    plugin: GoogleVertexPlugin,
    provider: "google-vertex",
    env: [
      "GOOGLE_VERTEX_PROJECT",
      "GOOGLE_CLOUD_PROJECT",
      "GCP_PROJECT",
      "GCLOUD_PROJECT",
      "GOOGLE_APPLICATION_CREDENTIALS",
    ],
  },
  { plugin: KiloPlugin, provider: "kilo", env: ["KILO_API_KEY"] },
  { plugin: LLMGatewayPlugin, provider: "llmgateway", env: ["LLM_GATEWAY_API_KEY"] },
  { plugin: ModalPlugin, provider: "modal", env: ["MODAL_TOKEN_ID"] },
  { plugin: NeonPlugin, provider: "neon", env: ["NEON_API_KEY"] },
  { plugin: NvidiaPlugin, provider: "nvidia", env: ["NVIDIA_API_KEY"] },
  { plugin: PoePlugin, provider: "poe", env: ["POE_API_KEY"] },
  { plugin: SapAICorePlugin, provider: "sap-ai-core", env: ["SAP_AI_CORE_CLIENT_ID"] },
  {
    plugin: SnowflakeCortexPlugin,
    provider: "snowflake-cortex",
    env: ["SNOWFLAKE_ACCOUNT", "SNOWFLAKE_TOKEN"],
  },
  { plugin: VLLMPlugin, provider: "vllm", env: ["VLLM_BASE_URL"] },
  { plugin: XAIPlugin, provider: "xai", env: ["XAI_API_KEY"] },
  { plugin: ZenmuxPlugin, provider: "zenmux", env: ["ZENMUX_API_KEY"] },
]

/** Every provider plugin this package declares, dormant or not. Registration reads {@link providerPluginsFor}. */
export const ProviderPlugins: PluginInternal.InternalPlugin[] = [
  ...CoreProviderPlugins,
  ...OptionalProviderPlugins.map((item) => item.plugin),
]

/**
 * The provider plugins to register: the core set, plus a dormant provider the user named somewhere. Naming it means
 * a `providers` entry in config, a stored credential for that provider, or an exported environment variable; the
 * caller collects those into `named` and `env`, so this stays a pure decision.
 */
export function providerPluginsFor(input: {
  readonly named: ReadonlySet<string>
  readonly env: (name: string) => string | undefined
}): PluginInternal.InternalPlugin[] {
  const optional = OptionalProviderPlugins.filter(
    (item) => input.named.has(item.provider) || item.env.some((name) => Boolean(input.env(name))),
  )
  return [...CoreProviderPlugins, ...optional.map((item) => item.plugin)]
}
