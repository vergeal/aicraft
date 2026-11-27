import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261127060717_slimy_abomination",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`context_snapshot\` (
          \`session_id\` text PRIMARY KEY,
          \`epoch\` integer NOT NULL,
          \`prefix_version\` integer NOT NULL,
          \`parent_version\` integer,
          \`bump_reason\` text NOT NULL,
          \`baseline_epoch\` integer NOT NULL,
          \`agent_id\` text NOT NULL,
          \`parts\` text NOT NULL,
          CONSTRAINT \`fk_context_snapshot_session_id_session_v2_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session_v2\`(\`id\`) ON DELETE CASCADE
        );
      `)
    })
  },
}

export default migration
