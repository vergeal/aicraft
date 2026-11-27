export * as SessionModelRequest from "./model-request.js"

import {
  ai,
  AssistantMessage,
  type ContentPart,
  GENERATION_KEYS,
  type GenerationOptionsFields,
  LanguageModel,
  type LLM,
  type LLMRequest,
  type Media,
  type MediaPart,
  Message,
  SystemPart,
  ToolMessage,
  type ToolResultPart,
  UserMessage,
} from "@aicraft/ai/effect"
import type { StreamOptions } from "@aicraft/ai/route"
import type {
  SessionCompaction,
  SessionContext,
  SessionGenerate,
  SessionRequest,
  SessionRequestKind,
  SessionTitle,
} from "@aicraft/aix/effect/session"
import type { Agent } from "@aicraft/schema/agent"
import { Model } from "@aicraft/schema/model"
import type { Content } from "@aicraft/schema/tool"
import { Cause, Context, Effect, Layer, Option, Result, Schema, Stream } from "effect"
import { HttpClientRequest, HttpClientResponse } from "effect/http"
import { Gates, type ContextEntry } from "@aicraft/context"
import { makeLocationNode } from "@aicraft/util/effect/app-node"
import { App } from "../app.js"
import { Instructions } from "../instructions/index.js"
import { ModelIdentity } from "../instructions/model-identity.js"
import { Permission } from "../permission.js"
import { PluginHooks } from "../plugin/hooks.js"
import { QuestionTool } from "../tool/plugin/question.js"
import { Tool } from "../tool.js"
import { SessionAffinity } from "./affinity.js"
import type { SessionContextSnapshot } from "./context-snapshot.js"
import { SessionModelTransport } from "./model-transport.js"
import { ProjectInstructions } from "./project-instructions.js"
import { SessionRunnerModel } from "./runner/model.js"
import { SessionSchema } from "./schema.js"
import { SessionSystemPrompt } from "./system-prompt.js"
import { SessionSystemTemplate } from "./system-template.js"
import { toLLMMessages } from "./runner/to-llm-message.js"
import type { SessionMessage } from "./message.js"

const IMAGE_BYTES_TRIGGER = 25 * 1024 * 1024 // 25 MiB
const IMAGE_BYTES_TARGET = 15 * 1024 * 1024 // 15 MiB
const IMAGE_REMOVED =
  "[This image was removed to reduce the request size and is no longer visible. Do not make claims about its contents from memory. If needed, retrieve it again with an available tool or ask the user to attach it again.]"
// Used when the catalog has no output limit for the model.
const OUTPUT_TOKEN_FALLBACK = 32_000
// No reply needs more, however much the model allows.
const OUTPUT_TOKEN_MAX = 256_000
// Prompt text is estimated at about 4 characters per token, which can run low on dense text such as code.
const ESTIMATE_ERROR = 0.15
// Share of the window a turn leaves unused when its output limit is fitted to the room left. Providers count a few
// tokens more than we do (chat template, tool schemas), and strict ones reject input plus output past the window.
// Compaction sizes its summary against its own reserve instead.
const WINDOW_HEADROOM = 0.01
// Never ask for less; only reachable with automatic compaction off, since it keeps the window from filling this far.
const OUTPUT_TOKEN_MIN = 1_024

/** Tool errors, plus the user declining a permission or dismissing a question. */
export type ExecuteError = Tool.Error | Permission.DeclinedError | QuestionTool.CancelledError

export interface Prepared<Event = SessionRequest> {
  readonly event: Event
  readonly request: LLMRequest
  readonly options: StreamOptions
  readonly retry: (event: PluginHooks.Domains["session"]["retry"]) => Effect.Effect<void>
  /** Runs a tool call against the tools this request advertised. */
  readonly executeTool: (
    input: Parameters<Tool.Snapshot["execute"]>[0],
  ) => Effect.Effect<Tool.NormalizedResult, ExecuteError>
}

export interface Input {
  readonly session: SessionSchema.Info
  readonly agent: Agent.ID
  readonly model: SessionRunnerModel.Resolved
  readonly tools?: Tool.Snapshot
  readonly system: Array<SystemPart>
  readonly messages: Array<Message>
  readonly toolChoice?: LLM.LLMRequestInput["toolChoice"]
  /** Only the durable runner may use a stateful WebSocket. */
  readonly webSocket?: "session"
  /** Prompt size, measured by the provider or estimated. The default output limit leaves room for it. */
  readonly inputTokens?: { readonly measured: number; readonly estimated: number }
}

/** The default output limit: the catalog limit, fitted to the room the prompt leaves in the context window. */
export const outputLimit = (limit: Model.Info["limit"], inputTokens?: Input["inputTokens"], headroom = 0) => {
  const requested = Math.min(limit.output > 0 ? limit.output : OUTPUT_TOKEN_FALLBACK, OUTPUT_TOKEN_MAX)
  if (inputTokens === undefined || limit.context <= 0) return requested
  const room =
    Math.floor(limit.context * (1 - headroom)) -
    inputTokens.measured -
    Math.ceil(inputTokens.estimated * (1 + ESTIMATE_ERROR))
  return Math.min(requested, Math.max(OUTPUT_TOKEN_MIN, room))
}

/** The volatile L1 parts of the system prefix; snapshotted per session, reread only on rebuild. */
export const volatileParts = (input: {
  readonly agent: Agent.Info
  readonly tools: Tool.Snapshot
  readonly project?: string
  readonly sessionPrompt?: string
  /** Catalog identity for P4 assembly-time family resolution; absent keeps the unresolved fallback. */
  readonly catalog?: Model.Info
}) => {
  const toolNames = input.tools.definitions.map((tool) => tool.name)
  return [
    {
      kind: "agent" as const,
      // P4: the family template resolves here (into the frozen snapshot) instead of the removed
      // session.context hook splicing it over the assembled prefix at request time.
      text: input.catalog
        ? SessionSystemTemplate.resolve({ agent: input.agent, model: input.catalog, tools: toolNames })
        : input.agent.system
          ? input.agent.system
          : SessionSystemPrompt.make(toolNames),
    },
    // P4: identity rides the frozen volatile parts, not the epoch ledger: a model switch is a snapshot
    // invalidation key (context_snapshot.model_id), so the block rebakes with the family prompt while the
    // instruction baseline stays untouched (model-identity.ts doc contract).
    ...(input.catalog
      ? [
          {
            kind: "identity" as const,
            text: ModelIdentity.identity({
              name: input.catalog.name,
              ref: Model.Ref.make({ providerID: input.catalog.providerID, id: input.catalog.modelID }),
            }),
          },
        ]
      : []),
    ...(input.project ? [{ kind: "project" as const, text: ProjectInstructions.block(input.project) }] : []),
    ...(input.sessionPrompt ? [{ kind: "session" as const, text: sessionBlock(input.sessionPrompt) }] : []),
  ]
}

/** The frozen volatile parts followed by the epoch-frozen baseline and the L4 notices, in cache order. */
export const assembleSystem = (
  parts: ReadonlyArray<SessionContextSnapshot.VolatilePart>,
  initial: ReadonlyArray<Instructions.Rendered>,
  l4: ReadonlyArray<Instructions.Rendered> = [],
) =>
  [
    // The Project's and Session's instructions sit before the baseline: both are stable, while the baseline carries
    // the date and environment that change and would otherwise invalidate the cached prefix behind them.
    ...parts.map((part) => withContext(SystemPart.make(part.text), [contextSource(sourceKey(part.kind), part.text)])),
    withContext(
      {
        ...SystemPart.make(Instructions.join(initial)),
        metadata: { experimental: { instructions: initial } },
      },
      initial.map(renderedSource),
    ),
    // The L4 notices trail the baseline: they hold the net instruction change, so an edit invalidates only
    // this tail segment instead of the cached prefix, and each notice is tagged with its own source key.
    ...l4.map((notice) => withContext(SystemPart.make(notice.text), [renderedSource(notice)])),
  ].filter((part) => part.text.length > 0)

export const baseTranscript = (input: {
  readonly agent: Agent.Info
  readonly model: SessionRunnerModel.Resolved
  readonly tools: Tool.Snapshot
  readonly initial: ReadonlyArray<Instructions.Rendered>
  /** The L4 notices, rendered as their own parts after the baseline. Absent leaves the request byte-identical. */
  readonly l4?: ReadonlyArray<Instructions.Rendered>
  /** The Project's own instructions, reread for every Step and rendered ahead of the baseline. */
  readonly project?: string
  /** This Session's own instructions, the most specific source in the request. */
  readonly sessionPrompt?: string
  readonly messages: ReadonlyArray<SessionMessage.Info>
  /** Frozen parts from the session snapshot; defaults to live values. */
  readonly volatile?: ReadonlyArray<SessionContextSnapshot.VolatilePart>
}) => {
  const providerMetadataKey = input.model.model.route.providerMetadataKey ?? input.model.model.provider
  return {
    providerMetadataKey,
    system: assembleSystem(input.volatile ?? volatileParts({ ...input, catalog: input.model.catalog }), input.initial, input.l4),
    messages: toLLMMessages(input.messages, input.model.ref, providerMetadataKey),
  }
}

/** One entry inside an injected source, such as a single instruction file. */
export const ContextItem = Schema.Struct({
  name: Schema.String,
  chars: Schema.Number,
  text: Schema.String,
})

/** One source the request injected ahead of the conversation, in system order. */
export const ContextSource = Schema.Struct({
  key: Schema.String,
  chars: Schema.Number,
  text: Schema.String,
  items: Schema.optionalKey(Schema.Array(ContextItem)),
})
export type ContextSource = typeof ContextSource.Type

const ContextMetadata = Schema.Struct({
  context: Schema.Struct({ sources: Schema.Array(ContextSource) }),
})

// Mirrors the source keys the inline assembly used before the parts were snapshotted: the agent prompt reports as
// "system", the project block under its instruction key, and the session prompt as "session".
const sourceKey = (kind: SessionContextSnapshot.VolatilePart["kind"]) =>
  kind === "agent" ? "system" : kind === "project" ? ProjectInstructions.key : kind === "identity" ? ModelIdentity.key : "session"

const contextSource = (key: string, text: string): ContextSource => ({ key, chars: text.length, text })

const renderedSource = (source: Instructions.Rendered): ContextSource => ({
  key: source.key,
  chars: source.text.length,
  text: source.text,
  ...(source.parts?.length
    ? {
        items: source.parts.map((part) => ({
          name: part.name,
          chars: part.text.length,
          text: part.text,
        })),
      }
    : {}),
})

/**
 * Tags a system part with the sources it injects and the text each one contributed, so a Step can show them.
 */
const withContext = (part: SystemPart, sources: ReadonlyArray<ContextSource>) => ({
  ...part,
  metadata: {
    ...part.metadata,
    context: { sources },
  },
})

/** What the finished request injected ahead of the conversation, for the transcript. */
export const contextSources = (system: ReadonlyArray<SystemPart>): Array<ContextSource> =>
  system.flatMap((part) => {
    const sources = Option.getOrUndefined(Schema.decodeUnknownOption(ContextMetadata)(part.metadata))?.context.sources
    return sources ? [...sources] : []
  })

/** Context a hook injected outside the system prefix, reported by the hook event for the transcript. */
export const hookContextSources = (
  injected: ReadonlyArray<{ readonly key: string; readonly text: string }> | undefined,
): Array<ContextSource> =>
  (injected ?? []).map((entry) => ({ key: entry.key, chars: entry.text.length, text: entry.text }))

/**
 * Maps one assembled system part to the `ContextEntry` shape the tail gate fingerprints.
 * `id` carries the part's attribution — its first reported context source key, falling back
 * to position — so a violation names which key was where when the prefix moved. `layer`
 * labels the frozen segment as a whole (the §1 L1–L3 domain), not the part's individual
 * layer: the gate compares model-visible text bytes (§3 invariant 1), and per-part layer
 * attribution lands with P4's snapshot layers.
 */
const frozenEntry = (index: number, part: SystemPart): ContextEntry => ({
  id: contextSources([part])[0]?.key ?? `system:${index}`,
  layer: "L1",
  source: "assembler",
  text: part.text,
})

/**
 * The hook's side of the comparison. Inside the frozen segment the identity fields are
 * copied from the assembler entry, so only text bytes can differ — a metadata edit that
 * leaves the model-visible text intact is not a cache break and must not trip the gate.
 * Past the segment the part is hook-owned tail (the §5 L5–L8 append channel) and is never
 * compared by `checkTailOnly`.
 */
const gatedEntry = (frozen: ReadonlyArray<ContextEntry>, index: number, part: SystemPart): ContextEntry => {
  const base = frozen[index]
  return base === undefined
    ? { id: `system:${index}`, layer: "L1", source: "hook", text: part.text }
    : { ...base, text: part.text }
}

const sessionBlock = (prompt: string) =>
  [
    "# Session instructions",
    "",
    "The user wrote these instructions for this session only.",
    "They apply on top of the project's instructions for as long as this session runs.",
    "",
    prompt,
  ].join("\n")

const mimeToModality = (mime: string) => {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("audio/")) return "audio"
  if (mime.startsWith("video/")) return "video"
  if (mime === "application/pdf") return "pdf"
}

// xAI rejects any other image type (e.g. GIF) with invalid_image, and the stored image would fail every later turn.
const XAI_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"])

const unsupportedMedia = (
  mime: string,
  name: string | undefined,
  capabilities: Model.Capabilities,
  provider: string | undefined,
) => {
  const modality = mimeToModality(mime)
  if (!modality) return
  const unsupported = !capabilities.input.some((item) => item.startsWith(modality))
    ? modality
    : provider === "xai" && modality === "image" && !XAI_IMAGE_MIMES.has(mime.toLowerCase())
      ? mime
      : undefined
  if (!unsupported) return
  return `ERROR: Cannot read ${name ? `"${name}"` : modality} (this model does not support ${unsupported} input). Inform the user.`
}

// The inline budget counts base64 characters, which are ASCII, so a string's length is its size without scanning it.
// Remote and provider-referenced media carry no local payload and never count toward the inline budget.
const mediaBytes = (media: Media.Asset) => {
  if (media.source.type === "base64") return media.source.data.length
  if (media.source.type === "bytes") return Math.ceil(media.source.data.byteLength / 3) * 4
  return 0
}

/** Replaces media with the returned text; messages without replacements are returned unchanged. */
const replaceMedia = (
  messages: LLMRequest["messages"],
  replace: (media: { mime: string; name: string | undefined; bytes: () => number }) => string | undefined,
) => {
  const media = (part: MediaPart) => {
    const text = replace({ mime: part.media.mediaType, name: part.filename, bytes: () => mediaBytes(part.media) })
    return text === undefined ? part : Message.text(text)
  }
  const toolResult = (part: ToolResultPart) => {
    if (part.result.type !== "content") return part
    const result = part.result
    const value = result.value.map((item): Content => {
      if (item.type !== "file") return item
      const text = replace({ mime: item.mime, name: item.name, bytes: () => item.uri.length })
      return text === undefined ? item : { type: "text", text }
    })
    return value.every((item, index) => item === result.value[index]) ? part : { ...part, result: { ...result, value } }
  }
  return messages.map((message) => {
    switch (message.role) {
      case "system":
        return message
      case "user": {
        const content = message.content.map((part) => (part.type === "media" ? media(part) : part))
        return sameParts(content, message.content) ? message : new UserMessage({ ...message, content })
      }
      case "assistant": {
        const content = message.content.map((part) => {
          if (part.type === "media") return media(part)
          return part.type === "tool-result" ? toolResult(part) : part
        })
        return sameParts(content, message.content) ? message : new AssistantMessage({ ...message, content })
      }
      case "tool": {
        const content = message.content.map(toolResult)
        return sameParts(content, message.content) ? message : new ToolMessage({ ...message, content })
      }
    }
  })
}

const sameParts = (next: ReadonlyArray<ContentPart>, previous: ReadonlyArray<ContentPart>) =>
  next.every((part, index) => part === previous[index])

export const unsupportedParts = (
  messages: LLMRequest["messages"],
  capabilities: Model.Capabilities,
  provider?: string,
) => replaceMedia(messages, (media) => unsupportedMedia(media.mime, media.name, capabilities, provider))

export const boundImages = (messages: LLMRequest["messages"]) => {
  const isImage = (mime: string) => mime.toLowerCase().startsWith("image/")
  const sizes = messages.flatMap((message) =>
    message.content.flatMap((part) => {
      if (part.type === "media") return isImage(part.media.mediaType) ? [mediaBytes(part.media)] : []
      if (part.type !== "tool-result" || part.result.type !== "content") return []
      return part.result.value.flatMap((item: Content) =>
        item.type === "file" && isImage(item.mime) ? [item.uri.length] : [],
      )
    }),
  )
  // Replay the images in order, dropping the oldest down to the target whenever the kept payload passes the trigger.
  // A new image then moves the cut only every (trigger - target) bytes instead of on every request, so the replaced
  // prefix, and with it the provider's prompt cache, stays the same between cuts.
  let cut = 0
  let kept = 0
  for (const size of sizes) {
    kept += size
    if (kept <= IMAGE_BYTES_TRIGGER) continue
    while (kept > IMAGE_BYTES_TARGET) kept -= sizes[cut++]!
  }
  if (cut === 0) return messages

  let index = 0
  return replaceMedia(messages, (media) => {
    if (!isImage(media.mime)) return
    return index++ < cut ? IMAGE_REMOVED : undefined
  })
}

type Definitions = PluginHooks.Domains["session"]["context"]["tools"]

/** Builds the model request for each session flow. Each entry runs its own plugin hook. */
export interface Interface {
  readonly primary: (input: Input) => Effect.Effect<Prepared<SessionContext>>
  readonly compaction: (input: Input) => Effect.Effect<Prepared<SessionCompaction>>
  readonly generate: (input: Input) => Effect.Effect<Prepared<SessionGenerate>>
  readonly title: (input: Input) => Effect.Effect<Prepared<SessionTitle>>
}

export class Service extends Context.Service<Service, Interface>()("@aicraft/SessionModelRequest") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const hooks = yield* PluginHooks.Service
    const transport = yield* SessionModelTransport.Service
    const app = yield* App.Metadata
    const prepare = Effect.fn("SessionModelRequest.prepare")(function* <
      S extends SessionRequest & { tools?: Definitions },
    >(kind: SessionRequestKind, input: Input, shape: (draft: SessionRequest, tools: Definitions) => Effect.Effect<S>) {
      const session = input.session
      const model = input.model
      const scope = { sessionID: session.id, agent: input.agent, model: model.ref, kind }
      const tools = input.tools ?? {
        definitions: [],
        execute: () => new Tool.Error({ message: "Tools are not available for this request" }),
      }
      // Remember which tool each definition object came from. Hooks rename a tool by moving
      // its definition to a new key, so after the hook we find the tool by object identity.
      // Definitions are shared across steps and sessions, and hooks may edit schemas in place,
      // so each hook gets a deep copy.
      const given = new Map(
        tools.definitions.map(
          (t) => [{ description: t.description, input: JSON.parse(JSON.stringify(t.inputSchema)) }, t] as const,
        ),
      )
      // Hooks see the default output limit and may change or remove it. Titles and generate keep the provider default,
      // because their reasoning is hard to budget.
      // The frozen segment snapshot must be taken before the hook runs: the event carries this
      // same array by reference, so anything read afterwards could already be rewritten.
      const frozen = input.system.map((part, index) => frozenEntry(index, part))
      const shaped = yield* shape(
        {
          sessionID: session.id,
          model: model.ref,
          system: input.system,
          messages: input.messages,
          options:
            kind === "primary"
              ? { maxTokens: outputLimit(model.limit, input.inputTokens, WINDOW_HEADROOM) }
              : kind === "compaction"
                ? { maxTokens: outputLimit(model.limit, input.inputTokens) }
                : {},
        },
        Object.fromEntries(Array.from(given, ([d, t]) => [t.name, d])),
      )
      // DESIGN §3 invariant 1 / §5: the hook may append to and rewrite the assembled tail,
      // never the frozen segment — a rewritten prefix silently corrupts provider cache
      // accounting, so there is no warn-and-send path: the violation throws as a
      // LayerViolation defect (§8 P3 acceptance) and the request is refused before it can
      // reach `ai.request` below. Hooks that only touch messages/tools/options, or append
      // system parts after the segment (the L5–L8 channel), pass untouched.
      Gates.checkTailOnly(frozen, shaped.system.map((part, index) => gatedEntry(frozen, index, part)))
      // Match by identity first, then by key. Entries matching neither were invented by a
      // hook and are dropped. `t.name` stays the real name so execution can map renames back.
      const byName = new Map(tools.definitions.map((t) => [t.name, t]))
      const hooked = new Map(
        Object.entries(shaped.tools ?? {}).flatMap(([name, d]) => {
          const t = given.get(d) ?? byName.get(name)
          return t ? [[name, { ...t, description: d.description, inputSchema: d.input }] as const] : []
        }),
      )
      const entries = Object.entries(shaped.options)
      const generation = Object.fromEntries(entries.filter(([k]) => GENERATION_KEYS.has(k))) as GenerationOptionsFields
      const providerOptions = Object.fromEntries(entries.filter(([k]) => !GENERATION_KEYS.has(k)))
      const affinity = SessionAffinity.get(session)
      const base = ai.request({
        model: model.model,
        headers: {
          "x-aicraft-session-id": session.id,
          ...(session.parentID ? { "x-aicraft-parent-session-id": session.parentID } : {}),
          "x-session-affinity": affinity,
          "X-Session-Id": affinity,
          ...(session.parentID ? { "x-parent-session-id": session.parentID } : {}),
          "User-Agent": App.useragent(app),
          "x-aicraft-project": session.projectID,
          "x-aicraft-session": affinity,
          "x-opencode-client": app.name,
        },
        // TODO: Persist cache lineage so nested forks reuse the root session's cache key.
        promptCacheKey: /^ses_[0-9a-f]{64}$/.test(affinity) ? affinity.slice(4) : affinity,
        cache: model.cache?.ttl === undefined ? undefined : { ttl: model.cache.ttl },
        system: shaped.system,
        messages: boundImages(unsupportedParts(shaped.messages, model.capabilities, model.model.provider)),
        tools: Array.from(hooked, ([name, t]) => ({ ...t, name })),
        toolChoice: input.toolChoice,
        ...generation,
        providerOptions: Object.keys(providerOptions).length === 0 ? undefined : providerOptions,
      })

      const baseURL = base.model.route.endpoint.baseURL
      const modelHook = yield* hooks.trigger("session", "model.request", {
        ...scope,
        baseURL,
        headers: { ...base.headers },
      })
      const route =
        modelHook.baseURL !== undefined && modelHook.baseURL !== baseURL
          ? base.model.route.with({ endpoint: { baseURL: modelHook.baseURL } })
          : base.model.route
      const request = {
        ...base,
        model: route === base.model.route ? base.model : LanguageModel.update(base.model, { route }),
        headers: Object.keys(modelHook.headers).length === 0 ? undefined : modelHook.headers,
      }
      const hasHttpHooks =
        (yield* hooks.has("session", "http.request", model.ref.providerID)) ||
        (yield* hooks.has("session", "http.response", model.ref.providerID))
      const http: StreamOptions["http"] = hasHttpHooks
        ? (req, handler) =>
            Effect.gen(function* () {
              const request = yield* HttpClientRequest.toWeb(req)
              const before = yield* hooks.trigger("session", "http.request", { ...scope, request })
              // A hook that kept the request object cannot have replaced its body, so the original body is sent as is.
              // Reading it back would hold a second full copy of the request, screenshots included, for the whole call.
              const sent =
                before.request === request
                  ? HttpClientRequest.setBody(HttpClientRequest.fromWeb(request), req.body)
                  : before.request.body
                    ? HttpClientRequest.bodyUint8Array(
                        HttpClientRequest.fromWeb(before.request),
                        new Uint8Array(yield* Effect.promise(() => before.request.clone().arrayBuffer())),
                        before.request.headers.get("content-type") ?? undefined,
                      )
                    : HttpClientRequest.fromWeb(before.request)
              const res = yield* handler(sent)
              const after = yield* hooks.trigger("session", "http.response", {
                ...scope,
                request: before.request,
                response: new Response(
                  [204, 205, 304].includes(res.status) ? null : yield* Stream.toReadableStreamEffect(res.stream),
                  { status: res.status, headers: res.headers },
                ),
              })
              return HttpClientResponse.fromWeb(sent, after.response)
            })
        : undefined
      // HTTP hooks wrap every HTTP request, including the WebSocket fallback path. The route decides
      // which transport actually carries the request, so both hook families are always offered.
      const webSocket =
        input.webSocket === "session" && model.transport === "websocket"
          ? transport.bind(
              session.id,
              {
                handshake: (connect) =>
                  hooks
                    .trigger("session", "experimental.ws.handshake", {
                      ...scope,
                      url: connect.url,
                      headers: connect.headers,
                    })
                    .pipe(Effect.map((event) => ({ url: event.url, headers: event.headers }))),
                send: (frame) =>
                  hooks
                    .trigger("session", "experimental.ws.send", { ...scope, frame })
                    .pipe(Effect.map((event) => event.frame)),
                receive: (frame) =>
                  hooks
                    .trigger("session", "experimental.ws.receive", { ...scope, frame })
                    .pipe(Effect.map((event) => event.frame)),
              },
              model.chunkTimeout,
            )
          : undefined

      return {
        event: shaped,
        request,
        options: { ...(http ? { http } : {}), ...(webSocket ? { webSocket } : {}) },
        retry: (event: Parameters<Prepared["retry"]>[0]) =>
          hooks.trigger("session", "retry", event).pipe(Effect.asVoid),
        // Permission.assert and the question tool throw declines as defects so tools cannot
        // catch them and turn a "no" into model-visible output. Recover them here as failures,
        // including declines a tool rethrew and its wrapper attached to a Tool.Error, as Promise
        // plugin tools do.
        executeTool: (call: Parameters<Prepared["executeTool"]>[0]) =>
          tools.execute({ ...call, definitions: hooked }).pipe(
            Effect.catchCauseFilter(
              (cause) => {
                const decline = cause.reasons
                  .map((r) => (Cause.isDieReason(r) ? r.defect : Cause.isFailReason(r) ? r.error.error : undefined))
                  .find(
                    (value): value is Permission.DeclinedError | QuestionTool.CancelledError =>
                      value instanceof Permission.DeclinedError || value instanceof QuestionTool.CancelledError,
                  )
                return decline ? Result.succeed(decline) : Result.fail(cause)
              },
              (decline) => Effect.fail(decline),
            ),
          ),
      }
    })

    const agentHook =
      (name: "context" | "compaction" | "generate", agent: Agent.ID) => (draft: SessionRequest, tools: Definitions) =>
        hooks.trigger("session", name, { ...draft, agent, tools })

    return Service.of({
      primary: (input) => prepare("primary", input, agentHook("context", input.agent)),
      compaction: (input) => prepare("compaction", input, agentHook("compaction", input.agent)),
      generate: (input) => prepare("generate", input, agentHook("generate", input.agent)),
      title: (input) => prepare("title", input, (draft) => hooks.trigger("session", "title", draft)),
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [PluginHooks.node, SessionModelTransport.node, App.node],
})
