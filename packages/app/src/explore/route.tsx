import type { PluginInfo } from "@opencode/client"
import type { SkillInfo } from "@opencode/client/promise"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { createEffect, createMemo, createResource, createSignal, For, on, Show } from "solid-js"
import { useExploreInstalled } from "@/explore/installed"
import { pluginLabel } from "@/providers/catalog/plugin"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { ServerProvider, useData } from "@/runtime/server/current"
import { useServers } from "@/runtime/server/registry"
import { showToast } from "@/shell/notifications/toast"
import { createModuleSearch, ModuleGroup, ModuleHeader, ModulePage, ModuleSearch } from "@/shell/module-page"
import { loadCatalog, loadLocalCatalog, type CatalogPlugin, type CatalogSkill } from "./catalog"
import { PluginInstallDialog } from "./plugin-install-dialog"
import { CatalogPluginCard, InstalledPluginCard, UninstallPluginDialog } from "./plugins"
import { CatalogSkillCard, InstallSkillDialog, InstalledSkillCard } from "./skills"
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

const itemKey = (item: ExploreItem) => {
  switch (item.kind) {
    case "plugin":
      return `plugin:${item.plugin.id ?? pluginLabel(item.plugin)}`
    case "skill":
      return `skill:${item.skill.id}`
    case "catalog-plugin":
      return `catalog-plugin:${item.entry.id}`
    case "catalog-skill":
      return `catalog-skill:${item.entry.id}`
  }
}

const itemLabel = (item: ExploreItem) => {
  switch (item.kind) {
    case "plugin":
      return pluginLabel(item.plugin)
    case "skill":
      return item.skill.name
    case "catalog-plugin":
      return item.entry.name
    case "catalog-skill":
      return item.entry.title
  }
}

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
 * The explore workspace: one fused page. Installed and available entries share one list, and each card opens its
 * details and the install or remove action in place.
 */
function ExplorePage() {
  const language = useLanguage()
  const server = useServerSDK()
  const data = useData()
  const dialog = useDialog()
  const installed = useExploreInstalled()
  const search = createModuleSearch()
  const [open, setOpen] = createSignal<string>()
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

  const needle = () => search.query().trim().toLocaleLowerCase()
  const matches = (item: ExploreItem) => !needle() || itemText(item).toLocaleLowerCase().includes(needle())

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

  const toggle = (item: ExploreItem) => {
    const key = itemKey(item)

    setOpen(open() === key ? undefined : key)
  }

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

  const card = (item: ExploreItem) => {
    const openItem = () => open() === itemKey(item)

    switch (item.kind) {
      case "plugin":
        return (
          <InstalledPluginCard
            plugin={item.plugin}
            skills={installed.skills()}
            open={openItem()}
            onToggle={() => toggle(item)}
            onUninstall={() => uninstallPlugin(item.plugin)}
            onRetry={() => reloadPlugin(item.plugin)}
            onRuntimeRetry={() => retryRuntime(item.plugin)}
          />
        )
      case "skill":
        return <InstalledSkillCard skill={item.skill} open={openItem()} onToggle={() => toggle(item)} />
      case "catalog-plugin":
        return (
          <CatalogPluginCard
            entry={item.entry}
            open={openItem()}
            onToggle={() => toggle(item)}
            onInstall={() => installCatalogPlugin(item.entry)}
          />
        )
      case "catalog-skill":
        return <CatalogSkillCard entry={item.entry} open={openItem()} onToggle={() => toggle(item)} />
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

  return (
    <ModulePage label={language.t("explore.title")}>
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
              onClick={search.show}
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
          when={installedMatches().length > 0}
          fallback={
            <p class="module-search-empty">
              {language.t(needle() ? "explore.plugins.noResults.description" : "explore.plugins.empty.description")}
            </p>
          }
        >
          <ModuleGroup title={language.t("explore.plugins.installed")} count={installedItems().length}>
            <For each={installedMatches()}>{card}</For>
          </ModuleGroup>
        </Show>

        <Show when={availableMatches().length > 0}>
          <ModuleGroup title={language.t("explore.group.available")} count={availableItems().length}>
            <For each={availableMatches()}>{card}</For>
          </ModuleGroup>
        </Show>

        <Show when={installedMatches().length > 0 && availableMatches().length === 0 && !needle()}>
          <p class="module-search-empty">{language.t("explore.plugins.none.description")}</p>
        </Show>
      </Show>

      <ModuleSearch
        state={search}
        label={language.t("replica.nav.search")}
        placeholder={language.t("explore.search.placeholder")}
        hint={
          needle()
            ? results().length
              ? language.plural("explore.search.results", results().length, { count: results().length })
              : undefined
            : undefined
        }
      >
        <Show
          when={results().length > 0}
          fallback={<p class="module-search-empty">{language.t("explore.search.empty")}</p>}
        >
          <For each={results()}>
            {(item) => (
              <button
                type="button"
                class="module-search-hit"
                onClick={() => {
                  setOpen(itemKey(item))
                  search.close()
                }}
              >
                <Show
                  when={item.kind === "plugin" || item.kind === "catalog-plugin"}
                  fallback={<Icon name="post-skill" size="small" />}
                >
                  <Icon name="outline-pair" size="small" />
                </Show>
                <span class="module-search-hit-label">{itemLabel(item)}</span>
                <span class="text-[12px] text-v2-text-text-faint">
                  {language.t(
                    item.kind === "plugin" || item.kind === "catalog-plugin"
                      ? "explore.plugins.title"
                      : "explore.skills.title",
                  )}
                </span>
              </button>
            )}
          </For>
        </Show>
      </ModuleSearch>
    </ModulePage>
  )
}
