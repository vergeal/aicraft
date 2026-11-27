export * as SessionContextSnapshot from "./context-snapshot.js"

import { eq } from "drizzle-orm"
import { bumpLineage, initialLineage } from "@aicraft/context"
import { Effect, Option, Schema } from "effect"
import type { Lineage } from "@aicraft/context"
import type { Database } from "../database/database.js"
import { SessionSchema } from "./schema.js"
import { ContextSnapshotTable } from "./sql.js"

type DatabaseService = Database.Interface["db"]
type SnapshotRow = typeof ContextSnapshotTable.$inferSelect

/** One of the three volatile system-prefix segments captured at build time. */
export interface VolatilePart {
  readonly kind: "agent" | "project" | "session"
  readonly text: string
}

export interface Resolved {
  readonly parts: ReadonlyArray<VolatilePart>
  readonly lineage: Lineage
  readonly rebuilt: boolean
}

interface ResolveInput {
  readonly sessionID: SessionSchema.ID
  readonly baselineEpoch: number
  readonly agentID: string
  readonly live: ReadonlyArray<VolatilePart>
}

const VolatilePartSchema = Schema.Struct({
  kind: Schema.Literals(["agent", "project", "session"]),
  text: Schema.String,
})
const StoredPartsSchema = Schema.Struct({ parts: Schema.Array(VolatilePartSchema) })
const BumpReasonSchema = Schema.Literals(["initial", "advance", "compaction"])

/**
 * Freezes the volatile system-prefix segments per session. While the invalidation keys
 * (instruction epoch baseline and agent) hold, the stored bytes are returned verbatim and
 * `input.live` is ignored, keeping the prompt cache prefix stable across steps.
 */
export const resolve = Effect.fn("SessionContextSnapshot.resolve")(function* (
  db: DatabaseService,
  input: ResolveInput,
) {
  const row = yield* db
    .select()
    .from(ContextSnapshotTable)
    .where(eq(ContextSnapshotTable.session_id, input.sessionID))
    .get()
    .pipe(Effect.orDie)
  if (!row) {
    const lineage = initialLineage()
    yield* store(db, input, lineage)
    return { parts: input.live, lineage, rebuilt: true }
  }
  const stored = yield* requireLineage(row)
  if (row.baseline_epoch === input.baselineEpoch && row.agent_id === input.agentID)
    return { parts: yield* requireParts(row.parts), lineage: stored, rebuilt: false }
  const lineage = bumpLineage(stored, row.baseline_epoch !== input.baselineEpoch ? "compaction" : "advance")
  yield* store(db, input, lineage)
  return { parts: input.live, lineage, rebuilt: true }
})

const store = Effect.fnUntraced(function* (db: DatabaseService, input: ResolveInput, lineage: Lineage) {
  const parts = yield* requireLive(input.live)
  const values = {
    epoch: lineage.epoch,
    prefix_version: lineage.prefixVersion,
    parent_version: lineage.parentVersion ?? null,
    bump_reason: lineage.bumpReason,
    baseline_epoch: input.baselineEpoch,
    agent_id: input.agentID,
    parts: { parts },
  }
  yield* db
    .insert(ContextSnapshotTable)
    .values({ session_id: input.sessionID, ...values })
    .onConflictDoUpdate({ target: ContextSnapshotTable.session_id, set: values })
    .run()
    .pipe(Effect.orDie)
})

const decodeStoredParts = Schema.decodeUnknownOption(StoredPartsSchema)
const decodeBumpReason = Schema.decodeUnknownOption(BumpReasonSchema)
const decodeLiveParts = Schema.decodeUnknownOption(Schema.Array(VolatilePartSchema))

const requireLineage = (row: SnapshotRow) =>
  Effect.gen(function* () {
    return {
      epoch: row.epoch,
      prefixVersion: row.prefix_version,
      parentVersion: row.parent_version ?? undefined,
      bumpReason: yield* orDie("bump_reason", decodeBumpReason(row.bump_reason), row.bump_reason),
    } satisfies Lineage
  })

const requireParts = (value: unknown) =>
  Effect.gen(function* () {
    return (yield* orDie("parts", decodeStoredParts(value), value)).parts
  })

const requireLive = (live: ReadonlyArray<VolatilePart>) =>
  Effect.gen(function* () {
    return yield* orDie("live parts", decodeLiveParts(live), live)
  })

function orDie<A>(label: string, decoded: Option.Option<A>, value: unknown) {
  return Effect.gen(function* () {
    if (Option.isSome(decoded)) return decoded.value
    return yield* Effect.die(new Error(`Corrupt context snapshot ${label}: ${JSON.stringify(value)}`))
  })
}
