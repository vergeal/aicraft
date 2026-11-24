import { Icon } from "@aicraft/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { createEffect, createMemo, For, Show } from "solid-js"
import { knowledgeImports } from "../import-status"
import type { KnowledgeFileStatus } from "../store"
import { FileGlyph, FileStatus, PageHead, View } from "./bits"
import { useWorkspace } from "./context"
import {
  FILE_TYPE_GROUPS,
  fileFolder,
  fileStatus,
  fileType,
  fileName,
  fileUpdatedAt,
  fileChunks,
  formatBytes,
  formatWhen,
  libraryUpdatedAt,
  typeLabelKey,
  type FileTypeGroup,
} from "./format"
import type { FileStatusFilter, MenuItem } from "./state"

const ACTIVE_STATUSES: ReadonlyArray<KnowledgeFileStatus> = ["pending", "parsing", "indexing"]

/** One library: its documents as a single list, filtered from the row above it. */
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
    const inferred = own().map(fileFolder).filter((folder) => folder.length > 0)

    return [...new Set([...declared, ...inferred])]
  })

  const query = () => ws.ui.store.query.trim().toLocaleLowerCase()

  const filtered = createMemo(() =>
    own()
      .filter((file) => ws.ui.store.folder === "all" || fileFolder(file) === ws.ui.store.folder)
      .filter((file) => ws.ui.store.type === "all" || fileType(file) === ws.ui.store.type)
      .filter((file) => {
        const status = fileStatus(file)

        if (ws.ui.store.status === "active") return ACTIVE_STATUSES.includes(status)

        if (ws.ui.store.status === "failed") return status === "failed"

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

  const importing = () => {
    const id = ws.ui.store.libraryID

    return id ? knowledgeImports.get(id) : undefined
  }

  const selectedCount = () => ws.ui.store.selected.length
  const allSelected = () => filtered().length > 0 && filtered().every((file) => ws.ui.store.selected.includes(file.path))
  const someSelected = () => filtered().some((file) => ws.ui.store.selected.includes(file.path))

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

  const openMenu = (event: MouseEvent, path: string) => {
    event.stopPropagation()

    const lib = library()

    if (!lib) return
    const file = own().find((entry) => entry.path === path)

    if (!file) return

    if (!(event.currentTarget instanceof HTMLElement)) return

    const rect = event.currentTarget.getBoundingClientRect()

    const items: MenuItem[] = [
      { label: language.t("knowledge.workspace.menu.open"), icon: "file-document", onSelect: () => ws.openDocument(lib.id, path) },
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

  const selectAll = (checked: boolean) =>
    ws.ui.selectPaths(
      filtered().map((file) => file.path),
      checked,
    )

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

  const setStatus = (status: FileStatusFilter) => {
    ws.ui.setStore("status", status)
    ws.ui.setStore("folder", "all")
  }

  const statusLabel = (status: FileStatusFilter) => {
    if (status === "active") return language.t("knowledge.workspace.library.status.active")

    if (status === "failed") return language.t("knowledge.workspace.library.status.failed")

    return language.t("knowledge.workspace.library.status.all")
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
              <PageHead
                back={{ label: language.t("knowledge.back"), onClick: () => ws.ui.closeLibrary() }}
                title={current().name}
                description={current().summary || current().description || language.t("knowledge.summary.empty")}
                actions={
                  <>
                    <button
                      class="kb-btn kb-btn-primary"
                      type="button"
                      onClick={() => void upload()}
                    >
                      <Icon name="plus" class="ico" />
                      <span>{language.t("knowledge.workspace.library.addFiles")}</span>
                    </button>
                    <button
                      class="kb-icon"
                      type="button"
                      aria-pressed={Boolean(current().favorite)}
                      aria-label={language.t("knowledge.workspace.library.star")}
                      onClick={() => {
                        ws.knowledge.libraries.setFavorite(current().id, !current().favorite)
                        ws.ui.notify(
                          language.t(
                            current().favorite
                              ? "knowledge.workspace.toast.unfavorite"
                              : "knowledge.workspace.toast.favorite",
                            { name: current().name },
                          ),
                        )
                      }}
                    >
                      <Icon name="pin" class="ico" />
                    </button>
                    <button
                      class="kb-icon"
                      type="button"
                      aria-label={language.t("knowledge.workspace.library.settings")}
                      onClick={() => ws.ui.openDialog({ type: "settings", libraryID: current().id })}
                    >
                      <Icon name="settings-gear" class="ico" />
                    </button>
                    <button
                      class="kb-icon"
                      type="button"
                      aria-label={language.t("knowledge.workspace.library.more")}
                      onClick={libraryMenu}
                    >
                      <Icon name="outline-dots" class="ico" />
                    </button>
                  </>
                }
                meta={
                  <>
                    <span>
                      {language.plural("knowledge.files", own().length, { count: own().length })}
                    </span>
                    <span class="kb-sep" aria-hidden="true" />
                    <span>
                      {language.plural("knowledge.workspace.chunks", chunks(), { count: chunks() })}
                    </span>
                    <span class="kb-sep" aria-hidden="true" />
                    <span>
                      {language.t("knowledge.workspace.library.meta.updated", {
                        time: formatWhen(libraryUpdatedAt(current()), language),
                      })}
                    </span>
                    <Show when={active() > 0}>
                      <span class="kb-sep" aria-hidden="true" />
                      <span class="status" data-state="busy">
                        <span class="dot" aria-hidden="true" />
                        {language.t("knowledge.workspace.library.meta.processing", { count: active() })}
                      </span>
                    </Show>
                    <Show when={failed() > 0}>
                      <span class="kb-sep" aria-hidden="true" />
                      <span class="status" data-state="failed">
                        <span class="dot" aria-hidden="true" />
                        {language.t("knowledge.workspace.library.meta.failed", { count: failed() })}
                      </span>
                    </Show>
                  </>
                }
              />

              <div class="kb-toolbar">
                <label class="kb-field">
                  <Icon name="magnifying-glass" class="ico" />
                  <input
                    type="search"
                    placeholder={language.t("knowledge.workspace.library.search")}
                    autocomplete="off"
                    value={ws.ui.store.query}
                    onInput={(event) => ws.ui.setStore("query", event.currentTarget.value)}
                  />
                </label>
                <div class="kb-segments" role="tablist" aria-label={language.t("knowledge.workspace.library.statusFilter")}>
                  <For each={["all", "active", "failed"] as const}>
                    {(status) => (
                      <button
                        class="kb-segment"
                        type="button"
                        role="tab"
                        aria-selected={ws.ui.store.status === status}
                        onClick={() => setStatus(status)}
                      >
                        {statusLabel(status)}
                      </button>
                    )}
                  </For>
                </div>
                <span class="kb-spacer" />
                <select
                  class="kb-select"
                  aria-label={language.t("knowledge.workspace.library.folders")}
                  value={ws.ui.store.folder}
                  onChange={(event) => ws.ui.setStore("folder", event.currentTarget.value)}
                >
                  <option value="all">{language.t("knowledge.workspace.library.allFiles")}</option>
                  <For each={folders()}>{(folder) => <option value={folder}>{folder}</option>}</For>
                </select>
                <button
                  class="kb-select kb-select-action"
                  type="button"
                  aria-label={language.t("knowledge.workspace.library.type")}
                  onClick={(event) => {
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
                  }}
                >
                  {ws.ui.store.type === "all"
                    ? language.t("knowledge.workspace.library.type")
                    : language.t(typeLabelKey(ws.ui.store.type))}
                </button>
                <select
                  class="kb-select"
                  aria-label={language.t("knowledge.workspace.library.sort")}
                  value={ws.ui.store.sort}
                  onChange={(event) => {
                    const sort = event.currentTarget.value

                    if (sort === "updated" || sort === "name" || sort === "size") ws.ui.setStore("sort", sort)
                  }}
                >
                  <option value="updated">{language.t("knowledge.workspace.library.sort.updated")}</option>
                  <option value="name">{language.t("knowledge.workspace.library.sort.name")}</option>
                  <option value="size">{language.t("knowledge.workspace.library.sort.size")}</option>
                </select>
                <button
                  class="kb-icon"
                  type="button"
                  aria-label={language.t("knowledge.workspace.library.newFolder")}
                  onClick={() => ws.ui.openDialog({ type: "new-folder", libraryID: current().id })}
                >
                  <Icon name="folder-plus" class="ico" />
                </button>
              </div>

              <Show
                when={filtered().length > 0}
                fallback={
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
                        <button class="kb-btn kb-btn-primary" type="button" onClick={() => void upload()}>
                          {language.t("knowledge.workspace.library.addFiles")}
                        </button>
                      }
                    >
                      <button class="kb-btn" type="button" onClick={() => ws.ui.clearFileFilters()}>
                        {language.t("knowledge.workspace.library.clearFilter")}
                      </button>
                    </Show>
                  </div>
                }
              >
                <div class="kb-doc-head">
                  <label class="kb-check">
                    <SelectAll
                      checked={allSelected()}
                      indeterminate={!allSelected() && someSelected()}
                      ariaLabel={language.t("knowledge.files.select")}
                      onChange={selectAll}
                    />
                  </label>
                  <span>{language.t("knowledge.workspace.library.columns.name")}</span>
                  <span class="kb-doc-head-meta">
                    {language.t("knowledge.workspace.library.columns.folder")}
                  </span>
                  <span class="kb-doc-head-status">
                    {language.t("knowledge.workspace.library.columns.status")}
                  </span>
                  <span />
                </div>
                <div class="kb-rows">
                  <For each={filtered()}>
                    {(file) => (
                      <div
                        class="kb-doc"
                        data-row={file.path}
                        data-selected={ws.ui.store.selected.includes(file.path)}
                        tabindex="0"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") ws.openDocument(current().id, file.path)
                        }}
                      >
                        <span class="kb-check">
                          <input
                            type="checkbox"
                            checked={ws.ui.store.selected.includes(file.path)}
                            aria-label={fileName(file)}
                            onChange={(event) => ws.ui.toggleSelected(file.path, event.currentTarget.checked)}
                          />
                        </span>
                        <button class="kb-doc-main" type="button" onClick={() => ws.openDocument(current().id, file.path)}>
                          <FileGlyph />
                          <span class="kb-row-body">
                            <span class="kb-row-title">{fileName(file)}</span>
                            <span class="kb-row-sub">
                              {language.t(typeLabelKey(fileType(file)))}
                              <span class="kb-sep" aria-hidden="true" />
                              {formatBytes(file.size)}
                              <span class="kb-sep" aria-hidden="true" />
                              {formatWhen(fileUpdatedAt(file), language)}
                            </span>
                          </span>
                        </button>
                        <span class="kb-doc-folder">{fileFolder(file) || language.t("knowledge.workspace.dialog.root")}</span>
                        <span class="kb-doc-status">
                          <FileStatus file={file} />
                          <Show when={fileStatus(file) === "failed"}>
                            <button
                              class="kb-icon kb-icon-sm"
                              type="button"
                              aria-label={language.t("knowledge.workspace.library.retry", { name: fileName(file) })}
                              onClick={(event) => {
                                event.stopPropagation()
                                void retry(file.path)
                              }}
                            >
                              <Icon name="refresh" class="ico ico-sm" />
                            </button>
                          </Show>
                        </span>
                        <button
                          class="kb-icon"
                          type="button"
                          aria-label={language.t("knowledge.workspace.library.more")}
                          onClick={(event) => openMenu(event, file.path)}
                        >
                          <Icon name="outline-dots" class="ico" />
                        </button>
                      </div>
                    )}
                  </For>
                </div>
                <p class="kb-foot">
                  <span>
                    {language.t("knowledge.workspace.library.foot.shown", {
                      shown: filtered().length,
                      total: own().length,
                    })}
                  </span>
                  <span class="kb-spacer" />
                  <Show when={importing()} fallback={<span>{language.t("knowledge.workspace.library.foot.local")}</span>}>
                    {(job) => (
                      <span>
                        {language.t(`knowledge.import.stage.${job().stage}`)} · {job().processed}/{job().total}
                      </span>
                    )}
                  </Show>
                </p>
              </Show>
            </div>
          </div>

          <Show when={selectedCount() > 0}>
            <div class="kb-selbar" role="status">
              <span class="kb-sel-count">
                {language.t("knowledge.workspace.library.selected", { count: selectedCount() })}
              </span>
              <span class="kb-sel-sep" aria-hidden="true" />
              <button
                class="kb-btn kb-btn-sm"
                type="button"
                onClick={() => ws.ui.openDialog({ type: "move", libraryID: current().id, paths: [...ws.ui.store.selected] })}
              >
                <Icon name="folder" class="ico" />
                {language.t("knowledge.workspace.library.selection.move")}
              </button>
              <button class="kb-btn kb-btn-sm" type="button" onClick={() => void exportFiles([...ws.ui.store.selected])}>
                <Icon name="outline-square-arrow" class="ico" />
                {language.t("knowledge.workspace.library.selection.export")}
              </button>
              <button
                class="kb-btn kb-btn-sm kb-btn-danger"
                type="button"
                onClick={() =>
                  ws.ui.openDialog({ type: "confirm-delete", libraryID: current().id, paths: [...ws.ui.store.selected] })
                }
              >
                <Icon name="outline-trash" class="ico" />
                {language.t("knowledge.workspace.library.selection.trash")}
              </button>
              <span class="kb-sel-sep" aria-hidden="true" />
              <button class="kb-btn kb-btn-sm kb-btn-ghost" type="button" onClick={() => ws.ui.clearSelection()}>
                {language.t("knowledge.workspace.library.selection.clear")}
              </button>
            </div>
          </Show>
        </View>
      )}
    </Show>
  )
}

function SelectAll(props: {
  checked: boolean
  indeterminate: boolean
  ariaLabel: string
  onChange: (checked: boolean) => void
}) {
  let element!: HTMLInputElement

  createEffect(() => {
    if (element) element.indeterminate = props.indeterminate
  })

  return (
    <input
      ref={element}
      type="checkbox"
      checked={props.checked}
      aria-label={props.ariaLabel}
      onChange={(event) => props.onChange(event.currentTarget.checked)}
    />
  )
}
