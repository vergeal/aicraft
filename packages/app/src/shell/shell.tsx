import { createEffect, createSignal, lazy, onCleanup, Show, Suspense, type ParentProps } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { useDialog } from "@opencode/ui/context/dialog"
import { ToastRegion } from "@/shell/notifications/toast"
import { UploadToastHost } from "@/composer/attachments/uploads"
import { useSettings } from "@/settings/model"
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
import { ReplicaSidebar } from "./replica/sidebar"
import { ReplicaTitleBar } from "./replica/titlebar"
import "./replica/replica.css"

const DraftPage = lazy(() => import("@/new-session/route").then((module) => ({ default: module.DraftPage })))

export const sidebarToggleCommand = { id: "sidebar.toggle", keybind: "mod+shift+b" }

/**
 * The replica frame is two full-height columns: the navigation sidebar on the left and the content on the right,
 * separated by a hairline instead of a card edge. Pages keep their routes and data; the empty home route shows the
 * new-conversation welcome.
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
  // Every desktop window sits on a system material, so the page root drops its opaque theme fill and the translucent
  // frame shows the desktop instead: macOS vibrancy, Windows acrylic, and the compositor's blur on Linux. Web keeps
  // the painted background, because a browser tab has no material behind it.
  createEffect(() => {
    document.documentElement.dataset.replicaWindow = platform.platform === "desktop" ? "translucent" : "opaque"
    // The frame height differs per OS, so the stylesheet sizes the window bar from the platform, not the viewport.
    if (platform.platform === "desktop" && platform.os) document.documentElement.dataset.os = platform.os
  })

  // The traffic lights sit in the top-left corner of the sidebar header. That header starts at the window's top edge and
  // is a fixed 44px tall, so the buttons' centre is always 22px down and needs no DOM measurement.
  const mac = () => platform.platform === "desktop" && platform.os === "macos"
  // Windows shows the workspace as an inset rounded panel under the chrome, the way the reference apps do.
  const windows = () => platform.platform === "desktop" && platform.os === "windows"

  createEffect(() => {
    if (!mac()) return

    const scale = platform.webviewZoom?.() ?? 1

    void platform.setTrafficLightsPosition?.({ x: 14, y: Math.round(22 * scale - 7) })
  })

  // Hand the buttons back at the window's default position when the shell unmounts.
  onCleanup(() => {
    if (!mac()) return
    void platform.setTrafficLightsPosition?.({ x: 14, y: 14 })
  })

  const sidebarWidth = () => preferences.appearance.sidebarWidth()
  const [resizing, setResizing] = createSignal(false)
  // The handle clamps while dragging; clamp again so an edited store cannot push the column out of range.
  const sidebarSize = () => Math.min(Math.max(sidebarWidth(), 220), 480)

  let root: HTMLDivElement | undefined
  let draggingWidth: number | undefined
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

  // Every column follows the pointer live: the sidebar slot and the main column are flex items, so both reflow each
  // frame of the drag and land where the pointer leaves them. No extra variable is written for the topbar, which now
  // lives inside the content column and follows it for free.
  const onDraggingChange = (value: boolean) => {
    setResizing(value)

    if (!value) commitSidebarWidth()
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

  return (
    <div
      ref={root}
      data-replica
      class="relative flex min-h-0 min-w-0 flex-1 select-none flex-col [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      data-resizing={resizing() ? "" : undefined}
      style={{
        "--navigation-sidebar-width-current": showSidebar() ? `${sidebarSize()}px` : "0px",
        /* Windows fills the workspace to the window edges and keeps only a rounded top-left corner, the way the
           reference apps do. The values live on the shell root so the sidebar hairline and the workspace share one
           origin. */
        "--shell-inline-inset": "0px",
        "--shell-top-inset": "0px",
        "--shell-bottom-inset": "0px",
        "--shell-panel-radius": windows() ? "12px" : "0px",
      }}
    >
      <div data-slot="replica-shell">
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
        >
          <ReplicaTitleBar sidebarOpen={sidebarOpen()} />

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
