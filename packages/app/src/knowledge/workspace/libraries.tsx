import { Icon } from "@opencode/ui/icon"
import { createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { FileGlyph, LibraryGlyph, PageHead, View } from "./bits"
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
 * The knowledge home: the libraries themselves, plus the three collections that share the same
 * list. Everything here is one reading column; the view is chosen in the toolbar, not in a sidebar.
 */
export function LibrariesView() {
  const ws = useWorkspace()
  const language = useLanguage()

  const libraries = () => ws.knowledge.libraries.libraries()
  const query = () => ws.ui.store.libraryQuery.trim().toLocaleLowerCase()

  const rows = createMemo(() => {
    const needle = query()

    const list = libraries().filter((library) =>
      !needle || `${library.name}\n${library.summary ?? ""}\n${library.description ?? ""}`.toLocaleLowerCase().includes(needle),
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

  const trash = createMemo(
    () =>
      libraries()
        .map((library) => ({
          library,
          files: library.files.filter((file) => file.deletedAt),
        }))
        .filter((group) => group.files.length > 0),
  )

  const trashCount = createMemo(() => trash().reduce((total, group) => total + group.files.length, 0))

  const recent = createMemo(() =>
    [...ws.documents()]
      .filter((entry) => entry.file.openedAt)
      .sort((left, right) => (right.file.openedAt ?? 0) - (left.file.openedAt ?? 0))
      .slice(0, RECENT_LIMIT),
  )

  const pending = createMemo(
    () => ws.documents().filter((entry) => (entry.file.processing?.status ?? "ready") !== "ready").length,
  )

  const collectionTabs = createMemo(
    (): ReadonlyArray<{ id: LibraryCollection; label: string }> => [
      { id: "libraries", label: language.t("knowledge.workspace.collections.libraries") },
      { id: "favorites", label: language.t("knowledge.workspace.collections.favorites") },
      { id: "trash", label: language.t("knowledge.workspace.collections.trash") },
    ],
  )

  const menu = (event: MouseEvent, libraryID: string) => {
    event.stopPropagation()

    const library = ws.knowledge.libraries.get(libraryID)

    if (!library) return

    if (!(event.currentTarget instanceof HTMLElement)) return

    const rect = event.currentTarget.getBoundingClientRect()

    const items: MenuItem[] = [
      { label: language.t("knowledge.workspace.menu.open"), icon: "library", onSelect: () => ws.openLibrary(libraryID) },
      {
        label: language.t("knowledge.workspace.menu.rename"),
        icon: "edit",
        onSelect: () => ws.ui.openDialog({ type: "rename-library", libraryID }),
      },
      {
        label: language.t(library.favorite ? "knowledge.workspace.menu.unfavorite" : "knowledge.workspace.menu.favorite"),
        icon: "pin",
        onSelect: () => {
          ws.knowledge.libraries.setFavorite(libraryID, !library.favorite)
          ws.ui.notify(
            language.t(library.favorite ? "knowledge.workspace.toast.unfavorite" : "knowledge.workspace.toast.favorite", {
              name: library.name,
            }),
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

  const pin = (event: MouseEvent, libraryID: string) => {
    event.stopPropagation()

    const library = ws.knowledge.libraries.get(libraryID)

    if (!library) return
    ws.knowledge.libraries.setFavorite(libraryID, !library.favorite)
    ws.ui.notify(
      language.t(library.favorite ? "knowledge.workspace.toast.unfavorite" : "knowledge.workspace.toast.favorite", {
        name: library.name,
      }),
    )
  }

  const restore = (libraryID: string, path: string) => {
    ws.knowledge.libraries.restoreFiles(libraryID, [path])
    ws.ui.notify(language.t("knowledge.workspace.toast.restored"))
  }

  const openRow = (event: KeyboardEvent, run: () => void) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    run()
  }

  return (
    <View name="libraries">
      <div class="kb-scroll" data-scrollable>
        <div class="kb-page">
          <PageHead
            title={language.t("knowledge.workspace.title")}
            description={language.t("knowledge.workspace.libraries.description")}
            actions={
              <>
                <button
                  class="kb-icon"
                  type="button"
                  aria-label={language.t("knowledge.workspace.search.entry")}
                  onClick={() => ws.ui.openSearch()}
                >
                  <Icon name="magnifying-glass" class="ico" />
                </button>
                <button class="kb-btn" type="button" onClick={() => ws.ui.go("jobs")}>
                  <Icon name="outline-list-changelog" class="ico" />
                  <span>{language.t("knowledge.workspace.nav.jobs")}</span>
                  <Show when={pending() > 0}>
                    <span class="kb-count">{pending()}</span>
                  </Show>
                </button>
                <button class="kb-btn" type="button" onClick={() => ws.ui.go("agents")}>
                  <Icon name="outline-brain" class="ico" />
                  <span>{language.t("knowledge.workspace.nav.agents")}</span>
                </button>
                <button class="kb-btn kb-btn-primary" type="button" onClick={() => ws.ui.openDialog({ type: "new-library" })}>
                  <Icon name="plus" class="ico" />
                  <span>{language.t("knowledge.new")}</span>
                </button>
              </>
            }
          />

          <div class="kb-toolbar">
            <div class="kb-segments" role="tablist" aria-label={language.t("knowledge.workspace.nav.label")}>
              <For each={collectionTabs()}>
                {(tab) => (
                  <button
                    class="kb-segment"
                    type="button"
                    role="tab"
                    aria-selected={ws.ui.store.collection === tab.id}
                    onClick={() => ws.ui.setStore("collection", tab.id)}
                  >
                    {tab.label}
                  </button>
                )}
              </For>
            </div>
            <span class="kb-spacer" />
            <label class="kb-field">
              <Icon name="magnifying-glass" class="ico" />
              <input
                type="search"
                placeholder={language.t("knowledge.workspace.libraries.search")}
                autocomplete="off"
                value={ws.ui.store.libraryQuery}
                onInput={(event) => ws.ui.setStore("libraryQuery", event.currentTarget.value)}
              />
            </label>
            <Show
              when={ws.ui.store.collection !== "trash"}
              fallback={
                <Show when={trashCount() > 0}>
                  <button
                    class="kb-btn kb-btn-ghost"
                    type="button"
                    onClick={() => ws.ui.openDialog({ type: "confirm-empty-trash" })}
                  >
                    {language.t("knowledge.workspace.collections.emptyTrash")}
                  </button>
                </Show>
              }
            >
              <select
                class="kb-select"
                aria-label={language.t("knowledge.workspace.libraries.sort")}
                value={ws.ui.store.librarySort}
                onChange={(event) => {
                  const sort = event.currentTarget.value

                  if (sort === "updated" || sort === "name" || sort === "count") ws.ui.setStore("librarySort", sort)
                }}
              >
                <option value="updated">{language.t("knowledge.workspace.libraries.sort.updated")}</option>
                <option value="name">{language.t("knowledge.workspace.libraries.sort.name")}</option>
                <option value="count">{language.t("knowledge.workspace.libraries.sort.count")}</option>
              </select>
            </Show>
          </div>

          <Show when={ws.ui.store.collection === "libraries"}>
            <Show
              when={rows().length > 0}
              fallback={
                <div class="kb-empty">
                  <span class="kb-empty-glyph">
                    <Icon name="library" class="ico" />
                  </span>
                  <h2>{query() ? language.t("knowledge.search.empty") : language.t("knowledge.workspace.libraries.empty.title")}</h2>
                  <p>
                    {query()
                      ? language.t("knowledge.workspace.library.filtered.hint")
                      : language.t("knowledge.workspace.libraries.empty.hint")}
                  </p>
                  <Show when={!query()}>
                    <button
                      class="kb-btn kb-btn-primary"
                      type="button"
                      onClick={() => ws.ui.openDialog({ type: "new-library" })}
                    >
                      {language.t("knowledge.new")}
                    </button>
                  </Show>
                </div>
              }
            >
              <div class="kb-rows">
                <For each={rows()}>
                  {(library) => {
                    const documents = () => library.files.filter((file) => !file.deletedAt)
                    const passages = () => documents().reduce((total, file) => total + fileChunks(file), 0)

                    return (
                      <div
                        class="kb-row"
                        role="button"
                        tabindex="0"
                        onClick={() => ws.openLibrary(library.id)}
                        onKeyDown={(event) => openRow(event, () => ws.openLibrary(library.id))}
                      >
                        <span class="kb-row-glyph">
                          <LibraryGlyph />
                        </span>
                        <span class="kb-row-body">
                          <span class="kb-row-title">{library.name}</span>
                          <span class="kb-row-sub">
                            {library.summary || library.description || language.t("knowledge.summary.empty")}
                          </span>
                        </span>
                        <span class="kb-row-meta">
                          {language.plural("knowledge.files", documents().length, { count: documents().length })}
                          <span class="kb-sep" aria-hidden="true" />
                          {language.plural("knowledge.workspace.chunks", passages(), { count: passages() })}
                        </span>
                        <span class="kb-row-time">{formatWhen(libraryUpdatedAt(library), language)}</span>
                        <span class="kb-row-actions">
                          <button
                            class="kb-icon"
                            type="button"
                            aria-pressed={Boolean(library.favorite)}
                            aria-label={language.t("knowledge.workspace.library.star")}
                            onClick={(event) => pin(event, library.id)}
                          >
                            <Icon name="pin" class="ico" />
                          </button>
                          <button
                            class="kb-icon"
                            type="button"
                            aria-label={language.t("knowledge.workspace.library.more")}
                            onClick={(event) => menu(event, library.id)}
                          >
                            <Icon name="outline-dots" class="ico" />
                          </button>
                        </span>
                      </div>
                    )
                  }}
                </For>
              </div>

              <Show when={recent().length > 0}>
                <section class="kb-section">
                  <div class="kb-section-head">
                    <h2>{language.t("knowledge.workspace.home.recent")}</h2>
                  </div>
                  <div class="kb-rows">
                    <For each={recent()}>
                      {(entry) => (
                        <div
                          class="kb-row kb-row-compact"
                          role="button"
                          tabindex="0"
                          onClick={() => ws.openDocument(entry.library.id, entry.file.path)}
                          onKeyDown={(event) => openRow(event, () => ws.openDocument(entry.library.id, entry.file.path))}
                        >
                          <span class="kb-row-glyph">
                            <FileGlyph />
                          </span>
                          <span class="kb-row-body">
                            <span class="kb-row-title">{fileName(entry.file)}</span>
                            <span class="kb-row-sub">
                              {entry.library.name}
                              <Show when={fileFolder(entry.file)}>
                                <span class="kb-sep" aria-hidden="true" />
                                {fileFolder(entry.file)}
                              </Show>
                            </span>
                          </span>
                          <span class="kb-row-time">{formatWhen(entry.file.openedAt, language)}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
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
                <section class="kb-section">
                  <div class="kb-section-head">
                    <h2>{language.t("knowledge.workspace.collections.libraries")}</h2>
                    <span class="kb-section-count">{favorites().length}</span>
                  </div>
                  <div class="kb-rows">
                    <For each={favorites()}>
                      {(library) => (
                        <div
                          class="kb-row"
                          role="button"
                          tabindex="0"
                          onClick={() => ws.openLibrary(library.id)}
                          onKeyDown={(event) => openRow(event, () => ws.openLibrary(library.id))}
                        >
                          <span class="kb-row-glyph">
                            <LibraryGlyph />
                          </span>
                          <span class="kb-row-body">
                            <span class="kb-row-title">{library.name}</span>
                            <span class="kb-row-sub">
                              {library.summary || library.description || language.t("knowledge.summary.empty")}
                            </span>
                          </span>
                          <span class="kb-row-time">{formatWhen(libraryUpdatedAt(library), language)}</span>
                          <span class="kb-row-actions">
                            <button
                              class="kb-icon"
                              type="button"
                              aria-pressed="true"
                              aria-label={language.t("knowledge.workspace.collections.unfavorite")}
                              onClick={(event) => pin(event, library.id)}
                            >
                              <Icon name="pin" class="ico" />
                            </button>
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Show>

              <Show when={favoriteDocuments().length > 0}>
                <section class="kb-section">
                  <div class="kb-section-head">
                    <h2>{language.t("knowledge.workspace.collections.documents")}</h2>
                    <span class="kb-section-count">{favoriteDocuments().length}</span>
                  </div>
                  <div class="kb-rows">
                    <For each={favoriteDocuments()}>
                      {(entry) => (
                        <div
                          class="kb-row"
                          role="button"
                          tabindex="0"
                          onClick={() => ws.openDocument(entry.library.id, entry.file.path)}
                          onKeyDown={(event) => openRow(event, () => ws.openDocument(entry.library.id, entry.file.path))}
                        >
                          <span class="kb-row-glyph">
                            <FileGlyph />
                          </span>
                          <span class="kb-row-body">
                            <span class="kb-row-title">{fileName(entry.file)}</span>
                            <span class="kb-row-sub">
                              {entry.library.name}
                              <span class="kb-sep" aria-hidden="true" />
                              {language.t(typeLabelKey(fileType(entry.file)))}
                            </span>
                          </span>
                          <span class="kb-row-time">{formatWhen(entry.file.updatedAt, language)}</span>
                          <span class="kb-row-actions">
                            <button
                              class="kb-icon"
                              type="button"
                              aria-label={language.t("knowledge.workspace.collections.unfavorite")}
                              onClick={(event) => {
                                event.stopPropagation()
                                ws.knowledge.libraries.setFileFavorite(entry.library.id, entry.file.path, false)
                              }}
                            >
                              <Icon name="pin" class="ico" />
                            </button>
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
                  <section class="kb-section">
                    <div class="kb-section-head">
                      <h2>{group.library.name}</h2>
                      <span class="kb-section-count">{group.files.length}</span>
                    </div>
                    <div class="kb-rows">
                      <For each={group.files}>
                        {(file) => (
                          <div class="kb-row">
                            <span class="kb-row-glyph">
                              <FileGlyph />
                            </span>
                            <span class="kb-row-body">
                              <span class="kb-row-title">{fileName(file)}</span>
                              <span class="kb-row-sub">
                                {formatBytes(file.size)}
                                <span class="kb-sep" aria-hidden="true" />
                                {language.t("knowledge.workspace.collections.deletedAt", {
                                  time: formatWhen(file.deletedAt, language),
                                })}
                              </span>
                            </span>
                            <span class="kb-row-actions">
                              <button
                                class="kb-btn kb-btn-sm"
                                type="button"
                                onClick={() => restore(group.library.id, file.path)}
                              >
                                {language.t("knowledge.workspace.collections.restore")}
                              </button>
                              <button
                                class="kb-btn kb-btn-sm kb-btn-danger"
                                type="button"
                                onClick={() =>
                                  ws.ui.openDialog({ type: "confirm-purge", libraryID: group.library.id, path: file.path })
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
              <p class="kb-note">{language.t("knowledge.workspace.collections.trashNote")}</p>
            </Show>
          </Show>

          <Show when={ws.ui.store.collection === "libraries" && rows().length > 0}>
            <p class="kb-foot">
              {language.t("knowledge.workspace.libraries.count", {
                libraries: rows().length,
                documents: libraries().reduce((total, library) => total + library.files.filter((file) => !file.deletedAt).length, 0),
              })}
            </p>
          </Show>
        </div>
      </div>
    </View>
  )
}
