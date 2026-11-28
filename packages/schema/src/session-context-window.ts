export * as SessionContextWindow from "./session-context-window.js"

import { Schema } from "effect"
import { Model } from "./model.js"
import { NonNegativeInt, optional } from "./schema.js"

/**
 * Whole-Session totals for the context panel, computed by one database aggregate. Every count describes
 * the session, not the transcript page a client has loaded: the panel used to summarise whatever the
 * timeline had scrolled to, so its figures changed as the reader moved.
 */

/** One finished step's prompt size, and whether a completed compaction precedes it. */
export const Point = Schema.Struct({
  /** Prompt-side tokens the provider reported: input plus both cache counters. */
  tokens: NonNegativeInt,
  /** True for the first step after a completed compaction, which is where the chart draws its drop. */
  afterCompaction: Schema.Boolean,
}).annotate({ identifier: "SessionContextWindow.Point" })
export type Point = typeof Point.Type

export const Info = Schema.Struct({
  /** Every durable message row in the Session. */
  messages: NonNegativeInt,
  /** Delivered prompts: the Session's turn count. */
  turns: NonNegativeInt,
  /** Turns since the newest completed compaction: what the next compaction actually has to summarise. */
  turnsSinceCompaction: NonNegativeInt,
  /** Assistant steps. */
  steps: NonNegativeInt,
  tokens: Schema.Struct({
    input: NonNegativeInt,
    output: NonNegativeInt,
    reasoning: NonNegativeInt,
    cacheRead: NonNegativeInt,
    cacheWrite: NonNegativeInt,
  }),
  /** The newest step's prompt size and the model that reported it; absent before any step runs. */
  last: optional(
    Schema.Struct({
      tokens: NonNegativeInt,
      model: Model.Ref,
    }),
  ),
  /** One entry per assistant step that reported usage, oldest first, for the prompt-history chart. */
  points: Schema.Array(Point),
  /** True when the series was sampled down to `maxPoints`; the counts above stay exact. */
  aggregated: Schema.Boolean,
}).annotate({ identifier: "SessionContextWindow.Info" })
export type Info = typeof Info.Type
