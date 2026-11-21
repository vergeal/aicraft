export * as MemoryContract from "./contract.js"

import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

/** Where a memory applies: one project, or every project. */
export const Scope = Schema.Literals(["global", "project"])
export type Scope = typeof Scope.Type

/** One saved memory, as the settings page lists it. */
export const Entry = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  tags: Schema.Array(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export interface Entry extends Schema.Schema.Type<typeof Entry> {}

const ScopeInput = {
  scope: Scope,
  /** The Project the memory belongs to; null for a global memory. */
  projectID: Schema.NullOr(Schema.String),
}

/**
 * The memory plugin's RPC, so the settings page reads and edits the same storage the tools write.
 *
 * `projectID` is explicit rather than read from the call's Location: settings has no routed Session, and plugin storage
 * is the plugin's own, not per Location.
 */
export const Definition = Rpc.define({
  id: "changhong.memory",
  methods: {
    list: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ projectID: Schema.NullOr(Schema.String) })),
      output: Schema.toStandardSchemaV1(
        Schema.Struct({ global: Schema.Array(Entry), project: Schema.Array(Entry) }),
      ),
    },
    save: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({ ...ScopeInput, text: Schema.String, tags: Schema.Array(Schema.String) }),
      ),
      output: Schema.toStandardSchemaV1(Schema.Struct({ entry: Entry, duplicate: Schema.Boolean })),
    },
    update: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({ ...ScopeInput, id: Schema.String, text: Schema.String, tags: Schema.Array(Schema.String) }),
      ),
      /** Null when the memory is gone, e.g. deleted in another window. */
      output: Schema.toStandardSchemaV1(Schema.Struct({ entry: Schema.NullOr(Entry) })),
    },
    remove: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ ...ScopeInput, id: Schema.String })),
      output: Schema.toStandardSchemaV1(Schema.Struct({ removed: Schema.Boolean })),
    },
  },
  events: {},
})
