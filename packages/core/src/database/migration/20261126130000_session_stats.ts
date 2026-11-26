import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

// Transcript statistics columns, read by the composer status line so the page renders turns, steps,
// durations and context tokens from the Session record alone. Existing sessions are backfilled with
// the same correlated aggregation SessionStatsRefresh runs on every settle, revert and fork.
const migration: DatabaseMigration.Migration = {
  id: "20261126130000_session_stats",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_v2\` ADD \`stat_turns\` integer;`)
      yield* tx.run(`ALTER TABLE \`session_v2\` ADD \`stat_steps\` integer;`)
      yield* tx.run(`ALTER TABLE \`session_v2\` ADD \`stat_model_time\` integer;`)
      yield* tx.run(`ALTER TABLE \`session_v2\` ADD \`stat_tool_time\` integer;`)
      yield* tx.run(`ALTER TABLE \`session_v2\` ADD \`stat_output_tokens\` integer;`)
      yield* tx.run(`ALTER TABLE \`session_v2\` ADD \`stat_context_tokens\` integer;`)
      yield* tx.run(`
        UPDATE \`session_v2\` SET
          \`stat_turns\` = (
            SELECT count(*) FROM \`session_message\`
            WHERE \`session_message\`.\`session_id\` = \`session_v2\`.\`id\` AND \`session_message\`.\`type\` = 'user'
          ),
          \`stat_steps\` = (
            SELECT count(*) FROM \`session_message\`
            WHERE \`session_message\`.\`session_id\` = \`session_v2\`.\`id\` AND \`session_message\`.\`type\` = 'assistant'
          ),
          \`stat_model_time\` = (
            SELECT coalesce(sum(
              max(0, json_extract(\`session_message\`.\`data\`, '$.time.streamed') - json_extract(\`session_message\`.\`data\`, '$.time.created'))
            ), 0) FROM \`session_message\`
            WHERE \`session_message\`.\`session_id\` = \`session_v2\`.\`id\`
              AND \`session_message\`.\`type\` = 'assistant'
              AND json_extract(\`session_message\`.\`data\`, '$.time.streamed') IS NOT NULL
          ),
          \`stat_tool_time\` = (
            SELECT coalesce(sum(
              max(0, json_extract(calls.value, '$.time.completed') - coalesce(json_extract(calls.value, '$.time.ran'), json_extract(calls.value, '$.time.created')))
            ), 0) FROM (
              SELECT part.data AS value FROM \`session_part\` AS part
              JOIN \`session_message\` AS message ON message.id = part.message_id
              WHERE part.session_id = \`session_v2\`.\`id\`
                AND message.type = 'assistant'
                AND part.type = 'tool'
                AND json_extract(part.data, '$.time.completed') IS NOT NULL
              UNION ALL
              SELECT content.value FROM \`session_message\` AS message, json_each(message.data, '$.content') AS content
              WHERE message.session_id = \`session_v2\`.\`id\`
                AND message.type = 'assistant'
                AND json_array_length(message.data, '$.content') > 0
                AND json_extract(content.value, '$.type') = 'tool'
                AND json_extract(content.value, '$.time.completed') IS NOT NULL
            ) AS calls
          ),
          \`stat_output_tokens\` = (
            SELECT coalesce(sum(
              coalesce(json_extract(\`session_message\`.\`data\`, '$.tokens.output'), 0) + coalesce(json_extract(\`session_message\`.\`data\`, '$.tokens.reasoning'), 0)
            ), 0) FROM \`session_message\`
            WHERE \`session_message\`.\`session_id\` = \`session_v2\`.\`id\` AND \`session_message\`.\`type\` = 'assistant'
          ),
          \`stat_context_tokens\` = coalesce((
            SELECT coalesce(json_extract(\`session_message\`.\`data\`, '$.tokens.input'), 0)
              + coalesce(json_extract(\`session_message\`.\`data\`, '$.tokens.cache.read'), 0)
              + coalesce(json_extract(\`session_message\`.\`data\`, '$.tokens.cache.write'), 0)
            FROM \`session_message\`
            WHERE \`session_message\`.\`session_id\` = \`session_v2\`.\`id\`
              AND \`session_message\`.\`type\` = 'assistant'
              AND json_extract(\`session_message\`.\`data\`, '$.tokens') IS NOT NULL
            ORDER BY \`session_message\`.\`seq\` DESC
            LIMIT 1
          ), 0);
      `)
    })
  },
}

export default migration
