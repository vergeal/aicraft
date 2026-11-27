export * as IdentityPlugin from "./identity.js"

import { define } from "@aicraft/aix/effect/plugin"
import { Effect } from "effect"
import { ModelIdentity } from "../instructions/model-identity.js"

// P4 removed the session hook that spliced the "# Your Model" block into the live system prefix at
// position 1. The block is an instruction-ledger source now (instructions/model-identity.ts), registered
// by SessionContext.select, so it renders into the epoch baseline instead of riding an assembly-time
// override channel. `identity` re-exports from there for existing callers; the plugin definition stays
// inert so any host that still activates it registers nothing.
export const identity = ModelIdentity.identity

export const Plugin = define({
  id: "aicraft.prompt.identity",
  effect: Effect.fn("IdentityPlugin")(function* () {}),
})
