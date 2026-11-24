export * as SessionCreateTool from "./session-create.js"

import { ToolFailure } from "@aicraft/ai/effect"
import type { Context } from "@aicraft/plugin/effect/plugin"
import { Effect, Schema } from "effect"
import { Permission } from "../../permission.js"
import { SessionSchema } from "../../session/schema.js"

export const name = "create"

export const description = [
  "Create a new session in this project and return its id. A session is a conversation, not a file.",
  "The new session is complete on its own: it appears in the session list and takes messages like any other session. It is attached to this session for display only, not as a subagent.",
  "Use it when the work should continue in a fresh context instead of this session: a long task that would fill this one, or a task for a different agent.",
  "Pass `prompt` to start the new session immediately with the first message; omit it to leave the session idle and deliver to it later.",
  "This session does not see what happens inside it. Address it with `deliver({ to, text })`, the same way as any other session.",
  "To start an agent that runs this task and reports back to you, use `subagent` instead.",
].join("\n")

export const Input = Schema.Struct({
  title: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "The session title. Defaults to the title the server picks.",
  })),
  prompt: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1)).annotate({
    description:
      "The first message for the new session. Write it as a complete, self-contained request: the new session cannot see this one's history.",
  })),
})

export const Output = Schema.Struct({
  sessionID: SessionSchema.ID,
})

export const Plugin = {
  id: "aicraft.tool.session-create",
  effect: Effect.fn("SessionCreateTool.Plugin")(function* (ctx: Context) {
    const permission = yield* Permission.Service

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          icon: "tool-create",
          options: { codemode: false },
          description,
          input: Input,
          output: Output,
          execute: (input, context) =>
            Effect.gen(function* () {
              yield* permission
                .assert({
                  action: name,
                  resources: ["*"],
                  save: ["*"],
                  ...Permission.invocation(context),
                })
                .pipe(
                  Effect.mapError(
                    (error) => new ToolFailure({ message: "Creating a session was not allowed", error }),
                  ),
                )

              const parent = yield* ctx.session
                .get({ sessionID: context.sessionID })
                .pipe(Effect.orElseSucceed(() => undefined))

              // The new session starts with no history, so it needs to know where it came from and why it exists.
              // This is its own system prompt, not a message: it stays in context for every request.
              const purpose = (input.prompt ?? input.title)?.replaceAll(/\s+/g, " ").trim().slice(0, 240)
              const instructions = [
                "你是由另一个会话通过 create 工具创建的独立会话，不是子代理（subagent）。",
                "你可以像任何会话一样接收用户和其他会话的消息，并保留自己的完整历史。",
                `创建你的会话是「${parent?.title?.trim() || context.sessionID}」（${context.sessionID}）。`,
                input.title ? `创建时给你的标题是「${input.title}」。` : undefined,
                purpose ? `创建者说明的用途是：${purpose}` : "创建者没有说明具体用途。",
                "创建者看不到你的执行过程；它只会用 deliver 把后续消息发给你，并在需要时主动询问结果。",
              ]
                .filter((line): line is string => line !== undefined)
                .join("\n")

              const created = yield* ctx.session
                .create({
                  // The parent is display lineage, not subagent ownership: the new session appears in the session list
                  // and is driven by `deliver`, while only `subagent` marks an internal child agent.
                  parentID: context.sessionID,
                  title: input.title,
                  metadata: { createdBy: { sessionID: context.sessionID } },
                  prompt: instructions,
                })
                .pipe(Effect.mapError((error) => new ToolFailure({ message: "Failed to create a session", error })))

              if (input.prompt) {
                yield* ctx.session
                  .prompt({ sessionID: created.id, text: input.prompt, delivery: "queue", resume: true })
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new ToolFailure({
                          message: `Created session ${created.id}, but its first message could not be delivered`,
                          error,
                        }),
                    ),
                  )
              }

              const title = created.title ?? created.id

              return {
                output: { sessionID: created.id },
                content: [
                  `Created session @${title} (${created.id}).`,
                  input.prompt ? "It starts on the message you passed." : "It is idle until something is delivered to it.",
                  `Address it later with deliver({ to: "${created.id}", text: "..." }).`,
                ].join("\n"),
                metadata: { sessionID: created.id },
              }
            }),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
