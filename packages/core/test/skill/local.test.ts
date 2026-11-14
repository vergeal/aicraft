import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { SkillLocal } from "../../src/skill/local"

const created: string[] = []

afterEach(async () => {
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function home() {
  const directory = await mkdtemp(path.join(tmpdir(), "opencode-skill-local-"))
  created.push(directory)
  return directory
}

async function skill(root: string, id: string, content: string | undefined) {
  const folder = path.join(root, ".distribution", "skills", id)
  await mkdir(folder, { recursive: true })
  if (content !== undefined) await writeFile(path.join(folder, "SKILL.md"), content)
}

describe("SkillLocal.list", () => {
  test("lists directories that ship a SKILL.md, sorted by id", async () => {
    const root = await home()
    await skill(root, "zeta", "---\nname: Zeta\ndescription: Last one.\n---\n\nZeta body.")
    await skill(root, "alpha", "---\nname: Alpha\ndescription: First one.\n---\n\nAlpha body.")
    // A SKILL.md without frontmatter is still a skill; its directory name becomes the id and name.
    await skill(root, "plain", "Plain body.")
    await mkdir(path.join(root, ".distribution", "skills", "empty"), { recursive: true })

    const skills = await SkillLocal.list({ home: root })

    expect(skills.map((item) => String(item.id))).toEqual(["alpha", "plain", "zeta"])
    expect(skills[0]).toMatchObject({ name: "Alpha", description: "First one." })
    expect(skills[0].content).toContain("Alpha body.")
    expect(skills[1]).toMatchObject({ name: "plain" })
  })

  test("returns nothing when the distribution root is missing", async () => {
    expect(await SkillLocal.list({ home: await home() })).toEqual([])
  })
})
