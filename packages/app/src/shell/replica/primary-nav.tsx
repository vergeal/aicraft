import { For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Icon } from "@opencode/ui/icon"
import type { IconName } from "@opencode/ui/icons/catalog"
import { MainSurface } from "@opencode/plugin/gui"
import { Tooltip } from "@opencode/ui/tooltip"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useLanguage } from "@/runtime/i18n/language"
import { usePluginHost } from "@/runtime/plugin/host"
import { mainSurfaceEntries, mainSurfacePath } from "@/runtime/plugin/main-surface"
import { useSettingsDialog } from "@/settings/command"
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

const ROW =
  "flex h-8 w-full items-center gap-1.5 rounded-[var(--radius-row)] px-2 text-start text-[13px] leading-5 text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] data-[state=pressed]:bg-[var(--color-selected)] data-[state=pressed]:text-[var(--color-text-primary)]"

const ICON_BUTTON =
  "flex size-[30px] shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-icon-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-icon-primary)] data-[state=pressed]:bg-[var(--color-selected)] data-[state=pressed]:text-[var(--color-icon-primary)]"

const BADGE = "shrink-0 rounded-full bg-[var(--color-accent-blue)] px-1.5 text-[11px] leading-4 text-white tabular-nums"

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

/** The account row: which server this window talks to, the model in use, and the way into settings. */
export function ReplicaPrimaryFooter() {
  const language = useLanguage()
  const layout = useLayout()
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

    return servers.local(item)
      ? language.t("replica.account.connectedLocal")
      : language.t("replica.account.connected", { name: servers.label(item) })
  }
  const model = () => global.models.store.recent[0]?.modelID

  return (
    <div data-slot="replica-primary-footer" class="flex shrink-0 items-center gap-1 px-2 pb-2">
      <button
        type="button"
        data-replica-control
        data-slot="replica-account"
        aria-label={language.t("replica.rail.settings")}
        class="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-row)] px-1.5 text-start transition-colors hover:bg-[var(--color-hover)] focus-visible:bg-[var(--color-hover)] focus-visible:outline-none"
        onClick={openSettings}
      >
        <img
          src="/assets/product-mark.png"
          alt=""
          aria-hidden="true"
          width="20"
          height="20"
          class="size-5 shrink-0 rounded-full object-cover shadow-[inset_0_0_0_0.5px_var(--color-border)]"
        />
        <span class="flex min-w-0 flex-1 flex-col gap-px">
          <span class="truncate text-[13px] leading-4 text-[var(--color-text-primary)]">{status()}</span>
          <Show when={model()}>
            <span class="truncate text-[12px] leading-4 text-[var(--color-text-tertiary)]">{model()}</span>
          </Show>
        </span>
        <span
          aria-hidden="true"
          data-state={healthy() ? "online" : "offline"}
          class="size-1.5 shrink-0 rounded-full bg-[var(--v2-state-fg-success)] data-[state=offline]:bg-[var(--v2-state-fg-warning)]"
        />
      </button>
      <Tooltip placement="top" value={language.t("replica.rail.settings")}>
        <button
          type="button"
          data-replica-control
          data-state={layout.route().type === "settings" ? "pressed" : undefined}
          aria-label={language.t("replica.rail.settings")}
          class={ICON_BUTTON}
          onClick={openSettings}
        >
          <Icon name="settings-gear" />
        </button>
      </Tooltip>
    </div>
  )
}
