export * as BrowserSkill from "./skill.js"

import { PluginManifest } from "@aicraft/schema/plugin-manifest"
import { AbsolutePath } from "@aicraft/schema/schema"
import { Skill } from "@aicraft/schema/skill"
import { Effect } from "effect"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
const manifest = await (async () => {
  for (const name of ["ocplugin.json", "METAINF"]) {
    const file = Bun.file(join(import.meta.dir, "..", name))
    if (await file.exists()) return PluginManifest.decode(await file.json())
  }
  throw new Error("This plugin has no ocplugin.json or METAINF manifest next to its server entry.")
})()

const entry = (manifest.skills ?? []).find((skill) => skill.id === "webwright")!

export const id = Skill.ID.make(entry.id)

/** The skill file next to the built server entry, or beside the sources in a worktree. */
export function skillPath() {
  const relative = entry.path.split("/").join("/")
  const candidates = [join(import.meta.dir, "..", relative), join(import.meta.dir, "..", "..", relative)]
  return candidates.find((path) => existsSync(path)) ?? candidates[0]!
}

/**
 * Load the skill body from the package rather than pasting it into this module: the package ships SKILL.md as data,
 * so the same file is what the app lists in `display.skills` and what the model reads.
 */
export function load() {
  return Effect.promise(async () => {
    const path = skillPath()
    return Skill.Info.make({
      id,
      name: Skill.Name.make(entry.name),
      description: entry.description,
      path: AbsolutePath.make(path),
      content: await readFile(path, "utf8"),
    })
  })
}
