export * as SessionStatsRefresh from "./stats-refresh.js"

import { eq, sql } from "drizzle-orm"
import { Effect } from "effect"
import type { Bus } from "../bus.js"
import type { Database } from "../database/database.js"
import { SessionEvent } from "@aicraft/schema/session-event"
import type { SessionSchema } from "./schema.js"
import { SessionMessageTable, SessionPartTable, SessionTable } from "./sql.js"

/**
 * Recomputes the session_v2 `stat_*` columns from projected message and part rows. Statistics stay
 * write-side because the composer status line must render them from the Session record alone, with
 * no transcript folding on the page. A single correlated statement, so the same SQL backs the
 * first-run migration backfill and every later refresh.
 */
export function statement(sessionID?: SessionSchema.ID) {
  return sql`
    UPDATE ${SessionTable} SET
      stat_turns = (
        SELECT count(*) FROM ${SessionMessageTable}
        WHERE ${SessionMessageTable.session_id} = ${SessionTable.id} AND ${SessionMessageTable.type} = 'user'
      ),
      stat_steps = (
        SELECT count(*) FROM ${SessionMessageTable}
        WHERE ${SessionMessageTable.session_id} = ${SessionTable.id} AND ${SessionMessageTable.type} = 'assistant'
      ),
      stat_model_time = (
        SELECT coalesce(sum(
          max(0, json_extract(${SessionMessageTable.data}, '$.time.streamed') - json_extract(${SessionMessageTable.data}, '$.time.created'))
        ), 0) FROM ${SessionMessageTable}
        WHERE ${SessionMessageTable.session_id} = ${SessionTable.id}
          AND ${SessionMessageTable.type} = 'assistant'
          AND json_extract(${SessionMessageTable.data}, '$.time.streamed') IS NOT NULL
      ),
      stat_tool_time = (
        SELECT coalesce(sum(
          max(0, json_extract(calls.value, '$.time.completed') - coalesce(json_extract(calls.value, '$.time.ran'), json_extract(calls.value, '$.time.created')))
        ), 0) FROM (
          SELECT part.data AS value FROM ${SessionPartTable} AS part
          JOIN ${SessionMessageTable} AS message ON message.id = part.message_id
          WHERE part.session_id = ${SessionTable.id}
            AND message.type = 'assistant'
            AND part.type = 'tool'
            AND json_extract(part.data, '$.time.completed') IS NOT NULL
          UNION ALL
          SELECT content.value FROM ${SessionMessageTable} AS message, json_each(message.data, '$.content') AS content
          WHERE message.session_id = ${SessionTable.id}
            AND message.type = 'assistant'
            AND json_array_length(message.data, '$.content') > 0
            AND json_extract(content.value, '$.type') = 'tool'
            AND json_extract(content.value, '$.time.completed') IS NOT NULL
        ) AS calls
      ),
      stat_output_tokens = (
        SELECT coalesce(sum(
          coalesce(json_extract(${SessionMessageTable.data}, '$.tokens.output'), 0) + coalesce(json_extract(${SessionMessageTable.data}, '$.tokens.reasoning'), 0)
        ), 0) FROM ${SessionMessageTable}
        WHERE ${SessionMessageTable.session_id} = ${SessionTable.id} AND ${SessionMessageTable.type} = 'assistant'
      ),
      stat_context_tokens = coalesce((
        SELECT coalesce(json_extract(${SessionMessageTable.data}, '$.tokens.input'), 0)
          + coalesce(json_extract(${SessionMessageTable.data}, '$.tokens.cache.read'), 0)
          + coalesce(json_extract(${SessionMessageTable.data}, '$.tokens.cache.write'), 0)
        FROM ${SessionMessageTable}
        WHERE ${SessionMessageTable.session_id} = ${SessionTable.id}
          AND ${SessionMessageTable.type} = 'assistant'
          AND json_extract(${SessionMessageTable.data}, '$.tokens') IS NOT NULL
        ORDER BY ${SessionMessageTable.seq} DESC
        LIMIT 1
      ), 0)
    ${sessionID ? sql`WHERE ${SessionTable.id} = ${sessionID}` : sql``}
  `
}

export function refresh(db: Database.Interface["db"], sessionID?: SessionSchema.ID) {
  return db
    .run(statement(sessionID))
    .pipe(Effect.orDie)
}

/** Recount one Session and broadcast the result so client session records carry the fresh numbers. */
export const publish = Effect.fn("SessionStatsRefresh.publish")(function* (
  db: Database.Interface["db"],
  bus: Bus.Interface,
  sessionID: SessionSchema.ID,
) {
  yield* refresh(db, sessionID)
  return yield* emit(db, bus, sessionID)
})

/**
 * Incremental `stat_turns` bump for a delivered prompt: a correlated count over an indexed column runs in
 * milliseconds, while the full statement re-reads every assistant part's JSON (`json_each`) — ~600ms on a
 * large session, measured in production — and it sat on the `InboxDelivered` critical path, which is what a
 * reader waits behind when opening a session. Turn counts only ever grow there, so a +1 keeps the composer
 * line live; the next `session.step.ended` refresh (which already runs on every step) reconciles anything else.
 */
export const publishTurn = Effect.fn("SessionStatsRefresh.publishTurn")(function* (
  db: Database.Interface["db"],
  bus: Bus.Interface,
  sessionID: SessionSchema.ID,
) {
  yield* db
    .run(sql`
      UPDATE ${SessionTable} SET stat_turns = (
        SELECT count(*) FROM ${SessionMessageTable}
        WHERE ${SessionMessageTable.session_id} = ${SessionTable.id} AND ${SessionMessageTable.type} = 'user'
      )
      WHERE ${SessionTable.id} = ${sessionID}
    `)
    .pipe(Effect.orDie)
  yield* emit(db, bus, sessionID)
})

/** Read the fresh numbers back and broadcast them on the ephemeral bus. */
const emit = Effect.fn("SessionStatsRefresh.emit")(function* (
  db: Database.Interface["db"],
  bus: Bus.Interface,
  sessionID: SessionSchema.ID,
) {
  const row = yield* db
    .select({
      turns: SessionTable.stat_turns,
      steps: SessionTable.stat_steps,
      modelTime: SessionTable.stat_model_time,
      toolTime: SessionTable.stat_tool_time,
      outputTokens: SessionTable.stat_output_tokens,
      contextTokens: SessionTable.stat_context_tokens,
    })
    .from(SessionTable)
    .where(eq(SessionTable.id, sessionID))
    .get()
    .pipe(Effect.orDie)
  if (!row || row.turns === null) return
  yield* bus.publish(SessionEvent.StatsUpdated, {
    sessionID,
    stats: {
      turns: row.turns,
      steps: row.steps ?? 0,
      modelTime: row.modelTime ?? 0,
      toolTime: row.toolTime ?? 0,
      outputTokens: row.outputTokens ?? 0,
      contextTokens: row.contextTokens ?? 0,
    },
  })
})
