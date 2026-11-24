import type { Aicraft } from "./client.js"

export * from "./generated/index.js"
export { Aicraft } from "./client.js"
export { mediaHashFromUri, withMediaRefs, type MediaRequestOptions } from "./media.js"
export type {
  AgentApi,
  CommandApi,
  ConfigApi,
  EventApi,
  IntegrationApi,
  ModelApi,
  PluginApi,
  ProviderApi,
  ReferenceApi,
  RpcApi,
  RpcCallOptions,
  RpcClient,
  RpcEventPayload,
  WebSearchApi,
  SessionApi,
  SkillApi,
} from "./api.js"
export type { EventSubscribeOutput as AicraftEvent } from "./generated/types.js"
export type {
  MediaFileAttachment as PromptMediaFileAttachment,
  Attachment as PromptAttachment,
} from "@aicraft/schema/prompt"
export type { TraceContext } from "../trace.js"
export type AicraftClient = ReturnType<typeof Aicraft.make>
