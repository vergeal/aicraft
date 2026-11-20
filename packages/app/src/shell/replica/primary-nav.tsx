import { For, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Icon } from "@opencode/ui/icon"
import type { IconName } from "@opencode/ui/icons/catalog"
import { Tooltip } from "@opencode/ui/tooltip"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useLanguage } from "@/runtime/i18n/language"
import { useCommand } from "@/shell/commands/command"
import { useSettingsDialog } from "@/settings/command"
import { useTabs } from "@/shell/tabs/tabs"
import { useLayout } from "@/shell/state/layout"
import { createSessionInbox } from "@/shell/titlebar/inbox-model"

type Destination = {
  id: "new-session" | "inbox" | "scheduled" | "explore" | "knowledge"
  icon: IconName
  labelKey: string
  path: string
}

/** The first-level destinations, rendered as rows at the top of the sidebar. */
const DESTINATIONS: readonly Destination[] = [
  { id: "new-session", icon: "bubble-5", labelKey: "replica.rail.newSession", path: "/" },
  { id: "inbox", icon: "rail-inbox", labelKey: "replica.rail.inbox", path: "/inbox" },
  { id: "scheduled", icon: "rail-history", labelKey: "replica.rail.scheduled", path: "/scheduled" },
  { id: "knowledge", icon: "rail-library", labelKey: "replica.rail.knowledge", path: "/knowledge" },
  { id: "explore", icon: "rail-compass", labelKey: "replica.rail.explore", path: "/explore" },
]

const ROW =
  "flex h-8 w-full items-center gap-2.5 rounded-[var(--radius-row)] px-2 text-start text-[13px] leading-5 text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-primary)] data-[state=pressed]:bg-[var(--color-selected)] data-[state=pressed]:text-[var(--color-text-primary)]"

const ICON_BUTTON =
  "flex size-[30px] shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-icon-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-icon-primary)] data-[state=pressed]:bg-[var(--color-selected)] data-[state=pressed]:text-[var(--color-icon-primary)]"

/** The sidebar's first-level navigation: five destinations stacked under the header. */
export function ReplicaPrimaryNav() {
  const language = useLanguage()
  const layout = useLayout()
  const global = useGlobal()
  const navigate = useNavigate()
  const tabs = useTabs()
  const inbox = createSessionInbox()

  const pending = () =>
    inbox.entries().filter((entry) => entry.status === "approval" || entry.status === "input").length

  const active = (id: Destination["id"]) => {
    if (id === "new-session") return layout.route().type === "draft"

    return layout.route().type === id
  }

  // The first destination opens a fresh draft; the conversation list below is where open sessions live.
  const newSession = () => {
    const conn = global.servers.list()[0]

    if (!conn) return
    const key = ServerConnection.key(conn)
    const ctx = global.serverCtx(key)

    if (!ctx) return
    const directory = ctx.projects.last()?.worktree ?? ctx.projects.list()[0]?.worktree

    if (!directory) return
    void tabs.openDraft({ server: key, directory })
  }

  return (
    <nav
      data-slot="replica-primary-nav"
      data-ui="primary-nav"
      aria-label={language.t("replica.rail.label")}
      class="flex shrink-0 flex-col gap-0.5 px-2 pt-1 pb-2"
    >
      <For each={DESTINATIONS}>
        {(item) => (
          <button
            type="button"
            data-replica-control
            data-state={active(item.id) ? "pressed" : undefined}
            aria-current={active(item.id) ? "page" : undefined}
            class={ROW}
            onClick={() => (item.id === "new-session" ? newSession() : navigate(item.path))}
          >
            <Icon name={item.icon} class="size-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{language.t(item.labelKey)}</span>
            <Show when={item.id === "inbox" && pending() > 0}>
              <span
                class="shrink-0 rounded-full bg-[var(--color-accent-blue)] px-1.5 text-[11px] leading-4 text-white tabular-nums"
                aria-hidden="true"
              >
                {pending()}
              </span>
            </Show>
          </button>
        )}
      </For>
    </nav>
  )
}

/** Updates and settings, pinned to the bottom of the sidebar. */
export function ReplicaPrimaryFooter() {
  const language = useLanguage()
  const layout = useLayout()
  const command = useCommand()
  const openSettings = useSettingsDialog()

  return (
    <div data-slot="replica-primary-footer" class="flex shrink-0 items-center gap-1 px-2 py-2">
      <Tooltip placement="top" value={language.t("replica.rail.updates")}>
        <button
          type="button"
          data-replica-control
          aria-label={language.t("replica.rail.updates")}
          class={`${ICON_BUTTON} text-[var(--color-accent-blue)]`}
          onClick={() => command.trigger("updater.check")}
        >
          <Icon name="rail-download" />
        </button>
      </Tooltip>
      <div class="ms-auto flex items-center">
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
    </div>
  )
}
