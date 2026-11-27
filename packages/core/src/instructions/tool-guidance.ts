export * as ToolGuidance from "./tool-guidance.js"

import { Effect, Schema } from "effect"
import { Instructions } from "./index.js"

export const key = Instructions.Key.make("core/tool-guidance")

/** The exact ledger text; exported so tests assert the assembled baseline against the same bytes. */
export const guidance =
  "When you create a worktree outside the current working directory and intend to use it as your primary working directory, consider using `execute` to call `tools.aicraft.session_move` and make the worktree the session's working directory."

/**
 * Registers the session-move guidance as an instruction-ledger source (P4). The text is constant, so it
 * renders into the epoch baseline once and never produces an L4 notice.
 */
export const make = (): Instructions.List =>
  Instructions.make({
    key,
    codec: Schema.toCodecJson(Schema.String),
    read: Effect.succeed("on"),
    render: {
      initial: () => guidance,
      changed: () => undefined,
    },
  })
