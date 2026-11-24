export * as PluginLocal from "./local.js"

import type { Plugin } from "@aicraft/schema/plugin"
import { Catalog } from "@aicraft/schema/catalog"
import { PluginManifest } from "@aicraft/schema/plugin-manifest"
import { Option, Schema } from "effect"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

/**
 * The local discover directory mirrors what a registry would publish: one folder per plugin id, one folder per
 * version inside it, and the `.exc` bundle in that version folder. The app lists it as the catalog, so this
 * machine can try the full install flow before a registry exists. Plugins and skills share one distribution root.
 */
export const root = (home: string) => path.join(home, ".distribution", "plugins")

/** Where installed bundles are unpacked, one directory per plugin id. */
export const installRoot = (home: string) => path.join(home, ".aicraft", "exc")

type Manifest = {
  id?: unknown
  version?: unknown
  display?: unknown
  skills?: unknown
  runtime?: unknown
}

type Found = { version: string; file: string; manifest?: Manifest }

/** Every id with at least one bundle, newest version first, keyed by id. */
export async function list(input: { home: string }): Promise<Plugin.LocalEntry[]> {
  const directory = root(input.home)
  const ids = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const entries = await Promise.all(
    ids.filter((entry) => entry.isDirectory()).map((entry) => read(directory, entry.name)),
  )
  return entries.filter((entry): entry is Plugin.LocalEntry => entry !== undefined).sort((a, b) => compare(a.id, b.id))
}

export function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Semver order when both versions parse, byte order otherwise. */
export function compareVersions(a: string, b: string) {
  const ordered = semver(a, b)
  return ordered ?? compare(a, b)
}

async function read(directory: string, id: string): Promise<Plugin.LocalEntry | undefined> {
  const versions = await readdir(path.join(directory, id), { withFileTypes: true }).catch(() => [])
  const found = (
    await Promise.all(
      versions.filter((entry) => entry.isDirectory()).map((entry) => readVersion(path.join(directory, id), entry.name)),
    )
  )
    .filter((entry): entry is Found => entry !== undefined)
    .sort((a, b) => compareVersions(a.version, b.version))
    .reverse()
  if (found.length === 0) return undefined

  // The newest bundle describes the plugin; older versions keep their own bundle but share the entry's copy.
  const display = found.map((entry) => displayOf(entry.manifest)).find((entry) => entry !== undefined)
  const runtime = found.map((entry) => runtimeOf(entry.manifest)).find((entry) => entry !== undefined)
  return {
    id,
    ...(display ? { display } : {}),
    ...(runtime ? { runtime } : {}),
    versions: found.map((entry) => ({ version: entry.version, file: entry.file })),
  }
}

async function readVersion(directory: string, version: string): Promise<Found | undefined> {
  const folder = path.join(directory, version)
  const files = await readdir(folder).catch(() => [])
  const file = files.find((name) => name.endsWith(".exc"))
  if (!file) return undefined
  const manifest = await readManifest(path.join(folder, file))
  // A bundle naming a category the client does not ship has no shelf to land on, so it is not discoverable either.
  if (!hasKnownCategory(manifest)) return undefined
  return { version, file, manifest }
}

function hasKnownCategory(manifest: Manifest | undefined) {
  if (typeof manifest?.display !== "object" || manifest.display === null) return true
  const category = (manifest.display as { category?: unknown }).category
  return category === undefined || Catalog.isCategory(category)
}

/**
 * The manifest travels inside the archive, so listing a version opens it. A bundle is self-contained on purpose:
 * the version directory holds one `.exc` and nothing else. Opening a large bundle (webwright ships its Playwright
 * driver) is the accepted cost of keeping the distribution directory clean.
 */
async function readManifest(file: string): Promise<Manifest | undefined> {
  const archive = new Bun.Archive(new Uint8Array(await readFile(file)))
  const declared = (await archive.files()).get("METAINF")
  if (!declared) return undefined
  const parsed: unknown = await declared.json().catch(() => undefined)
  return isManifest(parsed) ? parsed : undefined
}

function isManifest(input: unknown): input is Manifest {
  return typeof input === "object" && input !== null
}

/** The runtime the newest bundle declares, read with the same schema the host prepares it from. */
function runtimeOf(manifest: Manifest | undefined): Plugin.LocalEntry["runtime"] {
  return Option.getOrUndefined(Schema.decodeUnknownOption(PluginManifest.Runtime)(manifest?.runtime))
}

function displayOf(manifest: Manifest | undefined): Plugin.Display | undefined {
  if (typeof manifest?.display !== "object" || manifest.display === null) return undefined
  const display = manifest.display as Partial<Plugin.Display>
  if (typeof display.name !== "string" || typeof display.description !== "string") return undefined
  const skills = skillsOf(display.skills) ?? skillsOf(manifest.skills)
  return {
    name: display.name,
    description: display.description,
    ...(Catalog.isCategory(display.category) ? { category: display.category } : {}),
    ...(typeof display.icon === "string" && display.icon.trim() !== "" ? { icon: display.icon } : {}),
    ...(Array.isArray(display.tools) ? { tools: display.tools } : {}),
    ...(skills ? { skills } : {}),
  } as Plugin.Display
}

/** `display.skills` and a bundle's top-level `skills` share the fields a card reads; `path` only matters in the pack. */
function skillsOf(input: unknown): Plugin.Display["skills"] {
  if (!Array.isArray(input)) return undefined
  const skills = input.flatMap((item) => {
    if (typeof item !== "object" || item === null) return []
    const skill = item as { id?: unknown; name?: unknown; description?: unknown; icon?: unknown }
    if (typeof skill.id !== "string" || typeof skill.name !== "string" || typeof skill.description !== "string")
      return []
    return [
      {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        ...(typeof skill.icon === "string" && skill.icon.trim() !== "" ? { icon: skill.icon } : {}),
      },
    ]
  })
  return skills.length > 0 ? skills : undefined
}

function semver(a: string, b: string) {
  try {
    return Bun.semver.order(a, b) as -1 | 0 | 1
  } catch {
    return undefined
  }
}
