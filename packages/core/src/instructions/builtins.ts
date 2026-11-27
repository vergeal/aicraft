export * as InstructionBuiltIns from "./builtins.js"

import { makeLocationNode } from "@aicraft/util/effect/app-node"
import { Context, DateTime, Effect, Layer, Schema } from "effect"
import { Global } from "@aicraft/util/global"
import { Location } from "../location.js"
import { Instructions } from "./index.js"

export interface Interface {
  readonly load: () => Effect.Effect<Instructions.List>
}

export class Service extends Context.Service<Service, Interface>()("@aicraft/InstructionBuiltIns") {}

const languageInstruction =
  "Default to Chinese for user-facing content: replies, labels, buttons, empty states, error messages, and any UI copy you write. Keep code, identifiers, file paths, and command names as-is. Switch language only when the user writes in another language or explicitly asks for one."

/**
 * Cost discipline, not capability: every tool call re-sends the whole history, so the step count dominates
 * spend. Static text, so it stays in the epoch baseline and never invalidates the prompt cache.
 */
const toolEconomyInstruction =
  "Every tool call re-sends the full history, so the number of steps costs more than the size of any single result. Fire independent calls in the same step: reading several files, listing several directories, and running unrelated commands do not need to wait on each other. Merge unrelated probes into one command instead of a run of steps. Read a file in one pass rather than paging through it; when a file is large, locate the relevant region first. Do not re-run a command just to confirm an earlier edit landed — fold that check into the step that made the edit. Serialize only when one call's result decides how to ask for the next."

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const global = yield* Global.Service
    const location = yield* Location.Service
    return Service.of({
      load: () =>
        Effect.succeed(
          Instructions.combine([
            Instructions.make({
              key: Instructions.Key.make("core/language"),
              // L1: static harness text that never changes at runtime; the §5 static-registration
              // face — an edit lands on version advance, not as a turn supply.
              layer: "L1",
              codec: Schema.toCodecJson(Schema.String),
              read: Effect.succeed("zh"),
              render: {
                initial: () => languageInstruction,
                changed: () => languageInstruction,
              },
            }),
            Instructions.make({
              key: Instructions.Key.make("core/tool-economy"),
              // L1: same static harness text as core/language — byte-stable for the session's life.
              layer: "L1",
              codec: Schema.toCodecJson(Schema.String),
              read: Effect.succeed("on"),
              render: {
                initial: () => toolEconomyInstruction,
                changed: () => toolEconomyInstruction,
              },
            }),
            Instructions.make({
              key: Instructions.Key.make("core/date"),
              // L5: the day the clock crosses is exactly the dynamic fact §1 names for L5; it must
              // stay in the hot tail so it never invalidates the cached prefix behind it.
              layer: "L5",
              codec: Schema.toCodecJson(Schema.String),
              read: DateTime.nowAsDate.pipe(Effect.map((date) => date.toDateString())),
              render: {
                initial: (date) => `Today's date: ${date}`,
                changed: (_previous, date) => `Today's date is now: ${date}`,
              },
            }),
            Instructions.make({
              key: Instructions.Key.make("core/environment"),
              // L5: environment facts (directory, platform) vary per location — the "环境变化"
              // hot material §1 puts in L5, not in the frozen baseline's owner list.
              layer: "L5",
              codec: Schema.toCodecJson(Schema.String),
              read: Effect.sync(() =>
                [
                  "<env>",
                  `  Working directory: ${location.directory}`,
                  `  Workspace root folder: ${location.project.directory}`,
                  `  Is directory a git repo: ${location.vcs?.type === "git" ? "yes" : "no"}`,
                  `  Platform: ${process.platform}`,
                  `  Prefer ${global.tmp} over generic system temporary directories such as /tmp; it is pre-created and approved for external access.`,
                  "</env>",
                ].join("\n"),
              ),
              render: {
                initial: (environment) =>
                  ["Here is some useful information about the environment you are running in:", environment].join("\n"),
                changed: (_previous, environment) => ["You are running in a new environment:", environment].join("\n"),
              },
            }),
          ]),
        ),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Global.node, Location.node] })
