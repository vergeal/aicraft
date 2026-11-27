export * as SessionContextSnapshot from "./context-snapshot.js"

import { eq } from "drizzle-orm"
import { bumpLineage, initialLineage } from "@aicraft/context"
import { Effect, Option, Schema } from "effect"
import type { Lineage } from "@aicraft/context"
import type { Database } from "../database/database.js"
import { SessionSchema } from "./schema.js"
import { ContextLineageTable, ContextSnapshotTable, InstructionStateTable } from "./sql.js"

type DatabaseService = Database.Interface["db"]
type SnapshotRow = typeof ContextSnapshotTable.$inferSelect
/** The write surface the snapshot helpers need; a transaction handle satisfies it too. */
type Writer = Pick<DatabaseService, "insert" | "update">

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

export interface AdvanceResult {
  readonly lineage: Lineage
  readonly settled: ReadonlyArray<string>
  readonly rebuiltAt: "pending" | "not-needed"
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
 * (instruction epoch baseline and agent) hold and no manual advance is pending, the stored
 * bytes are returned verbatim and `input.live` is ignored, keeping the prompt cache prefix
 * stable across steps. A pending advance is treated as a miss: the rebake deferred by
 * {@link advance} happens here, where the live parts are already in hand.
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
  if (row.baseline_epoch === input.baselineEpoch && row.agent_id === input.agentID && !row.pending_advance)
    return { parts: yield* requireParts(row.parts), lineage: stored, rebuilt: false }
  // A pending advance keeps the epoch key, so it joins the agent switch in the "advance" bucket.
  const lineage = bumpLineage(stored, row.baseline_epoch !== input.baselineEpoch ? "compaction" : "advance")
  yield* store(db, input, lineage)
  return { parts: input.live, lineage, rebuilt: true }
})

/**
 * Manual advance: the user explicitly commits the pending instruction changes. Settles the
 * ledger (`initial_values = current_values`) without touching `epoch_start` — the dual-clock
 * split from compaction — then flags the stored snapshot so the rebake happens on the next
 * resolve, where the live parts are already in hand. The returned lineage is a preview: the
 * stored row is left unbumped, so the deferred rebuild writes exactly these coordinates.
 */
export const advance = Effect.fn("SessionContextSnapshot.advance")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
) {
  return yield* db
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* tx
          .select()
          .from(InstructionStateTable)
          .where(eq(InstructionStateTable.session_id, sessionID))
          .get()
          .pipe(Effect.orDie)
        const settled = yield* settleLedger(tx, sessionID, state)
        const row = yield* tx
          .select()
          .from(ContextSnapshotTable)
          .where(eq(ContextSnapshotTable.session_id, sessionID))
          .get()
          .pipe(Effect.orDie)
        // Without a snapshot there is nothing to flag: the next resolve builds a fresh
        // initial lineage lazily anyway, so the advance needs no rebuild of its own.
        if (!row) return { lineage: initialLineage(), settled, rebuiltAt: "not-needed" } satisfies AdvanceResult
        yield* tx
          .update(ContextSnapshotTable)
          .set({ pending_advance: true })
          .where(eq(ContextSnapshotTable.session_id, sessionID))
          .run()
          .pipe(Effect.orDie)
        return {
          lineage: bumpLineage(yield* requireLineage(row), "advance"),
          settled,
          rebuiltAt: "pending",
        } satisfies AdvanceResult
      }),
    )
    .pipe(Effect.orDie)
})

/**
 * Net per-key diff between the epoch baseline and the current values — the keys the
 * advance takes effect on — then rewrites the baseline to current. `epoch_start` stays.
 */
const settleLedger = Effect.fnUntraced(function* (
  db: Writer,
  sessionID: SessionSchema.ID,
  state: typeof InstructionStateTable.$inferSelect | undefined,
) {
  if (!state) return []
  const settled = [
    ...new Set([...Object.keys(state.initial_values), ...Object.keys(state.current_values)]),
  ].filter((key) => state.initial_values[key] !== state.current_values[key])
  yield* db
    .update(InstructionStateTable)
    .set({ initial_values: state.current_values })
    .where(eq(InstructionStateTable.session_id, sessionID))
    .run()
    .pipe(Effect.orDie)
  return settled
})

const store = Effect.fnUntraced(function* (db: Writer, input: ResolveInput, lineage: Lineage) {
  const parts = yield* requireLive(input.live)
  const values = {
    epoch: lineage.epoch,
    prefix_version: lineage.prefixVersion,
    parent_version: lineage.parentVersion ?? null,
    bump_reason: lineage.bumpReason,
    baseline_epoch: input.baselineEpoch,
    agent_id: input.agentID,
    // Writing the rebake is what consumes a pending advance flag.
    pending_advance: false,
    parts: { parts },
  }
  yield* db
    .insert(ContextSnapshotTable)
    .values({ session_id: input.sessionID, ...values })
    .onConflictDoUpdate({ target: ContextSnapshotTable.session_id, set: values })
    .run()
    .pipe(Effect.orDie)
  // Genealogy archive (DESIGN.md §2): keep every version, not just the live row.
  // onConflictDoNothing makes a replayed write idempotent instead of forking the chain.
  yield* db
    .insert(ContextLineageTable)
    .values({
      session_id: input.sessionID,
      epoch: lineage.epoch,
      prefix_version: lineage.prefixVersion,
      parent_version: lineage.parentVersion ?? null,
      bump_reason: lineage.bumpReason,
    })
    .onConflictDoNothing()
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
