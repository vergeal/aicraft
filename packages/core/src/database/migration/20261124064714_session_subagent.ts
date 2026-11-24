import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

// Which child sessions were spawned by the `subagent` tool. Until this column existed, `session.created`
// recorded only `parentID`, so history cannot distinguish a subagent from a child session created with the
// `create` tool. Backfill from the one parent whose children were all created by `create`.
const CHILD_SESSION_PARENT = "ses_df465c37fffe4EcbMETYS0QRN2"

const migration: DatabaseMigration.Migration = {
  id: "20261124064714_session_subagent",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_v2\` ADD \`subagent\` integer;`)
      yield* tx.run(
        `UPDATE \`session_v2\` SET \`subagent\` = 1 WHERE \`parent_id\` IS NOT NULL AND \`parent_id\` <> '${CHILD_SESSION_PARENT}' AND \`fork_session_id\` IS NULL;`,
      )
    })
  },
}

export default migration
