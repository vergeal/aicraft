export * as InstructionState from "./instruction-state.js"

import { and, eq, gte, inArray, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import type { Database } from "../database/database.js"
import type { Bus } from "../bus.js"
import { Instructions } from "../instructions/index.js"
import { SessionEvent } from "./event.js"
import { SessionSchema } from "./schema.js"
import { InstructionBlobTable, InstructionStateTable } from "./sql.js"

type DatabaseService = Database.Interface["db"]

export interface Observation extends Instructions.Admission {
  readonly sessionID: SessionSchema.ID
  readonly initial: boolean
  readonly previous: Instructions.Values
  readonly current: Instructions.Values
}

export const observe = Effect.fn("InstructionState.observe")(function* (
  db: DatabaseService,
  instructions: Instructions.List,
  sessionID: SessionSchema.ID,
): Effect.fn.Return<Observation, Instructions.InitializationBlocked> {
  const [observed, stored] = yield* Effect.all([Instructions.read(instructions), find(db, sessionID)], {
    concurrency: "unbounded",
  })
  const result = yield* observeAgainst(observed, stored?.current_values)
  return {
    sessionID,
    initial: !stored,
    previous: stored?.current_values ?? {},
    ...result,
  }
})

export const commit = Effect.fn("InstructionState.commit")(function* (
  db: DatabaseService,
  bus: Bus.Interface,
  observation: Observation,
) {
  if (!observation.initial && Object.keys(observation.delta).length === 0) return
  // The event is a ledger delta only. The rendered narrative is no longer frozen here: L4
  // recomputes the net baseline-to-current diff from the ledger at assembly time, replacing
  // the old append-only timeline injection.
  yield* bus.publish(
    SessionEvent.InstructionsUpdated,
    {
      sessionID: observation.sessionID,
      delta: observation.delta,
    },
    {
      // Initial sync establishes the baseline; unlike later deltas it is not chronological history.
      ...(observation.initial ? { metadata: { instructions: { initial: true } } } : {}),
      commit: () => insertBlobs(db, observation.blobs),
    },
  )
})

export const prepare = Effect.fn("InstructionState.prepare")(function* (
  db: DatabaseService,
  bus: Bus.Interface,
  instructions: Instructions.List,
  sessionID: SessionSchema.ID,
) {
  yield* commit(db, bus, yield* observe(db, instructions, sessionID))
})

export const apply = Effect.fn("InstructionState.apply")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  seq: number,
  delta: Instructions.Delta,
) {
  const stored = yield* find(db, sessionID)
  const current = Instructions.applyHashDelta(stored?.current_values ?? {}, delta)
  if (!stored) return yield* initialize(db, sessionID, seq, current)
  yield* db
    .update(InstructionStateTable)
    .set({ through_seq: seq, current_values: current })
    .where(eq(InstructionStateTable.session_id, sessionID))
    .run()
    .pipe(Effect.orDie)
})

export const initialize = Effect.fn("InstructionState.initialize")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  seq: number,
  values: Instructions.Values,
) {
  yield* db
    .insert(InstructionStateTable)
    .values({
      session_id: sessionID,
      epoch_start: seq,
      through_seq: seq,
      initial_values: values,
      current_values: values,
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
})

export const advanceEpoch = Effect.fn("InstructionState.advanceEpoch")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  epochStart: number,
) {
  yield* db
    .update(InstructionStateTable)
    .set({
      epoch_start: epochStart,
      through_seq: epochStart,
      initial_values: sql`${InstructionStateTable.current_values}`,
    })
    .where(eq(InstructionStateTable.session_id, sessionID))
    .run()
    .pipe(Effect.orDie)
})

/**
 * Clears the fold only when a committed revert removed an update or the epoch start. Otherwise the
 * fold still matches the surviving history, and keeping its baseline keeps the prompt cache.
 */
export const rewind = Effect.fn("InstructionState.rewind")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  boundary: number,
) {
  yield* db
    .delete(InstructionStateTable)
    .where(and(eq(InstructionStateTable.session_id, sessionID), gte(InstructionStateTable.through_seq, boundary)))
    .run()
    .pipe(Effect.orDie)
})

/** Renders the epoch baseline shown at the start of every model request. */
export const initial = Effect.fn("InstructionState.initial")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  instructions: Instructions.List,
) {
  const state = yield* find(db, sessionID)
  if (!state) return yield* Effect.die(new Error(`Instruction state not found during assembly: ${sessionID}`))
  const blobs = yield* loadBlobs(db, Object.values(state.initial_values))
  return Instructions.renderInitial(instructions, dereference(state.initial_values, blobs))
})

/** The current instruction values, used to seed a fork's baseline. */
export const current = Effect.fn("InstructionState.current")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
) {
  return (yield* find(db, sessionID))?.current_values
})

/**
 * L4 notices for the in-flight version: the net diff between the epoch baseline and
 * the current instruction values, rendered by the sources' own renderers. Recomputed
 * per assembly (replacing, never appending), so contradictory observations — uninstalled
 * then reinstalled, edited back to the baseline — settle to the latest state or vanish.
 */
export const notices = Effect.fn("InstructionState.notices")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  instructions: Instructions.List,
) {
  const state = yield* find(db, sessionID)
  if (!state) return []
  const keys = new Set([...Object.keys(state.initial_values), ...Object.keys(state.current_values)])
  const changed = [...keys].filter((key) => state.initial_values[key] !== state.current_values[key])
  if (changed.length === 0) return []
  const referenced = changed
    .flatMap((key) => [state.initial_values[key], state.current_values[key]])
    .filter((hash): hash is Instructions.Hash => hash !== undefined)
  const blobs = yield* loadBlobs(db, referenced)
  const previous: Record<string, Schema.Json> = {}
  const delta: Record<string, Option.Option<Schema.Json>> = {}
  for (const key of changed) {
    const before = state.initial_values[key]
    const after = state.current_values[key]
    if (before !== undefined) previous[key] = requireBlob(blobs, before)
    delta[key] = after === undefined ? Option.none() : Option.some(requireBlob(blobs, after))
  }
  // Per-source rendering (mirroring `Instructions.renderUpdate`, which joins to one string):
  // each notice keeps its key so the assembly can tag the request's context metadata. A notice is
  // an L4 state declaration even when the source it restates belongs to another layer (DESIGN §1):
  // it carries the net change, and the assembly trails it after the frozen baseline.
  return instructions.flatMap((source) => {
    if (!Object.hasOwn(delta, source.key)) return []
    const current = delta[source.key]
    if (current === undefined || Option.isNone(current)) {
      if (!Object.hasOwn(previous, source.key)) return []
      const text = source.removed(previous[source.key])
      return text === undefined ? [] : [{ key: source.key, layer: "L4" as const, text }]
    }
    const text = Object.hasOwn(previous, source.key)
      ? source.changed(previous[source.key], current.value)
      : source.initial(current.value)
    return text === undefined ? [] : [{ key: source.key, layer: "L4" as const, text }]
  })
})

/** The current baseline epoch start seq, the invalidation key for the context snapshot. */
export const epochOf = Effect.fn("InstructionState.epochOf")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
) {
  const row = yield* db
    .select({ epoch_start: InstructionStateTable.epoch_start })
    .from(InstructionStateTable)
    .where(eq(InstructionStateTable.session_id, sessionID))
    .get()
    .pipe(Effect.orDie)
  return row?.epoch_start
})

export const preview = Effect.fn("InstructionState.preview")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  instructions: Instructions.List,
  observed: Instructions.ReadResult,
) {
  const state = yield* find(db, sessionID)
  const result = yield* observeAgainst(observed, state?.current_values)
  const observedBlobs = new Map<Instructions.Hash, Schema.Json>(
    Object.entries(result.blobs).map(([hash, value]) => [Instructions.Hash.make(hash), value]),
  )
  if (!state) {
    const values = dereference(result.current, observedBlobs)
    return { initial: Instructions.renderInitial(instructions, values), update: "" }
  }
  const stored = yield* loadBlobs(db, [...Object.values(state.initial_values), ...Object.values(state.current_values)])
  return {
    initial: Instructions.renderInitial(instructions, dereference(state.initial_values, stored)),
    update: Instructions.renderUpdate(
      instructions,
      dereference(state.current_values, stored),
      dereferenceDelta(result.delta, observedBlobs),
    ),
  }
})

const observeAgainst = Effect.fnUntraced(function* (observed: Instructions.ReadResult, previous?: Instructions.Values) {
  const admission = yield* Instructions.diff(observed, previous)
  return {
    current: Instructions.applyHashDelta(previous ?? {}, admission.delta),
    ...admission,
  }
})

const find = Effect.fnUntraced(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  return yield* db
    .select()
    .from(InstructionStateTable)
    .where(eq(InstructionStateTable.session_id, sessionID))
    .get()
    .pipe(Effect.orDie)
})

const insertBlobs = Effect.fnUntraced(function* (db: DatabaseService, blobs: Readonly<Record<string, Schema.Json>>) {
  const rows = Object.entries(blobs).map(([hash, value]) => ({ hash: Instructions.Hash.make(hash), value }))
  if (rows.length === 0) return
  yield* db.insert(InstructionBlobTable).values(rows).onConflictDoNothing().run().pipe(Effect.orDie)
})

const loadBlobs = Effect.fnUntraced(function* (db: DatabaseService, values: ReadonlyArray<Instructions.Hash>) {
  const hashes = [...new Set(values)]
  const batches = Array.from({ length: Math.ceil(hashes.length / 500) }, (_, index) =>
    hashes.slice(index * 500, (index + 1) * 500),
  )
  const rows = (yield* Effect.forEach(
    batches,
    (batch) =>
      db.select().from(InstructionBlobTable).where(inArray(InstructionBlobTable.hash, batch)).all().pipe(Effect.orDie),
    { concurrency: 4 },
  )).flat()
  const blobs = new Map(rows.map((row) => [row.hash, row.value]))
  for (const hash of hashes) {
    if (!blobs.has(hash)) return yield* Effect.die(new Error(`Instruction blob not found: ${hash}`))
  }
  return blobs
})

function dereference(
  values: Instructions.Values,
  blobs: ReadonlyMap<Instructions.Hash, Schema.Json>,
): Readonly<Record<string, Schema.Json>> {
  return Object.fromEntries(Object.entries(values).map(([key, hash]) => [key, requireBlob(blobs, hash)]))
}

function dereferenceDelta(
  delta: Instructions.Delta,
  blobs: ReadonlyMap<Instructions.Hash, Schema.Json>,
): Readonly<Record<string, Option.Option<Schema.Json>>> {
  return Object.fromEntries(
    Object.entries(delta).map(([key, hash]) => [
      key,
      hash === "removed" ? Option.none() : Option.some(requireBlob(blobs, hash)),
    ]),
  )
}

function requireBlob(blobs: ReadonlyMap<Instructions.Hash, Schema.Json>, hash: Instructions.Hash) {
  const value = blobs.get(hash)
  if (value === undefined) throw new Error(`Instruction blob not found: ${hash}`)
  return value
}
