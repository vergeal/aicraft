import { Icon } from "@opencode/ui/icon"
import { createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { LibraryGlyph, View } from "./bits"
import { useWorkspace } from "./context"
import { fileChunks, formatWhen, libraryUpdatedAt } from "./format"
import type { MenuItem } from "./state"

/** Every library as one row: what it holds, how much it indexed, and when it last changed. */
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

  return (
    <View name="libraries">
      <div class="page-scroll scroll" data-scrollable>
        <div class="page">
          <header class="page-head">
            <div class="page-head-copy">
              <h1>{language.t("knowledge.workspace.libraries.title")}</h1>
              <p>{language.t("knowledge.workspace.libraries.description")}</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" type="button" onClick={() => ws.ui.openDialog({ type: "new-library" })}>
                <Icon name="plus" class="ico" />
                {language.t("knowledge.new")}
              </button>
            </div>
          </header>

          <div class="libs-toolbar">
            <label class="field">
              <Icon name="magnifying-glass" class="ico" />
              <input
                type="search"
                placeholder={language.t("knowledge.workspace.libraries.search")}
                autocomplete="off"
                value={ws.ui.store.libraryQuery}
                onInput={(event) => ws.ui.setStore("libraryQuery", event.currentTarget.value)}
              />
            </label>
            <span class="spacer" />
            <span class="count">
              {language.t("knowledge.workspace.libraries.count", {
                libraries: rows().length,
                documents: libraries().reduce((total, library) => total + library.files.length, 0),
              })}
            </span>
            <select
              class="select"
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
          </div>

          <Show
            when={rows().length > 0}
            fallback={
              <div class="empty">
                <span class="empty-glyph">
                  <Icon name="magnifying-glass" class="ico" />
                </span>
                <h2>{language.t("knowledge.workspace.libraries.empty.title")}</h2>
                <p>{language.t("knowledge.workspace.libraries.empty.hint")}</p>
              </div>
            }
          >
            <div class="libs-table">
              <div class="libs-head">
                <span>{language.t("knowledge.workspace.libraries.columns.name")}</span>
                <span>{language.t("knowledge.workspace.libraries.columns.documents")}</span>
                <span>{language.t("knowledge.workspace.libraries.columns.chunks")}</span>
                <span>{language.t("knowledge.workspace.libraries.columns.updated")}</span>
              </div>
              <For each={rows()}>
                {(library) => (
                  <div
                    class="lib-row"
                    role="button"
                    tabindex="0"
                    onClick={() => ws.openLibrary(library.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") ws.openLibrary(library.id)
                    }}
                  >
                    <span class="libs-glyph">
                      <LibraryGlyph />
                    </span>
                    <span class="libs-copy">
                      <span class="libs-name">
                        <span>{library.name}</span>
                      </span>
                      <span class="libs-desc">{library.summary || library.description || ""}</span>
                    </span>
                    <span class="libs-num">{library.files.filter((file) => !file.deletedAt).length}</span>
                    <span class="libs-num">
                      {library.files.reduce((total, file) => total + fileChunks(file), 0)}
                    </span>
                    <span class="libs-updated">{formatWhen(libraryUpdatedAt(library), language)}</span>
                    <span
                      class="libs-star"
                      role="button"
                      tabindex="0"
                      aria-pressed={Boolean(library.favorite)}
                      aria-label={language.t("knowledge.workspace.library.star")}
                      onClick={(event) => {
                        event.stopPropagation()
                        ws.knowledge.libraries.setFavorite(library.id, !library.favorite)
                        ws.ui.notify(
                          language.t(
                            library.favorite ? "knowledge.workspace.toast.unfavorite" : "knowledge.workspace.toast.favorite",
                            { name: library.name },
                          ),
                        )
                      }}
                    >
                      <Icon name="pin" class="ico" />
                    </span>
                    <span
                      class="libs-more"
                      role="button"
                      tabindex="0"
                      aria-label={language.t("knowledge.workspace.library.more")}
                      onClick={(event) => menu(event, library.id)}
                    >
                      <Icon name="outline-dots" class="ico" />
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </View>
  )
}
