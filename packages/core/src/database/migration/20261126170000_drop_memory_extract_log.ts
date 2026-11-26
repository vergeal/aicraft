import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261126170000_drop_memory_extract_log",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`DROP INDEX IF EXISTS \`memory_extract_log_time_idx\`;`)
      yield* tx.run(`DROP INDEX IF EXISTS \`memory_extract_log_session_idx\`;`)
      yield* tx.run(`DROP TABLE IF EXISTS \`memory_extract_log\`;`)
    })
  },
}

export default migration
