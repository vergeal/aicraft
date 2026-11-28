export * as SessionContextWindow from "./context-window.js"

import { Effect } from "effect"
import { Model } from "@aicraft/schema/model"
import { Provider } from "@aicraft/schema/provider"
import { sql } from "drizzle-orm"
import { Database } from "../database/database.js"
import { SessionMessageTable, SessionTable } from "./sql.js"
import type { SessionSchema } from "./schema.js"
import { SessionContextWindow as ContextWindowShape } from "@aicraft/schema/session-context-window"

/** The panel's totals shape, re-exported so callers name one module for both the read and its type. */
export const Info = ContextWindowShape.Info
export type Info = ContextWindowShape.Info
export type Point = ContextWindowShape.Point

/**
 * The whole Session, summarised for the context panel, in one read.
 *
 * The panel used to compute these numbers from whatever transcript page the timeline had loaded, which
 * meant every figure described the tail of the conversation and moved as the reader scrolled up. Reading
 * the pages instead would cost one round trip per page and hand the renderer megabytes of JSON to fold.
 *
 * So this is a single aggregate over `session_message` that never selects a message body. Every value
 * comes from a `json_extract` on the token block, which SQLite evaluates per row without materialising
 * the rest of the column, and the statement walks the `(session_id, type, seq)` index in order.
 */

type Row = {
  seq: number
  type: string
  tokens: number | null
  providerID: string | null
  modelID: string | null
  variant: string | null
  input: number | null
  output: number | null
  reasoning: number | null
  cacheRead: number | null
  cacheWrite: number | null
}

export const get = Effect.fn("SessionContextWindow.get")(function* (
  db: Database.Interface["db"],
  sessionID: SessionSchema.ID,
  options?: { readonly maxPoints?: number },
) {
  // A chart a few hundred pixels wide cannot resolve more samples than this, and every sample is two
  // JSON fields on the wire: 240 keeps the sawtooth's shape at ~40 KB instead of ~340 KB for 2000.
  const maxPoints = options?.maxPoints ?? 240
  // One index walk over the Session, ordered by seq so the compaction boundaries and the last step can be
  // read in place. `type` and both token fields come from the same row; nothing else in `data` is decoded.
  const rows = yield* db
    .all<Row>(
      sql`
      SELECT
        message.seq AS seq,
        message.type AS type,
        CASE WHEN message.type = 'assistant' THEN
          coalesce(json_extract(message.data, '$.tokens.input'), 0)
          + coalesce(json_extract(message.data, '$.tokens.cache.read'), 0)
          + coalesce(json_extract(message.data, '$.tokens.cache.write'), 0)
        END AS tokens,
        json_extract(message.data, '$.model.providerID') AS providerID,
        json_extract(message.data, '$.model.id') AS modelID,
        json_extract(message.data, '$.model.variant') AS variant,
        json_extract(message.data, '$.tokens.input') AS input,
        json_extract(message.data, '$.tokens.output') AS output,
        json_extract(message.data, '$.tokens.reasoning') AS reasoning,
        json_extract(message.data, '$.tokens.cache.read') AS cacheRead,
        json_extract(message.data, '$.tokens.cache.write') AS cacheWrite
      FROM ${SessionMessageTable} AS message
      WHERE message.session_id = ${sessionID}
        AND message.type IN ('user', 'assistant', 'compaction')
        AND (message.type != 'compaction' OR json_extract(message.data, '$.status') = 'completed')
      ORDER BY message.seq
    `,
    )
    .pipe(Effect.orDie)

  const tokens = { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }
  const points: Array<ContextWindowShape.Point> = []
  let messages = 0
  let turns = 0
  let steps = 0
  let afterCompaction = false
  // Turns counted since the newest completed compaction, which is what the panel reports: the total
  // says how big the Session is, this says how much conversation the next compaction has to react to.
  let turnsSinceCompaction = 0
  for (const row of rows) {
    // The count the panel labels "消息" is every durable row, including the ones this query filters out;
    // a separate scalar count keeps it exact without a second pass over `data`.
    if (row.type === "compaction") {
      afterCompaction = true
      turnsSinceCompaction = 0
      continue
    }
    messages++
    if (row.type === "user") {
      turns++
      turnsSinceCompaction++
      if (afterCompaction) afterCompaction = false
      continue
    }
    steps++
    tokens.input += row.input ?? 0
    tokens.output += row.output ?? 0
    tokens.reasoning += row.reasoning ?? 0
    tokens.cacheRead += row.cacheRead ?? 0
    tokens.cacheWrite += row.cacheWrite ?? 0
    if (row.tokens === null) continue
    points.push({ tokens: row.tokens, afterCompaction })
    afterCompaction = false
  }

  const last = yield* lastStep(db, sessionID)
  // Every message row, not only the three types above: the panel's "消息" is the Session's size.
  const counted = yield* db
    .get<{ messages: number }>(
      sql`SELECT count(*) AS messages FROM ${SessionMessageTable} WHERE session_id = ${sessionID}`,
    )
    .pipe(Effect.orDie)

  return {
    messages: counted?.messages ?? messages,
    turns,
    turnsSinceCompaction,
    steps,
    tokens,
    ...(last === undefined ? {} : { last }),
    points: capPoints(points, maxPoints),
    aggregated: points.length > maxPoints,
  }
})

/**
 * The newest step's prompt side and model. A separate statement because it must survive the point cap: a
 * long Session drops its oldest chart samples, but the occupancy figure always describes the last request.
 */
const lastStep = Effect.fnUntraced(function* (db: Database.Interface["db"], sessionID: SessionSchema.ID) {
  const row = yield* db
    .get<{ tokens: number; providerID: string | null; modelID: string | null; variant: string | null }>(
      sql`
      SELECT
        coalesce(json_extract(message.data, '$.tokens.input'), 0)
          + coalesce(json_extract(message.data, '$.tokens.cache.read'), 0)
          + coalesce(json_extract(message.data, '$.tokens.cache.write'), 0) AS tokens,
        json_extract(message.data, '$.model.providerID') AS providerID,
        json_extract(message.data, '$.model.id') AS modelID,
        json_extract(message.data, '$.model.variant') AS variant
      FROM ${SessionMessageTable} AS message
      WHERE message.session_id = ${sessionID}
        AND message.type = 'assistant'
        AND json_extract(message.data, '$.tokens') IS NOT NULL
      ORDER BY message.seq DESC
      LIMIT 1
    `,
    )
    .pipe(Effect.orDie)
  // A Session with no model recorded anywhere still reports its size; the model is what may be missing.
  if (row === undefined || row.providerID === null || row.modelID === null) return
  return {
    tokens: row.tokens,
    model: Model.Ref.make({
      providerID: Provider.ID.make(row.providerID),
      id: Model.ID.make(row.modelID),
      ...(row.variant === null ? {} : { variant: Model.VariantID.make(row.variant) }),
    }),
  }
})

/** Evenly spaced samples, keeping the first and last: the chart's shape survives, its resolution does not. */
const capPoints = (points: ReadonlyArray<ContextWindowShape.Point>, max: number) => {
  if (points.length <= max) return [...points]
  const step = (points.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, index) => points[Math.round(index * step)]!)
}

/** The Session row must exist; a stale panel asks about a Session that may have been deleted. */
export const exists = (db: Database.Interface["db"], sessionID: SessionSchema.ID) =>
  db
    .get(sql`SELECT 1 AS found FROM ${SessionTable} WHERE id = ${sessionID}`)
    .pipe(Effect.orDie, Effect.map((row) => row !== undefined))
