import { Effect } from "effect"
import { snapshot } from "../diagnostics/index"

/**
 * `diagnostics.server` in the `server.experimental` group. Reads this process's in-memory buffers, so
 * it needs no service and still answers while the database or a session turn is busy.
 */
export const serverDiagnostics = Effect.sync(snapshot)
