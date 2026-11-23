import { Icon } from "@opencode/ui/icon"
import { createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { FileGlyph, LibraryGlyph, View } from "./bits"
import { useWorkspace } from "./context"
import { fileName, fileFolder, formatBytes, formatWhen, libraryUpdatedAt } from "./format"

const DAY = 86_400_000

/** Documents the user opened, newest first, grouped so old visits do not compete with today's. */
export function RecentView() {
  const ws = useWorkspace()
  const language = useLanguage()

  const groups = createMemo(() => {
    const rows = ws
      .documents()
      .filter((entry) => entry.file.openedAt)
      .sort((left, right) => (right.file.openedAt ?? 0) - (left.file.openedAt ?? 0))

    const buckets: Array<{ label: string; rows: typeof rows }> = []
    const now = Date.now()

    for (const entry of rows) {
      const opened = entry.file.openedAt ?? 0

      const label =
        now - opened < DAY
          ? language.t("knowledge.workspace.collections.today")
          : now - opened < 7 * DAY
            ? language.t("knowledge.workspace.collections.week")
            : language.t("knowledge.workspace.collections.earlier")

      const bucket = buckets.find((item) => item.label === label)

      if (bucket) bucket.rows.push(entry)
      else buckets.push({ label, rows: [entry] })
    }

    return buckets
  })

  return (
    <View name="recent">
      <div class="page-scroll scroll" data-scrollable>
        <div class="page">
          <div class="collection-head">
            <h1>{language.t("knowledge.workspace.collections.recent")}</h1>
            <span class="note">{language.t("knowledge.workspace.collections.recentNote")}</span>
          </div>

          <Show
            when={groups().length > 0}
            fallback={
              <div class="empty">
                <span class="empty-glyph">
                  <Icon name="outline-list-changelog" class="ico" />
                </span>
                <h2>{language.t("knowledge.workspace.collections.recentEmpty.title")}</h2>
                <p>{language.t("knowledge.workspace.collections.recentEmpty.hint")}</p>
              </div>
            }
          >
            <For each={groups()}>
              {(group) => (
                <section class="collection-group">
                  <div class="collection-label">{group.label}</div>
                  <div class="collection-rows">
                    <For each={group.rows}>
                      {(entry) => (
                        <button
                          class="collection-row"
                          type="button"
                          onClick={() => ws.openDocument(entry.library.id, entry.file.path)}
                        >
                          <FileGlyph />
                          <span class="collection-copy">
                            <span class="collection-name">{fileName(entry.file)}</span>
                            <span class="collection-sub">
                              {entry.library.name}
                              {fileFolder(entry.file) ? ` · ${fileFolder(entry.file)}` : ""}
                            </span>
                          </span>
                          <span class="collection-when">{formatWhen(entry.file.openedAt, language)}</span>
                          <Icon name="outline-chevron-right" class="ico" />
                        </button>
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </Show>
        </div>
      </div>
    </View>
  )
}

/** Libraries and documents the user pinned; both lists read the same favorite flag. */
export function FavoritesView() {
  const ws = useWorkspace()
  const language = useLanguage()

  const libraries = createMemo(() => ws.knowledge.libraries.libraries().filter((library) => library.favorite))
  const documents = createMemo(() => ws.documents().filter((entry) => entry.file.favorite))

  return (
    <View name="favorites">
      <div class="page-scroll scroll" data-scrollable>
        <div class="page">
          <div class="collection-head">
            <h1>{language.t("knowledge.workspace.collections.favorites")}</h1>
            <span class="note">{language.t("knowledge.workspace.collections.favoritesNote")}</span>
          </div>

          <Show
            when={libraries().length > 0 || documents().length > 0}
            fallback={
              <div class="empty">
                <span class="empty-glyph">
                  <Icon name="pin" class="ico" />
                </span>
                <h2>{language.t("knowledge.workspace.collections.favoritesEmpty.title")}</h2>
                <p>{language.t("knowledge.workspace.collections.favoritesEmpty.hint")}</p>
              </div>
            }
          >
            <Show when={libraries().length > 0}>
              <section class="collection-group">
                <div class="collection-label">
                  {language.t("knowledge.workspace.collections.libraries")}
                  <span class="n">{libraries().length}</span>
                </div>
                <div class="collection-rows">
                  <For each={libraries()}>
                    {(library) => (
                      <button class="collection-row" type="button" onClick={() => ws.openLibrary(library.id)}>
                        <LibraryGlyph />
                        <span class="collection-copy">
                          <span class="collection-name">{library.name}</span>
                          <span class="collection-sub">
                            {language.t("knowledge.workspace.collections.libraryMeta", {
                              documents: library.files.filter((file) => !file.deletedAt).length,
                            })}
                          </span>
                        </span>
                        <span class="collection-when">{formatWhen(libraryUpdatedAt(library), language)}</span>
                        <Icon name="outline-chevron-right" class="ico" />
                      </button>
                    )}
                  </For>
                </div>
              </section>
            </Show>

            <Show when={documents().length > 0}>
              <section class="collection-group">
                <div class="collection-label">
                  {language.t("knowledge.workspace.collections.documents")}
                  <span class="n">{documents().length}</span>
                </div>
                <div class="collection-rows">
                  <For each={documents()}>
                    {(entry) => (
                      <button
                        class="collection-row"
                        type="button"
                        onClick={() => ws.openDocument(entry.library.id, entry.file.path)}
                      >
                        <FileGlyph />
                        <span class="collection-copy">
                          <span class="collection-name">{fileName(entry.file)}</span>
                          <span class="collection-sub">{entry.library.name}</span>
                        </span>
                        <span class="collection-when">{formatWhen(entry.file.updatedAt, language)}</span>
                        <span
                          class="libs-star"
                          role="button"
                          tabindex="0"
                          aria-label={language.t("knowledge.workspace.collections.unfavorite")}
                          onClick={(event) => {
                            event.stopPropagation()
                            ws.knowledge.libraries.setFileFavorite(entry.library.id, entry.file.path, false)
                          }}
                        >
                          <Icon name="pin" class="ico" />
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </section>
            </Show>
          </Show>
        </div>
      </div>
    </View>
  )
}

/** Removed documents keep their entry here; the original files were never moved. */
export function TrashView() {
  const ws = useWorkspace()
  const language = useLanguage()

  const groups = createMemo(() =>
    ws.knowledge
      .libraries.libraries()
      .map((library) => ({
        library,
        files: library.files.filter((file) => file.deletedAt),
      }))
      .filter((group) => group.files.length > 0),
  )

  const count = createMemo(() => groups().reduce((total, group) => total + group.files.length, 0))

  const restore = (libraryID: string, path: string) => {
    ws.knowledge.libraries.restoreFiles(libraryID, [path])
    ws.ui.notify(language.t("knowledge.workspace.toast.restored"))
  }

  return (
    <View name="trash">
      <div class="page-scroll scroll" data-scrollable>
        <div class="page">
          <header class="page-head">
            <div class="page-head-copy">
              <h1>{language.t("knowledge.workspace.collections.trash")}</h1>
              <p>{language.t("knowledge.workspace.collections.trashDescription")}</p>
            </div>
            <div class="page-actions">
              <Show when={count() > 0}>
                <button
                  class="btn btn-ghost"
                  type="button"
                  onClick={() => ws.ui.openDialog({ type: "confirm-empty-trash" })}
                >
                  {language.t("knowledge.workspace.collections.emptyTrash")}
                </button>
              </Show>
            </div>
          </header>

          <Show
            when={groups().length > 0}
            fallback={
              <div class="empty">
                <span class="empty-glyph">
                  <Icon name="trash" class="ico" />
                </span>
                <h2>{language.t("knowledge.workspace.collections.trashEmpty.title")}</h2>
                <p>{language.t("knowledge.workspace.collections.trashEmpty.hint")}</p>
              </div>
            }
          >
            <For each={groups()}>
              {(group) => (
                <section class="collection-group">
                  <div class="collection-label">
                    {group.library.name}
                    <span class="n">{group.files.length}</span>
                  </div>
                  <div class="collection-rows">
                    <For each={group.files}>
                      {(file) => (
                        <div class="collection-row">
                          <FileGlyph />
                          <span class="collection-copy">
                            <span class="collection-name">{fileName(file)}</span>
                            <span class="collection-sub">
                              {formatBytes(file.size)} ·{" "}
                              {language.t("knowledge.workspace.collections.deletedAt", {
                                time: formatWhen(file.deletedAt, language),
                              })}
                            </span>
                          </span>
                          <span class="collection-actions">
                            <button
                              class="btn btn-sm"
                              type="button"
                              onClick={() => restore(group.library.id, file.path)}
                            >
                              {language.t("knowledge.workspace.collections.restore")}
                            </button>
                            <button
                              class="btn btn-sm btn-danger"
                              type="button"
                              onClick={() => ws.ui.openDialog({ type: "confirm-purge", libraryID: group.library.id, path: file.path })}
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
          </Show>

          <Show when={count() > 0}>
            <p class="collection-note">{language.t("knowledge.workspace.collections.trashNote")}</p>
          </Show>
        </div>
      </div>
    </View>
  )
}
