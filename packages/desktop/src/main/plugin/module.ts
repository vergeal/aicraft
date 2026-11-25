import { createRequire, isBuiltin } from "node:module"
import {
  evaluatePluginBundle,
  inertModule,
  legacyPluginModule,
  pluginWindowModules,
  type pluginSharedModules,
} from "@aicraft/aix/gui/host"
import type { Plugin } from "@aicraft/aix/gui/main"

const native = createRequire(import.meta.url)

// Plugin bundles share the host's module instances, so tokens and schemas they import are the same objects the host
// checks against. In main, the window SDK's name resolves to the main SDK.
const shared = {
  effect: () => import("effect"),
  "@aicraft/aix/gui": () => import("@aicraft/aix/gui/main"),
  "@aicraft/aix/gui/main": () => import("@aicraft/aix/gui/main"),
  "@aicraft/aix/rpc": () => import("@aicraft/aix/rpc"),
  "@aicraft/schema/rpc": () => import("@aicraft/schema/rpc"),
  "@aicraft/client": () => import("@aicraft/client"),
  "@aicraft/client/effect": () => import("@aicraft/client/effect"),
} satisfies Record<(typeof pluginSharedModules)[number], () => Promise<object>>

const windowOnly = new Set<string>(pluginWindowModules)

/**
 * Evaluates a plugin's `./gui-experimental` bundle in main and returns what main runs: its `Plugin.define`'s `main`
 * setup, or one that does nothing for a plugin with none, and its `os` and catalog. `electron`
 * and Node built-ins are the real modules; the window-only modules are inert placeholders.
 */
export async function evaluateMain(code: string) {
  const modules = new Map<string, object>(
    await Promise.all(Object.entries(shared).map(async ([name, load]) => [name, await load()] as const)),
  )

  const bundle = evaluatePluginBundle(code, {
    process: "main",
    require: (name) => {
      const loaded = modules.get(legacyPluginModule(name))

      if (loaded) return loaded

      if (name === "electron" || isBuiltin(name)) return native(name)

      if (windowOnly.has(name)) return inertModule(name)

      throw new Error(`Plugin GUI bundle requires a module the app does not share: ${name}`)
    },
  })

  return {
    setup: bundle.main ?? ((() => {}) satisfies Plugin.MainSetup),
    i18n: bundle.definition.i18n,
    os: bundle.definition.os,
  }
}
