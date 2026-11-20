import type { PluginInfo } from "@opencode/client"
import { createSignal, For, Show } from "solid-js"
import { render } from "solid-js/web"
import type { CatalogPlugin } from "../src/explore/catalog"
import {
  CatalogPluginCard,
  CatalogPluginDetail,
  InstalledPluginCard,
  InstalledPluginDetail,
} from "../src/explore/plugins"
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

/** A discoverable bundle: it ships as one `.craf` file, so the card shows the bundle instead of a package. */
export const webwrightCatalog: CatalogPlugin[] = [
  {
    id: "opencode.webwright",
    name: "Webwright",
    category: "automation",
    author: "OpenCode",
    description: "让 AI 直接操作浏览器：打开网页、点击、填表、抓取内容。",
    package: "opencode.webwright",
    repository: "https://github.com/anomalyco/opencode/tree/dev/plugins/webwright",
    bundle: { file: "opencode.webwright-2.2.5.craf", format: "craf" },
    skills: [{ name: "Webwright", description: "用 webwright.* 工具操作专用浏览器。" }],
  },
]

/** What the server reports once that bundle is unpacked into the plugins directory. */
export const webwrightInstalled: PluginInfo[] = [
  {
    id: "opencode.webwright",
    source: { type: "local", path: "plugins/opencode.webwright" },
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
 * Mounts the real plugin rows over fixture data. A row opens that plugin's own page the way the explore route does,
 * and the page's back button returns to the list.
 */
export function mountExplorePlugins(input?: {
  catalog?: readonly CatalogPlugin[]
  installed?: readonly PluginInfo[]
  selected?: PluginInfo
}) {
  const catalog = input?.catalog ?? sample
  const installed = input?.installed ?? []
  const [open, setOpen] = createSignal<string | undefined>(
    input?.selected ? `installed:${input.selected.id}` : undefined,
  )

  const host = document.createElement("div")
  host.dataset.testid = "explore-plugins-fixture"
  host.style.cssText = "position:fixed;inset:24px;display:flex;flex-direction:column;min-height:0;overflow:hidden"
  document.body.appendChild(host)

  // The real route swaps the list for the entry's own page, so the fixture renders exactly one of the two.
  const list = () => (
    <>
      <For each={installed}>
        {(plugin) => <InstalledPluginCard plugin={plugin} onOpen={() => setOpen(`installed:${plugin.id}`)} />}
      </For>
      <For each={catalog.filter((entry) => !installed.some((plugin) => plugin.id === entry.id))}>
        {(entry) => <CatalogPluginCard entry={entry} onOpen={() => setOpen(`catalog:${entry.id}`)} />}
      </For>
    </>
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
