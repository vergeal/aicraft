import { NodeFileSystem } from "@effect/platform-node"
import { compile, emitEffectImported, emitEffectShape, emitPromise, write } from "@aicraft/httpapi-codegen"
import {
  ClientApi,
  clientNamespace,
  effectOmitEndpoints,
  groupNames,
  promiseOmitEndpoints,
} from "@aicraft/protocol/client"
import { Agent } from "@aicraft/schema/agent"
import { Artifact } from "@aicraft/schema/artifact"
import { Command } from "@aicraft/schema/command"
import { Config } from "@aicraft/schema/config"
import { Credential } from "@aicraft/schema/credential"
import { Event } from "@aicraft/schema/event"
import { EventLog } from "@aicraft/schema/event-log"
import { FileDiff } from "@aicraft/schema/file-diff"
import { FileSystem } from "@aicraft/schema/filesystem"
import { Form } from "@aicraft/schema/form"
import { Generate } from "@aicraft/schema/generate"
import { Instruction } from "@aicraft/schema/instruction"
import { InstructionEntry } from "@aicraft/schema/instruction-entry"
import { Integration } from "@aicraft/schema/integration"
import { Job } from "@aicraft/schema/job"
import { Location } from "@aicraft/schema/location"
import { Mcp } from "@aicraft/schema/mcp"
import { Model } from "@aicraft/schema/model"
import { Money } from "@aicraft/schema/money"
import { Permission } from "@aicraft/schema/permission"
import { PermissionSaved } from "@aicraft/schema/permission-saved"
import { Plugin } from "@aicraft/schema/plugin"
import { Project } from "@aicraft/schema/project"
import { Worktree } from "@aicraft/schema/worktree"
import { AgentAttachment, FileAttachment, Prompt, PromptMention } from "@aicraft/schema/prompt"
import { PromptInput } from "@aicraft/schema/prompt-input"
import { Provider } from "@aicraft/schema/provider"
import { Pty } from "@aicraft/schema/pty"
import { PtyTicket } from "@aicraft/schema/pty-ticket"
import { Question } from "@aicraft/schema/question"
import { Reference } from "@aicraft/schema/reference"
import { AbsolutePath, RelativePath } from "@aicraft/schema/schema"
import { Schedule } from "@aicraft/schema/schedule"
import { Session } from "@aicraft/schema/session"
import { SessionMessage } from "@aicraft/schema/session-message"
import { SessionInbox } from "@aicraft/schema/session-inbox"
import { Shell } from "@aicraft/schema/shell"
import { Skill } from "@aicraft/schema/skill"
import { Snapshot } from "@aicraft/schema/snapshot"
import { UsageLimits } from "@aicraft/schema/usage-limits"
import { Vcs } from "@aicraft/schema/vcs"
import { WebSearch } from "@aicraft/schema/websearch"
import { Workspace } from "@aicraft/schema/workspace"
import { Effect, Schema } from "effect"
import { fileURLToPath } from "url"

const promiseContract = compile(ClientApi, {
  groupNames,
  omitEndpoints: promiseOmitEndpoints,
  namespace: clientNamespace,
  aliases: true,
})
const effectContract = compile(ClientApi, {
  groupNames,
  omitEndpoints: effectOmitEndpoints,
  namespace: clientNamespace,
  aliases: true,
})
const effectTypeReferences = [
  ...namespaceTypes("Agent", "@aicraft/schema/agent", Agent),
  ...namespaceTypes("Artifact", "@aicraft/schema/artifact", Artifact),
  ...namespaceTypes("Command", "@aicraft/schema/command", Command),
  ...namespaceTypes("Config", "@aicraft/schema/config", Config),
  ...namespaceTypes("Credential", "@aicraft/schema/credential", Credential),
  ...namespaceTypes("Event", "@aicraft/schema/event", Event),
  ...namespaceTypes("EventLog", "@aicraft/schema/event-log", EventLog),
  ...namespaceTypes("FileDiff", "@aicraft/schema/file-diff", FileDiff),
  ...namespaceTypes("FileSystem", "@aicraft/schema/filesystem", FileSystem),
  ...namespaceTypes("Form", "@aicraft/schema/form", Form),
  ...namespaceTypes("Generate", "@aicraft/schema/generate", Generate),
  ...namespaceTypes("Instruction", "@aicraft/schema/instruction", Instruction),
  ...namespaceTypes("InstructionEntry", "@aicraft/schema/instruction-entry", InstructionEntry),
  ...namespaceTypes("Integration", "@aicraft/schema/integration", Integration),
  ...namespaceTypes("Job", "@aicraft/schema/job", Job),
  typeReference("Location.PublicRef", "@aicraft/schema/location", Location.PublicRef),
  typeReference("Location.PublicInfo", "@aicraft/schema/location", Location.PublicInfo),
  ...namespaceTypes("Mcp", "@aicraft/schema/mcp", Mcp),
  ...namespaceTypes("Model", "@aicraft/schema/model", Model),
  ...namespaceTypes("Money", "@aicraft/schema/money", Money),
  ...namespaceTypes("Permission", "@aicraft/schema/permission", Permission),
  ...namespaceTypes("PermissionSaved", "@aicraft/schema/permission-saved", PermissionSaved),
  ...namespaceTypes("Plugin", "@aicraft/schema/plugin", Plugin),
  ...namespaceTypes("Project", "@aicraft/schema/project", Project),
  ...namespaceTypes("Worktree", "@aicraft/schema/worktree", Worktree),
  ...namespaceTypes("PromptInput", "@aicraft/schema/prompt-input", PromptInput),
  ...namespaceTypes("Provider", "@aicraft/schema/provider", Provider),
  ...namespaceTypes("Pty", "@aicraft/schema/pty", Pty),
  ...namespaceTypes("PtyTicket", "@aicraft/schema/pty-ticket", PtyTicket),
  ...namespaceTypes("Question", "@aicraft/schema/question", Question),
  ...namespaceTypes("Reference", "@aicraft/schema/reference", Reference),
  ...namespaceTypes("Schedule", "@aicraft/schema/schedule", Schedule),
  ...namespaceTypes("Session", "@aicraft/schema/session", Session),
  ...namespaceTypes("SessionMessage", "@aicraft/schema/session-message", SessionMessage),
  ...namespaceTypes("SessionInbox", "@aicraft/schema/session-inbox", SessionInbox),
  ...namespaceTypes("Shell", "@aicraft/schema/shell", Shell),
  ...namespaceTypes("Skill", "@aicraft/schema/skill", Skill),
  ...namespaceTypes("Snapshot", "@aicraft/schema/snapshot", Snapshot),
  ...namespaceTypes("UsageLimits", "@aicraft/schema/usage-limits", UsageLimits),
  ...namespaceTypes("Vcs", "@aicraft/schema/vcs", Vcs),
  ...namespaceTypes("WebSearch", "@aicraft/schema/websearch", WebSearch),
  ...namespaceTypes("Workspace", "@aicraft/schema/workspace", Workspace),
  typeReference("Prompt", "@aicraft/schema/prompt", Prompt),
  typeReference("PromptMention", "@aicraft/schema/prompt", PromptMention),
  typeReference("FileAttachment", "@aicraft/schema/prompt", FileAttachment),
  typeReference("AgentAttachment", "@aicraft/schema/prompt", AgentAttachment),
  typeReference("AbsolutePath", "@aicraft/schema/schema", AbsolutePath),
  typeReference("RelativePath", "@aicraft/schema/schema", RelativePath),
]

await Effect.runPromise(
  Effect.all(
    [
      write(
        emitPromise(promiseContract, {
          mutableOutputs: true,
        }),
        fileURLToPath(new URL("../src/promise/generated", import.meta.url)),
      ),
      write(
        emitEffectImported(effectContract, {
          module: "../../contract",
          api: "ClientApi",
          shapeModule: "../api/api.js",
        }),
        fileURLToPath(new URL("../src/effect/generated", import.meta.url)),
      ),
      write(
        emitEffectShape(effectContract, {
          typeReferences: effectTypeReferences,
          outputTypes: {
            "event.subscribe": {
              name: "AicraftEvent",
              import: 'import type { AicraftEvent } from "@aicraft/protocol/groups/event"',
            },
          },
        }),
        fileURLToPath(new URL("../src/effect/api", import.meta.url)),
      ),
    ],
    { concurrency: 3, discard: true },
  ).pipe(Effect.provide(NodeFileSystem.layer)),
)

function namespaceTypes(namespace: string, module: string, values: object) {
  return Object.entries(values).flatMap(([name, schema]) =>
    Schema.isSchema(schema) ? [typeReference(`${namespace}.${name}`, module, schema)] : [],
  )
}

function typeReference(name: string, module: string, schema: Schema.Top) {
  return {
    schema,
    name,
    import: `import type { ${name.split(".")[0]} } from ${JSON.stringify(module)}`,
  }
}
