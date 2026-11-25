// The module lists only: `gui()` reads them at build time, so this file imports nothing.

/**
 * The modules a plugin's `./gui-experimental` bundle may require that both processes provide, each its own instance.
 * Main maps `@aicraft/aix/gui` to the main SDK and a window maps `@aicraft/aix/gui/main` to the window SDK:
 * both export the same `Plugin`, `Store`, `Ipc`, `Contract` and `Registry`, so one definition and contract serve both
 * processes. `@aicraft/aix/rpc` is here because a plugin's `./rpc` contract imports it, and its GUI imports that
 * contract.
 */
export const pluginSharedModules = [
  "effect",
  "@aicraft/aix/gui",
  "@aicraft/aix/gui/main",
  "@aicraft/aix/rpc",
  "@aicraft/schema/rpc",
  "@aicraft/client",
  "@aicraft/client/effect",
] as const

/**
 * The modules only a window provides to a plugin's `./gui-experimental` bundle; main gives the bundle an inert
 * placeholder.
 */
export const pluginWindowModules = [
  "solid-js",
  "solid-js/web",
  "solid-js/store",
  "@aicraft/aix/gui/file",
  "@aicraft/aix/gui/review",
  "@aicraft/aix/gui/browser",
  "@aicraft/client/solid",
] as const

/** A module name in `pluginSharedModules` or `pluginWindowModules`. */
export type PluginModule = (typeof pluginSharedModules)[number] | (typeof pluginWindowModules)[number]

/**
 * Bundles built before the AIX rename import the SDK as `@aicraft/plugin`. Map those names onto the renamed modules so
 * an old bundle keeps resolving to the host's own instances. Drop this alias once no shipped bundle references the old
 * name anymore (`docs/aix/spec.md` §7).
 */
export function legacyPluginModule(name: string) {
  if (name === "@aicraft/plugin") return "@aicraft/aix"

  if (name.startsWith("@aicraft/plugin/")) return `@aicraft/aix/${name.slice("@aicraft/plugin/".length)}`

  return name
}
