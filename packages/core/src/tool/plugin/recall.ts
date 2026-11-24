export * as RecallTool from "./recall.js"

import { ToolFailure } from "@aicraft/ai/effect"
import type { Context } from "@aicraft/plugin/effect/plugin"
import { SessionMessage } from "@aicraft/schema/session-message"
import type { SessionInbox } from "@aicraft/schema/session-inbox"
import { Effect, Schema } from "effect"
import { Permission } from "../../permission.js"
import { SessionTarget } from "./session-target.js"

export const name = "recall"

export const description = [
  "Withdraw deliveries this session sent that the target has not read yet, so it never acts on instructions that were replaced or sent by mistake.",
  "Only deliveries from the current session are eligible. A message a person typed, a delivery from another session, or anything another plugin published is never touched.",
  "A delivery the target has already read cannot be withdrawn. It is reported as failed rather than silently succeeding; correct one with `steer` instead.",
  "To inspect what is still waiting in a queue, use `queue` instead. It only reads: withdrawing a delivery is done here, by the session that sent it.",
  "`to` is a session address: `ses_xxx`, `@session:ses_xxx`, or an exact title of a session in this project.",
  "`ids` withdraws only those deliveries; omit it to withdraw every delivery from this session that the target has not read.",
].join("\n")

export const Input = Schema.Struct({
  to: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "The target session: ses_xxx, @session:ses_xxx, or an exact session title in this project.",
  }),
  ids: Schema.optionalKey(Schema.Array(SessionMessage.ID)).annotate({
    description: "Message IDs to withdraw. Omit to withdraw every pending delivery from this session.",
  }),
})

export const Output = Schema.Struct({
  cancelled: Schema.Array(Schema.String),
  failed: Schema.Array(Schema.Struct({ id: Schema.String, reason: Schema.String })),
})

export interface Failure {
  readonly id: string
  readonly reason: string
}

/**
 * Decides what can be withdrawn before anything is cancelled. Ownership comes from the delivery
 * envelope, and an id that is not pending is a delivered or unknown message: it must be reported, not
 * dropped, so a caller never believes a delivered instruction was withdrawn.
 */
export function planRecall(input: {
  readonly pending: readonly SessionInbox.Info[]
  readonly from: string
  readonly ids?: readonly string[]
}): { cancel: string[]; failed: Failure[] } {
  const owned = new Map<string, SessionInbox.Info>(
    input.pending
      .filter((item) => SessionTarget.deliveredBy(item) === input.from)
      .map((item) => [item.id, item] as const),
  )

  if (input.ids === undefined) return { cancel: [...owned.keys()], failed: [] }

  const other = new Set<string>(input.pending.map((item) => item.id))

  return input.ids.reduce<{ cancel: string[]; failed: Failure[] }>(
    (plan, id) => {
      if (owned.has(id)) plan.cancel.push(id)
      else
        plan.failed.push({
          id,
          reason: other.has(id)
            ? "Pending, but not delivered by this session. Recall only withdraws this session's deliveries."
            : "Not pending: already delivered or unknown. Use steer to send a corrected message.",
        })

      return plan
    },
    { cancel: [], failed: [] },
  )
}

/**
 * Cancels a plan made by {@link planRecall}. A cancel that fails keeps its real reason, because the
 * server turns an inbox conflict into a no-op and the caller must still learn the message stayed.
 */
export const run = (input: {
  readonly pending: readonly SessionInbox.Info[]
  readonly from: string
  readonly ids?: readonly string[]
  readonly cancel: (id: SessionMessage.ID) => Effect.Effect<void, unknown>
}) =>
  Effect.gen(function* () {
    const plan = planRecall(input)
    const results = yield* Effect.forEach(plan.cancel, (id) =>
      input.cancel(SessionMessage.ID.make(id)).pipe(
        Effect.as({ id, ok: true as const }),
        Effect.catch((error) => Effect.succeed({ id, ok: false as const, reason: reasonOf(error) })),
      ),
    )

    return {
      cancelled: results.flatMap((result) => (result.ok ? [result.id] : [])),
      failed: [
        ...plan.failed,
        ...results.flatMap((result) => (result.ok ? [] : [{ id: result.id, reason: result.reason }])),
      ],
    }
  })

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const Plugin = {
  id: "aicraft.tool.recall",
  effect: Effect.fn("RecallTool.Plugin")(function* (ctx: Context) {
    const permission = yield* Permission.Service

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          icon: "tool-recall",
          options: { codemode: false },
          description,
          input: Input,
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              const from = yield* ctx.session
                .get({ sessionID: context.sessionID })
                .pipe(
                  Effect.mapError(
                    (error) => new ToolFailure({ message: `Current session not found: ${context.sessionID}`, error }),
                  ),
                )
              const target = yield* SessionTarget.resolve(ctx, input.to)

              yield* permission
                .assert({
                  action: name,
                  resources: [target.id],
                  save: [target.id],
                  ...Permission.invocation(context),
                })
                .pipe(
                  Effect.mapError(
                    (error) => new ToolFailure({ message: `Recall in ${target.id} was not allowed`, error }),
                  ),
                )

              const pending = yield* ctx.session.inbox.list({ sessionID: target.id }).pipe(
                Effect.mapError(
                  (error) => new ToolFailure({ message: `Could not read the queue of ${target.id}`, error }),
                ),
              )
              const result = yield* run({
                pending,
                from: from.id,
                ids: input.ids,
                cancel: (inboxID) => ctx.session.inbox.cancel({ sessionID: target.id, inboxID, by: from.id }),
              })

              return {
                output: result,
                content: [
                  `Withdrew ${result.cancelled.length} pending delivery(ies) from @${target.title ?? target.id} (${target.id}).`,
                  ...result.cancelled.map((id) => `- ${id}`),
                  ...(result.failed.length === 0
                    ? []
                    : [
                        "Not withdrawn:",
                        ...result.failed.map((failure) => `- ${failure.id}: ${failure.reason}`),
                        "A delivered message cannot be withdrawn. Use steer to send a corrected instruction instead.",
                      ]),
                ].join("\n"),
                metadata: { sessionID: target.id, cancelled: result.cancelled },
              }
            }),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
