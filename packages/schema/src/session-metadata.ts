import { Schema } from "effect"

/**
 * Host-supplied session annotations, durable and opaque to core. Keys are
 * arbitrary; values must be JSON-serializable. Children and forks inherit
 * the parent's current metadata unless the creator supplies its own.
 */
export const SessionMetadata = Schema.Record(Schema.String, Schema.Json).annotate({
  identifier: "Session.Metadata",
})
export type SessionMetadata = typeof SessionMetadata.Type

/**
 * The one annotation the L3 mapping reads: `true` makes a completed turn replay its reasoning
 * into the next request instead of dropping it (DESIGN §1.1 rule 1). Debug-only — it inflates
 * every later request in the Session by the whole accumulated thinking, so it exists to measure
 * what dropping that thinking costs, never as a shipping default.
 */
export const REPLAY_REASONING_KEY = "debug.replayReasoning"

export const replaysReasoning = (metadata: SessionMetadata | undefined) =>
  metadata?.[REPLAY_REASONING_KEY] === true
