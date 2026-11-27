import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261127085418_sloppy_sunset_bain",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`context_snapshot\` ADD \`model_id\` text DEFAULT '' NOT NULL;`)
    })
  },
}

export default migration
