import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261128150251_lumpy_magik",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`instruction_state\` ADD \`notified_values\` text DEFAULT '{}' NOT NULL;`)
    })
  },
}

export default migration
