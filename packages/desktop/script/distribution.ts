#!/usr/bin/env bun
import { $ } from "bun"
import { cp, mkdir, readdir, rm } from "node:fs/promises"
import path from "node:path"

// Collects the repository's official plugins and skills into resources/distribution. A packaged
// install copies that tree into the user's ~/.distribution on launch (src/main/distribution.ts),
// so the Explore catalog and the skill loader see them without a registry or a manual install.
const repo = path.resolve(import.meta.dir, "../../..")

const out = path.resolve(import.meta.dir, "../resources/distribution")

const build = !process.argv.includes("--no-build")

await rm(out, { recursive: true, force: true })

await mkdir(out, { recursive: true })

for (const entry of await readdir(path.join(repo, "plugins"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  const folder = path.join(repo, "plugins", entry.name)
  const manifest = await readManifest(path.join(folder, "METAINF"))

  if (!manifest) {
    console.log(`skip plugins/${entry.name}: no METAINF`)
    continue
  }

  if (build) await $`bun run build`.cwd(folder)

  const target = path.join(out, "plugins", manifest.id, manifest.version)

  await mkdir(target, { recursive: true })
  await $`bun run pack`.cwd(folder).env({ ...process.env, AIX_OUT: target })
  console.log(`bundled ${manifest.id}@${manifest.version}`)
}

const skills = path.join(repo, "skills")

for (const entry of await readdir(skills, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  const folder = path.join(skills, entry.name)

  if (!(await Bun.file(path.join(folder, "SKILL.md")).exists())) {
    console.log(`skip skills/${entry.name}: no SKILL.md`)
    continue
  }

  await cp(folder, path.join(out, "skills", entry.name), {
    recursive: true,
    filter: (source) => !["node_modules", ".turbo"].includes(path.basename(source)),
  })
  console.log(`bundled skill ${entry.name}`)
}

async function readManifest(file: string) {
  const parsed = await Bun.file(file)
    .json()
    .catch(() => undefined)

  if (typeof parsed !== "object" || parsed === null) return undefined

  const manifest = parsed as { id?: unknown; version?: unknown }

  return typeof manifest.id === "string" && typeof manifest.version === "string"
    ? { id: manifest.id, version: manifest.version }
    : undefined
}
