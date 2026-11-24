import { Icon } from "@aicraft/ui/icon"
import { createEffect, For, onCleanup, onMount, Show, type JSX } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { PagePanel } from "@/shell/page"
import { AgentsView } from "./agents"
import { useWorkspace } from "./context"
import { WorkspaceDialog } from "./dialogs"
import { DocView } from "./doc"
import { JobDrawer, JobsView } from "./jobs"
import { LibrariesView } from "./libraries"
import { LibraryView } from "./library"
import { SearchView } from "./search"
import "./workspace.css"

const MENU_WIDTH = 208

const MENU_MAX_HEIGHT = 260

/**
 * The knowledge destination: one reading column on the app's own canvas, the same measure as an
 * answer. The app's rail and titlebar stay outside this route; the page adds no navigation of its
 * own, only the header and the list the current view shows.
 */
export function WorkspaceScreen() {
  const ws = useWorkspace()
  const language = useLanguage()
  const platform = usePlatform()

  const currentLibraryID = () => {
    const id = ws.ui.store.libraryID

    return id && ws.knowledge.libraries.get(id) ? id : undefined
  }

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault()
        ws.ui.openSearch()

        return
      }

      if (event.key !== "Escape") return

      if (ws.ui.dialog()) {
        ws.ui.closeDialog()

        return
      }

      if (ws.ui.menu()) {
        ws.ui.closeMenu()

        return
      }

      if (ws.ui.drawer()) ws.ui.closeDrawer()
    }

    window.addEventListener("keydown", onKeyDown)
    onCleanup(() => window.removeEventListener("keydown", onKeyDown))
  })

  const pathsOf = (event: DragEvent) =>
    [...(event.dataTransfer?.files ?? [])].flatMap((file) => {
      const path = platform.getPathForFile?.(file)

      return path ? [path] : []
    })

  const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes("Files")

  const drop = async (event: DragEvent) => {
    event.preventDefault()
    ws.ui.setDragging(false)
    const paths = pathsOf(event)

    if (!paths.length) return

    const id = currentLibraryID()

    if (!id) {
      ws.ui.notify(language.t("knowledge.workspace.drop.noLibrary"))

      return
    }

    const library = ws.knowledge.libraries.get(id)

    if (!library) return
    ws.knowledge.openLibrary(library)
    await ws.knowledge.runImport(paths)
  }

  return (
    <PagePanel>
      <div
        class="kbw"
        onDragOver={(event) => {
          if (!hasFiles(event)) return

          event.preventDefault()
          ws.ui.setDragging(true)
        }}
        onDragLeave={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return

          ws.ui.setDragging(false)
        }}
        onDrop={(event) => void drop(event)}
      >
        <main class="work">
          <LibrariesView />
          <LibraryView />
          <DocView />
          <SearchView />
          <JobsView />
          <AgentsView />
          <WorkspaceDialog />
          <JobDrawer />
          <WorkspaceMenu />
          <WorkspaceToast />
          <Show when={ws.ui.dragging()}>
            <div class="drop-overlay">
              <div class="drop-overlay-card">
                <Icon name="outline-arrow-up-right" class="ico" />
                <strong>{language.t("knowledge.workspace.drop.title")}</strong>
                <span>{language.t("knowledge.workspace.drop.hint")}</span>
              </div>
            </div>
          </Show>
        </main>
      </div>
    </PagePanel>
  )
}

/** Menus are placed by pointer position, then clamped so they never leave the window. */
function WorkspaceMenu() {
  const ws = useWorkspace()

  const style = (): JSX.CSSProperties => {
    const menu = ws.ui.menu()

    if (!menu) return {}
    const left = Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8))
    const top = Math.max(8, Math.min(menu.y, window.innerHeight - MENU_MAX_HEIGHT))

    return { left: `${left}px`, top: `${top}px` }
  }

  return (
    <Show when={ws.ui.menu()}>
      {(menu) => (
        <MenuSurface style={style()}>
          <For each={menu().items}>
            {(item) =>
              "separator" in item ? (
                <div class="sep" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  data-danger={item.danger ? "true" : undefined}
                  onClick={() => {
                    ws.ui.closeMenu()
                    item.onSelect()
                  }}
                >
                  <Show when={item.icon}>{(icon) => <Icon name={icon()} class="ico" />}</Show>
                  <span>{item.label}</span>
                  <Show when={item.checked}>
                    <span class="check">
                      <Icon name="check" class="ico ico-sm" />
                    </span>
                  </Show>
                </button>
              )
            }
          </For>
        </MenuSurface>
      )}
    </Show>
  )
}

function MenuSurface(props: { style: JSX.CSSProperties; children: JSX.Element }) {
  const ws = useWorkspace()

  onMount(() => {
    const close = () => ws.ui.closeMenu()

    // The opening click already finished, so the next pointer down anywhere else dismisses the menu.
    window.addEventListener("pointerdown", close)
    onCleanup(() => window.removeEventListener("pointerdown", close))
  })

  return (
    <div class="menu" role="menu" style={props.style} onPointerDown={(event) => event.stopPropagation()}>
      {props.children}
    </div>
  )
}

function WorkspaceToast() {
  const ws = useWorkspace()
  const language = useLanguage()

  createEffect(() => {
    const toast = ws.ui.toast()

    if (!toast) return
    const timer = setTimeout(() => ws.ui.dismissToast(), 4000)

    onCleanup(() => clearTimeout(timer))
  })

  return (
    <Show when={ws.ui.toast()}>
      {(toast) => (
        <div class="toast" role="status">
          <Icon name="check" class="ico ico-sm" />
          <span>{toast().message}</span>
          <Show when={toast().actionLabel}>
            <button
              type="button"
              onClick={() => {
                toast().onAction?.()
                ws.ui.dismissToast()
              }}
            >
              {toast().actionLabel}
            </button>
          </Show>
          <button
            type="button"
            aria-label={language.t("knowledge.workspace.dialog.close")}
            onClick={() => ws.ui.dismissToast()}
          >
            <Icon name="close" class="ico ico-xs" />
          </button>
        </div>
      )}
    </Show>
  )
}
