export * as QueueTool from "./queue.js"

import { ToolFailure } from "@aicraft/ai/effect"
import type { Context } from "@aicraft/aix/effect/plugin"
import { SessionInbox } from "@aicraft/schema/session-inbox"
import { SessionMessage } from "@aicraft/schema/session-message"
import { DateTime, Effect, Schema } from "effect"
import { SessionSchema } from "../../session/schema.js"
import { SessionTarget } from "./session-target.js"

export const name = "queue"

const PREVIEW_LIMIT = 160

export const description = [
  "Inspect the work still waiting in a session's inbox: messages that were delivered but have not started yet. This tool only reads; it never cancels anything.",
  "Call it with no arguments to inspect this session's own queue. Pass `sessionID` to inspect a direct child session this session created; any other session is rejected.",
  "Work that already started or finished is not in the queue, so it cannot be found here. Use `transcript` to read what happened.",
  "Each item reports its id, how it will be delivered (`queue` or `steer`), the session that sent it, and a text preview. Identical previews from the same sender are marked as duplicates, the usual sign of an agent loop.",
  "To withdraw duplicates, the session that sent them must call `recall`; a session that receives them cannot remove them from here.",
].join("\n")

export const Input = Schema.Struct({
  sessionID: Schema.optionalKey(SessionSchema.ID).annotate({
    description:
      "The session whose queue to inspect: omit it for this session, or pass a direct child session this session created.",
  }),
})

const QueueItem = Schema.Struct({
  id: SessionMessage.ID,
  type: Schema.String,
  delivery: SessionInbox.Delivery,
  from: Schema.NullOr(Schema.String),
  enqueued: Schema.String,
  preview: Schema.String,
  /** How many items share this preview and sender, including this one. 1 means no duplicate. */
  duplicates: Schema.Int,
})

export const Output = Schema.Struct({
  sessionID: SessionSchema.ID,
  items: Schema.Array(QueueItem),
})

const previewOf = (item: SessionInbox.Info) => {
  switch (item.type) {
    case "user":
      return item.payload.text
    case "synthetic":
      return item.payload.text
    case "compaction":
      return "(compaction)"
    case "move":
      return "(location change)"
  }
}

const truncate = (value: string) => {
  const chars = [...value.replace(/\s*\n+\s*/g, " ")]
  return chars.length <= PREVIEW_LIMIT ? chars.join("") : `${chars.slice(0, PREVIEW_LIMIT).join("")}…`
}

/** Counts items that would appear identical to a reader: same sender and same preview. */
const duplicateCounts = (items: readonly SessionInbox.Info[]) => {
  const keys = items.map((item) => `${SessionTarget.deliveredBy(item) ?? "person"}\u0000${previewOf(item)}`)
  return keys.map((key) => keys.filter((candidate) => candidate === key).length)
}

const describe = (items: readonly SessionInbox.Info[], counts: readonly number[]) =>
  items.map((item, index) => ({
    id: item.id,
    type: item.type,
    delivery: item.delivery,
    from: SessionTarget.deliveredBy(item) ?? null,
    enqueued: DateTime.formatIso(item.time.created),
    preview: truncate(previewOf(item)),
    duplicates: counts[index]!,
  }))

const render = (target: { id: string; title?: string }, items: readonly SessionInbox.Info[], counts: readonly number[]) => {
  const title = target.title ?? target.id
  const duplicates = counts.filter((count) => count > 1).length

  return [
    `Queue of @${title} (${target.id}) — ${items.length} pending, oldest first${duplicates > 0 ? `, ${duplicates} sharing a preview with another item` : ""}:`,
    ...(items.length === 0
      ? ["(empty)"]
      : items.map((item, index) => {
          const from = SessionTarget.deliveredBy(item)
          const sender = from === undefined ? "sent by a person" : `from ${from}`
          const duplicate = counts[index]! > 1 ? ` · duplicate ×${counts[index]}` : ""

          return `- ${item.id} · ${item.delivery} · ${item.type} · ${sender} · ${DateTime.formatIso(item.time.created)}${duplicate}\n  ${truncate(previewOf(item))}`
        })),
  ].join("\n")
}

export const Plugin = {
  id: "aicraft.tool.queue",
  effect: Effect.fn("QueueTool.Plugin")(function* (ctx: Context) {
    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          icon: "tool-queue",
          options: { codemode: false },
          description,
          input: Input,
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              const self = yield* ctx.session
                .get({ sessionID: context.sessionID })
                .pipe(
                  Effect.mapError(
                    (error) => new ToolFailure({ message: `Current session not found: ${context.sessionID}`, error }),
                  ),
                )
              const target =
                input.sessionID === undefined || input.sessionID === self.id
                  ? self
                  : yield* ctx.session
                      .get({ sessionID: input.sessionID })
                      .pipe(
                        Effect.mapError(
                          (error) => new ToolFailure({ message: `Session not found: ${input.sessionID}`, error }),
                        ),
                      )

              if (target.id !== self.id && target.parentID !== self.id)
                return yield* new ToolFailure({
                  message: `${target.id} is neither this session nor a direct child of it, so its queue cannot be inspected here. Use \`transcript\` to read it.`,
                })

              const pending = yield* ctx.session.inbox.list({ sessionID: target.id }).pipe(
                Effect.mapError(
                  (error) => new ToolFailure({ message: `Could not read the queue of ${target.id}`, error }),
                ),
              )
              const counts = duplicateCounts(pending)

              return {
                output: { sessionID: target.id, items: describe(pending, counts) },
                content: render(target, pending, counts),
                metadata: { sessionID: target.id, pending: pending.length },
              }
            }),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
