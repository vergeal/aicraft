import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261125170739_memory_extract",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`memory_extract_log\` (
          \`seq\` integer PRIMARY KEY AUTOINCREMENT,
          \`session_id\` text NOT NULL,
          \`scope\` text NOT NULL,
          \`outcome\` text NOT NULL,
          \`reply_chars\` integer NOT NULL,
          \`saved\` text NOT NULL,
          \`merged\` integer NOT NULL,
          \`superseded\` text NOT NULL,
          \`rejected\` text NOT NULL,
          \`duration_ms\` integer NOT NULL,
          \`time_created\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`memory_extract_log_time_idx\` ON \`memory_extract_log\` (\`time_created\`);`)
      yield* tx.run(`CREATE INDEX \`memory_extract_log_session_idx\` ON \`memory_extract_log\` (\`session_id\`);`)
    })
  },
}

export default migration
