import type { PluginInfo } from "@opencode/client"
import type { SkillInfo } from "@opencode/client/promise"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from "solid-js"
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
import { ModuleGroup, ModuleHeader, ModulePage } from "@/shell/module-page"
import { loadCatalog, loadLocalCatalog, type CatalogPlugin, type CatalogSkill } from "./catalog"
import { PluginInstallDialog } from "./plugin-install-dialog"
import {
  CatalogPluginCard,
  CatalogPluginDetail,
  InstalledPluginCard,
  InstalledPluginDetail,
  UninstallPluginDialog,
} from "./plugins"
import {
  CatalogSkillCard,
  CatalogSkillDetail,
  InstallSkillDialog,
  InstalledSkillCard,
  InstalledSkillDetail,
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

/** How many cards one group paints before the rest wait behind "show more"; a catalog of thousands stays cheap. */
const PAGE_SIZE = 60

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

/**
 * The explore workspace. The top tabs split plugins from skills, the list keeps installed and available entries in
 * two groups, and every row opens its own page at `/explore/<section>/<id>`.
 */
function ExplorePage() {
  const language = useLanguage()
  const server = useServerSDK()
  const data = useData()
  const dialog = useDialog()
  const installed = useExploreInstalled()
  const params = useParams<{ section?: string; id?: string }>()
  const navigate = useNavigate()

  const [filter, setFilter] = createStore<{ query: string; installed: number; available: number }>({
    query: "",
    installed: PAGE_SIZE,
    available: PAGE_SIZE,
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

  // A new query or shelf starts both groups over, so "show more" never carries into a filtered list.
  createEffect(on([needle, section], () => setFilter({ installed: PAGE_SIZE, available: PAGE_SIZE })))

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

  const row = (item: ExploreItem) => {
    switch (item.kind) {
      case "plugin":
        return <InstalledPluginCard plugin={item.plugin} onOpen={() => openItem(item)} />
      case "skill":
        return <InstalledSkillCard skill={item.skill} onOpen={() => openItem(item)} />
      case "catalog-plugin":
        return <CatalogPluginCard entry={item.entry} onOpen={() => openItem(item)} />
      case "catalog-skill":
        return <CatalogSkillCard entry={item.entry} onOpen={() => openItem(item)} />
    }
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

  const allItems = createMemo(() => [...installedItems(), ...availableItems()])
  const sectionCount = (shelf: ExploreSection) => allItems().filter((item) => sectionOf(item) === shelf).length

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
      <ModuleHeader
        title={language.t("explore.title")}
        count={
          installedItems().length
            ? language.plural("explore.items", installedItems().length, { count: installedItems().length })
            : undefined
        }
        description={language.t("explore.description")}
        actions={
          <>
            <Button
              size="small"
              variant="ghost-muted"
              icon="magnifying-glass"
              aria-label={language.t("replica.nav.search")}
              onClick={focusSearch}
            />
            <Button
              size="small"
              variant="ghost-muted"
              icon="refresh"
              disabled={syncing()}
              aria-busy={syncing()}
              aria-label={language.t("explore.plugins.refresh")}
              onClick={refresh}
            />
            <Button size="small" variant="ghost-muted" icon="plus" onClick={installSkill}>
              {language.t("explore.skills.install")}
            </Button>
            <Button size="small" variant="contrast" icon="plus" onClick={installPlugin}>
              {language.t("explore.plugins.install")}
            </Button>
          </>
        }
      />

      <div class="explore-toolbar" role="search" aria-label={language.t("explore.filter.label")}>
        <div class="explore-tabs" role="tablist" aria-label={language.t("explore.filter.label")}>
          <For each={EXPLORE_SECTIONS}>
            {(shelf) => (
              <button
                type="button"
                role="tab"
                class="explore-tab"
                aria-selected={section() === shelf}
                data-selected={section() === shelf ? "" : undefined}
                onClick={() => openSection(shelf)}
              >
                {language.t(shelf === "plugins" ? "explore.plugins.title" : "explore.skills.title")}
                <span class="count">{sectionCount(shelf)}</span>
              </button>
            )}
          </For>
        </div>

        <label class="explore-search">
          <Icon name="magnifying-glass" size="small" class="explore-search-icon" />
          <input
            ref={(element) => (searchField = element)}
            type="search"
            value={filter.query}
            placeholder={language.t("explore.search.placeholder")}
            aria-label={language.t("explore.search.placeholder")}
            onInput={(event) => setFilter("query", event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return

              setFilter("query", "")
              event.currentTarget.blur()
            }}
          />
        </label>

        <Show when={needle()}>
          <span class="explore-toolbar-count" aria-live="polite">
            {results().length
              ? language.plural("explore.search.results", results().length, { count: results().length })
              : language.t("explore.search.empty")}
          </span>
        </Show>
      </div>

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

      <Show
        when={!loading()}
        fallback={
          <div class="flex justify-center py-16" aria-busy="true">
            <Loader />
          </div>
        }
      >
        <Show
          when={installedMatches().length > 0 || availableMatches().length > 0}
          fallback={
            <p class="module-search-empty">
              {language.t(
                needle()
                  ? "explore.search.empty"
                  : section() === "plugins"
                    ? "explore.plugins.empty.description"
                    : "explore.skills.empty.description",
              )}
            </p>
          }
        >
          <Show when={installedMatches().length > 0}>
            <ModuleGroup title={language.t("explore.plugins.installed")} count={installedMatches().length}>
              <div class="module-grid explore-grid">
                <For each={installedMatches().slice(0, filter.installed)}>{row}</For>
              </div>
              <Show when={installedMatches().length > filter.installed}>
                <div class="explore-more">
                  <Button
                    size="small"
                    variant="ghost-muted"
                    onClick={() => setFilter("installed", filter.installed + PAGE_SIZE)}
                  >
                    {language.t("explore.showMore", { count: installedMatches().length - filter.installed })}
                  </Button>
                </div>
              </Show>
            </ModuleGroup>
          </Show>

          <Show when={availableMatches().length > 0}>
            <ModuleGroup title={language.t("explore.group.available")} count={availableMatches().length}>
              <div class="module-grid explore-grid">
                <For each={availableMatches().slice(0, filter.available)}>{row}</For>
              </div>
              <Show when={availableMatches().length > filter.available}>
                <div class="explore-more">
                  <Button
                    size="small"
                    variant="ghost-muted"
                    onClick={() => setFilter("available", filter.available + PAGE_SIZE)}
                  >
                    {language.t("explore.showMore", { count: availableMatches().length - filter.available })}
                  </Button>
                </div>
              </Show>
            </ModuleGroup>
          </Show>

          <Show when={installedMatches().length > 0 && availableMatches().length === 0 && !needle()}>
            <p class="module-search-empty">{language.t("explore.plugins.none.description")}</p>
          </Show>
        </Show>
      </Show>
    </ModulePage>
  )

  return (
    <Show when={detailID()} fallback={listPage()}>
      {detailPage()}
    </Show>
  )
}
