export * as PluginManifest from "./plugin-manifest.js"

/**
 * The manifest fields that decide where a plugin's code starts. They are the wire-level half of the entry standard:
 * `packages/aix/src/host.ts` resolves files through them, and `packages/core/src/plugin/bundle.ts` refuses a bundle
 * whose declared entries are missing. A scaffolding tool can validate the manifest it writes with the same schema.
 */

import { Schema } from "effect"
import { Catalog } from "./catalog.js"

/** The four parts a plugin can ship. Each one lives in a directory of the same name, with a `main` file inside. */
export const Kind = Schema.Literals(["server", "gui", "tui", "rpc"])
export type Kind = typeof Kind.Type

/**
 * The extensions the host tries for an entry, in order. The GUI entry is the prebuilt CommonJS bundle the app
 * evaluates, so it admits only CommonJS files: a TypeScript source or an ES module is never a GUI entry.
 */
export const Extensions = {
  server: [".ts", ".tsx", ".js", ".mjs"],
  tui: [".ts", ".tsx", ".js", ".mjs"],
  rpc: [".ts", ".tsx", ".js", ".mjs"],
  gui: [".js", ".cjs"],
} as const satisfies Record<Kind, readonly string[]>

/**
 * One entry path from `METAINF`: relative to the plugin root, without an extension, and ending in `/main`, such
 * as `server/main` or, once built, `dist/server/main`. The directory prefix may be any relative path, so a build can
 * keep its output beside its sources, but the file itself is always named `main`.
 */
export const Entrypoint = Schema.String.check(
  Schema.isPattern(/^(?!\/)(?!\.\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?:[^/\\]+\/)+main$/u),
).annotate({
  identifier: "PluginManifest.Entrypoint",
  description: "A path relative to the plugin root, without an extension, ending in /main.",
})
export type Entrypoint = typeof Entrypoint.Type

/** The manifest's `entry`: which parts the plugin ships and where each one starts. */
export const Entry = Schema.Struct({
  server: Schema.optional(Entrypoint),
  gui: Schema.optional(Entrypoint),
  tui: Schema.optional(Entrypoint),
  rpc: Schema.optional(Entrypoint),
}).annotate({ identifier: "PluginManifest.Entry" })
export type Entry = typeof Entry.Type

/**
 * The interpreter a plugin needs, when it needs one. The host prepares an isolated environment per plugin, so a
 * plugin's dependencies never touch the machine's own site-packages. Only Python is implemented; later runtimes add
 * their own optional key here instead of reinterpreting these fields.
 */
export const Runtime = Schema.Struct({
  /** A version constraint such as `>=3.10`; only the lower bound is checked. */
  python: Schema.optional(Schema.String),
  /** pip requirements, passed to the package manager unchanged. */
  dependencies: Schema.optional(Schema.Array(Schema.String)),
}).annotate({ identifier: "PluginManifest.Runtime" })
export type Runtime = typeof Runtime.Type

/** A skill the manifest advertises: its identity, its copy, and the file that ships it inside the bundle. */
export const Skill = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  path: Schema.String,
  /** The skill's own inline SVG mark, shown instead of the generated colour tile. */
  icon: Schema.optional(Schema.String),
}).annotate({ identifier: "PluginManifest.Skill" })
export type Skill = typeof Skill.Type

/**
 * The complete `METAINF` a bundle ships. Identity, entries and display are what discovery reads before install; the
 * rest describes what the bundle carries. Additional keys (such as `configuration`) are allowed and ignored here.
 */
export interface Manifest extends Schema.Schema.Type<typeof Manifest> {}
export const Manifest = Schema.Struct({
  apiVersion: Schema.Number,
  id: Schema.String,
  version: Schema.String,
  entry: Entry,
  requires: Schema.optional(Schema.Struct({ aicraft: Schema.optional(Schema.String) })),
  externals: Schema.optional(Schema.Array(Schema.String)),
  display: Schema.Struct({
    name: Schema.String,
    description: Schema.String,
    /** The shelf the plugin browser files this plugin under; the client owns the value set. */
    category: Schema.optional(Catalog.Category),
    tools: Schema.optional(Schema.Array(Schema.String)),
    icon: Schema.optional(Schema.String),
  }),
  skills: Schema.optional(Schema.Array(Skill)),
  assets: Schema.optional(Schema.Array(Schema.String)),
  runtime: Schema.optional(Runtime),
  files: Schema.optional(Schema.Array(Schema.Struct({ path: Schema.String, sha256: Schema.String }))),
}).annotate({ identifier: "PluginManifest.Manifest" })

/** Reads a `METAINF` file's parsed JSON, failing loudly when the bundle's manifest is not a manifest. */
export const decode = Schema.decodeUnknownSync(Manifest)

/** The entry a kind's file must have, for an error that names the path a plugin author has to create. */
export function expectedPath(kind: Kind, entrypoint: Entrypoint) {
  return `${entrypoint} (${Extensions[kind].join(", ")})`
}
