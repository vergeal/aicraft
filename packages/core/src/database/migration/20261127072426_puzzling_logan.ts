import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261127072426_puzzling_logan",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`context_lineage\` (
          \`session_id\` text NOT NULL,
          \`epoch\` integer NOT NULL,
          \`prefix_version\` integer NOT NULL,
          \`parent_version\` integer,
          \`bump_reason\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_context_lineage_session_id_session_v2_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session_v2\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`ALTER TABLE \`context_snapshot\` ADD \`pending_advance\` integer DEFAULT false NOT NULL;`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`context_lineage_session_prefix_version_idx\` ON \`context_lineage\` (\`session_id\`,\`prefix_version\`);`,
      )
    })
  },
}

export default migration
