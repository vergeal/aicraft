export * as Memory from "./memory.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"

/** Where a memory applies: one project, or every project. */
export const Scope = Schema.Literals(["global", "project"])
export type Scope = typeof Scope.Type

/** One saved memory, as the settings page lists it. */
export interface Entry extends Schema.Schema.Type<typeof Entry> {}
export const Entry = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  tags: Schema.Array(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
}).annotate({ identifier: "Memory.Entry" })

const Empty = Schema.toStandardSchemaV1(Schema.Struct({}))

const ScopeInput = {
  scope: Scope,
  /** The Project the memory belongs to; null for a global memory. */
  projectID: Schema.NullOr(Schema.String),
}

/**
 * The built-in memory RPC, so the settings page reads and edits the same storage the tools write.
 *
 * `projectID` is explicit rather than read from the call's Location: settings has no routed Session, and a memory is
 * not tied to the directory the settings page happens to reach the server through.
 */
export const Definition = Rpc.define({
  id: "opencode.memory",
  methods: {
    list: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ projectID: Schema.NullOr(Schema.String) })),
      output: Schema.toStandardSchemaV1(Schema.Struct({ global: Schema.Array(Entry), project: Schema.Array(Entry) })),
    },
    save: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({ ...ScopeInput, text: Schema.String, tags: Schema.Array(Schema.String) }),
      ),
      output: Schema.toStandardSchemaV1(Schema.Struct({ entry: Entry, duplicate: Schema.Boolean })),
      errors: { "memory.empty": Empty },
    },
    update: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({ ...ScopeInput, id: Schema.String, text: Schema.String, tags: Schema.Array(Schema.String) }),
      ),
      /** Null when the memory is gone, e.g. deleted in another window. */
      output: Schema.toStandardSchemaV1(Schema.Struct({ entry: Schema.NullOr(Entry) })),
      errors: { "memory.empty": Empty },
    },
    remove: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ ...ScopeInput, id: Schema.String })),
      output: Schema.toStandardSchemaV1(Schema.Struct({ removed: Schema.Boolean })),
    },
    /**
     * Plugin memories, grouped by plugin id. Plugins write them through their own `ctx.memory`; this page is where
     * the user sees and deletes them, and no plugin can read another's.
     */
    plugins: {
      input: Schema.toStandardSchemaV1(Schema.Struct({})),
      output: Schema.toStandardSchemaV1(
        Schema.Struct({
          groups: Schema.Array(Schema.Struct({ plugin: Schema.String, entries: Schema.Array(Entry) })),
        }),
      ),
    },
    removePlugin: {
      input: Schema.toStandardSchemaV1(Schema.Struct({ plugin: Schema.String, id: Schema.String })),
      output: Schema.toStandardSchemaV1(Schema.Struct({ removed: Schema.Boolean })),
    },
  },
  events: {},
})
