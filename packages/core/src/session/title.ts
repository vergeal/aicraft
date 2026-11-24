export * as SessionTitle from "./title.js"

import { LLMClient, LLMEvent, Message, SystemPart } from "@opencode/ai/effect"
import type { Agent } from "@opencode/schema/agent"
import { Context, DateTime, Effect, Layer, Option, Stream } from "effect"
import { Database } from "../database/database.js"
import { Bus } from "../bus.js"
import { makeLocationNode } from "@opencode/util/effect/app-node"
import { isExactRootFallback } from "@opencode/util/session-title-fallback"
import { llmClient } from "../effect/app-node-platform.js"
import { SessionContext } from "./context.js"
import { SessionEvent } from "./event.js"
import { SessionHistory } from "./history.js"
import type { SessionRunnerModel } from "./runner/model.js"
import { SessionSchema } from "./schema.js"
import { SessionUsage } from "./usage.js"
import { SessionStore } from "./store.js"

const MAX_LENGTH = 100
const MAX_CONTEXT_LENGTH = 8_000
const MAX_FIRST_MESSAGE_LENGTH = 2_000
// A title is cosmetic: never let one stalled request hold up the conversation.
const ATTEMPT_TIMEOUT = "8 seconds"
// The first attempt races the Session's own model calls and the location's model catalog, so a transient failure
// would otherwise leave the Session untitled until the next prompt. A title is background work; retry it, bounded.
const GENERATE_ATTEMPTS = 3
const GENERATE_RETRY_DELAY = ["2 seconds", "5 seconds"] as const
const titleChanged = Symbol("Session title changed")

export interface Interface {
  /** Generates an initial title or regenerates one from bounded conversation history. */
  readonly generate: (sessionID: SessionSchema.ID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionTitle") {}

const truncate = (value: string, max = MAX_LENGTH) =>
  value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3))}...`
// A fork keeps its `(fork #N)` suffix when the title is regenerated from the conversation, so forking the fork
// again still sees the previous number and increments it instead of restarting at #1.
const forkSuffix = / \(fork #\d+\)$/
function withForkSuffix(session: SessionSchema.Info, base: string) {
  if (!session.fork) return truncate(base)
  const suffix = session.title?.match(forkSuffix)?.[0] ?? " (fork #1)"
  return `${truncate(base, MAX_LENGTH - suffix.length)}${suffix}`
}
// Framing the input as text to name keeps models from answering or carrying out the request instead.
const messagePrompt = (text: string) =>
  `Here is the first message of the conversation:\n\n<message>\n${text}\n</message>\n\nReply with only the title.`
const conversationPrompt = (text: string) =>
  `Here is the conversation so far:\n\n<conversation>\n${text}\n</conversation>\n\nReply with only the title.`
export const isUntitled = (session: SessionSchema.Info) =>
  isExactRootFallback({
    title: session.title,
    time: { created: DateTime.toEpochMillis(session.time.created) },
  })

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const llm = yield* LLMClient.Service
    const context = yield* SessionContext.Service
    const store = yield* SessionStore.Service
    const db = (yield* Database.Service).db

    const attempt = Effect.fn("SessionTitle.attempt")(function* (input: {
      readonly session: SessionSchema.Info
      readonly agent: Agent.Info
      readonly text: string
      readonly model: SessionRunnerModel.Resolved
    }) {
      const chunks: string[] = []
      let failure: { readonly message: string; readonly reason: { readonly _tag: string }; readonly status?: number } | undefined
      let usage: SessionUsage.Recorded | undefined
      const recordUsage = Effect.suspend(() =>
        usage
          ? bus.publish(SessionEvent.UsageRecorded, {
              sessionID: input.session.id,
              source: "title",
              ...usage,
            })
          : Effect.void,
      )
      const prepared = yield* context.request.title({
        session: input.session,
        agent: input.agent.id,
        model: input.model,
        system: input.agent.system ? [SystemPart.make(input.agent.system)] : [],
        messages: [Message.user(input.text)],
      })
      if (prepared.event.result !== undefined)
        return { timedOut: false, title: prepared.event.result, failure: undefined }
      const outcome = yield* llm.stream(prepared.request, prepared.options).pipe(
        Stream.runForEach((event) => {
          if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
          if (LLMEvent.is.stepFinish(event)) {
            const step = SessionUsage.record(event.usage, input.model.cost)
            usage = usage ? SessionUsage.add(usage, step) : step
          }
          return Effect.void
        }),
        Effect.catchTag("AI.Error", (error) =>
          Effect.sync(() => {
            failure = error
          }),
        ),
        Effect.timeoutOption(ATTEMPT_TIMEOUT),
        Effect.onInterrupt(() => recordUsage.pipe(Effect.asVoid)),
      )
      yield* recordUsage
      if (Option.isNone(outcome)) return { timedOut: true, title: undefined, failure: undefined }
      if (failure) return { timedOut: false, title: undefined, failure }
      return {
        timedOut: false,
        title: chunks
          .join("")
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0),
        failure: undefined,
      }
    })

    const generate = Effect.fn("SessionTitle.generate")(function* (sessionID: SessionSchema.ID) {
      const session = yield* store.get(sessionID)
      if (!session) return
      const firstUser = yield* SessionHistory.firstUserMessage(db, session.id)
      if (!firstUser) return
      const text = !isUntitled(session)
        ? yield* store.context(session.id).pipe(
            Effect.map((messages) => {
              const original = `Original request:\n${firstUser.text.slice(0, MAX_FIRST_MESSAGE_LENGTH)}`
              const recent = messages
                .flatMap((message) => {
                  if (message.type === "user" && message.id !== firstUser.id) return [`User: ${message.text.trim()}`]
                  if (message.type !== "assistant") return []
                  const text = message.content
                    .flatMap((part) => (part.type === "text" ? [part.text.trim()] : []))
                    .filter(Boolean)
                    .join("\n")
                  return text ? [`Assistant: ${text}`] : []
                })
                .join("\n\n")
              if (!recent) return conversationPrompt(original)
              const prefix = `${original}\n\nRecent conversation:\n`
              const budget = MAX_CONTEXT_LENGTH - conversationPrompt("").length - prefix.length
              return conversationPrompt(`${prefix}${recent.slice(-budget)}`)
            }),
            Effect.orElseSucceed(() => messagePrompt(firstUser.text)),
          )
        : messagePrompt(firstUser.text)
      // A title is background work, so a missing selection or a failed request retries instead of leaving the
      // Session untitled until the next prompt. The retry budget covers the window in which a fresh location is
      // still filling its agent and model catalog and the moment in which the provider queues the request behind
      // the Session's own calls.
      const title = yield* Effect.gen(function* () {
        for (let round = 0; round < GENERATE_ATTEMPTS; round++) {
          const selection = yield* context.selectTitle(session)
          if (selection) {
            const model = round === 0 ? selection.selected : (selection.primary ?? selection.selected)
            const result = yield* attempt({ session, agent: selection.agent, text, model })
            if (result.title) return result.title
            yield* Effect.logWarning("session title attempt failed", {
              sessionID,
              attempt: round + 1,
              providerID: model.ref.providerID,
              modelID: model.ref.id,
              timedOut: result.timedOut,
              reason: result.failure?.reason._tag,
              status: result.failure?.status,
              message: result.failure?.message,
            })
          } else {
            yield* Effect.logWarning("session title model unavailable", { sessionID, attempt: round + 1 })
          }
          const delay = GENERATE_RETRY_DELAY[round]
          if (delay) yield* Effect.sleep(delay)
        }
        return undefined
      })
      if (!title) return
      const next = withForkSuffix(session, title)
      const expectedSequence = (yield* Bus.latestSequence(db, sessionID)) + 1
      const current = yield* store.get(sessionID)
      if (!current || current.title !== session.title || current.title === next) return
      yield* bus
        .publish(
          SessionEvent.Renamed,
          {
            sessionID: session.id,
            title: next,
          },
          { commit: (sequence) => (sequence === expectedSequence ? Effect.void : Effect.die(titleChanged)) },
        )
        .pipe(Effect.catchDefect((defect) => (defect === titleChanged ? Effect.void : Effect.die(defect))))
    })
    return Service.of({ generate })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Bus.node, llmClient, SessionContext.node, SessionStore.node, Database.node],
})
