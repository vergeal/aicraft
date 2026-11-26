import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

// Completed-turn patch bodies, read by SessionDiff.turn so opening a turn on the
// timeline is a plain lookup instead of spawning git diff each time.
const migration: DatabaseMigration.Migration = {
  id: "20261126120000_session_turn_diff",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_turn_diff\` (
          \`session_id\` text NOT NULL,
          \`from_message_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`session_turn_diff_pk\` PRIMARY KEY(\`session_id\`, \`from_message_id\`),
          CONSTRAINT \`fk_session_turn_diff_session_id_session_v2_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session_v2\`(\`id\`) ON DELETE CASCADE
        );
      `)
    })
  },
}

export default migration
