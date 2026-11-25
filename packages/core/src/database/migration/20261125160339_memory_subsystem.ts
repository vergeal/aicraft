import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261125160339_memory_subsystem",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`memory_log\` (
          \`seq\` integer PRIMARY KEY AUTOINCREMENT,
          \`session_id\` text,
          \`scope\` text NOT NULL,
          \`query\` text NOT NULL,
          \`mode\` text NOT NULL,
          \`channels\` text NOT NULL,
          \`trigger_hits\` text NOT NULL,
          \`vector_hits\` text NOT NULL,
          \`lexical_hits\` text NOT NULL,
          \`injected\` text NOT NULL,
          \`skipped\` text NOT NULL,
          \`injected_chars\` integer NOT NULL,
          \`time_created\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`memory_source\` (
          \`memory_id\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`ref\` text NOT NULL,
          CONSTRAINT \`memory_source_pk\` PRIMARY KEY(\`memory_id\`, \`kind\`, \`ref\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`memory\` (
          \`id\` text NOT NULL,
          \`version\` integer NOT NULL,
          \`scope\` text NOT NULL,
          \`type\` text NOT NULL,
          \`status\` text NOT NULL,
          \`text\` text NOT NULL,
          \`tags\` text NOT NULL,
          \`tokens\` text NOT NULL,
          \`text_hash\` text NOT NULL,
          \`embedding\` blob,
          \`embed_version\` text,
          \`superseded_by\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`memory_pk\` PRIMARY KEY(\`id\`, \`version\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`memory_token\` (
          \`token\` text NOT NULL,
          \`memory_id\` text NOT NULL,
          \`scope\` text NOT NULL,
          CONSTRAINT \`memory_token_pk\` PRIMARY KEY(\`token\`, \`memory_id\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`memory_trigger\` (
          \`text\` text NOT NULL,
          \`memory_id\` text NOT NULL,
          CONSTRAINT \`memory_trigger_pk\` PRIMARY KEY(\`text\`, \`memory_id\`)
        );
      `)
      yield* tx.run(`CREATE INDEX \`memory_log_time_idx\` ON \`memory_log\` (\`time_created\`);`)
      yield* tx.run(`CREATE INDEX \`memory_log_session_idx\` ON \`memory_log\` (\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`memory_source_lookup_idx\` ON \`memory_source\` (\`kind\`,\`ref\`);`)
      yield* tx.run(`CREATE INDEX \`memory_scope_status_idx\` ON \`memory\` (\`scope\`,\`status\`,\`time_updated\`);`)
      yield* tx.run(`CREATE INDEX \`memory_scope_hash_idx\` ON \`memory\` (\`scope\`,\`text_hash\`);`)
      yield* tx.run(`CREATE INDEX \`memory_token_memory_idx\` ON \`memory_token\` (\`memory_id\`);`)
      yield* tx.run(`CREATE INDEX \`memory_token_scope_idx\` ON \`memory_token\` (\`scope\`,\`memory_id\`);`)
      yield* tx.run(`CREATE INDEX \`memory_trigger_memory_idx\` ON \`memory_trigger\` (\`memory_id\`);`)
    })
  },
}

export default migration
