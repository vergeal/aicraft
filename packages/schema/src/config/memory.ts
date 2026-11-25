export * as ConfigMemory from "./memory.js"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "../schema.js"

/**
 * The turn pipeline's retrieval channels, cheapest first: `off` reads memory only through the
 * tools, `trigger` injects exact surface-form hits, `vector` adds the semantic top matches.
 * A legacy boolean setting is mapped here by config normalization: true to `vector`, false to `off`.
 */
export const AutoInject = Schema.Literals(["off", "trigger", "vector"]).annotate({
  identifier: "ConfigMemory.AutoInject",
})
export type AutoInject = typeof AutoInject.Type

/** How cross-session memory is read back into a request. Saving and searching are always available. */
export class Info extends Schema.Class<Info>("ConfigMemory.Info")({
  auto_inject: AutoInject.pipe(optional).annotate({
    description:
      "Memory channels read back into each request: off = tools only, trigger = exact trigger hits, vector = trigger plus semantic top matches. Defaults to vector.",
  }),
  max_injected_chars: NonNegativeInt.pipe(optional).annotate({
    description: "Character budget for the per-turn retrieval block appended to the request. Defaults to 1500.",
  }),
  extract: Schema.Boolean.pipe(optional).annotate({
    description:
      "Extract memories from finished conversations in the background when a session goes idle, through one model call per gated run. Defaults to true.",
  }),
  max_entries: NonNegativeInt.pipe(optional).annotate({
    description: "How many memories each scope listing returns at most. Defaults to 200.",
  }),
}) {}
