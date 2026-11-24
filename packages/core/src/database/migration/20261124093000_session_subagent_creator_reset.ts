import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

// `create` makes a real session, not a subagent, so its children stay ordinary sessions even though they record
// the creating session as their parent. An earlier backfill marked every child as a subagent; undo that for the
// children of the session that used `create`. Rows without an explicit mark are already ordinary sessions, so
// clearing the column is enough. A fork keeps its own backfill rule and is left alone.
const CREATOR_SESSION = "ses_df465c37fffe4EcbMETYS0QRN2"

const migration: DatabaseMigration.Migration = {
  id: "20261124093000_session_subagent_creator_reset",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(
        `UPDATE \`session_v2\` SET \`subagent\` = NULL WHERE \`parent_id\` = '${CREATOR_SESSION}' AND \`fork_session_id\` IS NULL;`,
      )
    })
  },
}

export default migration
