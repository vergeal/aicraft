import { Icon } from "@opencode/ui/icon"
import { createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { KnowledgeFile } from "../store"
import { FileGlyph, LibraryGlyph, View } from "./bits"
import { useWorkspace } from "./context"
import {
  fileName,
  fileChunks,
  fileFolder,
  fileType,
  formatBytes,
  formatWhen,
  libraryUpdatedAt,
  typeLabelKey,
} from "./format"
import type { LibraryCollection, MenuItem } from "./state"

const RECENT_LIMIT = 5

/**
 * The knowledge index, as drawn in docs/standard/design/prototypes/knowledge-index.html:
 * one column, a right-aligned page-number column, and a hairline under each chapter title.
 */
export function LibrariesView() {
  const ws = useWorkspace()
  const language = useLanguage()

  const libraries = () => ws.knowledge.libraries.libraries()
  const query = () => ws.ui.store.libraryQuery.trim().toLocaleLowerCase()

  const rows = createMemo(() => {
    const needle = query()

    const list = libraries().filter(
      (library) =>
        !needle ||
        `${library.name}\n${library.summary ?? ""}\n${library.description ?? ""}`.toLocaleLowerCase().includes(needle),
    )

    if (ws.ui.store.librarySort === "name") {
      return [...list].sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"))
    }

    if (ws.ui.store.librarySort === "count") {
      return [...list].sort((left, right) => right.files.length - left.files.length)
    }

    return [...list].sort((left, right) => libraryUpdatedAt(right) - libraryUpdatedAt(left))
  })

  const favorites = createMemo(() => libraries().filter((library) => library.favorite))
  const favoriteDocuments = createMemo(() => ws.documents().filter((entry) => entry.file.favorite))

  const trash = createMemo(() =>
    libraries()
      .map((library) => ({ library, files: library.files.filter((file) => file.deletedAt) }))
      .filter((group) => group.files.length > 0),
  )

  const trashCount = createMemo(() => trash().reduce((total, group) => total + group.files.length, 0))

  const recent = createMemo(() => {
    const needle = query()

    return [...ws.documents()]
      .filter((entry) => entry.file.openedAt)
      .filter(
        (entry) => !needle || `${fileName(entry.file)}\n${entry.library.name}`.toLocaleLowerCase().includes(needle),
      )
      .sort((left, right) => (right.file.openedAt ?? 0) - (left.file.openedAt ?? 0))
      .slice(0, RECENT_LIMIT)
  })

  const pending = createMemo(
    () => ws.documents().filter((entry) => (entry.file.processing?.status ?? "ready") !== "ready").length,
  )

  const collectionTabs = createMemo(
    (): ReadonlyArray<{ id: LibraryCollection; label: string; count: number }> => [
      { id: "libraries", label: language.t("knowledge.workspace.collections.all"), count: rows().length },
      {
        id: "favorites",
        label: language.t("knowledge.workspace.collections.favorites"),
        count: favorites().length + favoriteDocuments().length,
      },
      { id: "trash", label: language.t("knowledge.workspace.collections.trash"), count: trashCount() },
    ],
  )

  const live = (files: ReadonlyArray<KnowledgeFile>) => files.filter((file) => !file.deletedAt)

  const chunks = (files: ReadonlyArray<KnowledgeFile>) =>
    live(files).reduce((total, file) => total + fileChunks(file), 0)

  const summaryOf = (library: { summary?: string; description?: string }) =>
    library.summary || library.description || language.t("knowledge.summary.empty")

  const openRow = (event: KeyboardEvent, run: () => void) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    run()
  }

  const libraryMenu = (event: MouseEvent, libraryID: string) => {
    event.preventDefault()

    const library = ws.knowledge.libraries.get(libraryID)

    if (!library) return

    if (!(event.currentTarget instanceof HTMLElement)) return

    const rect = event.currentTarget.getBoundingClientRect()

    const items: MenuItem[] = [
      {
        label: language.t("knowledge.workspace.menu.open"),
        icon: "library",
        onSelect: () => ws.openLibrary(libraryID),
      },
      {
        label: language.t("knowledge.workspace.menu.rename"),
        icon: "edit",
        onSelect: () => ws.ui.openDialog({ type: "rename-library", libraryID }),
      },
      {
        label: language.t(
          library.favorite ? "knowledge.workspace.menu.unfavorite" : "knowledge.workspace.menu.favorite",
        ),
        icon: "pin",
        onSelect: () => {
          ws.knowledge.libraries.setFavorite(libraryID, !library.favorite)
          ws.ui.notify(
            language.t(
              library.favorite ? "knowledge.workspace.toast.unfavorite" : "knowledge.workspace.toast.favorite",
              {
                name: library.name,
              },
            ),
          )
        },
      },
      { separator: true },
      {
        label: language.t("knowledge.workspace.menu.deleteLibrary"),
        icon: "outline-trash",
        danger: true,
        onSelect: () => ws.ui.openDialog({ type: "delete-library", libraryID }),
      },
    ]

    ws.ui.openMenu({ x: rect.right, y: rect.bottom + 4, items })
  }

  const documentMenu = (event: MouseEvent, libraryID: string, path: string) => {
    event.preventDefault()

    const library = ws.knowledge.libraries.get(libraryID)
    const file = library?.files.find((entry) => entry.path === path)

    if (!library || !file) return

    if (!(event.currentTarget instanceof HTMLElement)) return

    const rect = event.currentTarget.getBoundingClientRect()

    const items: MenuItem[] = [
      {
        label: language.t("knowledge.workspace.menu.open"),
        icon: "file-document",
        onSelect: () => ws.openDocument(libraryID, path),
      },
      {
        label: language.t("knowledge.workspace.menu.unfavorite"),
        icon: "pin",
        onSelect: () => ws.knowledge.libraries.setFileFavorite(libraryID, path, false),
      },
      { separator: true },
      {
        label: language.t("knowledge.workspace.menu.trash"),
        icon: "outline-trash",
        danger: true,
        onSelect: () => ws.ui.openDialog({ type: "confirm-delete", libraryID, paths: [path] }),
      },
    ]

    ws.ui.openMenu({ x: rect.right, y: rect.bottom + 4, items })
  }

  const restore = (libraryID: string, path: string) => {
    ws.knowledge.libraries.restoreFiles(libraryID, [path])
    ws.ui.notify(language.t("knowledge.workspace.toast.restored"))
  }

  const libraryRow = (library: ReturnType<typeof libraries>[number]) => (
    <div
      class="kb-row"
      role="button"
      tabindex="0"
      onClick={() => ws.openLibrary(library.id)}
      onKeyDown={(event) => openRow(event, () => ws.openLibrary(library.id))}
      onContextMenu={(event) => libraryMenu(event, library.id)}
    >
      <span class="kb-tile">
        <LibraryGlyph />
      </span>
      <span class="kb-copy">
        <span class="kb-name">{library.name}</span>
        <span class="kb-desc">{summaryOf(library)}</span>
      </span>
      <span class="kb-index">
        <span>{live(library.files).length}</span>
        <span>{chunks(library.files)}</span>
      </span>
      <Icon name="outline-chevron-right" class="ico kb-go" />
    </div>
  )

  return (
    <View name="libraries">
      <div class="kb-scroll" data-scrollable>
        <div class="kb-page">
          <header class="kb-head">
            <div>
              <h1>{language.t("knowledge.workspace.title")}</h1>
              <p>{language.t("knowledge.workspace.libraries.description")}</p>
            </div>
            <div class="kb-tools">
              <label class="kb-search">
                <Icon name="magnifying-glass" class="ico ico-sm" />
                <input
                  type="search"
                  placeholder={language.t("knowledge.workspace.libraries.search")}
                  aria-label={language.t("knowledge.workspace.libraries.search")}
                  autocomplete="off"
                  value={ws.ui.store.libraryQuery}
                  onInput={(event) => ws.ui.setStore("libraryQuery", event.currentTarget.value)}
                />
              </label>
              <button
                class="kb-icon-btn"
                type="button"
                aria-label={language.t("knowledge.workspace.nav.jobs")}
                onClick={() => ws.ui.go("jobs")}
              >
                <Icon name="outline-list-changelog" class="ico" />
                <Show when={pending() > 0}>
                  <span class="kb-badge">{pending()}</span>
                </Show>
              </button>
              <button
                class="kb-icon-btn"
                type="button"
                aria-label={language.t("knowledge.workspace.nav.agents")}
                onClick={() => ws.ui.go("agents")}
              >
                <Icon name="outline-brain" class="ico" />
              </button>
              <button class="kb-primary" type="button" onClick={() => ws.ui.openDialog({ type: "new-library" })}>
                <Icon name="plus" class="ico ico-sm" />
                {language.t("knowledge.new")}
              </button>
            </div>
          </header>

          <div class="kb-tabs" role="tablist" aria-label={language.t("knowledge.workspace.nav.label")}>
            <For each={collectionTabs()}>
              {(tab) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={ws.ui.store.collection === tab.id}
                  onClick={() => ws.ui.setStore("collection", tab.id)}
                >
                  {tab.label} <span class="n">{tab.count}</span>
                </button>
              )}
            </For>
          </div>

          <Show when={ws.ui.store.collection === "libraries"}>
            <Show
              when={rows().length > 0 || recent().length > 0}
              fallback={
                <div class="kb-empty">
                  <span class="kb-empty-glyph">
                    <Icon name="library" class="ico" />
                  </span>
                  <h2>
                    {query()
                      ? language.t("knowledge.search.empty")
                      : language.t("knowledge.workspace.libraries.empty.title")}
                  </h2>
                  <p>
                    {query()
                      ? language.t("knowledge.workspace.library.filtered.hint")
                      : language.t("knowledge.workspace.libraries.empty.hint")}
                  </p>
                  <Show when={!query()}>
                    <button class="kb-primary" type="button" onClick={() => ws.ui.openDialog({ type: "new-library" })}>
                      <Icon name="plus" class="ico ico-sm" />
                      {language.t("knowledge.new")}
                    </button>
                  </Show>
                </div>
              }
            >
              <Show when={rows().length > 0}>
                <section class="kb-group">
                  <div class="kb-group-head">
                    <h2>{language.t("knowledge.workspace.collections.libraries")}</h2>
                    <span class="kb-rule" aria-hidden="true" />
                    <span class="kb-cols" aria-hidden="true">
                      <span>{language.t("knowledge.workspace.libraries.columns.documents")}</span>
                      <span>{language.t("knowledge.workspace.libraries.columns.chunks")}</span>
                    </span>
                  </div>
                  <div class="kb-rows">
                    <For each={rows()}>{(library) => libraryRow(library)}</For>
                  </div>
                </section>
              </Show>

              <Show when={recent().length > 0}>
                <section class="kb-group">
                  <div class="kb-group-head">
                    <h2>{language.t("knowledge.workspace.collections.recent")}</h2>
                    <span class="kb-rule" aria-hidden="true" />
                  </div>
                  <div class="kb-rows">
                    <For each={recent()}>
                      {(entry) => (
                        <div
                          class="kb-row"
                          data-kind="recent"
                          role="button"
                          tabindex="0"
                          onClick={() => ws.openDocument(entry.library.id, entry.file.path)}
                          onKeyDown={(event) =>
                            openRow(event, () => ws.openDocument(entry.library.id, entry.file.path))
                          }
                        >
                          <span class="kb-tile">
                            <FileGlyph />
                          </span>
                          <span class="kb-copy">
                            <span class="kb-name">{fileName(entry.file)}</span>
                            <span class="kb-desc">
                              {entry.library.name}
                              <Show when={fileFolder(entry.file)}>{` › ${fileFolder(entry.file)}`}</Show>
                            </span>
                          </span>
                          <span class="kb-when">{formatWhen(entry.file.openedAt, language)}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              <Show when={rows().length > 0}>
                <p class="kb-foot">
                  {language.t("knowledge.workspace.libraries.foot", {
                    libraries: rows().length,
                    documents: libraries().reduce((total, library) => total + live(library.files).length, 0),
                    chunks: libraries().reduce((total, library) => total + chunks(library.files), 0),
                  })}
                </p>
              </Show>
            </Show>
          </Show>

          <Show when={ws.ui.store.collection === "favorites"}>
            <Show
              when={favorites().length > 0 || favoriteDocuments().length > 0}
              fallback={
                <div class="kb-empty">
                  <span class="kb-empty-glyph">
                    <Icon name="pin" class="ico" />
                  </span>
                  <h2>{language.t("knowledge.workspace.collections.favoritesEmpty.title")}</h2>
                  <p>{language.t("knowledge.workspace.collections.favoritesEmpty.hint")}</p>
                </div>
              }
            >
              <Show when={favorites().length > 0}>
                <section class="kb-group">
                  <div class="kb-group-head">
                    <h2>{language.t("knowledge.workspace.collections.favoriteLibraries")}</h2>
                    <span class="kb-rule" aria-hidden="true" />
                    <span class="kb-cols" aria-hidden="true">
                      <span>{language.t("knowledge.workspace.libraries.columns.documents")}</span>
                      <span>{language.t("knowledge.workspace.libraries.columns.chunks")}</span>
                    </span>
                  </div>
                  <div class="kb-rows">
                    <For each={favorites()}>{(library) => libraryRow(library)}</For>
                  </div>
                </section>
              </Show>

              <Show when={favoriteDocuments().length > 0}>
                <section class="kb-group">
                  <div class="kb-group-head">
                    <h2>{language.t("knowledge.workspace.collections.favoriteDocuments")}</h2>
                    <span class="kb-rule" aria-hidden="true" />
                  </div>
                  <div class="kb-rows">
                    <For each={favoriteDocuments()}>
                      {(entry) => (
                        <div
                          class="kb-row"
                          data-kind="recent"
                          role="button"
                          tabindex="0"
                          onClick={() => ws.openDocument(entry.library.id, entry.file.path)}
                          onKeyDown={(event) =>
                            openRow(event, () => ws.openDocument(entry.library.id, entry.file.path))
                          }
                          onContextMenu={(event) => documentMenu(event, entry.library.id, entry.file.path)}
                        >
                          <span class="kb-tile">
                            <FileGlyph />
                          </span>
                          <span class="kb-copy">
                            <span class="kb-name">{fileName(entry.file)}</span>
                            <span class="kb-desc">
                              {entry.library.name}
                              {` › ${language.t(typeLabelKey(fileType(entry.file)))}`}
                            </span>
                          </span>
                          <span class="kb-row-flag" aria-label={language.t("knowledge.workspace.collections.favorite")}>
                            <Icon name="pin" class="ico ico-sm" />
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Show>
            </Show>
          </Show>

          <Show when={ws.ui.store.collection === "trash"}>
            <Show
              when={trash().length > 0}
              fallback={
                <div class="kb-empty">
                  <span class="kb-empty-glyph">
                    <Icon name="trash" class="ico" />
                  </span>
                  <h2>{language.t("knowledge.workspace.collections.trashEmpty.title")}</h2>
                  <p>{language.t("knowledge.workspace.collections.trashEmpty.hint")}</p>
                </div>
              }
            >
              <For each={trash()}>
                {(group) => (
                  <section class="kb-group">
                    <div class="kb-group-head">
                      <h2>{group.library.name}</h2>
                      <span class="kb-rule" aria-hidden="true" />
                      <span class="kb-cols" aria-hidden="true">
                        <span>{language.t("knowledge.workspace.library.columns.size")}</span>
                        <span />
                      </span>
                    </div>
                    <div class="kb-rows">
                      <For each={group.files}>
                        {(file) => (
                          <div class="kb-row" data-kind="trash">
                            <span class="kb-tile">
                              <FileGlyph />
                            </span>
                            <span class="kb-copy">
                              <span class="kb-name">{fileName(file)}</span>
                              <span class="kb-desc">
                                {language.t("knowledge.workspace.collections.deletedAt", {
                                  time: formatWhen(file.deletedAt, language),
                                })}
                              </span>
                            </span>
                            <span class="kb-index">
                              <span>{formatBytes(file.size)}</span>
                            </span>
                            <span class="kb-row-actions">
                              <button
                                class="kb-row-link"
                                type="button"
                                onClick={() => restore(group.library.id, file.path)}
                              >
                                {language.t("knowledge.workspace.collections.restore")}
                              </button>
                              <button
                                class="kb-row-link"
                                type="button"
                                data-danger
                                onClick={() =>
                                  ws.ui.openDialog({
                                    type: "confirm-purge",
                                    libraryID: group.library.id,
                                    path: file.path,
                                  })
                                }
                              >
                                {language.t("knowledge.workspace.collections.purge")}
                              </button>
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </section>
                )}
              </For>
              <p class="kb-foot">{language.t("knowledge.workspace.collections.trashNote")}</p>
              <button
                class="kb-neutral"
                type="button"
                onClick={() => ws.ui.openDialog({ type: "confirm-empty-trash" })}
              >
                {language.t("knowledge.workspace.collections.emptyTrash")}
              </button>
            </Show>
          </Show>
        </div>
      </div>
    </View>
  )
}
