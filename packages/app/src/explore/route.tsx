import type { PluginInfo } from "@opencode/client"
import type { SkillInfo } from "@opencode/client/promise"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { createEffect, createMemo, createResource, createSignal, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { makeEventListener } from "@solid-primitives/event-listener"
import { useNavigate, useParams } from "@solidjs/router"
import { useExploreInstalled } from "@/explore/installed"
import { pluginLabel } from "@/providers/catalog/plugin"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { ServerProvider, useData } from "@/runtime/server/current"
import { useServers } from "@/runtime/server/registry"
import { showToast } from "@/shell/notifications/toast"
import { ModuleHeader, ModulePage } from "@/shell/module-page"
import { loadCatalog, loadLocalCatalog, categoryOf, PLUGIN_CATEGORIES, type CatalogPlugin, type CatalogSkill } from "./catalog"
import { ExploreMarket, type MarketEntry, type MarketGroup, type MarketSource } from "./market"
import { PluginInstallDialog } from "./plugin-install-dialog"
import { CatalogPluginDetail, categoryLabels, InstalledPluginDetail, UninstallPluginDialog } from "./plugins"
import {
  CatalogSkillDetail,
  InstallSkillDialog,
  InstalledSkillDetail,
  isBuiltinSkill,
  SkillReferenceButton,
} from "./skills"
import "@/settings/settings.css"
import "./explore.css"

/** Plugins and skills live here instead of Settings, so both are one click from the rail. */
export function ExploreScreen() {
  const servers = useServers()

  // Explore manages the first configured server, the one Home opens with.
  const connection = createMemo(() => servers.list[0])

  return (
    <Show when={connection()} keyed fallback={<div class="min-h-0 flex-1" aria-busy="true" />}>
      {(conn) => (
        <ServerProvider conn={conn}>
          <ExplorePage />
        </ServerProvider>
      )}
    </Show>
  )
}

type ExploreItem =
  | { kind: "plugin"; plugin: PluginInfo }
  | { kind: "skill"; skill: SkillInfo }
  | { kind: "catalog-plugin"; entry: CatalogPlugin }
  | { kind: "catalog-skill"; entry: CatalogSkill }

/** The two shelves of the catalog; the page's top tabs switch between them. */
export const EXPLORE_SECTIONS = ["plugins", "skills"] as const

export type ExploreSection = (typeof EXPLORE_SECTIONS)[number]

/** A stable colour bucket per entry, so a tile keeps its identity across renders and restarts. */
const toneOf = (id: string) =>
  [...id].reduce((hash, char) => (hash * 31 + (char.codePointAt(0) ?? 0)) % 997, 0) % 8

/** Where an entry comes from: an installed entry keeps its plugin source, a catalog entry is what can be installed. */
const sourceKindOf = (item: ExploreItem): MarketSource["kind"] => {
  switch (item.kind) {
    case "plugin":
      return item.plugin.source.type
    case "skill":
      return isBuiltinSkill(item.skill) ? "builtin" : "local"
    case "catalog-plugin":
    case "catalog-skill":
      return "available"
  }
}

const SOURCE_LABELS = {
  builtin: "explore.plugins.source.builtin",
  package: "explore.plugins.source.package",
  local: "explore.plugins.source.local",
  sdk: "explore.plugins.source.sdk",
  project: "explore.plugins.source.local",
  available: "explore.market.source.available",
} as const

const isPluginItem = (item: ExploreItem) => item.kind === "plugin" || item.kind === "catalog-plugin"

/** The id a detail URL carries. An installed plugin without an id is named by its label, as the list does. */
const itemID = (item: ExploreItem) => {
  switch (item.kind) {
    case "plugin":
      return item.plugin.id ?? pluginLabel(item.plugin)
    case "skill":
      return item.skill.id
    case "catalog-plugin":
      return item.entry.id
    case "catalog-skill":
      return item.entry.id
  }
}

const sectionOf = (item: ExploreItem): ExploreSection => (isPluginItem(item) ? "plugins" : "skills")

const itemText = (item: ExploreItem) => {
  switch (item.kind) {
    case "plugin":
      return `${pluginLabel(item.plugin)}\n${item.plugin.display?.description ?? ""}\n${item.plugin.id ?? ""}`
    case "skill":
      return `${item.skill.name}\n${item.skill.description}\n${item.skill.id}`
    case "catalog-plugin":
      return `${item.entry.name}\n${item.entry.description}\n${item.entry.package}\n${item.entry.author}`
    case "catalog-skill":
      return `${item.entry.title}\n${item.entry.description}\n${item.entry.id}`
  }
}

/** The skill shelves, in reading order: what this project has, then what can be installed. */
const SKILL_SHELVES = [
  { key: "installed", title: "explore.skills.group.installed" },
  { key: "available", title: "explore.skills.group.available" },
] as const

/** The catalog category a plugin belongs to; an installed plugin without one is automation, the catalog's default. */
const pluginCategoryOf = (item: ExploreItem) => {
  if (item.kind === "catalog-plugin") return item.entry.category

  if (item.kind === "plugin") return categoryOf(item.plugin.display?.category)

  return undefined
}

/** Built-in skills ship with the app; they end the installed shelf and carry a badge instead of a shelf of their own. */
const isBuiltinItem = (item: ExploreItem) => item.kind === "skill" && isBuiltinSkill(item.skill)

const skillShelfOf = (item: ExploreItem) => {
  if (item.kind === "catalog-skill") return "available"

  if (item.kind === "skill") return "installed"

  return undefined
}

/**
 * The explore workspace. The top tabs split plugins from skills, each shelf is one card pack per category, and every
 * row opens its own page at `/explore/<section>/<id>`.
 */
function ExplorePage() {
  const language = useLanguage()
  const server = useServerSDK()
  const data = useData()
  const dialog = useDialog()
  const installed = useExploreInstalled()
  const params = useParams<{ section?: string; id?: string }>()
  const navigate = useNavigate()

  const [filter, setFilter] = createStore<{ query: string; publicOnly: boolean }>({
    query: "",
    publicOnly: true,
  })

  const [syncing, setSyncing] = createSignal(true)
  const [syncError, setSyncError] = createSignal("")

  const [pluginCatalog, { refetch: refetchCatalog }] = createResource(() => loadLocalCatalog(server))
  const [skillCatalog] = createResource(() => loadCatalog(server))

  const pluginCatalogEntries = () =>
    pluginCatalog.state === "ready" || pluginCatalog.state === "refreshing" ? (pluginCatalog.latest?.plugins ?? []) : []

  const skillCatalogEntries = () =>
    skillCatalog.state === "ready" || skillCatalog.state === "refreshing" ? (skillCatalog.latest?.skills ?? []) : []

  // A catalog entry the server already loads must not offer a second install.
  const installedIDs = createMemo(
    () => new Set(installed.plugins().flatMap((plugin) => (plugin.id ? [plugin.id] : []))),
  )

  // A plugin lists the skills it contributes on its own card, so the installed list only holds the user's skills.
  const ownSkills = createMemo(() => {
    const contributed = new Set(installed.plugins().flatMap((plugin) => (plugin.id ? [plugin.id] : [])))

    return installed.skills().filter((skill) => !skill.plugin || !contributed.has(skill.plugin))
  })

  const discoverableSkills = createMemo(() => {
    // Before the server reports its skills, every entry would look uninstalled, so wait instead of flashing the list.
    if (!installed.skillsLoaded()) return []

    const known = new Set(installed.skills().map((skill) => skill.id))

    return skillCatalogEntries().filter((entry) => !known.has(entry.id))
  })

  const syncSkills = async (target: string) => {
    setSyncing(true)
    setSyncError("")

    try {
      await data.location.skill.sync({ directory: target })
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error))
    } finally {
      setSyncing(false)
    }
  }

  // One read follows the location and a reconnect; it does not loop on the state it writes.
  createEffect(
    on([installed.directory, () => server.connection.status()], ([target, status]) => {
      if (!target) return

      if (status !== "connected") {
        setSyncing(false)

        return
      }

      void syncSkills(target)
    }),
  )

  const section = (): ExploreSection => (params.section === "skills" ? "skills" : "plugins")
  const detailID = () => params.id

  const needle = () => filter.query.trim().toLocaleLowerCase()

  const matches = (item: ExploreItem) =>
    sectionOf(item) === section() && (!needle() || itemText(item).toLocaleLowerCase().includes(needle()))

  // The page keeps its search field; the platform shortcut focuses it instead of opening a separate overlay.
  let searchField: HTMLInputElement | undefined

  const focusSearch = () => {
    searchField?.focus()
    searchField?.select()
  }

  onCleanup(
    makeEventListener(document, "keydown", (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return
      event.preventDefault()
      focusSearch()
    }),
  )

  const installedItems = createMemo<ExploreItem[]>(() => [
    ...installed.plugins().map((plugin) => ({ kind: "plugin" as const, plugin })),
    ...ownSkills().map((skill) => ({ kind: "skill" as const, skill })),
  ])

  const availableItems = createMemo<ExploreItem[]>(() => [
    ...pluginCatalogEntries()
      .filter((entry) => !installedIDs().has(entry.id))
      .map((entry) => ({ kind: "catalog-plugin" as const, entry })),
    ...discoverableSkills().map((entry) => ({ kind: "catalog-skill" as const, entry })),
  ])

  const installedMatches = createMemo(() => installedItems().filter(matches))
  const availableMatches = createMemo(() => availableItems().filter(matches))
  const results = createMemo(() => [...installedMatches(), ...availableMatches()])

  const openSection = (next: ExploreSection) => navigate(`/explore/${next}`)

  const openItem = (item: ExploreItem) => navigate(`/explore/${sectionOf(item)}/${encodeURIComponent(itemID(item))}`)

  const uninstallPlugin = (plugin: PluginInfo) =>
    void dialog.show(() => (
      <UninstallPluginDialog plugin={plugin} onUninstalled={() => void installed.refetchPlugins()} />
    ))

  const installCatalogPlugin = (entry: CatalogPlugin) =>
    void dialog.show(() => (
      <PluginInstallDialog
        package={entry.package}
        name={entry.name}
        integrated={entry.integrated}
        bundle={entry.bundle}
        id={entry.id}
        entry={entry}
        versions={entry.versions}
        onInstalled={() => void installed.refetchPlugins()}
      />
    ))

  const reloadPlugin = async (plugin: PluginInfo) => {
    if (!plugin.id) return

    await server.api.experimental.plugin.reload({ id: plugin.id })
    void installed.refetchPlugins()
  }

  const retryRuntime = async (plugin: PluginInfo) => {
    if (!plugin.id) return

    await server.api.experimental.plugin.runtime.retry({ id: plugin.id })
    void installed.refetchPlugins()
  }

  const refresh = () => {
    void refetchCatalog()
    void installed.refetchPlugins()
    void syncSkills(installed.directory())
  }

  const installPlugin = () =>
    void dialog.show(() => <PluginInstallDialog onInstalled={() => void installed.refetchPlugins()} />)

  const installSkill = () =>
    void dialog.show(() => (
      <InstallSkillDialog
        directory={installed.directory()}
        existing={installed.skills().map((skill) => skill.id)}
        onInstalled={() => {
          void syncSkills(installed.directory())
          showToast({ variant: "success", title: language.t("explore.skills.install.success") })
        }}
      />
    ))

  const installCatalogSkill = (entry: CatalogSkill) =>
    void dialog.show(() => (
      <InstallSkillDialog
        directory={installed.directory()}
        existing={installed.skills().map((skill) => skill.id)}
        initial={{ id: entry.id, name: entry.title, description: entry.description, instructions: entry.instructions }}
        onInstalled={() => {
          void syncSkills(installed.directory())
          showToast({ variant: "success", title: language.t("explore.skills.install.success") })
        }}
      />
    ))

  /** One row of the market: its identity, its origin, one line about it, and the one action the row offers. */
  const marketEntry = (item: ExploreItem): MarketEntry => {
    const id = itemID(item)
    const source = sourceKindOf(item)
    const sourceLabel = language.t(SOURCE_LABELS[source])
    const base = { key: `${item.kind}:${id}`, tone: toneOf(id), source: { kind: source, label: sourceLabel } }

    switch (item.kind) {
      case "plugin": {
        const name = pluginLabel(item.plugin)
        const failed = item.plugin.state.status === "failed"

        return {
          ...base,
          name,
          description: failed ? language.t("explore.plugins.state.failedHint") : (item.plugin.display?.description ?? ""),
          icon: item.plugin.display?.icon,
          glyph: "plugin",
          failed,
          label: language.t("explore.market.row.installed", { name, source: sourceLabel }),
          open: () => openItem(item),
        }
      }

      case "skill": {
        const name = item.skill.name
        const description = item.skill.description ?? ""

        return {
          ...base,
          // A skill without its own mark gets a generated colour, so one skill keeps one tile across restarts.
          tone: toneOf(`${name}\n${description}`),
          name,
          description,
          icon: item.skill.icon,
          glyph: "skill",
          badge: isBuiltinSkill(item.skill) ? language.t("explore.market.badge.builtin") : undefined,
          failed: false,
          label: language.t("explore.market.row.installed", { name, source: sourceLabel }),
          open: () => openItem(item),
        }
      }

      case "catalog-plugin": {
        const name = item.entry.name

        return {
          ...base,
          name,
          description: item.entry.description,
          icon: item.entry.icon,
          glyph: "plugin",
          failed: false,
          label: language.t("explore.market.row.available", { name, source: sourceLabel }),
          open: () => openItem(item),
          install: () => installCatalogPlugin(item.entry),
          installLabel: language.t("explore.market.install", { name }),
        }
      }

      case "catalog-skill": {
        const name = item.entry.title

        return {
          ...base,
          tone: toneOf(`${name}\n${item.entry.description}`),
          name,
          description: item.entry.description,
          icon: item.entry.icon,
          glyph: "skill",
          failed: false,
          label: language.t("explore.market.row.available", { name, source: sourceLabel }),
          open: () => openItem(item),
          install: () => installCatalogSkill(item.entry),
          installLabel: language.t("explore.market.install", { name }),
        }
      }
    }
  }

  // The shelf becomes one group per category or skill shelf, in reading order; a group with no rows is not painted.
  const groups = createMemo<MarketGroup[]>(() => {
    const items = results().filter((item) => !filter.publicOnly || sourceKindOf(item) !== "local")

    if (section() === "plugins") {
      return PLUGIN_CATEGORIES.flatMap((category) => {
        const group = items.filter((item) => pluginCategoryOf(item) === category)

        if (group.length === 0) return []

        return [{ key: `plugin:${category}`, title: language.t(categoryLabels[category]), entries: group.map(marketEntry) }]
      })
    }

    return SKILL_SHELVES.flatMap((shelf) => {
      const group = items.filter((item) => skillShelfOf(item) === shelf.key)

      if (group.length === 0) return []

      // The app's own skills sit at the end of the installed shelf, so the project's work reads first.
      const ordered =
        shelf.key === "installed"
          ? [...group.filter((item) => !isBuiltinItem(item)), ...group.filter(isBuiltinItem)]
          : group

      return [{ key: `skill:${shelf.key}`, title: language.t(shelf.title), entries: ordered.map(marketEntry) }]
    })
  })

  const loading = () => !installed.skillsLoaded() && installed.plugins().length === 0

  // The detail URL names one entry; an installed one wins over a catalog entry that shares its id.
  const detail = createMemo<ExploreItem | undefined>(() => {
    const target = detailID()

    if (!target) return undefined

    if (section() === "plugins") {
      const plugin = installed.plugins().find((plugin) => (plugin.id ?? pluginLabel(plugin)) === target)

      if (plugin) return { kind: "plugin", plugin }

      const entry = pluginCatalogEntries().find((entry) => entry.id === target)

      return entry ? { kind: "catalog-plugin", entry } : undefined
    }

    const skill = installed.skills().find((skill) => skill.id === target)

    if (skill) return { kind: "skill", skill }

    const entry = skillCatalogEntries().find((entry) => entry.id === target)

    return entry ? { kind: "catalog-skill", entry } : undefined
  })

  // A row's page is only missing after the catalog that could provide it has finished loading.
  const detailLoading = () => pluginCatalog.loading || skillCatalog.loading

  const detailPage = () => {
    const item = detail()

    if (!item) {
      return (
        <ModulePage label={language.t("explore.title")}>
          <ModuleHeader title={language.t("explore.title")} />
          <Show
            when={detailLoading()}
            fallback={<p class="module-search-empty">{language.t("explore.detail.missing")}</p>}
          >
            <div class="flex justify-center py-16" aria-busy="true">
              <Loader />
            </div>
          </Show>
        </ModulePage>
      )
    }

    switch (item.kind) {
      case "plugin":
        return (
          <ModulePage label={pluginLabel(item.plugin)}>
            <ModuleHeader title={pluginLabel(item.plugin)} description={item.plugin.display?.description} />
            <InstalledPluginDetail
              plugin={item.plugin}
              skills={installed.skills()}
              onUninstall={() => uninstallPlugin(item.plugin)}
              onRetry={() => reloadPlugin(item.plugin)}
              onRuntimeRetry={() => retryRuntime(item.plugin)}
            />
          </ModulePage>
        )
      case "catalog-plugin":
        return (
          <ModulePage label={item.entry.name}>
            <ModuleHeader title={item.entry.name} description={item.entry.description} />
            <CatalogPluginDetail entry={item.entry} onInstall={() => installCatalogPlugin(item.entry)} />
          </ModulePage>
        )
      case "skill":
        return (
          <ModulePage label={item.skill.name}>
            <ModuleHeader
              title={item.skill.name}
              description={item.skill.description}
              actions={<SkillReferenceButton skill={item.skill} />}
            />
            <InstalledSkillDetail skill={item.skill} />
          </ModulePage>
        )
      case "catalog-skill":
        return (
          <ModulePage label={item.entry.title}>
            <ModuleHeader title={item.entry.title} description={item.entry.description} />
            <CatalogSkillDetail entry={item.entry} />
          </ModulePage>
        )
    }
  }

  const listPage = () => (
    <ModulePage label={language.t("explore.title")} wide>
      <ExploreMarket
        sectionKey={section()}
        tabsLabel={language.t("explore.market.tabs.label")}
        tabs={EXPLORE_SECTIONS.map((shelf) => ({
          id: shelf,
          label: language.t(shelf === "plugins" ? "explore.nav.plugins" : "explore.nav.skills"),
          selected: section() === shelf,
          onSelect: () => openSection(shelf),
        }))}
        title={language.t(section() === "plugins" ? "explore.plugins.title" : "explore.skills.title")}
        description={language.t(section() === "plugins" ? "explore.plugins.description" : "explore.skills.description")}
        query={filter.query}
        searchPlaceholder={language.t(
          section() === "plugins" ? "explore.plugins.search.placeholder" : "explore.skills.search.placeholder",
        )}
        searchLabel={language.t("explore.search.placeholder")}
        onQuery={(value) => setFilter("query", value)}
        setField={(element) => (searchField = element)}
        refreshLabel={language.t("explore.plugins.refresh")}
        refreshing={syncing()}
        onRefresh={refresh}
        addLabel={language.t("explore.plugins.add")}
        onAdd={section() === "plugins" ? installPlugin : installSkill}
        chip={
          section() === "plugins"
            ? {
                label: language.t("explore.market.scope.public"),
                pressed: filter.publicOnly,
                onToggle: () => setFilter("publicOnly", (value) => !value),
              }
            : undefined
        }
        loading={loading()}
        groups={groups()}
        emptyTitle={language.t(section() === "plugins" ? "explore.market.empty.plugins" : "explore.market.empty.skills")}
        emptyHint={language.t("explore.market.empty.hint")}
        alert={
          <Show when={syncError()}>
            {(message) => (
              <div class="explore-error" role="alert">
                <Icon name="outline-hexagonal-warning" size="small" class="shrink-0" />
                <span class="min-w-0 flex-1 break-words">{message()}</span>
                <Button size="small" variant="ghost-muted" onClick={() => void syncSkills(installed.directory())}>
                  {language.t("explore.plugins.error.retry")}
                </Button>
              </div>
            )}
          </Show>
        }
      />
    </ModulePage>
  )

  return (
    <Show when={detailID()} fallback={listPage()}>
      {detailPage()}
    </Show>
  )
}
