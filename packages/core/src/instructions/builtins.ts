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

/**
 * Deliberately blunt, by the user's instruction. A rule phrased as a preference ("default to…") reads as a
 * style hint and gets dropped under load; the same demand stated flatly, with the annoyance attached, is
 * obeyed. Keep the specifics intact — thinking and replies in Chinese, code and identifiers untouched.
 */
export const languageInstruction =
  "他妈的给我用中文！思考和回复全部用中文，别给老子甩英文。界面文案、按钮、空状态、报错、注释说明，一律中文。代码、标识符、文件路径、命令名保持原样，那不是英文。用户没说换语言，就永远中文。"

/**
 * Cost discipline, not capability: every tool call re-sends the whole history, so the step count dominates
 * spend. Static text, so it stays in the epoch baseline and never invalidates the prompt cache.
 */
export const toolEconomyInstruction =
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
              // L1: the date rides the frozen baseline instead of being re-read per step, so a clock
              // that crosses midnight cannot rewrite the prefix. The ISO form is also 19 characters
              // shorter than `toDateString` for the same information.
              layer: "L1",
              codec: Schema.toCodecJson(Schema.String),
              read: DateTime.now.pipe(Effect.map((date) => DateTime.formatIsoDate(date))),
              render: {
                initial: (date) => `Today's date: ${date}`,
                // The baseline stays frozen for the epoch, so a day crossing is stated once as an L4
                // notice instead of rewriting L1 every step. The next compaction bakes the new date
                // into the baseline and the notice settles.
                changed: (_previous, date) => `The date has changed. Today's date: ${date}`,
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
