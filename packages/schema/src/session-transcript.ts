export * as SessionTranscript from "./session-transcript.js"

import { Schema } from "effect"
import { NonNegativeInt } from "./schema.js"

/**
 * Turn and step counts, durations and prompt-token measurements recorded as the Session runs, stored on
 * the Session so the composer status line renders from the Session record alone instead of folding the transcript.
 */
export const Stats = Schema.Struct({
  turns: NonNegativeInt,
  steps: NonNegativeInt,
  /** Milliseconds spent generating across the Session's steps. */
  modelTime: NonNegativeInt,
  /** Milliseconds completed tool calls spent across the Session's steps. */
  toolTime: NonNegativeInt,
  /** Output and reasoning tokens produced across the Session's steps. */
  outputTokens: NonNegativeInt,
  /** Prompt tokens of the last step that recorded usage: input plus cache read plus cache write. */
  contextTokens: NonNegativeInt,
}).annotate({ identifier: "Session.Stats" })
export interface Stats extends Schema.Schema.Type<typeof Stats> {}
