import { createEffect, createMemo, createSignal, on, onCleanup, Show, type Accessor } from "solid-js"
import { Schema } from "effect"
import { makeEventListener } from "@solid-primitives/event-listener"
import { Key } from "@solid-primitives/keyed"
import { useNavigate } from "@solidjs/router"
import { DragDropProvider, PointerSensor } from "@dnd-kit/solid"
import { isSortable, useSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers"
import { ActivityRing } from "@opencode/ui/activity-ring"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { Menu } from "@opencode/ui/menu"
import { Tooltip } from "@opencode/ui/tooltip"
import { displayName } from "@opencode/ui/project-avatar"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { usePlatform } from "@/runtime/platform/platform"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { arrayMove } from "@/runtime/array-move"
import { useSettingsSurface } from "@/settings/surface"
import { usePinnedSessions } from "@/session/pins"
import { sessionLabel } from "@/session/title"
import { SessionMenuCopyID, useCopySessionID } from "@/session/menu-items"
import { SessionSettingsDialog } from "@/session/settings-dialog"
import { sessionTreeIDs } from "@/session/requests/session-request-tree"
import { useTabs } from "@/shell/tabs/tabs"
import { useLayout } from "@/shell/state/layout"
import { homeProjectDirectories } from "@/shell/layout/helpers"
import { addProjects } from "@/home/projects/add"
import { useDirectoryPicker } from "@/workspaces/selection/picker"
import { showToast } from "@/shell/notifications/toast"
import { sessionHref } from "@/shell/routes/session"
import { createWorktree } from "@/workspaces/create"
import { createSessionInbox, inboxArchived, type InboxEntry, type InboxStatus } from "@/shell/titlebar/inbox-model"
import { deliveryFrom, playDeliveryFlight, playUndoDrop } from "./envelope-flight"
import { LIST, ROW, SECTION } from "./sidebar-tokens"
import { ReplicaPrimaryFooter, ReplicaPrimaryNav, useNewSessionDraft } from "./primary-nav"
import { createdFrom, creatorName, playBranchGrowth } from "./session-branch"
import { replicaRow } from "./overlay"

const DOT: Record<Exclude<InboxStatus, "ready" | "working">, string> = {
  approval: "bg-[var(--v2-state-fg-warning)]",
  input: "bg-[var(--v2-state-fg-warning)]",
  failed: "bg-[var(--v2-state-fg-danger)]",
  done: "bg-[var(--v2-state-fg-success)]",
}

const STATUS_LABEL = {
  approval: "sidebar.inbox.status.approval",
  input: "sidebar.inbox.status.input",
  working: "sidebar.inbox.status.working",
  failed: "sidebar.inbox.status.failed",
  done: "sidebar.inbox.status.done",
} as const

const RECENT_GROUP = "replica-sidebar-recent"

/** The workspace head's actions: 24px targets, so the three sit quietly beside one 13px label. */
const HEAD_BUTTON =
  "flex size-6 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-icon-secondary)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-icon-primary)] data-[state=pressed]:bg-[var(--color-selected)] data-[state=pressed]:text-[var(--color-icon-primary)]"

/**
 * Sessions opened in this window. `time.viewed` cannot answer "has this been opened": the server records a view only
 * once the session has a completed execution newer than the last viewed one, so a freshly created session stays
 * unviewed after it is opened. Clearing on reload is harmless because the creation chip only plays on the event.
 */
const openedSessions = new Set<string>()

/** The order a drag leaves the recent list in; pinned order lives in the pin list itself. */
const SidebarSessionOrder = Persistence.struct({
  recent: Persistence.array(Schema.String),
})

/** The run state at the end of a conversation row: a ring while working, one dot once the result lands. */
function StatusMark(props: { status: InboxStatus }) {
  const language = useLanguage()

  const label = () => {
    const value = props.status

    if (value === "ready") return

    return STATUS_LABEL[value]
  }

  return (
    <Show when={label()}>
      {(key) => (
        <span class="ms-auto flex shrink-0 items-center" title={language.t(key())}>
          <Show
            when={props.status === "working"}
            fallback={
              <span
                aria-hidden="true"
                class={`size-[6px] shrink-0 rounded-full ${DOT[props.status as Exclude<InboxStatus, "ready" | "working">]}`}
              />
            }
          >
            <ActivityRing class="size-3.5 shrink-0 text-[var(--color-icon-secondary)]" />
          </Show>
          <span class="sr-only">{language.t(key())}</span>
        </span>
      )}
    </Show>
  )
}

/**
 * The navigation column of the workbench: the window bar's left segment sits directly above it and carries the
 * traffic lights and the collapse control, so the column starts with the product mark.
 */
export function ReplicaSidebar() {
  return (
    <aside data-slot="replica-sidebar" data-ui="navigation-sidebar" class="flex min-h-0 flex-col">
      <ReplicaSidebarBrand />

      <ReplicaNewSessionButton />

      <ReplicaPrimaryNav />

      <ConversationNav />

      <ReplicaPrimaryFooter />
    </aside>
  )
}

/** The product mark, sitting under the window controls where the brand belongs. */
function ReplicaSidebarBrand() {
  const language = useLanguage()

  return (
    <div data-slot="replica-sidebar-brand" class="mb-3 flex h-8 shrink-0 items-center gap-2 px-4">
      <img src="/assets/product-mark.png" alt="" aria-hidden="true" width="20" height="20" class="size-5 shrink-0" />
      <span class="min-w-0 truncate text-[13px] leading-5 font-[500] tracking-[-0.01em] text-[var(--color-text-primary)]">
        {language.t("replica.rail.product")}
      </span>
      <span class="shrink-0 rounded-full px-1.5 text-[12px] leading-[18px] text-[var(--color-text-tertiary)] shadow-[inset_0_0_0_0.5px_var(--color-border)]">
        {language.t("replica.rail.preview")}
      </span>
    </div>
  )
}

/**
 * The primary action: a filled, inverted button so starting a conversation is the one obvious move on the column.
 * Its overlay carries the contrast hover and press washes, which lighten a dark fill and dim a light one.
 */
function ReplicaNewSessionButton() {
  const language = useLanguage()
  const newSession = useNewSessionDraft()

  return (
    <button
      type="button"
      data-replica-control
      data-slot="replica-new-session"
      aria-label={language.t("replica.rail.newSession")}
      class="group relative mx-2 mb-3 flex h-9 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-[var(--radius-card)] bg-[var(--v2-background-bg-inverse)] px-2 text-[13px] leading-5 font-[500] text-[var(--v2-text-text-inverse)] focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--v2-border-border-base)]"
      onClick={() => newSession()}
    >
      <span
        aria-hidden="true"
        class="absolute inset-0 bg-[var(--v2-overlay-simple-overlay-contrast-hover)] opacity-0 transition-opacity group-hover:opacity-100 group-active:bg-[var(--v2-overlay-simple-overlay-contrast-pressed)] group-active:opacity-100"
      />
      <Icon name="plus" class="relative size-4 shrink-0" />
      <span class="relative min-w-0 truncate">{language.t("replica.rail.newSession")}</span>
    </button>
  )
}

/**
 * The home destination: pinned conversations, then recent ones, each row carrying its project's icon. Rows sit
 * 2px apart so a selected background never reads as one continuous block.
 */
/** One session row: click opens it, double-click on the title renames it in place, right-click shows its actions. */
function SessionRow(props: {
  entry: Accessor<InboxEntry>
  active: Accessor<boolean>
  group: string
  index: number
  onOpen: (entry: InboxEntry) => void
  onArchive: (entry: InboxEntry) => void
  onDelete: (entry: InboxEntry) => void
}) {
  const language = useLanguage()

  const pins = usePinnedSessions()

  const platform = usePlatform()

  const copySessionID = useCopySessionID()

  const settings = useSettingsSurface()

  const dialog = useDialog()

  const navigate = useNavigate()

  // The row is the sortable element itself: dnd-kit refuses a drag that starts on a row's own pressed
  // button when that button is only a descendant of a different element.
  const sortable = useSortable({
    get id() {
      return props.entry().key
    },
    get index() {
      return props.index
    },
    get group() {
      return props.group
    },
    get data() {
      return { group: props.group }
    },
    accept: (source) => source.data?.group === props.group,
  })

  const nativeMenu = () => !!platform.showContextMenu

  const [renaming, setRenaming] = createSignal(false)
  let label!: HTMLSpanElement

  const project = () => props.entry().ctx.projects.forSession(props.entry().session)

  const creator = () => createdFrom(props.entry().session.metadata)

  // Keeping the origin on the row itself leaves it readable after the chip has faded, even across reloads.
  const createdByTitle = () => {
    const by = creator()

    if (!by) return undefined

    const name = creatorName(props.entry().ctx.data.session.get(by)?.title, by)

    if (!name) return undefined

    return language.t("replica.session.createdBy", { title: name })
  }

  createEffect(() => {
    if (props.active()) openedSessions.add(props.entry().session.id)
  })

  const openProjectSettings = () => {
    const current = project()

    if (!current) return

    settings.openProject({ server: props.entry().server, project: current.worktree })
  }

  createEffect(() => {
    const value = sessionLabel(props.entry().session)

    if (!label || renaming()) return
    label.textContent = value
  })

  const startRename = () => {
    if (renaming()) return
    label.textContent = sessionLabel(props.entry().session)
    setRenaming(true)

    requestAnimationFrame(() => {
      label.focus()
      const range = document.createRange()
      range.selectNodeContents(label)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
  }

  const beginRename = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    startRename()
  }

  const commit = async (save: boolean) => {
    if (!renaming()) return

    const entry = props.entry()
    const original = sessionLabel(entry.session)
    const next = (label.textContent ?? "").trim()
    setRenaming(false)
    label.textContent = original

    if (!save || !next || next === original) return
    const ctx = entry.ctx
    const id = entry.session.id

    await ctx.sdk.api.session
      .update({ sessionID: id, title: next })
      .then(() => {
        ctx.data.session.remember({ ...(ctx.data.session.get(id) ?? entry.session), title: next })
        // A rename advances time.updated server-side, so re-read the canonical record.
        ctx.data.session.invalidate(id)
        void ctx.data.session.sync(id).catch(() => undefined)
      })
      .catch(() => undefined)
  }

  // A branch conversation starts in its own worktree of the project rather than on a draft page: the user asked for a
  // separate checkout, so open a real session there and report a failed creation instead of leaving a blank draft.
  const createBranch = async () => {
    const entry = props.entry()
    const directory = entry.session.location.directory
    const root = entry.ctx.data.location.info({ directory })?.project.canonical ?? directory

    try {
      const created = await createWorktree({ api: entry.ctx.sdk.api, data: entry.ctx.data, directory: root })
      const session = entry.ctx.data.session.create({
        location: { directory: created },
        model: entry.session.model,
        agent: entry.session.agent,
      })

      await session.request
      navigate(sessionHref(entry.server, session.id))
    } catch (cause: unknown) {
      showToast({
        title: language.t("common.requestFailed"),
        description: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  // Desktop draws the platform menu; only the web build needs the in-app one.
  const showNativeMenu = async (position: { x: number; y: number }) => {
    const show = platform.showContextMenu

    if (!show) return

    const entry = props.entry()

    const session = entry.session

    const pinned = pins.isPinned(session.id)

    const chosen = await show(
      [
        { id: "rename", label: language.t("common.rename"), accelerator: "Alt+CmdOrCtrl+R", icon: "rename" },
        {
          id: "pin",
          label: pinned ? language.t("common.unpin") : language.t("common.pin"),
          accelerator: "Alt+CmdOrCtrl+P",
          icon: pinned ? "unpin" : "pin",
        },
        // No unread state for a row yet; the entry stays as the placeholder the native menu shape expects.
        {
          id: "markUnread",
          label: language.t("common.markUnread"),
          accelerator: "Shift+CmdOrCtrl+U",
          icon: "markUnread",
          enabled: false,
        },
        { id: "sessionSettings", label: language.t("session.settings.menu"), icon: "settings" },
        { id: "projectSettings", label: language.t("project.settings.menu"), icon: "project" },
        { type: "separator" },
        // A branch is a new draft on a fresh worktree of the same directory, so the conversation continues there.
        { id: "createBranch", label: language.t("common.createBranch"), icon: "branch" },
        { type: "separator" },
        {
          id: "copy",
          label: language.t("common.copy"),
          icon: "copy",
          submenu: [{ id: "copyID", label: language.t("command.session.copyID") }],
        },
        // Placeholder until a session can open in a second window.
        { id: "openInNewWindow", label: language.t("common.openInNewWindow"), icon: "newWindow", enabled: false },
        { type: "separator" },
        {
          id: "archive",
          label: session.time.archived !== undefined ? language.t("common.unarchive") : language.t("common.archive"),
          icon: "archive",
        },
        { type: "separator" },
        { id: "delete", label: `${language.t("common.delete")}…`, icon: "delete" },
      ],
      position,
    )

    if (chosen === "pin") pins.toggle(session.id)
    else if (chosen === "rename") startRename()
    else if (chosen === "copyID") void copySessionID(session.id)
    else if (chosen === "sessionSettings")
      dialog.show(() => <SessionSettingsDialog server={entry.server} session={entry.session} />)
    else if (chosen === "projectSettings") openProjectSettings()
    else if (chosen === "createBranch") void createBranch()
    else if (chosen === "archive") props.onArchive(entry)
    else if (chosen === "delete") props.onDelete(props.entry())
  }

  createEffect(() => {
    if (!renaming()) return

    const cleanup = makeEventListener(
      document,
      "pointerdown",
      (event) => {
        const target = event.target

        if (!(target instanceof Node)) return
        if (label.contains(target)) return
        // A pointer that lands before the editor took focus belongs to whatever is still closing, not to
        // an outside click on the editor.
        if (document.activeElement !== label) return
        void commit(true)
      },
      { capture: true },
    )

    onCleanup(cleanup)
  })

  return (
    <Menu.Context modal={false}>
      <Menu.Context.Trigger
        as="div"
        ref={sortable.ref}
        data-slot="replica-row"
        data-ui="sidebar-row"
        data-session-server={props.entry().server}
        data-session-id={props.entry().session.id}
        data-state={props.active() ? "pressed" : undefined}
        data-renaming={renaming() ? "" : undefined}
        title={createdByTitle()}
        role="button"
        tabindex={renaming() ? undefined : 0}
        class={`${ROW} outline-none focus-visible:[box-shadow:inset_0_0_0_1px_var(--color-icon-secondary)]`}
        onClick={() => {
          if (renaming()) return
          props.onOpen(props.entry())
        }}
        onContextMenu={(event) => {
          if (!nativeMenu()) return
          event.preventDefault()
          void showNativeMenu({ x: event.clientX, y: event.clientY })
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (renaming() || event.key !== "Enter") return
          event.preventDefault()
          props.onOpen(props.entry())
        }}
      >
        <Icon name="bubble-5" class="size-4 shrink-0 text-[var(--color-icon-secondary)]" />
        <span
          ref={label}
          data-slot="replica-row-title"
          dir="auto"
          class="min-w-0 flex-1 outline-none"
          classList={{ truncate: !renaming(), "cursor-text select-text": renaming() }}
          contenteditable={renaming() ? "plaintext-only" : undefined}
          onDblClick={beginRename}
          onKeyDown={(event) => {
            if (!renaming()) return
            event.stopPropagation()

            if (event.key === "Enter") {
              event.preventDefault()
              void commit(true)

              return
            }

            if (event.key !== "Escape") return
            event.preventDefault()
            void commit(false)
          }}
          onBlur={() => {
            // Losing the window (a native menu closing, another app taking focus) is not the user leaving
            // the editor; keep it open so the rename survives.
            if (!document.hasFocus()) return
            void commit(true)
          }}
          onPointerDown={(event) => {
            if (renaming()) event.stopPropagation()
          }}
          onClick={(event) => {
            if (!renaming()) return
            event.preventDefault()
            event.stopPropagation()
          }}
        />
        <StatusMark status={props.entry().status} />
      </Menu.Context.Trigger>
      <Menu.Context.Portal>
        <Menu.Context.Content
          onCloseAutoFocus={(event) => {
            if (renaming()) event.preventDefault()
          }}
        >
          <Menu.Group>
            <Menu.GroupLabel>{language.t("menu.group.organize")}</Menu.GroupLabel>
            <Menu.Item onSelect={() => pins.toggle(props.entry().session.id)}>
              {pins.isPinned(props.entry().session.id) ? language.t("common.unpin") : language.t("common.pin")}
            </Menu.Item>
            <Menu.Item onSelect={startRename}>{language.t("common.rename")}</Menu.Item>
            <Menu.Item onSelect={() => props.onArchive(props.entry())}>
              {props.entry().session.time.archived !== undefined
                ? language.t("common.unarchive")
                : language.t("common.archive")}
            </Menu.Item>
          </Menu.Group>
          <Menu.Separator />
          <Menu.Group>
            <Menu.GroupLabel>{language.t("menu.group.copyExport")}</Menu.GroupLabel>
            <SessionMenuCopyID sessionID={props.entry().session.id} />
          </Menu.Group>
          <Menu.Separator />
          <Menu.Group>
            <Menu.GroupLabel>{language.t("menu.group.danger")}</Menu.GroupLabel>
            <Menu.Item data-variant="critical" onSelect={() => props.onDelete(props.entry())}>
              {language.t("common.delete")}…
            </Menu.Item>
          </Menu.Group>
        </Menu.Context.Content>
      </Menu.Context.Portal>
    </Menu.Context>
  )
}

function ConversationNav() {
  const language = useLanguage()
  const tabs = useTabs()
  const layout = useLayout()
  const global = useGlobal()
  const inbox = createSessionInbox()
  const pins = usePinnedSessions()
  const dialog = useDialog()
  const pickDirectory = useDirectoryPicker()

  const openSearch = () =>
    void import("@/shell/commands/session-search").then(({ DialogSessionSearch }) =>
      dialog.show(() => <DialogSessionSearch />),
    )

  const addProject = () => {
    const conn = global.servers.list()[0]

    if (!conn) return
    const key = ServerConnection.key(conn)
    const ctx = global.serverCtx(key)

    if (!ctx) return
    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: (result) => void addProjects(ctx, homeProjectDirectories(result)),
    })
  }

  // A cross-session delivery sends a letter from the sender's row to the recipient's. Only `deliver` stamps the
  // envelope into the payload, so a person's own prompt never triggers it.
  createEffect(() => {
    for (const conn of global.servers.list()) {
      const server = ServerConnection.key(conn)
      const ctx = global.serverCtx(server)

      if (!ctx) continue

      onCleanup(
        ctx.data.on("session.inbox.enqueued", (event) => {
          if (event.data.item.type !== "user") return
          const from = deliveryFrom(event.data.item.payload.metadata)

          if (!from) return
          // The recipient row arrives with this event, so measure the rows after the list has rendered.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => playDeliveryFlight(server, from, event.data.sessionID)),
          )
        }),
      )

      // A created session grows out of the row that made it. The event arrives before the new row renders, so the
      // two frames below let the list settle and give the branch somewhere to land.
      onCleanup(
        ctx.data.on("session.created", (event) => {
          const by = createdFrom(event.data.metadata)

          // A session the person made themselves has no creator to name, so it simply appears.
          if (!by) return

          const target = event.data.sessionID

          // A row that is already open carries its own activity; a creation cue would read as stale news.
          if (openedSessions.has(target)) return

          // The list paints the new row from a later refresh than this event, so it can take seconds to
          // arrive. Poll for it: drawing into a row that does not exist yet paints nothing at all.
          const started = performance.now()
          const draw = () => {
            if (replicaRow(server, target)) {
              playBranchGrowth(server, by, target)

              return
            }

            if (performance.now() - started > 10000) return

            setTimeout(draw, 50)
          }

          draw()
        }),
      )
    }
  })

  // A withdrawal has no flight. The target row stamps itself and names the sender at its trailing edge. One undo
  // can cancel several items; the count aggregates them so the stamp plays once.
  const voidBatches = new Map<string, { count: number; timer: ReturnType<typeof setTimeout> }>()

  createEffect(() => {
    onCleanup(() => {
      for (const batch of voidBatches.values()) clearTimeout(batch.timer)
      voidBatches.clear()
    })

    for (const conn of global.servers.list()) {
      const server = ServerConnection.key(conn)
      const ctx = global.serverCtx(server)

      if (!ctx) continue

      onCleanup(
        ctx.data.on("session.inbox.cancelled", (event) => {
          const by = event.data.by

          // A local removal in the target is not a cross-session withdrawal, so nothing is stamped.
          if (!by) return

          const target = event.data.sessionID
          const key = `${server}|${target}|${by}`
          const batch = voidBatches.get(key)
          const count = (batch?.count ?? 0) + 1

          if (batch) clearTimeout(batch.timer)
          const timer = setTimeout(() => voidBatches.delete(key), 1500)
          voidBatches.set(key, { count, timer })

          requestAnimationFrame(() => requestAnimationFrame(() => playUndoDrop(server, target, by, count)))
        }),
      )
    }
  })

  const [order, setOrder] = persisted(Persist.global("replica.sidebar.sessions"), SidebarSessionOrder, { recent: [] })

  // The workspace head's filter: every project, or only the ones holding a pinned session.
  const [onlyPinned, setOnlyPinned] = createSignal(false)

  // A pinned session keeps its place in the tree and is marked on its project row instead of moving to its own
  // section, so the workspace reads as one tree in the reference's shape.
  const pinnedIDs = () => new Set(pins.ids())

  // A dragged order wins for the sessions it lists. A session that arrives afterwards joins the top in creation
  // order, so sending a message never reorders the list under the pointer.
  const recent = createMemo(() => {
    // Archiving keeps the session in the local store, so the row has to leave the list here as well as from the index.
    const list = inbox.entries().filter((entry) => !inboxArchived(entry))
    const byID = new Map(list.map((entry) => [entry.session.id, entry]))
    const ranked = new Set(order.recent)
    const fresh = list
      .filter((entry) => !ranked.has(entry.session.id))
      .toSorted(
        (a, b) =>
          b.session.time.created - a.session.time.created ||
          (a.session.id < b.session.id ? -1 : a.session.id > b.session.id ? 1 : 0),
      )
    // Every loaded entry is listed; the sidebar scrolls instead of hiding the tail behind a fixed count.
    const ordered = [...fresh, ...order.recent.flatMap((id) => byID.get(id) ?? [])]
    const route = layout.route()
    const currentID = route.type === "session" ? route.sessionId : undefined

    // The open session stays reachable even when it is older than the fetched index.
    if (currentID && !ordered.some((entry) => entry.session.id === currentID)) {
      const current = byID.get(currentID)

      if (current) ordered.push(current)
    }

    return ordered
  })

  /**
   * The recent list read as a project tree: one folder row per project with its sessions underneath. Group order
   * follows the list itself, so the project that spoke last stays on top, and a session keeps the relative position
   * the fetch and drag order gave it inside its own project.
   */
  const projectGroups = createMemo(() => {
    const groups = new Map<string, { key: string; name: string; entries: InboxEntry[] }>()

    for (const entry of recent()) {
      const project = entry.ctx.projects.forSession(entry.session)
      const key = project?.id ?? project?.worktree ?? entry.session.location.directory
      const name = project
        ? displayName(project)
        : entry.session.location.directory
            .replace(/[\\/]+$/, "")
            .split(/[\\/]/)
            .pop() || key
      const group = groups.get(key)

      if (group) group.entries.push(entry)
      else groups.set(key, { key, name, entries: [entry] })
    }

    const pinned = pinnedIDs()

    return [...groups.values()].flatMap((group) => {
      const marked = group.entries.some((entry) => pinned.has(entry.session.id))

      if (onlyPinned() && !marked) return []

      return [{ ...group, pinned: marked }]
    })
  })

  // Rows leave the list through its top and bottom edges, so fade them there rather than cutting them off. The fade
  // shows only on the edges the list can actually scroll, which the row count and the scroll position decide.
  const [list, setList] = createSignal<HTMLDivElement>()
  const updateFades = (element: HTMLDivElement | undefined) => {
    if (!element) return

    element.toggleAttribute("data-fade-top", element.scrollTop > 0)
    element.toggleAttribute("data-fade-bottom", element.scrollHeight - element.scrollTop - element.clientHeight > 1)
  }

  createEffect(
    on(
      () => projectGroups().length,
      () => updateFades(list()),
      { defer: true },
    ),
  )

  // A folded project stays folded while the list re-sorts underneath, because the key is the project, not the row.
  const [foldedProjects, setFoldedProjects] = createSignal<ReadonlySet<string>>(new Set())

  const toggleProject = (key: string) => {
    setFoldedProjects((current) => {
      const next = new Set(current)

      if (next.has(key)) next.delete(key)
      else next.add(key)

      return next
    })
  }

  const currentTab = createMemo(() => {
    const route = layout.route()

    if (route.type === "session") return tabs.sessionTab(route.server, route.sessionId)

    if (route.type === "draft")
      return tabs.store.find((item) => item.type === "draft" && item.draftID === route.draftID)
  })

  const active = (entry: InboxEntry) => {
    const tab = currentTab()

    return !!tab && tab.type === "session" && tab.server === entry.server && tab.sessionId === entry.session.id
  }

  const open = (entry: InboxEntry) => {
    const directory = entry.ctx.projects.forSession(entry.session)?.worktree ?? entry.session.location.directory
    inbox.open(entry)
    entry.ctx.projects.touch(directory)
  }

  const archive = (entry: InboxEntry) => {
    if (inboxArchived(entry)) {
      void inbox.unarchive(entry)

      return
    }

    void inbox.archive(entry)
  }

  const confirmDelete = (entry: InboxEntry) => {
    const ids = sessionTreeIDs(entry.ctx.data.session.list(), entry.session.id)

    void dialog.show(() => (
      <Dialog fit>
        <DialogHeader hideClose>
          <DialogTitleGroup
            title={language.t("session.delete.title")}
            description={language.t("session.delete.confirm", { name: sessionLabel(entry.session) })}
          />
        </DialogHeader>
        <DialogFooter>
          <Button variant="neutral" autofocus onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              dialog.close()
              pins.remove(ids)
              void inbox.remove(entry)
            }}
          >
            {language.t("session.delete.button")}
          </Button>
        </DialogFooter>
      </Dialog>
    ))
  }

  return (
    <>
      <div
        ref={setList}
        data-slot="replica-sidebar-scroll"
        class="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-3"
        onScroll={(event) => {
          const element = event.currentTarget
          updateFades(element)
          // Start the next page before the list runs out, so scrolling never stops at an empty edge.
          if (element.scrollHeight - element.scrollTop - element.clientHeight > 320) return

          void inbox.loadMore()
        }}
      >
        <div data-slot="replica-workspace-head" class="flex h-7 items-center ps-1">
          <h2 class={SECTION}>{language.t("replica.workspace.name")}</h2>
          <div class="ms-auto flex items-center gap-0.5">
            <Tooltip placement="top" openDelay={400} value={language.t("replica.workspace.search")}>
              <button
                type="button"
                data-replica-control
                aria-label={language.t("replica.workspace.search")}
                class={HEAD_BUTTON}
                onClick={openSearch}
              >
                <Icon name="magnifying-glass" size="small" />
              </button>
            </Tooltip>
            <Tooltip
              placement="top"
              openDelay={400}
              value={language.t(onlyPinned() ? "replica.workspace.filter.all" : "replica.workspace.filter.pinned")}
            >
              <button
                type="button"
                data-replica-control
                data-state={onlyPinned() ? "pressed" : undefined}
                aria-pressed={onlyPinned()}
                aria-label={language.t("replica.workspace.filter")}
                class={HEAD_BUTTON}
                onClick={() => setOnlyPinned((value) => !value)}
              >
                <Icon name="filter" size="small" />
              </button>
            </Tooltip>
            <Tooltip placement="top" openDelay={400} value={language.t("replica.workspace.newProject")}>
              <button
                type="button"
                data-replica-control
                aria-label={language.t("replica.workspace.newProject")}
                class={HEAD_BUTTON}
                onClick={addProject}
              >
                <Icon name="folder-plus" size="small" />
              </button>
            </Tooltip>
          </div>
        </div>
        <DragDropProvider
          sensors={[
            PointerSensor.configure({
              activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
            }),
          ]}
          modifiers={[RestrictToVerticalAxis]}
          plugins={(defaults) => [
            ...defaults.filter((plugin) => plugin !== Accessibility),
            Feedback.configure({ dropAnimation: null }),
          ]}
          onDragEnd={(event) => {
            const source = event.operation.source

            if (event.canceled || !isSortable(source) || source.initialIndex === source.index) return

            const group = String(source.group ?? "")

            if (group !== RECENT_GROUP) return
            setOrder(
              "recent",
              arrayMove(
                recent().map((entry) => entry.session.id),
                source.initialIndex,
                source.index,
              ),
            )
          }}
        >
          <Show when={projectGroups().length > 0}>
            <div class="flex flex-col gap-[2px]">
              <Key each={projectGroups()} by={(group) => group.key}>
                {(group) => (
                  <div class="flex flex-col">
                    <button
                      type="button"
                      data-replica-control
                      data-slot="replica-project-row"
                      aria-expanded={!foldedProjects().has(group().key)}
                      class={ROW}
                      onClick={() => toggleProject(group().key)}
                    >
                      <Icon
                        name={foldedProjects().has(group().key) ? "folder" : "folder-open"}
                        class="size-4 shrink-0 text-[var(--color-icon-secondary)]"
                      />
                      <span class="min-w-0 flex-1 truncate">{group().name}</span>
                      <Show when={group().pinned}>
                        <Icon name="pin" size="small" class="shrink-0 text-[var(--color-icon-secondary)]" />
                      </Show>
                      <Icon
                        name="chevron-down"
                        size="small"
                        class="replica-project-chevron shrink-0 text-[var(--color-icon-secondary)]"
                      />
                    </button>
                    {/* The sessions fold open by grid rows, so the column grows instead of the list appearing at once. */}
                    <div class="replica-project-sessions" data-collapsed={foldedProjects().has(group().key)}>
                      <div class={`${LIST} ps-3 min-h-0 overflow-hidden`}>
                        <Key each={group().entries} by={(entry) => entry.key}>
                          {(entry) => (
                            <SessionRow
                              entry={entry}
                              active={() => active(entry())}
                              group={RECENT_GROUP}
                              index={recent().findIndex((item) => item.key === entry().key)}
                              onOpen={open}
                              onArchive={archive}
                              onDelete={confirmDelete}
                            />
                          )}
                        </Key>
                      </div>
                    </div>
                  </div>
                )}
              </Key>
            </div>
          </Show>
          <Show when={projectGroups().length === 0}>
            <p class="px-1 py-2 text-[13px] leading-5 text-[var(--color-text-tertiary)]">
              {language.t(onlyPinned() ? "replica.workspace.filter.empty" : "replica.project.empty")}
            </p>
          </Show>
        </DragDropProvider>
      </div>
    </>
  )
}
