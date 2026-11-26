export * as MemoryStore from "./store.js"

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { Effect } from "effect"
import type { BrowseFilter, MemoryRecord, MemoryType, Scope, ScopeListing, Store, TurnDecision } from "@aicraft/memory"
import { scopeKey } from "@aicraft/memory"
import type { EffectDrizzleSqlite } from "../database/drizzle.js"
import { MemoryExtractLogTable, MemoryLogTable, MemorySourceTable, MemoryTable, MemoryTokenTable, MemoryTriggerTable } from "./sql.js"
import type { ExtractLogRecord } from "./extract.js"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

type MemoryRow = typeof MemoryTable.$inferSelect

/** Mirrors the reference store's `byRecency`: updated-desc with an id tiebreak, so equal
 *  timestamps cannot reorder candidates and break the byte-stability the injection block relies on. */
const recency = [desc(MemoryTable.time_updated), asc(MemoryTable.id)]

/**
 * The `@aicraft/memory` Store port over the main database. Read rules mirror the package's
 * reference store exactly (one active row per id, candidates from the token index, vectors only
 * from the current embed version), because every metric gate in the package is asserted against
 * those rules and an adapter that drifts invalidates the measurement.
 */
export function createSqlStore(db: Database): Store {
  const run = <A>(effect: Effect.Effect<A, unknown, never>) => Effect.runPromise(effect.pipe(Effect.orDie))
  const toRow = (record: MemoryRecord) => ({
    id: record.id,
    version: record.version,
    scope: scopeKeyOf(record),
    type: record.type,
    status: record.status,
    text: record.text,
    tags: [...record.tags],
    tokens: [...record.tokens],
    text_hash: record.textHash,
    embedding: encodeEmbedding(record.embedding),
    embed_version: record.embedVersion ?? null,
    superseded_by: record.supersededBy ?? null,
    time_created: Date.parse(record.createdAt),
    time_updated: Date.parse(record.updatedAt),
  })

  return {
    insert: (record) =>
      run(
        db.transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.insert(MemoryTable).values(toRow(record)).run()
            yield* insertTokens(tx, record)
          }),
        ),
      ),

    revise: (record) =>
      run(
        db.transaction((tx) =>
          Effect.gen(function* () {
            yield* tx
              .update(MemoryTable)
              .set({ status: "superseded", superseded_by: sql`coalesce(${MemoryTable.superseded_by}, ${MemoryTable.id})` })
              .where(and(eq(MemoryTable.id, record.id), eq(MemoryTable.status, "active")))
              .run()
            yield* tx.delete(MemoryTokenTable).where(eq(MemoryTokenTable.memory_id, record.id)).run()
            yield* tx.insert(MemoryTable).values(toRow(record)).run()
            yield* insertTokens(tx, record)
          }),
        ),
      ),

    supersede: (id, byID) =>
      run(
        db.transaction((tx) =>
          Effect.gen(function* () {
            const rows = yield* tx
              .update(MemoryTable)
              .set({ status: "superseded", superseded_by: byID })
              .where(and(eq(MemoryTable.id, id), eq(MemoryTable.status, "active")))
              .returning({ version: MemoryTable.version })
              .all()
            if (rows.length === 0) return false
            yield* tx.delete(MemoryTokenTable).where(eq(MemoryTokenTable.memory_id, id)).run()
            return true
          }),
        ),
      ),

    remove: (id) =>
      run(
        db.transaction((tx) =>
          Effect.gen(function* () {
            yield* tx.delete(MemoryTable).where(eq(MemoryTable.id, id)).run()
            yield* tx.delete(MemoryTokenTable).where(eq(MemoryTokenTable.memory_id, id)).run()
            yield* tx.delete(MemoryTriggerTable).where(eq(MemoryTriggerTable.memory_id, id)).run()
            yield* tx.delete(MemorySourceTable).where(eq(MemorySourceTable.memory_id, id)).run()
          }),
        ),
      ),

    get: (id) =>
      run(
        activeRows(db, [eq(MemoryTable.id, id)])
          .orderBy(desc(MemoryTable.version))
          .limit(1)
          .get()
          .pipe(Effect.map(only)),
      ),

    history: (id) =>
      run(
        db
          .select()
          .from(MemoryTable)
          .where(eq(MemoryTable.id, id))
          .orderBy(sql`${MemoryTable.version} asc`)
          .all()
          .pipe(Effect.map((rows) => rows.map(decode))),
      ),

    findByTextHash: (textHash, scope) =>
      run(
        activeRows(db, [eq(MemoryTable.scope, scope), eq(MemoryTable.text_hash, textHash)])
          .orderBy(...recency)
          .limit(1)
          .get()
          .pipe(Effect.map(only)),
      ),

    findTriggers: (forms, scopes) =>
      forms.length === 0 || scopes.length === 0
        ? Promise.resolve([])
        : run(
            db
              .select({ record: MemoryTable })
              .from(MemoryTriggerTable)
              .innerJoin(
                MemoryTable,
                and(eq(MemoryTable.id, MemoryTriggerTable.memory_id), eq(MemoryTable.status, "active")),
              )
              .where(and(inArray(MemoryTriggerTable.text, forms), inArray(MemoryTable.scope, scopes)))
              .orderBy(...recency)
              .all()
              .pipe(Effect.map(distinctRecords)),
          ),

    addTrigger: (trigger) =>
      run(
        db
          .insert(MemoryTriggerTable)
          .values({ text: trigger.text, memory_id: trigger.memoryID })
          .onConflictDoNothing()
          .run()
          .pipe(Effect.asVoid),
      ),

    removeTriggers: (memoryID) =>
      run(db.delete(MemoryTriggerTable).where(eq(MemoryTriggerTable.memory_id, memoryID)).run().pipe(Effect.asVoid)),

    addSource: (source) =>
      run(
        db
          .insert(MemorySourceTable)
          .values({ memory_id: source.memoryID, kind: source.kind, ref: source.ref })
          .onConflictDoNothing()
          .run()
          .pipe(Effect.asVoid),
      ),

    findCached: (kind, ref, scope, limit) =>
      run(
        db
          .select({ record: MemoryTable })
          .from(MemorySourceTable)
          .innerJoin(MemoryTable, and(eq(MemoryTable.id, MemorySourceTable.memory_id), eq(MemoryTable.status, "active")))
          .where(and(eq(MemorySourceTable.kind, kind), eq(MemorySourceTable.ref, ref), eq(MemoryTable.scope, scope)))
          .orderBy(...recency)
          .limit(limit)
          .all()
          .pipe(Effect.map((rows) => rows.map((item) => decode(item.record)))),
      ),

    listRecent: (scope, max) =>
      run(
        Effect.all(
          [
            activeRows(db, [eq(MemoryTable.scope, scope)]).orderBy(...recency).limit(max).all(),
            countActive(db, scope),
          ],
          { concurrency: "unbounded" },
        ).pipe(
          Effect.map(([rows, total]) => ({
            records: rows.map(decode),
            total,
            truncated: total > max,
          }) satisfies ScopeListing),
        ),
      ),

    /**
     * The token index is the candidate source: rows exist only for active versions, so a
     * superseded entry cannot be resurrected here.
     */
    lexicalCandidates: (tokens, scope, limit) =>
      tokens.length === 0
        ? Promise.resolve([])
        : run(
            db
              .select({ record: MemoryTable, shared: sql<number>`count(distinct ${MemoryTokenTable.token})` })
              .from(MemoryTokenTable)
              .innerJoin(MemoryTable, and(eq(MemoryTable.id, MemoryTokenTable.memory_id), eq(MemoryTable.status, "active")))
              .where(and(inArray(MemoryTokenTable.token, tokens), eq(MemoryTokenTable.scope, scope)))
              .groupBy(MemoryTable.id, MemoryTable.version)
              .orderBy(sql`count(distinct ${MemoryTokenTable.token}) desc`, ...recency)
              .limit(limit)
              .all()
              .pipe(Effect.map((rows) => rows.map((item) => decode(item.record)))),
          ),

    vectorCandidates: (scope, max, embedVersion) =>
      run(
        activeRows(db, [
          eq(MemoryTable.scope, scope),
          eq(MemoryTable.embed_version, embedVersion),
          sql`${MemoryTable.embedding} is not null`,
        ])
          .orderBy(...recency)
          .limit(max)
          .all()
          .pipe(Effect.map((rows) => rows.map(decode))),
      ),

    browse: (filter: BrowseFilter) =>
      run(
        Effect.all(
          [
            db
              .select()
              .from(MemoryTable)
              .where(browseWhere(filter))
              .orderBy(...recency)
              .limit(filter.limit)
              .offset(filter.offset)
              .all(),
            db
              .select({ count: sql<number>`count(*)` })
              .from(MemoryTable)
              .where(browseWhere(filter))
              .get(),
          ],
          { concurrency: "unbounded" },
        ).pipe(
          Effect.map(([rows, total]) => ({
            records: rows.map(decode),
            total: total?.count ?? 0,
            truncated: (total?.count ?? 0) > filter.offset + rows.length,
          }) satisfies ScopeListing),
        ),
      ),
  }

  function insertTokens(tx: Transaction, record: MemoryRecord) {
    const scope = scopeKeyOf(record)
    const values = [...new Set(record.tokens)].map((token) => ({ token, memory_id: record.id, scope }))
    if (values.length === 0) return Effect.void
    return tx.insert(MemoryTokenTable).values(values).onConflictDoNothing().run()
  }
}

function browseWhere(filter: BrowseFilter) {
  return and(
    eq(MemoryTable.scope, filter.scope),
    eq(MemoryTable.status, filter.status ?? "active"),
    filter.type === undefined ? undefined : eq(MemoryTable.type, filter.type),
    filter.tag === undefined
      ? undefined
      : sql`exists (select 1 from json_each(${MemoryTable.tags}) where value = ${filter.tag})`,
  )
}

function activeRows(db: Database, where: (ReturnType<typeof sql> | undefined)[]) {
  return db
    .select()
    .from(MemoryTable)
    .where(and(eq(MemoryTable.status, "active"), ...where))
}

function countActive(db: Database, scope: string) {
  return db
    .select({ count: sql<number>`count(*)` })
    .from(MemoryTable)
    .where(and(eq(MemoryTable.scope, scope), eq(MemoryTable.status, "active")))
    .get()
    .pipe(Effect.map((row) => row?.count ?? 0))
}

function scopeKeyOf(record: MemoryRecord) {
  return scopeKey(record.scope, record.scope === "global" ? undefined : (record.projectID ?? record.pluginID))
}

function only(row: MemoryRow | undefined) {
  return row === undefined ? undefined : decode(row)
}

function distinctRecords(rows: readonly { record: MemoryRow }[]): MemoryRecord[] {
  const seen = new Set<string>()
  const out: MemoryRecord[] = []
  for (const item of rows) {
    if (seen.has(item.record.id)) continue
    seen.add(item.record.id)
    out.push(decode(item.record))
  }
  return out
}

function decode(row: MemoryRow): MemoryRecord {
  const [scope, id] = parseScope(row.scope)
  return {
    id: row.id,
    scope,
    ...(scope === "project" ? { projectID: id } : scope === "plugin" ? { pluginID: id } : {}),
    type: row.type as MemoryType,
    status: row.status as MemoryRecord["status"],
    version: row.version,
    text: row.text,
    tags: row.tags,
    tokens: row.tokens,
    textHash: row.text_hash,
    embedding: decodeEmbedding(row.embedding),
    ...(row.embed_version === null ? {} : { embedVersion: row.embed_version }),
    ...(row.superseded_by === null ? {} : { supersededBy: row.superseded_by }),
    createdAt: new Date(row.time_created).toISOString(),
    updatedAt: new Date(row.time_updated).toISOString(),
  }
}

function parseScope(key: string): [Scope, string] {
  if (key === "global") return ["global", ""]
  const index = key.indexOf(":")
  if (index < 0) return ["project", key]
  const scope = key.slice(0, index)
  return [scope === "plugin" ? "plugin" : "project", key.slice(index + 1)]
}

/** Float32 little-endian, the byte layout every llama.cpp embedding consumer expects. */
function encodeEmbedding(vector: readonly number[] | undefined): Buffer | null {
  if (vector === undefined || vector.length === 0) return null
  return Buffer.from(new Float32Array(vector).buffer)
}

function decodeEmbedding(blob: Buffer | null): readonly number[] | undefined {
  if (blob === null || blob.length === 0) return undefined
  return Array.from(new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4))
}

/**
 * One tuning row per real retrieval (not for cached step reuse): aggregate this table to see
 * what the channels and thresholds actually cost and hit in production. It stays outside the
 * `Store` port because logging is an operational concern of this adapter, not a retrieval
 * decision of the subsystem.
 */
export function insertTurnLog(db: Database, decision: TurnDecision, sessionID: string | undefined): Promise<void> {
  return Effect.runPromise(
    db
      .transaction((tx) =>
        tx.insert(MemoryLogTable).values({
          session_id: sessionID ?? null,
          scope: decision.scope,
          query: decision.query,
          mode: decision.mode,
          channels: decision.channels,
          trigger_hits: [...decision.triggerHits],
          vector_hits: [...decision.vectorHits],
          lexical_hits: [...decision.lexicalHits],
          injected: [...decision.injected],
          skipped: decision.skipped.map((entry) => ({ id: entry.id, reason: entry.reason })),
          injected_chars: decision.injectedChars,
        }),
      )
      .pipe(Effect.asVoid, Effect.orDie),
  )
}

/** One audit row per extraction attempt (applied, malformed or failed), mirroring `insertTurnLog`. */
export function insertExtractLog(db: Database, row: ExtractLogRecord): Promise<void> {
  return Effect.runPromise(
    db
      .insert(MemoryExtractLogTable)
      .values({
        session_id: row.sessionID,
        scope: row.scope,
        outcome: row.outcome,
        reply_chars: row.replyChars,
        saved: [...row.saved],
        merged: row.merged,
        superseded: row.superseded.map((entry) => ({ id: entry.id, byID: entry.byID })),
        rejected: row.rejected.map((entry) => ({ index: entry.index, reason: entry.reason })),
        duration_ms: row.durationMs,
      })
      .pipe(Effect.asVoid, Effect.orDie),
  )
}