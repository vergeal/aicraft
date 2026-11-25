import { blob, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql.js"

/**
 * The memory subsystem's storage. The decision logic lives in `@aicraft/memory`; this file is
 * its durable shape. Scope is the composed routing key (`global` / `project:<id>` /
 * `plugin:<id>`), so channel isolation is a column filter, exactly as in the subsystem's ports.
 */
export const MemoryTable = sqliteTable(
  "memory",
  {
    /** Stable `mem_*` id; never reused, never rewritten. */
    id: text().notNull(),
    /** Version rows share the id; the newest row is the active one. */
    version: integer().notNull(),
    scope: text().notNull(),
    type: text().notNull(),
    /** `active` | `superseded`; superseded rows are retained so old references never dangle. */
    status: text().notNull(),
    text: text().notNull(),
    tags: text({ mode: "json" }).$type<string[]>().notNull(),
    /** The tokenizer's output for `text`, stored so `get`/candidates can rebuild a complete
     *  `MemoryRecord` in one query: the subsystem's lexical scoring reads `record.tokens`. */
    tokens: text({ mode: "json" }).$type<string[]>().notNull(),
    /** FNV-1a of the normalized text — exact-duplicate key. */
    text_hash: text().notNull(),
    /** Float32 little-endian bytes from the embedding model; null until embedded or after a model swap. */
    embedding: blob({ mode: "buffer" }),
    /** The Embedder.version that produced `embedding`; a mismatch excludes the row from scoring. */
    embed_version: text(),
    superseded_by: text(),
    ...Timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.id, table.version] }),
    index("memory_scope_status_idx").on(table.scope, table.status, table.time_updated),
    index("memory_scope_hash_idx").on(table.scope, table.text_hash),
  ],
)

/**
 * Inverted token index (CJK bigrams + ASCII words) for `lexicalCandidates`. Rows exist only for
 * the ACTIVE version of an entry: `revise` swaps them in the same transaction, so a candidate
 * query cannot resurrect a superseded row. A recency window is not a substitute — see the
 * measurement in the memory package's AGENTS.md.
 */
export const MemoryTokenTable = sqliteTable(
  "memory_token",
  {
    token: text().notNull(),
    memory_id: text().notNull(),
    scope: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.token, table.memory_id] }),
    index("memory_token_memory_idx").on(table.memory_id),
    index("memory_token_scope_idx").on(table.scope, table.memory_id),
  ],
)

/** Exact surface forms (`pp`, aliases, quoted commands). Trigger matching is exact by contract. */
export const MemoryTriggerTable = sqliteTable(
  "memory_trigger",
  {
    text: text().notNull(),
    memory_id: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.text, table.memory_id] }),
    index("memory_trigger_memory_idx").on(table.memory_id),
  ],
)

/** Provenance rows: which session saved an entry (the session index channel), which plugin owns it. */
export const MemorySourceTable = sqliteTable(
  "memory_source",
  {
    memory_id: text().notNull(),
    kind: text().notNull(),
    ref: text().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.memory_id, table.kind, table.ref] }),
    index("memory_source_lookup_idx").on(table.kind, table.ref),
  ],
)

/**
 * Append-only turn ledger: every `onTurn` decision, including misses and their reasons. This is
 * the calibration data the real thresholds get tuned from, so it records the cut candidates, not
 * just the winners. No `time_updated`: a log row is a fact, not state.
 */
export const MemoryLogTable = sqliteTable(
  "memory_log",
  {
    seq: integer().primaryKey({ autoIncrement: true }),
    session_id: text(),
    scope: text().notNull(),
    query: text().notNull(),
    mode: text().notNull(),
    channels: text({ mode: "json" }).$type<Record<string, string>>().notNull(),
    trigger_hits: text({ mode: "json" }).$type<string[]>().notNull(),
    vector_hits: text({ mode: "json" }).$type<string[]>().notNull(),
    lexical_hits: text({ mode: "json" }).$type<string[]>().notNull(),
    injected: text({ mode: "json" }).$type<string[]>().notNull(),
    skipped: text({ mode: "json" }).$type<{ id: string; reason: string }[]>().notNull(),
    injected_chars: integer().notNull(),
    time_created: integer().notNull().$default(() => Date.now()),
  },
  (table) => [index("memory_log_time_idx").on(table.time_created), index("memory_log_session_idx").on(table.session_id)],
)
