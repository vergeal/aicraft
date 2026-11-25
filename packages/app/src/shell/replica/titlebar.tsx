import { createEffect, createMemo, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { makeEventListener } from "@solid-primitives/event-listener"
import { Icon } from "@aicraft/ui/icon"
import { MainSurface, type MainSurfaceTitlebar } from "@aicraft/aix/gui"
import { useLanguage } from "@/runtime/i18n/language"
import { useGlobal } from "@/runtime/server/runtime"
import { useCommand } from "@/shell/commands/command"
import { goBackCommand, goForwardCommand } from "@/shell/titlebar/history-commands"
import { createTitlebarHistory } from "@/shell/titlebar/history-store"
import { useLayout } from "@/shell/state/layout"
import { usePlatform } from "@/runtime/platform/platform"
import { usePluginHost } from "@/runtime/plugin/host"
import { findMainSurface } from "@/runtime/plugin/main-surface"
import { SidebarToggle } from "@/shell/sidebar-toggle"
import { WindowsMenuBar } from "@/shell/titlebar/windows-menu"
import { ReplicaTitlebarActions } from "./titlebar-actions"

const BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-icon-secondary)] hover:bg-[var(--color-hover)] hover:text-[var(--color-icon-primary)] focus-visible:outline-none focus-visible:[box-shadow:inset_0_0_0_1px_var(--color-icon-secondary)] disabled:opacity-40 disabled:pointer-events-none"

/**
 * The window bar spans the whole window: its left segment is the navigation column's own head and shares the column's
 * width and surface, and its right segment heads the workspace. Collapsed, the left segment gives its width back and
 * the way to reopen the column moves into the workspace bar.
 */
export function ReplicaTitleBar(props: { sidebarOpen: boolean; width: number; empty?: boolean }) {
  const language = useLanguage()
  const layout = useLayout()
  const global = useGlobal()
  const command = useCommand()
  const history = createTitlebarHistory()
  const platform = usePlatform()
  const pluginHost = usePluginHost()

  // A plugin's page may paint the workspace segment in its own colors, so the bar and the page below read as one
  // surface. Leaving the page restores the app's chrome.
  const pluginTitlebar = createMemo(() => {
    const route = layout.route()

    if (route.type !== "plugin") return

    return findMainSurface(pluginHost.items(MainSurface), route.plugin, route.surface)?.value.titlebar?.()
  })

  // The Windows caption buttons are native, so they take the plugin bar's foreground outside CSS.
  createEffect(() => void platform.setTitlebarControls?.(pluginTitlebar()?.foreground))

  const back = history.back
  const forward = history.forward

  command.register(() => [
    {
      ...goBackCommand,
      title: language.t("common.goBack"),
      category: language.t("command.category.view"),
      onSelect: back,
    },
    {
      ...goForwardCommand,
      title: language.t("common.goForward"),
      category: language.t("command.category.view"),
      onSelect: forward,
    },
  ])

  /** The open conversation's title, the only thing the topbar says about where the window is. */
  const conversation = () => {
    const route = layout.route()

    if (route.type !== "session") return
    const session = global.serverCtx(route.server)?.data.session.get(route.sessionId)

    return session?.title
  }

  // The conversation title is edited in place, the way session rows and tab titles do it: double-click opens
  // the editor, Enter or an outside click saves, Escape restores.
  let titleElement!: HTMLSpanElement

  const [titleState, setTitleState] = createStore({ editing: false })

  createEffect(() => {
    if (!titleElement || titleState.editing) return

    titleElement.textContent = conversation() ?? ""
  })

  const beginRename = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (titleState.editing) return
    const current = conversation()

    if (!titleElement || !current) return
    titleElement.textContent = current
    setTitleState("editing", true)

    requestAnimationFrame(() => {
      titleElement.focus()
      const range = document.createRange()
      range.selectNodeContents(titleElement)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
  }

  const commitRename = async (save: boolean) => {
    if (!titleState.editing) return

    const original = conversation() ?? ""
    const next = (titleElement.textContent ?? "").trim()
    setTitleState("editing", false)
    titleElement.textContent = original

    if (!save || !next || next === original) return

    const route = layout.route()

    if (route.type !== "session") return
    const ctx = global.serverCtx(route.server)
    const session = ctx?.data.session.get(route.sessionId)

    if (!ctx || !session) return

    await ctx.sdk.api.session
      .update({ sessionID: session.id, title: next })
      .then(() => {
        ctx.data.session.remember({ ...session, title: next })
        // A rename advances time.updated server-side, so re-read the canonical record.
        ctx.data.session.invalidate(session.id)
        void ctx.data.session.sync(session.id).catch(() => undefined)
      })
      .catch(() => undefined)
  }

  createEffect(() => {
    if (!titleState.editing) return

    const cleanup = makeEventListener(
      document,
      "pointerdown",
      (event) => {
        const target = event.target

        if (!(target instanceof Node)) return

        if (titleElement.contains(target)) return

        // A pointer that lands before the editor took focus belongs to whatever is still closing, not to
        // an outside click on the editor.
        if (document.activeElement !== titleElement) return

        void commitRename(true)
      },
      { capture: true },
    )

    onCleanup(cleanup)
  })

  return (
    <header data-slot="replica-titlebar" data-ui="content-topbar" data-empty={props.empty ? "" : undefined}>
      {/* The navigation column's own head. It carries the column's width and surface so the window bar and the
          column below read as one piece of chrome, and the collapse control sits at its trailing edge. */}
      <div
        data-slot="replica-titlebar-side"
        data-ui="titlebar-side"
        data-collapsed={props.sidebarOpen ? undefined : ""}
        style={{ "flex-basis": props.sidebarOpen ? `${props.width}px` : "0px" }}
      >
        <Show when={props.sidebarOpen}>
          <SidebarToggle />
          <WindowsMenuBar />
        </Show>
      </div>

      <div
        data-slot="replica-titlebar-main"
        data-ui="titlebar-main"
        style={titlebarColors(pluginTitlebar())}
      >
        {/* Collapsed, the column's head is gone, so the workspace bar offers the way back in and the menu bar that
            otherwise sits beside it. Kept in its own group so the empty state can hide the rest of the bar while
            the way back to the column stays available. */}
        <Show when={!props.sidebarOpen}>
          <div data-slot="replica-titlebar-collapsed" class="flex shrink-0 items-center gap-3">
            <SidebarToggle />
            <WindowsMenuBar />
          </div>
        </Show>

        <div
          data-slot="replica-titlebar-nav"
          data-ui="titlebar-nav"
          data-session-only
          class="flex shrink-0 items-center gap-0.5"
        >
        <button
          type="button"
          data-replica-control
          class={BUTTON}
          aria-label={language.t("replica.titlebar.back")}
          disabled={!history.canBack()}
          onClick={back}
        >
          <Icon name="outline-arrow-left" size="small" />
        </button>
        <button
          type="button"
          data-replica-control
          class={BUTTON}
          aria-label={language.t("replica.titlebar.forward")}
          disabled={!history.canForward()}
          onClick={forward}
        >
          <Icon name="outline-arrow-right" size="small" />
        </button>
      </div>

        <span data-session-only class="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            ref={titleElement}
            class="min-w-0 truncate text-[14px] leading-5 font-[500] text-[var(--color-text-main)] outline-none"
            classList={{ "cursor-text select-text": titleState.editing }}
            contenteditable={titleState.editing ? "plaintext-only" : undefined}
            data-ui="titlebar-title"
            dir="auto"
            onDblClick={beginRename}
            onKeyDown={(event) => {
              if (!titleState.editing) return
              event.stopPropagation()

              if (event.key === "Enter") {
                event.preventDefault()
                void commitRename(true)

                return
              }

              if (event.key !== "Escape") return
              event.preventDefault()
              void commitRename(false)
            }}
            onBlur={() => {
              // Losing the window is not the user leaving the editor; keep it open so the rename survives.
              if (!document.hasFocus()) return
              void commitRename(true)
            }}
          />
        </span>

        <div class="ms-auto flex shrink-0 items-center gap-2">
          <ReplicaTitlebarActions placement="workspace" fps={!props.empty} />
        </div>
      </div>

      {/* The side panel's own head. The session side region writes its width, and the panel itself rises over this
          segment, so the three columns each read as one column of chrome: navigation, workspace, and the panel. */}
      <div data-slot="replica-titlebar-panel" aria-hidden="true" />
    </header>
  )
}

/**
 * The chrome tokens a plugin page's colors replace on the workspace segment. The segment's own background comes from
 * `background`; the rest fade the given foreground so the title, icons, hover states and dividers stay legible on it.
 */
function titlebarColors(tint: MainSurfaceTitlebar | undefined) {
  if (!tint) return

  const faded = (percent: number) => `color-mix(in srgb, ${tint.foreground} ${percent}%, transparent)`

  return {
    "--color-main": tint.background,
    "--color-text-main": tint.foreground,
    "--color-text-primary": tint.foreground,
    "--color-text-secondary": faded(70),
    "--color-text-tertiary": faded(56),
    "--color-icon-primary": tint.foreground,
    "--color-icon-secondary": faded(64),
    "--color-hover": faded(9),
    "--color-selected": faded(14),
    "--color-border": faded(18),
    "--color-divider": faded(12),
  }
}
