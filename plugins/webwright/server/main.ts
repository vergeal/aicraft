import { Plugin } from "@aicraft/aix/effect"
import { PluginManifest } from "@aicraft/schema/plugin-manifest"
import { Effect } from "effect"
import { join } from "node:path"
import { BrowserRuntime } from "../src/browser.js"
import { BrowserTools } from "../src/tools.js"

// The installed bundle names its manifest `ocplugin.json`; the source tree and older bundles keep `METAINF`. Both
// carry the same document, so the entry resolves whichever one it finds.
async function readManifest() {
  for (const name of ["ocplugin.json", "METAINF"]) {
    const file = Bun.file(join(import.meta.dir, "..", name))
    if (await file.exists()) return PluginManifest.decode(await file.json())
  }
  throw new Error("This plugin has no ocplugin.json or METAINF manifest next to its server entry.")
}

const manifest = await readManifest()

export default Plugin.define({
  id: manifest.id,
  // The manifest is the single source of truth for what the plugin browser shows: the same file is what discovery
  // reads before the package is installed, so the two views cannot drift.
  display: {
    name: manifest.display.name,
    description: manifest.display.description,
    category: manifest.display.category,
    icon: manifest.display.icon,
    skills: (manifest.skills ?? []).map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
    })),
    tools: manifest.display.tools,
  },
  effect: (ctx) =>
    Effect.gen(function* () {
      // The browser starts lazily on the first tool call, so activating the plugin never opens a window.
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(() => BrowserRuntime.create(ctx.options)),
        (value) => Effect.promise(() => value.dispose()),
      )
      yield* BrowserTools.register(ctx, runtime)
    }),
})
