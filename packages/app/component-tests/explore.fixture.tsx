import type { PluginInfo } from "@opencode/client"
import { createSignal, Show } from "solid-js"
import { render } from "solid-js/web"
import type { CatalogPlugin } from "../src/explore/catalog"
import { ExploreMarket, type MarketEntry, type MarketGroup } from "../src/explore/market"
import { CatalogPluginDetail, InstalledPluginDetail } from "../src/explore/plugins"
import { LanguageProvider } from "../src/runtime/i18n/language"
import { PlatformProvider, type Platform } from "../src/runtime/platform/platform"

const sample: CatalogPlugin[] = [
  {
    id: "alpha-plugin",
    name: "alpha-plugin",
    category: "developer-tools",
    author: "example",
    description: "Adds alpha behaviour",
    details: "The full alpha introduction.",
    package: "opencode-plugin-alpha",
    repository: "https://github.com/example/alpha-plugin",
  },
  {
    id: "beta-plugin",
    name: "beta-plugin",
    category: "productivity",
    author: "example",
    description: "Adds beta behaviour",
    package: "opencode-plugin-beta",
    repository: "https://github.com/example/beta-plugin",
    mcpServers: [{ name: "beta-mcp" }],
    skills: [{ name: "Beta Skill", description: "Does beta work" }],
  },
  {
    id: "gamma-plugin",
    name: "gamma-plugin",
    category: "automation",
    author: "example",
    description: "Adds gamma behaviour",
    package: "opencode-plugin-gamma",
    repository: "https://github.com/example/gamma-plugin",
  },
]

/** A discoverable bundle: it ships as one `.exc` file, so the row offers the bundle instead of a package. */
export const webwrightCatalog: CatalogPlugin[] = [
  {
    id: "changhong.aicraft.webwright",
    name: "Webwright",
    category: "automation",
    author: "Changhong",
    description: "让 AI 直接操作浏览器：打开网页、点击、填表、抓取内容。",
    package: "changhong.aicraft.webwright",
    repository: "https://github.com/anomalyco/opencode/tree/dev/plugins/webwright",
    bundle: { file: "changhong.aicraft.webwright-2.3.1.exc", format: "exc" },
    skills: [{ name: "Webwright", description: "用 webwright.* 工具操作专用浏览器。" }],
  },
]

/** What the server reports once that bundle is unpacked into the plugins directory. */
export const webwrightInstalled: PluginInfo[] = [
  {
    id: "changhong.aicraft.webwright",
    source: { type: "local", path: "plugins/webwright" },
    features: { server: true },
    state: { status: "active" },
    display: {
      name: "Webwright",
      description: "让 AI 直接操作浏览器：打开网页、点击、填表、抓取内容。",
      category: "automation",
      skills: [{ id: "webwright", name: "Webwright", description: "用 webwright.* 工具操作专用浏览器。" }],
      tools: ["webwright.*"],
    },
  },
]

/** A plugin that failed to load, with the long error and the reference core records. */
export const failedInstalled: PluginInfo[] = [
  {
    id: "opencode.broken",
    source: { type: "local", path: "plugins/opencode.broken" },
    features: { server: true },
    state: {
      status: "failed",
      error:
        "Tool transform failed: acme.search has no input schema\n    at Tool.transform (tool.ts:120:9)\n    at Plugin.start (plugin.ts:88:5)",
      ref: "err_1a2b3c4d",
    },
  },
]

/** A web window: it offers no debug-log export, so the failure block shows the summary, stack and reference only. */
const webPlatform: Platform = {
  platform: "web",
  openExternal: () => undefined,
  restart: async () => undefined,
  notify: async () => undefined,
}

/**
 * Mounts the real market list over fixture data. A row opens that entry's own page the way the explore route does,
 * and the page's back button returns to the list.
 */
export function mountExplorePlugins(input?: {
  catalog?: readonly CatalogPlugin[]
  installed?: readonly PluginInfo[]
  selected?: PluginInfo
}) {
  const catalog = input?.catalog ?? sample
  const installed = input?.installed ?? []
  const [open, setOpen] = createSignal<string | undefined>(input?.selected ? `installed:${input.selected.id}` : undefined)

  const host = document.createElement("div")
  host.dataset.testid = "explore-plugins-fixture"
  host.style.cssText = "position:fixed;inset:24px;display:flex;flex-direction:column;min-height:0;overflow:hidden"
  document.body.appendChild(host)

  const entries = (): MarketEntry[] => [
    ...installed.map((plugin, index): MarketEntry => {
      const name = plugin.display?.name ?? plugin.id ?? ""

      return {
        key: `installed:${plugin.id}`,
        name,
        description: plugin.display?.description ?? "",
        source: { kind: "local", label: "Local" },
        tone: index % 8,
        icon: plugin.display?.icon,
        glyph: "plugin",
        failed: plugin.state.status === "failed",
        label: `${name}, from Local, installed`,
        open: () => setOpen(`installed:${plugin.id}`),
      }
    }),
    ...catalog
      .filter((entry) => !installed.some((plugin) => plugin.id === entry.id))
      .map(
        (entry, index): MarketEntry => ({
          key: `catalog:${entry.id}`,
          name: entry.name,
          description: entry.description,
          source: { kind: "available", label: "Available" },
          tone: index % 8,
          icon: entry.icon,
          glyph: "plugin",
          failed: false,
          label: `${entry.name}, from Available, not installed`,
          open: () => setOpen(`catalog:${entry.id}`),
        }),
      ),
  ]

  const groups = (): MarketGroup[] => [{ key: "fixture", title: "Plugins", entries: entries() }]

  // The real route swaps the list for the entry's own page, so the fixture renders exactly one of the two.
  const list = () => (
    <ExploreMarket
      sectionKey="plugins"
      tabsLabel="Resource type"
      tabs={[]}
      title="Plugins"
      description=""
      query=""
      searchPlaceholder="Search plugins"
      searchLabel="Search plugins"
      onQuery={() => undefined}
      setField={() => undefined}
      refreshLabel="Refresh"
      refreshing={false}
      onRefresh={() => undefined}
      addLabel="Add"
      onAdd={() => undefined}
      loading={false}
      groups={groups()}
      emptyTitle="No matching plugins"
      emptyHint="Try a shorter keyword."
    />
  )

  const page = (key: string) => {
    const [kind, id] = key.split(":")

    if (kind === "installed") {
      const plugin = installed.find((plugin) => plugin.id === id)

      return plugin ? <InstalledPluginDetail plugin={plugin} /> : undefined
    }

    const entry = catalog.find((entry) => entry.id === id)

    return entry ? <CatalogPluginDetail entry={entry} /> : undefined
  }

  const dispose = render(
    () => (
      <LanguageProvider locale="en">
        <PlatformProvider value={webPlatform}>
          <Show when={open()} fallback={list()}>
            {(key) => page(key())}
          </Show>
        </PlatformProvider>
      </LanguageProvider>
    ),
    host,
  )

  return {
    host,
    unmount: () => {
      dispose()
      host.remove()
    },
  }
}
