export * as ClaudeInstructions from "./instructions.js"

import type { SystemPart } from "@aicraft/ai/effect"
import type { Context } from "@aicraft/aix/effect/plugin"
import { Effect, Option, Schema } from "effect"
import { ClaudeSystemPrompt } from "./language-model/system-prompt.js"
import { ClaudeProvider } from "./provider.js"

const KINDS = ["context", "generate", "compaction"] as const

const InstructionsMetadata = Schema.Struct({
  experimental: Schema.Struct({
    instructions: Schema.Array(Schema.Struct({ key: Schema.String, text: Schema.String })),
  }),
})

// Claude Code writes its own date and environment, so AI Craft's would repeat them.
// P3 dependency: if date/environment move out of the ledger baseline into a live L5 tail part, they arrive
// here as a plain part.text instead of an experimental instruction and this filter stops applying — the
// characterization test pins the current behavior, revisit the list when the layering lands.
const SUPPLIED_BY_CLAUDE = new Set(["core/date", "core/environment"])

export const register = Effect.fn("ClaudeInstructions.register")(function* (ctx: Context) {
  yield* Effect.forEach(
    KINDS,
    (kind) =>
      ctx.session.hook(
        kind,
        (event) =>
          Effect.gen(function* () {
            const agent = yield* ctx.agent.get({ agentID: event.agent }).pipe(Effect.orDie)
            // Read the role from the resolved agent, not by guessing which prompt text is a built-in.
            event.options[ClaudeSystemPrompt.AGENT_OPTION] = agent.data.system ?? ""
            event.options[ClaudeSystemPrompt.INSTRUCTIONS_OPTION] = instructions(event.system)
          }),
        { providerID: ClaudeProvider.ID },
      ),
    { discard: true },
  )
})

// The first part is AI Craft's own prompt, which Claude Code's prompt replaces.
// Exported for the P4 characterization test: the provider reassembles its system prompt from exactly this
// degradation of the core `assembleSystem` output — behavior changes must be deliberate.
export function instructions(system: ReadonlyArray<SystemPart>) {
  const texts: string[] = []
  for (const part of system.slice(1)) {
    const metadata = Schema.decodeUnknownOption(InstructionsMetadata)(part.metadata)
    if (Option.isNone(metadata)) {
      texts.push(part.text)
      continue
    }
    for (const source of metadata.value.experimental.instructions) {
      if (SUPPLIED_BY_CLAUDE.has(source.key)) continue
      texts.push(source.text)
    }
  }
  return texts.join("\n\n")
}
