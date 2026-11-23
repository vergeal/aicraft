export * as ConfigMemory from "./memory.js"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "../schema.js"

/** How cross-session memory is read back into a request. Saving and searching are always available. */
export class Info extends Schema.Class<Info>("ConfigMemory.Info")({
  auto_inject: Schema.Boolean.pipe(optional).annotate({
    description: "Inject the current project's memories and the global memories into every request. Defaults to true.",
  }),
  max_injected_chars: NonNegativeInt.pipe(optional).annotate({
    description: "Character budget for the injected memories. The most recently updated memories fill it first. Defaults to 4000.",
  }),
  max_entries: NonNegativeInt.pipe(optional).annotate({
    description: "How many memories each scope reads at most. Defaults to 200.",
  }),
}) {}
