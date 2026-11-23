import { createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import type { IconName } from "./bits"
import type { FileTypeGroup } from "./format"

export type WorkspaceView =
  | "home"
  | "libraries"
  | "library"
  | "doc"
  | "search"
  | "jobs"
  | "agents"
  | "recent"
  | "favorites"
  | "trash"

export type FileMode = "list" | "grid"

export type FileStatusFilter = "all" | "active" | "failed"

export type FileSort = "updated" | "name" | "size"

export type LibrarySort = "updated" | "name" | "count"

export type JobTab = "active" | "failed" | "done"

export type MenuItem =
  | {
      label: string
      icon?: IconName
      danger?: boolean
      checked?: boolean
      onSelect: () => void
    }
  | { separator: true }

export type MenuState = { x: number; y: number; items: MenuItem[] }

export type ToastState = { id: number; message: string; actionLabel?: string; onAction?: () => void }

export type DialogState =
  | { type: "new-library" }
  | { type: "rename-library"; libraryID: string }
  | { type: "delete-library"; libraryID: string }
  | { type: "settings"; libraryID: string }
  | { type: "new-folder"; libraryID: string }
  | { type: "move"; libraryID: string; paths: string[] }
  | { type: "rename-file"; libraryID: string; path: string }
  | { type: "confirm-delete"; libraryID: string; paths: string[] }
  | { type: "confirm-purge"; libraryID: string; path: string }
  | { type: "confirm-empty-trash" }

type WorkspaceStore = {
  view: WorkspaceView
  libraryID: string | undefined
  docPath: string | undefined
  folder: string
  type: FileTypeGroup | "all"
  status: FileStatusFilter
  sort: FileSort
  mode: FileMode
  query: string
  selected: string[]
  jobTab: JobTab
  agentLibraryID: string | undefined
  libraryQuery: string
  librarySort: LibrarySort
  searchQuery: string
  searchLibraries: string[]
  searchFocused: number
}

/**
 * The workspace's own navigation and selection. Library content stays in the knowledge store, so
 * this state only holds what the user is looking at and which documents they picked.
 */
export function createWorkspaceState() {
  const [store, setStore] = createStore<WorkspaceStore>({
    view: "home",
    libraryID: undefined,
    docPath: undefined,
    folder: "all",
    type: "all",
    status: "all",
    sort: "updated",
    mode: "list",
    query: "",
    selected: [],
    jobTab: "active",
    agentLibraryID: undefined,
    libraryQuery: "",
    librarySort: "updated",
    searchQuery: "",
    searchLibraries: [],
    searchFocused: 0,
  })

  const [dialog, setDialog] = createSignal<DialogState>()
  const [menu, setMenu] = createSignal<MenuState>()
  const [toast, setToast] = createSignal<ToastState>()
  const [drawer, setDrawer] = createSignal<{ libraryID: string; path: string }>()
  const [dragging, setDragging] = createSignal(false)

  const go = (view: WorkspaceView) => {
    setStore("view", view)

    if (view !== "library" && view !== "doc") setStore("selected", [])
  }

  const openLibrary = (libraryID: string) => {
    setStore({
      libraryID,
      view: "library",
      folder: "all",
      type: "all",
      status: "all",
      query: "",
      selected: [],
    })
  }

  const openDoc = (libraryID: string, path: string) => {
    setStore({ libraryID, docPath: path, view: "doc" })
  }

  const closeDoc = () => {
    setStore("docPath", undefined)
    go("library")
  }

  const clearFileFilters = () =>
    setStore({ folder: "all", type: "all", status: "all", query: "", selected: [] })

  const toggleSelected = (path: string, checked: boolean) =>
    setStore("selected", (current) =>
      checked ? [...new Set([...current, path])] : current.filter((item) => item !== path),
    )

  const selectPaths = (paths: ReadonlyArray<string>, checked: boolean) =>
    setStore("selected", (current) =>
      checked ? [...new Set([...current, ...paths])] : current.filter((path) => !paths.includes(path)),
    )

  const clearSelection = () => setStore("selected", [])

  const openSearch = () => {
    go("search")
    setStore("searchFocused", store.searchFocused + 1)
  }

  return {
    store,
    setStore,
    dialog,
    openDialog: (next: DialogState) => setDialog(next),
    closeDialog: () => setDialog(),
    menu,
    openMenu: (next: MenuState) => setMenu(next),
    closeMenu: () => setMenu(),
    toast,
    notify: (message: string, actionLabel?: string, onAction?: () => void) =>
      setToast({ id: Date.now(), message, actionLabel, onAction }),
    dismissToast: () => setToast(),
    drawer,
    openDrawer: (libraryID: string, path: string) => setDrawer({ libraryID, path }),
    closeDrawer: () => setDrawer(),
    dragging,
    setDragging,
    go,
    openLibrary,
    openDoc,
    closeDoc,
    clearFileFilters,
    toggleSelected,
    selectPaths,
    clearSelection,
    openSearch,
  }
}

export type WorkspaceState = ReturnType<typeof createWorkspaceState>
