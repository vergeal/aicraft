export * as SkillLocal from "./local.js"

import { readdir } from "node:fs/promises"
import path from "node:path"
import { SkillFile } from "../config/plugin/skill-file.js"
import type { Skill } from "../skill.js"

/**
 * The local skills discover directory mirrors the plugin one: each skill is a directory holding a `SKILL.md`, and
 * the app lists them next to the plugin bundles so a machine can try the whole install flow before a registry exists.
 */
export const root = (home: string) => path.join(home, ".distribution", "skills")

/** Every skill directory under the discover root, sorted by id so the catalog order is stable. */
export async function list(input: { home: string }): Promise<Skill.Info[]> {
  const directory = root(input.home)
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const skills = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map((entry) => read(directory, entry.name)),
  )
  return skills
    .filter((skill): skill is Skill.Info => skill !== undefined)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

async function read(directory: string, name: string): Promise<Skill.Info | undefined> {
  const folder = path.join(directory, name)
  const file = path.join(folder, "SKILL.md")
  const content = await Bun.file(file)
    .text()
    .catch(() => undefined)
  if (content === undefined) return undefined
  const parsed = SkillFile.parse(folder, file, content)
  return parsed._tag === "Parsed" ? parsed.skill : undefined
}
