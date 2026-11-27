export * as ModelIdentity from "./model-identity.js"

import type { Model } from "@aicraft/schema/model"
import { Instructions } from "./index.js"

/** Audit key the identity volatile part is tagged with in `context.sources`. */
export const key = Instructions.Key.make("core/model-identity")

/**
 * The "# Your Model" block, byte-identical to the one the removed identity session hook spliced into the
 * prefix. P4 renders it as a frozen volatile part (SessionModelRequest.volatileParts), not a ledger source:
 * a model switch is a snapshot invalidation key, so the block rebakes with the family prompt while the
 * instruction baseline stays untouched.
 */
export const identity = (model: { readonly name: string; readonly ref: Model.Ref }) =>
  ["# Your Model", `- Name: ${model.name}`, `- Provider ID: ${model.ref.providerID}`, `- Model ID: ${model.ref.id}`].join(
    "\n",
  )
