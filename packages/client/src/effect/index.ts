// TODO: Keep additional network capabilities inside Schema and Protocol as the client grows; /effect must never import
// Core or Server. Preserve these datatype exports so internal model reorganizations do not require caller migrations.
import type { Effect } from "effect"
import type { Aicraft } from "./client.js"

export * from "./generated/index"
export { Aicraft } from "./client.js"
export type {
  AgentApi,
  AppApi,
  CommandApi,
  ConfigApi,
  EventApi,
  IntegrationApi,
  ModelApi,
  PluginApi,
  ProviderApi,
  ReferenceApi,
  RpcApi,
  RpcClient,
  WebSearchApi,
  SessionApi,
  SkillApi,
} from "./api.js"
export { Agent } from "@aicraft/schema/agent"
export { Command } from "@aicraft/schema/command"
export { Config } from "@aicraft/schema/config"
export { Credential } from "@aicraft/schema/credential"
export { Event } from "@aicraft/schema/event"
export { EventLog } from "@aicraft/schema/event-log"
export { FileSystem } from "@aicraft/schema/filesystem"
export { Form } from "@aicraft/schema/form"
export { Integration } from "@aicraft/schema/integration"
export { Location } from "@aicraft/schema/location"
export { Model } from "@aicraft/schema/model"
export { Permission } from "@aicraft/schema/permission"
export { PermissionSaved } from "@aicraft/schema/permission-saved"
export { Project } from "@aicraft/schema/project"
export { Worktree } from "@aicraft/schema/worktree"
export { Vcs } from "@aicraft/schema/vcs"
export { Provider } from "@aicraft/schema/provider"
export { Pty } from "@aicraft/schema/pty"
export { Question } from "@aicraft/schema/question"
export { Reference } from "@aicraft/schema/reference"
export { WebSearch } from "@aicraft/schema/websearch"
export { AbsolutePath, RelativePath } from "@aicraft/schema/schema"
export { Session } from "@aicraft/schema/session"
export { SessionInbox } from "@aicraft/schema/session-inbox"
export { SessionMessage } from "@aicraft/schema/session-message"
export { Skill } from "@aicraft/schema/skill"
export { Prompt } from "@aicraft/schema/prompt"
export { PromptInput } from "@aicraft/schema/prompt-input"
export type { AicraftEvent } from "@aicraft/protocol/groups/event"
export type AicraftClient = Effect.Success<ReturnType<typeof Aicraft.make>>
