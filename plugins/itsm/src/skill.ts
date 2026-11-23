export * as ItsmSkill from "./skill.js"

import { PluginManifest } from "@opencode/schema/plugin-manifest"
import { AbsolutePath } from "@opencode/schema/schema"
import { Skill } from "@opencode/schema/skill"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
const manifest = PluginManifest.decode(await Bun.file(join(import.meta.dir, "..", "METAINF")).json())

const entry = (manifest.skills ?? []).find((skill) => skill.id === "itsm")!

export const id = Skill.ID.make(entry.id)

/** 与构建产物同级的 SKILL.md，或工作区里的源码。 */
export function skillPath() {
  const candidates = [join(import.meta.dir, "..", entry.path), join(import.meta.dir, "..", "..", entry.path)]
  return candidates.find((path) => existsSync(path)) ?? candidates[0]!
}

/** 激活时读取 SKILL.md，让清单里的描述与模型读到的正文不会各说一套。 */
export async function load() {
  const path = skillPath()
  return Skill.Info.make({
    id,
    name: Skill.Name.make(entry.name),
    description: entry.description,
    path: AbsolutePath.make(path),
    content: await readFile(path, "utf8"),
  })
}
