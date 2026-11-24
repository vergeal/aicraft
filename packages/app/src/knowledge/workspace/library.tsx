import { Icon } from "@aicraft/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { knowledgeImports } from "../import-status"
import type { KnowledgeFileStatus } from "../store"
import { FileStatus, View } from "./bits"
import { useWorkspace } from "./context"
import {
  FILE_TYPE_GROUPS,
  fileChunks,
  fileFolder,
  fileStatus,
  fileType,
  fileName,
  fileUpdatedAt,
  formatBytes,
  formatWhen,
  libraryUpdatedAt,
  typeLabelKey,
  type FileTypeGroup,
} from "./format"
import type { FileStatusFilter, MenuItem } from "./state"

const ACTIVE_STATUSES: ReadonlyArray<KnowledgeFileStatus> = ["pending", "parsing", "indexing"]

/**
 * One library inside the prototype's page column: the documents as a single list, read through
 * the composition bar above them.
 */
export function LibraryView() {
  const ws = useWorkspace()
  const language = useLanguage()
  const platform = usePlatform()

  const library = () => {
    const id = ws.ui.store.libraryID

    return id ? ws.knowledge.libraries.get(id) : undefined
  }

  const own = createMemo(() => (library()?.files ?? []).filter((file) => !file.deletedAt))

  const folders = createMemo(() => {
    const declared = library()?.folders ?? []
    const inferred = own()
      .map(fileFolder)
      .filter((folder) => folder.length > 0)

    return [...new Set([...declared, ...inferred])]
  })

  const query = () => ws.ui.store.query.trim().toLocaleLowerCase()

  const filtered = createMemo(() =>
    own()
      .filter((file) => ws.ui.store.folder === "all" || fileFolder(file) === ws.ui.store.folder)
      .filter((file) => ws.ui.store.type === "all" || fileType(file) === ws.ui.store.type)
      .filter((file) => {
        const status = fileStatus(file)

        if (ws.ui.store.status === "ready") return status === "ready"

        if (ws.ui.store.status === "busy") return ACTIVE_STATUSES.includes(status)

        if (ws.ui.store.status === "flag") return status === "failed"

        return true
      })
      .filter((file) => {
        const needle = query()

        return !needle || `${file.name}\n${file.path}`.toLocaleLowerCase().includes(needle)
      })
      .sort((left, right) => {
        if (ws.ui.store.sort === "name") return fileName(left).localeCompare(fileName(right), "zh-Hans-CN")

        if (ws.ui.store.sort === "size") return right.size - left.size

        return fileUpdatedAt(right) - fileUpdatedAt(left)
      }),
  )

  const chunks = createMemo(() => own().reduce((total, file) => total + fileChunks(file), 0))
  const failed = createMemo(() => own().filter((file) => fileStatus(file) === "failed").length)

  const active = createMemo(() => own().filter((file) => ACTIVE_STATUSES.includes(fileStatus(file))).length)

  const ready = createMemo(() => own().length - active() - failed())

  const importing = () => {
    const id = ws.ui.store.libraryID

    return id ? knowledgeImports.get(id) : undefined
  }

  const filtersActive = () =>
    Boolean(ws.ui.store.query) ||
    ws.ui.store.type !== "all" ||
    ws.ui.store.status !== "all" ||
    ws.ui.store.folder !== "all"

  const ensureLibrary = () => {
    const current = library()

    if (current && ws.knowledge.library()?.id !== current.id) ws.knowledge.openLibrary(current)
  }

  const upload = async (paths?: ReadonlyArray<string>) => {
    ensureLibrary()
    await ws.knowledge.runImport(paths)
  }

  const retry = async (path: string) => {
    const file = own().find((entry) => entry.path === path)

    if (!file) return
    ws.knowledge.libraries.patchFile(ws.ui.store.libraryID!, path, {
      processing: { status: "pending", progress: 0, at: Date.now() },
    })
    ws.ui.notify(language.t("knowledge.workspace.toast.requeued", { name: fileName(file) }))
    await upload([file.source || file.path])
  }

  const exportFiles = async (paths: ReadonlyArray<string>) => {
    const lib = library()

    if (!lib) return
    const files = own().filter((file) => paths.includes(file.path))
    let text = ""

    for (const file of files) {
      const read = await platform.readKnowledgeFile?.({ libraryID: lib.id, path: file.path }).catch(() => undefined)
      text += `# ${fileName(file)}\n\n${read?.text ?? ""}\n\n`
    }

    if (!text) return
    const name = files.length === 1 ? fileName(files[0]) : lib.name
    await platform.saveFile?.({ defaultPath: `${name}.md` }, text)
  }

  const fileMenu = (event: MouseEvent, path: string) => {
    event.stopPropagation()

    const lib = library()
    const file = own().find((entry) => entry.path === path)

    if (!lib || !file) return

    if (!(event.currentTarget instanceof HTMLElement)) return

    const rect = event.currentTarget.getBoundingClientRect()

    const items: MenuItem[] = [
      {
        label: language.t("knowledge.workspace.menu.open"),
        icon: "file-document",
        onSelect: () => ws.openDocument(lib.id, path),
      },
      {
        label: language.t("knowledge.workspace.menu.rename"),
        icon: "edit",
        onSelect: () => ws.ui.openDialog({ type: "rename-file", libraryID: lib.id, path }),
      },
      {
        label: language.t("knowledge.workspace.menu.move"),
        icon: "folder",
        onSelect: () => ws.ui.openDialog({ type: "move", libraryID: lib.id, paths: [path] }),
      },
      {
        label: language.t(file.favorite ? "knowledge.workspace.menu.unfavorite" : "knowledge.workspace.menu.favorite"),
        icon: "pin",
        onSelect: () => ws.knowledge.libraries.setFileFavorite(lib.id, path, !file.favorite),
      },
      {
        label: language.t("knowledge.workspace.menu.download"),
        icon: "outline-square-arrow",
        onSelect: () => void exportFiles([path]),
      },
      {
        label: language.t("knowledge.workspace.menu.reprocess"),
        icon: "refresh",
        onSelect: () => void retry(path),
      },
      { separator: true },
      {
        label: language.t("knowledge.workspace.menu.trash"),
        icon: "outline-trash",
        danger: true,
        onSelect: () => ws.ui.openDialog({ type: "confirm-delete", libraryID: lib.id, paths: [path] }),
      },
    ]

    ws.ui.openMenu({ x: rect.right, y: rect.bottom + 4, items })
  }

  const libraryMenu = (event: MouseEvent) => {
    const lib = library()

    if (!lib) return

    if (!(event.currentTarget instanceof HTMLElement)) return

    const rect = event.currentTarget.getBoundingClientRect()

    const items: MenuItem[] = [
      {
        label: language.t("knowledge.workspace.menu.settings"),
        icon: "settings-gear",
        onSelect: () => ws.ui.openDialog({ type: "settings", libraryID: lib.id }),
      },
      {
        label: language.t("knowledge.workspace.library.newFolder"),
        icon: "folder-plus",
        onSelect: () => ws.ui.openDialog({ type: "new-folder", libraryID: lib.id }),
      },
      {
        label: language.t("knowledge.workspace.menu.rename"),
        icon: "edit",
        onSelect: () => ws.ui.openDialog({ type: "rename-library", libraryID: lib.id }),
      },
      {
        label: language.t(lib.favorite ? "knowledge.workspace.menu.unfavorite" : "knowledge.workspace.menu.favorite"),
        icon: "pin",
        onSelect: () => {
          ws.knowledge.libraries.setFavorite(lib.id, !lib.favorite)
          ws.ui.notify(
            language.t(lib.favorite ? "knowledge.workspace.toast.unfavorite" : "knowledge.workspace.toast.favorite", {
              name: lib.name,
            }),
          )
        },
      },
      { separator: true },
      {
        label: language.t("knowledge.workspace.menu.deleteLibrary"),
        icon: "outline-trash",
        danger: true,
        onSelect: () => ws.ui.openDialog({ type: "delete-library", libraryID: lib.id }),
      },
    ]

    ws.ui.openMenu({ x: rect.right, y: rect.bottom + 4, items })
  }

  const sortMenu = (event: MouseEvent) => {
    if (!(event.currentTarget instanceof HTMLElement)) return

    const rect = event.currentTarget.getBoundingClientRect()
    const options = ["updated", "name", "size"] as const

    ws.ui.openMenu({
      x: rect.left,
      y: rect.bottom + 4,
      items: options.map((option) => ({
        label: language.t(`knowledge.workspace.library.sort.${option}`),
        checked: ws.ui.store.sort === option,
        onSelect: () => ws.ui.setStore("sort", option),
      })),
    })
  }

  const typeMenu = (event: MouseEvent) => {
    if (!(event.currentTarget instanceof HTMLElement)) return

    const rect = event.currentTarget.getBoundingClientRect()
    const options: ReadonlyArray<FileTypeGroup | "all"> = ["all", ...FILE_TYPE_GROUPS]

    ws.ui.openMenu({
      x: rect.left,
      y: rect.bottom + 4,
      items: options.map((option) => ({
        label: language.t(option === "all" ? "knowledge.workspace.type.all" : typeLabelKey(option)),
        checked: ws.ui.store.type === option,
        onSelect: () => ws.ui.setStore("type", option),
      })),
    })
  }

  const toggle = (path: string) => ws.ui.toggleSelected(path, !ws.ui.store.selected.includes(path))

  const openFile = (event: MouseEvent, path: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      toggle(path)

      return
    }

    const lib = library()

    if (!lib) return
    ws.openDocument(lib.id, path)
  }

  const drop = async (event: DragEvent) => {
    event.preventDefault()
    ws.ui.setDragging(false)

    const paths = [...(event.dataTransfer?.files ?? [])].flatMap((file) => {
      const path = platform.getPathForFile?.(file)

      return path ? [path] : []
    })

    if (!paths.length) return

    await upload(paths)
  }

  const statusLabel = (status: FileStatusFilter) => {
    if (status === "ready") return language.t("knowledge.workspace.status.ready")

    if (status === "busy") return language.t("knowledge.workspace.library.status.active")

    if (status === "flag") return language.t("knowledge.workspace.status.failed")

    return language.t("knowledge.workspace.collections.all")
  }

  const countOf = (status: FileStatusFilter) => {
    if (status === "ready") return ready()

    if (status === "busy") return active()

    if (status === "flag") return failed()

    return own().length
  }

  const toneOf = (status: FileStatusFilter) => {
    if (status === "busy") return "busy"

    if (status === "flag") return "flag"

    return undefined
  }

  createEffect(() => {
    // Entering the library directly (or after a reload) still needs the desktop file list.
    const id = ws.ui.store.libraryID

    if (!id) return
    const lib = ws.knowledge.libraries.get(id)

    if (!lib) return
    void ws.data.refreshLibrary(id).catch(() => undefined)
  })

  return (
    <Show when={library()} fallback={<div class="kb-scroll" />}>
      {(current) => (
        <View name="library">
          <div
            class="kb-scroll"
            data-scrollable
            onDragOver={(event) => {
              if (!event.dataTransfer?.types.includes("Files")) return
              event.preventDefault()
              ws.ui.setDragging(true)
            }}
            onDragLeave={() => ws.ui.setDragging(false)}
            onDrop={(event) => void drop(event)}
          >
            <div class="kb-page">
              <button class="kb-back" type="button" onClick={() => ws.ui.closeLibrary()}>
                <Icon name="outline-arrow-left" class="ico ico-sm" />
                {language.t("knowledge.workspace.title")}
              </button>

              <header class="kb-head">
                <div>
                  <h1>{current().name}</h1>
                  <p>{current().summary || current().description || language.t("knowledge.summary.empty")}</p>
                </div>
                <div class="kb-tools">
                  <label class="kb-search">
                    <Icon name="magnifying-glass" class="ico ico-sm" />
                    <input
                      type="search"
                      placeholder={language.t("knowledge.workspace.library.search")}
                      aria-label={language.t("knowledge.workspace.library.search")}
                      autocomplete="off"
                      value={ws.ui.store.query}
                      onInput={(event) => ws.ui.setStore("query", event.currentTarget.value)}
                    />
                  </label>
                  <button class="kb-neutral" type="button" onClick={() => void upload()}>
                    <Icon name="outline-square-arrow" class="ico ico-sm" />
                    {language.t("knowledge.workspace.library.addFiles")}
                  </button>
                  <button
                    class="kb-icon-btn"
                    type="button"
                    aria-label={language.t("knowledge.workspace.library.more")}
                    onClick={libraryMenu}
                  >
                    <Icon name="outline-dots" class="ico" />
                  </button>
                </div>
              </header>

              <p class="kb-meta">
                <span>{language.plural("knowledge.files", own().length, { count: own().length })}</span>
                <span>{language.plural("knowledge.workspace.chunks", chunks(), { count: chunks() })}</span>
                <span>
                  {language.t("knowledge.workspace.library.meta.updated", {
                    time: formatWhen(libraryUpdatedAt(current()), language),
                  })}
                </span>
              </p>

              <Show when={own().length > 0}>
                <div class="kb-breakdown">
                  <div class="kb-meter" role="img" aria-label={language.t("knowledge.workspace.library.statusFilter")}>
                    <Show when={ready() > 0}>
                      <i data-tone="ready" style={{ flex: String(ready()) }} />
                    </Show>
                    <Show when={active() > 0}>
                      <i data-tone="busy" style={{ flex: String(active()) }} />
                    </Show>
                    <Show when={failed() > 0}>
                      <i data-tone="flag" style={{ flex: String(failed()) }} />
                    </Show>
                  </div>

                  <div class="kb-filters">
                    <div
                      class="kb-segments"
                      role="group"
                      aria-label={language.t("knowledge.workspace.library.statusFilter")}
                    >
                      <For each={["all", "ready", "busy", "flag"] as const}>
                        {(status) => (
                          <Show when={status === "all" || countOf(status) > 0}>
                            <button
                              type="button"
                              aria-pressed={ws.ui.store.status === status}
                              data-filter={status}
                              data-tone={toneOf(status)}
                              onClick={() => ws.ui.setStore("status", status)}
                            >
                              <Show when={toneOf(status)}>
                                <span class="kb-dot" aria-hidden="true" />
                              </Show>
                              {statusLabel(status)} <span class="n">{countOf(status)}</span>
                            </button>
                          </Show>
                        )}
                      </For>
                    </div>

                    <Show when={folders().length > 0}>
                      <select
                        class="kb-select"
                        aria-label={language.t("knowledge.workspace.library.folders")}
                        value={ws.ui.store.folder}
                        onChange={(event) => ws.ui.setStore("folder", event.currentTarget.value)}
                      >
                        <option value="all">{language.t("knowledge.workspace.library.allFiles")}</option>
                        <For each={folders()}>{(folder) => <option value={folder}>{folder}</option>}</For>
                      </select>
                    </Show>

                    <button
                      class="kb-sort"
                      type="button"
                      aria-label={language.t("knowledge.workspace.library.type")}
                      onClick={typeMenu}
                    >
                      {ws.ui.store.type === "all"
                        ? language.t("knowledge.workspace.library.type")
                        : language.t(typeLabelKey(ws.ui.store.type))}
                      <Icon name="outline-chevron-down" class="ico ico-sm" />
                    </button>

                    <button
                      class="kb-sort"
                      type="button"
                      aria-label={language.t("knowledge.workspace.library.sort")}
                      onClick={sortMenu}
                    >
                      {language.t(`knowledge.workspace.library.sort.${ws.ui.store.sort}`)}
                      <Icon name="outline-chevron-down" class="ico ico-sm" />
                    </button>
                  </div>
                </div>
              </Show>

              <Show
                when={filtered().length > 0}
                fallback={
                  <Show when={own().length > 0 || filtersActive()}>
                    <div class="kb-empty">
                      <span class="kb-empty-glyph">
                        <Icon name={filtersActive() ? "magnifying-glass" : "folder-plus"} class="ico" />
                      </span>
                      <h2>
                        {language.t(
                          filtersActive()
                            ? "knowledge.workspace.library.filtered.title"
                            : "knowledge.workspace.library.empty.title",
                        )}
                      </h2>
                      <p>
                        {language.t(
                          filtersActive()
                            ? "knowledge.workspace.library.filtered.hint"
                            : "knowledge.workspace.library.empty.hint",
                        )}
                      </p>
                      <Show
                        when={filtersActive()}
                        fallback={
                          <button class="kb-primary" type="button" onClick={() => void upload()}>
                            <Icon name="outline-square-arrow" class="ico ico-sm" />
                            {language.t("knowledge.workspace.library.addFiles")}
                          </button>
                        }
                      >
                        <button class="kb-neutral" type="button" onClick={() => ws.ui.clearFileFilters()}>
                          {language.t("knowledge.workspace.library.clearFilter")}
                        </button>
                      </Show>
                    </div>
                  </Show>
                }
              >
                <div class="kb-files">
                  <For each={filtered()}>
                    {(file) => (
                      <div
                        class="kb-file"
                        data-selected={ws.ui.store.selected.includes(file.path)}
                        onClick={(event) => openFile(event, file.path)}
                      >
                        <button class="kb-file-main" type="button">
                          <span class="kb-file-name">{fileName(file)}</span>
                          <span class="kb-file-sub">
                            {language.t(typeLabelKey(fileType(file)))}
                            {`，${formatBytes(file.size)}，`}
                            {language.plural("knowledge.workspace.chunks", fileChunks(file), {
                              count: fileChunks(file),
                            })}
                          </span>
                        </button>
                        <Show when={fileStatus(file) === "failed"} fallback={<FileStatus file={file} />}>
                          <button
                            class="kb-status"
                            type="button"
                            data-state="flag"
                            aria-label={language.t("knowledge.workspace.library.retry", { name: fileName(file) })}
                            onClick={(event) => {
                              event.stopPropagation()
                              void retry(file.path)
                            }}
                          >
                            <span class="kb-dot" aria-hidden="true" />
                            {language.t("knowledge.workspace.status.failed")}
                          </button>
                        </Show>
                        <span class="kb-time">{formatWhen(fileUpdatedAt(file), language)}</span>
                        <button
                          class="kb-file-more"
                          type="button"
                          aria-label={language.t("knowledge.workspace.library.more")}
                          onClick={(event) => fileMenu(event, file.path)}
                        >
                          <Icon name="outline-dots" class="ico ico-sm" />
                        </button>
                      </div>
                    )}
                  </For>
                  <p class="kb-foot">
                    {language.t("knowledge.workspace.library.foot.shown", {
                      shown: filtered().length,
                      total: own().length,
                    })}
                    <Show when={importing()}>
                      {(job) => (
                        <span>
                          {` · ${language.t(`knowledge.import.stage.${job().stage}`)} ${job().processed}/${job().total}`}
                        </span>
                      )}
                    </Show>
                  </p>
                </div>
              </Show>

              <Show when={own().length === 0 && !filtersActive()}>
                <div class="kb-empty">
                  <span class="kb-empty-glyph">
                    <Icon name="folder" class="ico" />
                  </span>
                  <h2>{language.t("knowledge.workspace.library.empty.title")}</h2>
                  <p>{language.t("knowledge.workspace.library.empty.hint")}</p>
                  <button class="kb-primary" type="button" onClick={() => void upload()}>
                    <Icon name="outline-square-arrow" class="ico ico-sm" />
                    {language.t("knowledge.workspace.library.addFiles")}
                  </button>
                </div>
              </Show>
            </div>
          </div>

          <Show when={ws.ui.store.selected.length > 0}>
            <div class="kb-selbar" role="status">
              <span class="kb-sel-count">
                {language.t("knowledge.workspace.library.selected", { count: ws.ui.store.selected.length })}
              </span>
              <span class="kb-sel-sep" aria-hidden="true" />
              <button
                class="kb-neutral"
                type="button"
                onClick={() =>
                  ws.ui.openDialog({ type: "move", libraryID: current().id, paths: [...ws.ui.store.selected] })
                }
              >
                <Icon name="folder" class="ico ico-sm" />
                {language.t("knowledge.workspace.library.selection.move")}
              </button>
              <button class="kb-neutral" type="button" onClick={() => void exportFiles([...ws.ui.store.selected])}>
                <Icon name="outline-square-arrow" class="ico ico-sm" />
                {language.t("knowledge.workspace.library.selection.export")}
              </button>
              <button
                class="kb-neutral"
                type="button"
                data-danger
                onClick={() =>
                  ws.ui.openDialog({
                    type: "confirm-delete",
                    libraryID: current().id,
                    paths: [...ws.ui.store.selected],
                  })
                }
              >
                <Icon name="outline-trash" class="ico ico-sm" />
                {language.t("knowledge.workspace.library.selection.trash")}
              </button>
              <span class="kb-spacer" />
              <button
                class="kb-neutral"
                type="button"
                onClick={() =>
                  ws.ui.selectPaths(
                    filtered().map((file) => file.path),
                    true,
                  )
                }
              >
                {language.t("knowledge.files.select")}
              </button>
              <button class="kb-neutral" type="button" onClick={() => ws.ui.clearSelection()}>
                {language.t("knowledge.workspace.library.selection.clear")}
              </button>
            </div>
          </Show>
        </View>
      )}
    </Show>
  )
}
