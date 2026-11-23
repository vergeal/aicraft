import { Plugin } from "@opencode/plugin/effect"
import { PluginManifest } from "@opencode/schema/plugin-manifest"
import { Effect } from "effect"
import { join } from "node:path"
import { BrowserRuntime } from "../src/browser.js"
import { BrowserTools } from "../src/tools.js"

const manifest = PluginManifest.decode(await Bun.file(join(import.meta.dir, "..", "METAINF")).json())

export default Plugin.define({
  id: manifest.id,
  // The manifest is the single source of truth for what the plugin browser shows: the same file is what discovery
  // reads before the package is installed, so the two views cannot drift.
  display: {
    name: manifest.display.name,
    description: manifest.display.description,
    category: manifest.display.category,
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
