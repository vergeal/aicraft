import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261128120320_context_snapshot_baseline",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`context_snapshot\` ADD \`baseline\` text DEFAULT '[]' NOT NULL;`)
    })
  },
}

export default migration
