import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261127124727_chubby_nightshade",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`context_snapshot\` ADD \`tools\` text DEFAULT '[]' NOT NULL;`)
    })
  },
}

export default migration
