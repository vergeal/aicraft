import { createEffect, createSignal, lazy, onCleanup, Show, Suspense, type ParentProps } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { useDialog } from "@opencode/ui/context/dialog"
import { ToastRegion } from "@/shell/notifications/toast"
import { UploadToastHost } from "@/composer/attachments/uploads"
import { useSettings } from "@/settings/model"
import { useSettingsDialog } from "@/settings/command"
import { PluginServerCover } from "@/runtime/plugin/server-shell"
import { PluginSlot } from "@/runtime/plugin/render"
import { COMMAND_SEARCH_ID, useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useTabs, type DraftTab } from "@/shell/tabs/tabs"
import { useLayout } from "@/shell/state/layout"
import { useNavigate } from "@solidjs/router"
import { ResizeHandle } from "@opencode/ui/resize-handle"
import { DestinationToggle } from "@/shell/titlebar/destination-toggle"
import { createSessionInbox } from "@/shell/titlebar/inbox-model"
import { ExploreInstalledProvider } from "@/explore/installed"
import { InboxProvider } from "@/inbox/context"
import { KnowledgeProvider } from "@/knowledge/context"
import { ScheduledProvider } from "@/scheduled/context"
import { ReplicaRail } from "./replica/rail"
import { ReplicaSidebar } from "./replica/sidebar"
import { ReplicaTitleBar } from "./replica/titlebar"
import "./replica/replica.css"

const DraftPage = lazy(() => import("@/new-session/route").then((module) => ({ default: module.DraftPage })))

export const sidebarToggleCommand = { id: "sidebar.toggle", keybind: "mod+shift+b" }

/**
 * The replica workbench frame: a 27px window bar over a 36px rail, a 239px sidebar and the remaining white
 * canvas. Pages keep their routes and data; the empty home route shows the new-conversation welcome.
 */
export default function Layout(props: ParentProps) {
  return (
    <InboxProvider>
      <ScheduledProvider>
        <KnowledgeProvider>
          <ExploreInstalledProvider>
            <ReplicaLayer {...props} />
          </ExploreInstalledProvider>
        </KnowledgeProvider>
      </ScheduledProvider>
    </InboxProvider>
  )
}

/**
 * Home is the new-chat page itself: the ChangHong wordmark and the composer, rendered in place instead of a
 * separate welcome screen. It opens the most recent draft, or starts one when none is open.
 */
function HomeNewChat() {
  const tabs = useTabs()
  const global = useGlobal()
  const [draft, setDraft] = createSignal<DraftTab>()

  createEffect(() => {
    if (!tabs.ready()) return

    const open = tabs.store.findLast((tab): tab is DraftTab => tab.type === "draft")

    if (open) {
      setDraft(open)

      return
    }

    const conn = global.servers.list()[0]
    if (!conn) return
    const ctx = global.serverCtx(ServerConnection.key(conn))
    if (!ctx) return

    const directory = ctx.projects.last()?.worktree ?? ctx.projects.list()[0]?.worktree
    if (!directory) return

    void tabs
      .newDraft({ server: ServerConnection.key(conn), directory }, undefined, undefined, { navigate: false })
      .then((tab) => setDraft(tab))
  })

  return (
    <Show when={draft()}>
      {(value) => (
        <Suspense>
          <DraftPage draft={value()} />
        </Suspense>
      )}
    </Show>
  )
}

function ReplicaLayer(props: ParentProps) {
  const preferences = useSettings()
  const command = useCommand()
  const language = useLanguage()
  const platform = usePlatform()
  const openSettings = useSettingsDialog()
  const dialog = useDialog()
  const global = useGlobal()
  const servers = useServers()
  const tabs = useTabs()
  const layout = useLayout()
  const navigate = useNavigate()
  const mobile = createMediaQuery("(max-width: 767px)")
  const sessionInbox = createSessionInbox()

  const pendingInbox = () =>
    sessionInbox
      .entries()
      .filter((entry) => entry.status === "approval" || entry.status === "input" || entry.status === "failed").length

  // The v6 column is 300px until dragging pins an explicit width, so the resize handle starts from the width
  // the sidebar is really laid out at instead of snapping to another value on the first move.
  // The macOS window sits on a blurred material, so the page root drops its opaque theme fill and the
  // translucent frame shows the desktop instead. Other platforms keep the painted background.
  createEffect(() => {
    document.documentElement.dataset.replicaWindow =
      platform.platform === "desktop" && platform.os === "macos" ? "translucent" : "opaque"
    // The frame height differs per OS, so the stylesheet sizes the window bar from the platform, not the viewport.
    if (platform.platform === "desktop" && platform.os) document.documentElement.dataset.os = platform.os
  })

  const sidebarWidth = () => preferences.appearance.sidebarWidth()
  const [resizing, setResizing] = createSignal(false)
  // The handle clamps while dragging; clamp again so an edited store cannot push the column out of range.
  const sidebarSize = () => Math.min(Math.max(sidebarWidth(), 220), 480)

  let root: HTMLDivElement | undefined
  let draggingWidth: number | undefined
  let dragTitlebar: HTMLElement | undefined
  let frame = 0

  // Dragging writes the slot's own flex-basis, coalesced to one write per frame. The root variable is left alone:
  // changing an inherited custom property invalidates the whole tree's style, which is the cost this avoids.
  const writeSidebarWidth = (width: number) => {
    const next = Math.round(width / 2) * 2

    if (next === draggingWidth) return
    draggingWidth = next

    if (frame) return

    frame = requestAnimationFrame(() => {
      frame = 0

      if (draggingWidth === undefined) return
      const slot = root?.querySelector<HTMLElement>('[data-slot="replica-sidebar-slot"]')
      if (slot) slot.style.flexBasis = showSidebar() ? `${draggingWidth}px` : "0px"
      // Same frame and the same rounded value as the slot, so the titlebar edge never trails the sidebar by a pixel.
      dragTitlebar?.style.setProperty("--drag-sidebar-current", `${draggingWidth}px`)
    })
  }

  const commitSidebarWidth = () => {
    if (frame) {
      cancelAnimationFrame(frame)
      frame = 0
    }

    const width = draggingWidth
    draggingWidth = undefined

    // Commit first, then drop the dragging override: removing it while the root still held the old width would revert
    // the column to that width for a frame.
    if (width !== undefined) preferences.appearance.setSidebarWidth(width)

    const slot = root?.querySelector<HTMLElement>('[data-slot="replica-sidebar-slot"]')
    slot?.style.removeProperty("flex-basis")
  }

  // While the pointer drags, the two columns keep the content width they started with and only their visible box
  // changes, so rows never rewrap mid-drag; the committed width is applied once on release. Each variable is written on
  // the element that consumes it, not on the shell root: an inherited custom property invalidates the whole subtree.
  // The titlebar is the one exception: its left column follows the drag so the title stays level with the sidebar edge.
  const freezeColumns = () => {
    const sidebar = root?.querySelector<HTMLElement>('[data-slot="replica-sidebar"]')
    const main = root?.querySelector<HTMLElement>('[data-slot="replica-main"]')
    dragTitlebar = root?.querySelector<HTMLElement>('[data-slot="replica-titlebar"]') ?? undefined

    if (sidebar) sidebar.style.setProperty("--drag-sidebar-width", `${sidebar.offsetWidth}px`)
    if (main) main.style.setProperty("--drag-main-width", `${main.offsetWidth}px`)
    // Seeded with the width the resting stylesheet already gives the column, so the first move does not jump.
    dragTitlebar?.style.setProperty("--drag-sidebar-current", `${sidebarSize()}px`)
  }

  const releaseColumns = () => {
    root?.querySelector<HTMLElement>('[data-slot="replica-sidebar"]')?.style.removeProperty("--drag-sidebar-width")
    root?.querySelector<HTMLElement>('[data-slot="replica-main"]')?.style.removeProperty("--drag-main-width")
    dragTitlebar?.style.removeProperty("--drag-sidebar-current")
    dragTitlebar = undefined
  }

  const onDraggingChange = (value: boolean) => {
    setResizing(value)

    if (value) {
      freezeColumns()

      return
    }

    commitSidebarWidth()
    releaseColumns()
  }

  onCleanup(() => {
    if (frame) cancelAnimationFrame(frame)
  })

  const sidebarOpen = () => preferences.appearance.sidebarOpen()
  const toggleSidebar = () => preferences.appearance.setSidebarOpen(!sidebarOpen())
  // Settings ships its own category column and search, so the navigation sidebar would duplicate it.
  const showSidebar = () => !mobile() && sidebarOpen() && layout.route().type !== "settings"
  const welcome = () => layout.route().type === "home"

  command.register("sidebar", () => [
    {
      ...sidebarToggleCommand,
      title: language.t("command.sidebar.toggle"),
      category: language.t("command.category.view"),
      onSelect: toggleSidebar,
    },
  ])

  const destinations = [
    { id: "destination.home", path: "/", titleKey: "home.title", keybind: "mod+1" },
    { id: "destination.inbox", path: "/inbox", titleKey: "inbox.title", keybind: "mod+2" },
    { id: "destination.knowledge", path: "/knowledge", titleKey: "knowledge.title", keybind: "mod+3" },
    { id: "destination.scheduled", path: "/scheduled", titleKey: "scheduled.title", keybind: "mod+4" },
  ] as const

  command.register("destinations", () =>
    destinations.map((item) => ({
      id: item.id,
      title: language.t(item.titleKey),
      category: language.t("command.category.view"),
      keybind: item.keybind,
      onSelect: () => navigate(item.path),
    })),
  )

  command.register("palette", () => [
    {
      id: "command.palette",
      title: language.t("command.palette"),
      hidden: true,
      onSelect: async () => {
        const conn = servers.visible.find((item) => servers.current(item)) ?? servers.visible[0]

        if (!conn) return
        const { HomeCommandPalette } = await import("@/home/start/command-palette")
        void dialog.show(() => (
          <HomeCommandPalette
            server={conn}
            onSelectSession={(entry) => {
              if (!entry.sessionID || !entry.directory || !entry.server) return
              const sessionID = entry.sessionID
              const server = entry.server
              global.serverCtx(server)?.projects.touch(entry.project?.worktree ?? entry.directory)
              void tabs.select(tabs.addSessionTab({ server, sessionId: sessionID }))
            }}
          />
        ))
      },
    },
  ])
  command.register("commands", () => [
    {
      id: COMMAND_SEARCH_ID,
      title: language.t("command.commands.search"),
      category: language.t("command.category.view"),
      onSelect: async () => {
        const { DialogCommandSearch } = await import("@/shell/commands/command-search")
        void dialog.show(() => <DialogCommandSearch />)
      },
    },
  ])

  const newChat = () => {
    const conn = global.servers.list()[0]

    if (!conn) return
    const key = ServerConnection.key(conn)
    const ctx = global.serverCtx(key)

    if (!ctx) return
    const directory = ctx.projects.last()?.worktree ?? ctx.projects.list()[0]?.worktree

    if (!directory) return
    void tabs.newDraft({ server: key, directory })
  }

  return (
    <div
      ref={root}
      data-replica
      class="relative flex min-h-0 min-w-0 flex-1 select-none flex-col [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      data-resizing={resizing() ? "" : undefined}
      style={{
        "--navigation-sidebar-width-current": showSidebar() ? `${sidebarSize()}px` : "0px",
      }}
    >
      <ReplicaTitleBar
        sidebarOpen={sidebarOpen()}
        onToggleSidebar={toggleSidebar}
        onMore={() => command.trigger("command.palette")}
        onView={openSettings}
        onAdd={newChat}
      />

      <div data-slot="replica-shell">
        <Show when={!mobile()}>
          <ReplicaRail />
        </Show>

        <div data-slot="replica-workbench">
          <div
            data-slot="replica-sidebar-slot"
            data-collapsed={showSidebar() ? undefined : ""}
            class="relative flex min-h-0 min-w-0"
          >
            <ReplicaSidebar />
            <Show when={showSidebar()}>
              <ResizeHandle
                direction="horizontal"
                edge="end"
                size={sidebarSize()}
                min={220}
                max={480}
                onResize={writeSidebarWidth}
                onDraggingChange={onDraggingChange}
              />
            </Show>
          </div>

          <main
            data-slot="replica-main"
            data-ui="main-workspace"
            class="relative flex min-h-0 min-w-0 flex-col"
            style={{
              "--shell-inline-inset": "0px",
              "--shell-top-inset": "0px",
              "--shell-bottom-inset": "0px",
              "--shell-panel-radius": "0px",
            }}
          >
            <Show
              when={welcome()}
              fallback={
                <PluginServerCover>
                  <Suspense>{props.children}</Suspense>
                </PluginServerCover>
              }
            >
              <HomeNewChat />
            </Show>
          </main>
        </div>
      </div>

      <Show when={mobile()}>
        <nav
          data-slot="destination-bar"
          class="relative z-10 flex shrink-0 items-stretch border-t border-[var(--color-divider)] bg-[var(--color-titlebar)] px-2 pt-1 pb-[env(safe-area-inset-bottom,0px)] [height:calc(52px+env(safe-area-inset-bottom,0px))] [&_[data-slot=destination-toggle]]:h-full [&_button]:h-full"
        >
          <DestinationToggle
            pressed={(id) => layout.route().type === id}
            pending={pendingInbox()}
            onSelect={(id) => navigate(id === "home" ? "/" : `/${id}`)}
          />
        </nav>
      </Show>

      <div data-slot="composer-touch-bar-mount" class="order-last shrink-0" />
      <PluginSlot at="window.bottom" input={{}} />
      <ToastRegion />
      <UploadToastHost />
    </div>
  )
}
