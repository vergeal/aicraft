/**
 * The Explore catalog: the plugins and skills people publish for OpenCode, as the sidebar's "Discover" lists.
 *
 * Plugins and skills come from the local discover root (`~/.distribution/`), which stands in for a registry until one
 * exists: the server reads it and returns each plugin id with its available versions, and every skill directory with a
 * `SKILL.md`. `loadLocalCatalog` is the one seam that changes when a real registry lands.
 */
import type { PluginLocalEntry } from "@opencode/client/promise"

export const PLUGIN_CATEGORIES = ["developer-tools", "productivity", "automation"] as const

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number]

export type CatalogVersion = { version: string; file: string }

export type CatalogPlugin = {
  id: string
  name: string
  /** Which shelf the list groups this entry under. */
  category: PluginCategory
  /** The publisher shown under the name on the detail page. */
  author: string
  /** One line under the name in the list. */
  description: string
  /** The longer introduction on the detail page; the list's description stands in when absent. */
  details?: string
  /** The npm package a config entry loads the plugin from. */
  package: string
  repository: string
  /**
   * Ships inside the app: installing only writes the config entry that enables it, so no package is downloaded.
   */
  integrated?: boolean
  /**
   * A single-file `.exc` bundle. There is no package to fetch and no config entry to write: the host unpacks the
   * file into `~/.aicraft/exc/<id>/`, so the card shows the bundle instead of offering a package install.
   */
  bundle?: { file: string; format: "exc" }
  /** The version shown on the install card. */
  version?: string
  /** Every version available in the local discover directory, newest first. */
  versions?: readonly CatalogVersion[]
  /** Tool families the plugin registers, for the install card. */
  tools?: readonly string[]
  /** MCP servers the plugin starts, when the catalog knows them. */
  mcpServers?: readonly { name: string }[]
  /** Skills the plugin ships, when the catalog knows them. */
  skills?: readonly { name: string; description: string }[]
  /** The interpreter environment installing this plugin prepares, when its manifest declares one. */
  runtime?: NonNullable<PluginLocalEntry["runtime"]>
}

export type CatalogSkill = {
  /** Also the SKILL.md directory name, so it must stay a lowercase hyphenated slug. */
  id: string
  title: string
  description: string
  /** The markdown body written below the frontmatter. */
  instructions: string
}

export type CatalogSource = {
  plugins: readonly CatalogPlugin[]
  skills: readonly CatalogSkill[]
}

export type CatalogServer = {
  api: {
    experimental: {
      plugin: { local: () => Promise<{ data: PluginLocalEntry[] }> }
      skill: { local: () => Promise<{ data: readonly LocalSkill[] }> }
    }
  }
}

type LocalSkill = { id: string; name: string; description?: string; content: string }

/**
 * The skills shelf reads the local distribution directory, where each skill is a directory with a `SKILL.md`.
 * Results are newest first by id, matching how the plugin shelf lists bundle versions.
 */
export function loadCatalog(server: CatalogServer): Promise<CatalogSource> {
  return server.api.experimental.skill.local().then((result) => ({
    plugins: [],
    skills: result.data.map((skill) => ({
      id: skill.id,
      title: skill.name,
      description: skill.description ?? "",
      instructions: skill.content,
    })),
  }))
}

/**
 * Maps one local bundle id onto a catalog card. Display data comes from the id's newest manifest, so the card reads
 * the same before and after installing; the versions list is newest first, as the server returns it.
 */
export function loadLocalCatalog(server: {
  api: { experimental: { plugin: { local: () => Promise<{ data: PluginLocalEntry[] }> } } }
}): Promise<CatalogSource> {
  return server.api.experimental.plugin.local().then((result) => ({
    plugins: result.data.map((entry) => {
      const newest = entry.versions[0]
      return {
        id: entry.id,
        name: entry.display?.name ?? entry.id,
        category: categoryOf(entry.display?.category),
        author: "",
        description: entry.display?.description ?? "",
        package: entry.id,
        repository: "",
        bundle: { file: newest?.file ?? `${entry.id}.exc`, format: "exc" as const },
        ...(newest ? { version: newest.version } : {}),
        versions: entry.versions,
        ...(entry.display?.tools ? { tools: entry.display.tools } : {}),
        ...(entry.runtime ? { runtime: entry.runtime } : {}),
        ...(entry.display?.skills
          ? {
              skills: entry.display.skills.map((skill) => ({
                name: skill.name,
                description: skill.description,
              })),
            }
          : {}),
      } satisfies CatalogPlugin
    }),
    skills: [],
  }))
}

function categoryOf(input: string | undefined): PluginCategory {
  return PLUGIN_CATEGORIES.includes(input as PluginCategory) ? (input as PluginCategory) : "automation"
}
