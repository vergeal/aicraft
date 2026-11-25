import { createEffect, For, on, onCleanup, onMount, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Icon } from "@aicraft/ui/icon"
import type { IconName } from "@aicraft/ui/icons/catalog"
import { MainSurface } from "@aicraft/aix/gui"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useLanguage } from "@/runtime/i18n/language"
import { usePluginHost } from "@/runtime/plugin/host"
import { mainSurfaceEntries, mainSurfacePath } from "@/runtime/plugin/main-surface"
import { useSettingsDialog } from "@/settings/command"
import { preloadSettings } from "@/settings/preload"
import { preloadRoute, preloadRoutes } from "@/shell/routes/preload"
import { useTabs } from "@/shell/tabs/tabs"
import { useLayout } from "@/shell/state/layout"
import { createSessionInbox } from "@/shell/titlebar/inbox-model"

type Destination = {
  id: "inbox" | "scheduled" | "explore" | "knowledge"
  icon: IconName
  labelKey: string
  path: string
}

/** The first-level destinations, rendered as rows at the top of the sidebar. */
const DESTINATIONS: readonly Destination[] = [
  { id: "inbox", icon: "rail-inbox", labelKey: "replica.rail.inbox", path: "/inbox" },
  { id: "scheduled", icon: "rail-history", labelKey: "replica.rail.scheduled", path: "/scheduled" },
  { id: "knowledge", icon: "rail-library", labelKey: "replica.rail.knowledge", path: "/knowledge" },
  { id: "explore", icon: "rail-compass", labelKey: "replica.rail.explore", path: "/explore" },
]

/**
 * How long after the rail mounts its destinations start warming. Until then the window is busy with the route it
 * restored, the session list and the plugin bundles — pages the user is looking at, or waiting on. The rail's own
 * pages come after them, one chunk at a time, in the order the rail lists them.
 */
const WARM_DELAY_MS = 1800

const ROW =
  "flex h-8 w-full items-center gap-1.5 rounded-[var(--radius-row)] px-2 text-start text-[13px] leading-5 text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] data-[state=pressed]:bg-[var(--color-selected)] data-[state=pressed]:text-[var(--color-text-primary)]"

/* 未读/待办角标：11/16 白字、鲜红实心。红取 red-600 而非 red-800——后者在浅色下几乎黑红，小字读不出来。
   字重 500：11px 的 600 在 macOS 的 grayscale 抗锯齿下发虚，500 更锐利。
   文字色必须走 --v2-text-text-contrast：Tailwind 的调色板被 `--color-*: initial` 清空，`text-white` 不生成，
   浅色下会落回行内的 secondary 灰字，压在红底上几乎看不清。 */
const BADGE =
  "shrink-0 rounded-full bg-[var(--v2-red-600)] px-1 text-[11px] font-medium leading-4 text-v2-text-text-contrast tabular-nums [[data-color-scheme=dark]_&]:bg-[var(--v2-red-700)]"

/** Opens a draft in the most recent project: the sidebar's primary button starts here. */
export function useNewSessionDraft() {
  const global = useGlobal()
  const tabs = useTabs()

  return () => {
    const conn = global.servers.list()[0]

    if (!conn) return
    const key = ServerConnection.key(conn)
    const ctx = global.serverCtx(key)

    if (!ctx) return
    const directory = ctx.projects.last()?.worktree ?? ctx.projects.list()[0]?.worktree

    if (!directory) return
    void tabs.openDraft({ server: key, directory })
  }
}

/** The sidebar's first-level navigation: the app's destinations, then the plugins' main surfaces. */
export function ReplicaPrimaryNav() {
  const language = useLanguage()
  const layout = useLayout()
  const navigate = useNavigate()
  const inbox = createSessionInbox()
  const host = usePluginHost()

  const pending = () =>
    inbox.entries().filter((entry) => entry.status === "approval" || entry.status === "input").length

  const surfaces = () => mainSurfaceEntries(host.items(MainSurface))

  // Warming an already warm route is a cached promise, so the rows below can call this on every pointer entry.
  const warm = (path: string) => void preloadRoute(path)

  // The whole rail warms in the background too, so a page the user reaches for without ever hovering its row still
  // opens on the click rather than on the download.
  onMount(() => {
    const timer = setTimeout(() => void preloadRoutes(DESTINATIONS.map((item) => item.path)), WARM_DELAY_MS)
    onCleanup(() => clearTimeout(timer))
  })

  // A plugin row only exists once its bundle has activated, so the plugin's own code is already loaded. What is left
  // is the shared surface screen, and the first row warms it for every one of them.
  createEffect(
    on(
      () => surfaces()[0],
      (first) => {
        if (first) warm(mainSurfacePath(first.plugin, first.value.id))
      },
      { defer: true },
    ),
  )

  const active = (id: Destination["id"]) => layout.route().type === id

  const pluginActive = (plugin: string, id: string) => {
    const route = layout.route()

    return route.type === "plugin" && route.plugin === plugin && route.surface === id
  }

  return (
    <nav
      data-slot="replica-primary-nav"
      data-ui="primary-nav"
      aria-label={language.t("replica.rail.label")}
      class="flex shrink-0 flex-col gap-0.5 px-2 pb-2"
    >
      <For each={DESTINATIONS}>
        {(item) => (
          <button
            type="button"
            data-replica-control
            data-state={active(item.id) ? "pressed" : undefined}
            aria-current={active(item.id) ? "page" : undefined}
            class={ROW}
            onPointerEnter={(event) => event.pointerType !== "touch" && warm(item.path)}
            onFocus={() => warm(item.path)}
            onClick={() => navigate(item.path)}
          >
            <Icon name={item.icon} class="size-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{language.t(item.labelKey)}</span>
            <Show when={item.id === "inbox" && pending() > 0}>
              <span class={BADGE} aria-hidden="true">
                {pending()}
              </span>
            </Show>
          </button>
        )}
      </For>
      <For each={surfaces()}>
        {(item) => (
          <button
            type="button"
            data-replica-control
            data-state={pluginActive(item.plugin, item.value.id) ? "pressed" : undefined}
            aria-current={pluginActive(item.plugin, item.value.id) ? "page" : undefined}
            class={ROW}
            onPointerEnter={(event) =>
              event.pointerType !== "touch" && warm(mainSurfacePath(item.plugin, item.value.id))
            }
            onFocus={() => warm(mainSurfacePath(item.plugin, item.value.id))}
            onClick={() => navigate(mainSurfacePath(item.plugin, item.value.id))}
          >
            <Icon name={item.value.icon} class="size-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{item.value.title}</span>
            <Show when={item.value.badge?.()} keyed>
              {(count) => (
                <Show when={count > 0}>
                  <span class={BADGE} aria-hidden="true">
                    {count}
                  </span>
                </Show>
              )}
            </Show>
          </button>
        )}
      </For>
    </nav>
  )
}

/** The account row: which server this window talks to, and the way into settings. */
export function ReplicaPrimaryFooter() {
  const language = useLanguage()
  const global = useGlobal()
  const servers = useServers()
  const openSettings = useSettingsDialog()

  const conn = () => servers.list[0]

  const healthy = () => {
    const item = conn()

    return !!item && global.servers.health[ServerConnection.key(item)]?.type === "healthy"
  }

  const status = () => {
    const item = conn()

    if (!item || !healthy()) return language.t("replica.account.reconnecting")

    return language.t("replica.account.connected")
  }

  return (
    <div data-slot="replica-primary-footer" class="flex shrink-0 items-center px-2 pb-2">
      <button
        type="button"
        data-replica-control
        data-slot="replica-account"
        aria-label={language.t("replica.rail.settings")}
        class="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-row)] px-1.5 text-start transition-colors hover:bg-[var(--color-hover)] focus-visible:bg-[var(--color-hover)] focus-visible:outline-none"
        onPointerEnter={(event) => event.pointerType !== "touch" && preloadSettings()}
        onFocus={preloadSettings}
        onClick={openSettings}
      >
        <img
          src="/assets/product-mark.png"
          alt=""
          aria-hidden="true"
          width="32"
          height="32"
          class="size-8 shrink-0 rounded-full object-cover shadow-[inset_0_0_0_0.5px_var(--color-border)]"
        />
        <span class="min-w-0 flex-1 truncate text-[13px] leading-4 text-[var(--color-text-primary)]">{status()}</span>
        <span
          aria-hidden="true"
          data-state={healthy() ? "online" : "offline"}
          class="size-1.5 shrink-0 rounded-full bg-[var(--v2-state-fg-success)] data-[state=offline]:bg-[var(--v2-state-fg-warning)]"
        />
      </button>
    </div>
  )
}
