import { Icon } from "@opencode/ui/icon"
import { createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { View } from "./bits"
import { useWorkspace } from "./context"
import type { MenuItem } from "./state"

/**
 * Access is granted per project: assigning a library lets every Agent of this project read it, so the
 * list is shown per Agent while the operation stays one assignment per library.
 */
export function AgentsView() {
  const ws = useWorkspace()
  const language = useLanguage()

  const libraries = () => ws.knowledge.libraries.libraries()

  const selected = createMemo(() => {
    const id = ws.ui.store.agentLibraryID
    const found = id ? libraries().find((library) => library.id === id) : undefined

    return found ?? libraries()[0]
  })

  const linked = () => {
    const library = selected()

    return library && ws.data.isLinked(library.id) ? ws.data.agents() : []
  }

  const candidates = () => libraries().filter((library) => !ws.data.isLinked(library.id))

  const link = async (libraryID: string) => {
    const library = ws.knowledge.libraries.get(libraryID)

    if (!library) return

    try {
      await ws.data.link(library)
      ws.ui.notify(language.t("knowledge.workspace.agents.linked", { name: library.name }))
    } catch (error) {
      ws.ui.notify(error instanceof Error ? error.message : String(error))
    }
  }

  const unlink = async (libraryID: string) => {
    const library = ws.knowledge.libraries.get(libraryID)

    if (!library) return

    try {
      await ws.data.unlink(libraryID)
      ws.ui.notify(language.t("knowledge.workspace.agents.unlinked", { name: library.name }))
    } catch (error) {
      ws.ui.notify(error instanceof Error ? error.message : String(error))
    }
  }

  const addMenu = (event: MouseEvent) => {
    if (!(event.currentTarget instanceof HTMLElement)) return

    const rect = event.currentTarget.getBoundingClientRect()

    const items: MenuItem[] = candidates().map((library) => ({
      label: library.name,
      icon: "library",
      onSelect: () => void link(library.id),
    }))

    if (!items.length) {
      ws.ui.notify(language.t("knowledge.workspace.agents.noneAvailable"))

      return
    }

    ws.ui.openMenu({ x: rect.right, y: rect.bottom + 4, items })
  }

  return (
    <View name="agents">
      <div class="kb-scroll" data-scrollable>
        <div class="kb-page">
          <button class="kb-back" type="button" onClick={() => ws.ui.go("libraries")}>
            <Icon name="outline-arrow-left" class="ico ico-sm" />
            {language.t("knowledge.workspace.title")}
          </button>

          <header class="kb-head">
            <div>
              <h1>{language.t("knowledge.workspace.agents.title")}</h1>
              <p>{language.t("knowledge.workspace.agents.description")}</p>
            </div>
            <div class="kb-tools">
              <button class="kb-primary" type="button" onClick={addMenu}>
                <Icon name="plus" class="ico ico-sm" />
                {language.t("knowledge.workspace.agents.add")}
              </button>
            </div>
          </header>

          <Show
            when={libraries().length > 0}
            fallback={
              <div class="kb-empty">
                <span class="kb-empty-glyph">
                  <Icon name="library" class="ico" />
                </span>
                <h2>{language.t("knowledge.workspace.agents.emptyLibraries.title")}</h2>
                <p>{language.t("knowledge.workspace.agents.emptyLibraries.hint")}</p>
              </div>
            }
          >
            <div class="kb-toolbar">
              <span class="kb-toolbar-label">{language.t("knowledge.workspace.agents.pick")}</span>
              <div class="kb-facets">
                <For each={libraries()}>
                  {(library) => (
                    <button
                      class="kb-chip"
                      type="button"
                      aria-pressed={selected()?.id === library.id}
                      onClick={() => ws.ui.setStore("agentLibraryID", library.id)}
                    >
                      <span>{library.name}</span>
                      <Show when={ws.data.isLinked(library.id)}>
                        <span class="kb-dot" data-state="ready" aria-hidden="true" />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </div>

            <section class="kb-section">
              <div class="kb-section-head">
                <h2>{language.t("knowledge.workspace.agents.granted")}</h2>
                <span class="kb-section-count">
                  {language.t("knowledge.workspace.agents.count", { count: linked().length })}
                </span>
                <span class="kb-spacer" />
                <Show when={selected() && ws.data.isLinked(selected()!.id)}>
                  <button class="kb-row-link" type="button" data-danger onClick={() => void unlink(selected()!.id)}>
                    {language.t("knowledge.workspace.agents.removeLibrary")}
                  </button>
                </Show>
              </div>

              <Show
                when={selected() && ws.data.isLinked(selected()!.id)}
                fallback={
                  <div class="kb-empty kb-empty-inline">
                    <span class="kb-empty-glyph">
                      <Icon name="outline-brain" class="ico" />
                    </span>
                    <h2>{language.t("knowledge.workspace.agents.empty.title")}</h2>
                    <p>{language.t("knowledge.workspace.agents.empty.hint")}</p>
                    <button class="kb-primary" type="button" onClick={() => void link(selected()!.id)}>
                      {language.t("knowledge.workspace.agents.empty.action")}
                    </button>
                  </div>
                }
              >
                <div class="kb-item-rows">
                  <For each={linked()}>
                    {(agent) => (
                      <div class="kb-item">
                        <span class="kb-avatar">{agent.name.slice(0, 1).toLocaleUpperCase()}</span>
                        <span class="kb-item-body">
                          <span class="kb-item-title">{agent.name}</span>
                          <Show when={agent.description}>
                            {(description) => <span class="kb-item-sub">{description()}</span>}
                          </Show>
                        </span>
                        <span class="kb-badge">{language.t("knowledge.workspace.agents.readonly")}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={selected() && ws.data.isLinked(selected()!.id)}>
                <p class="kb-note">{language.t("knowledge.workspace.agents.note")}</p>
              </Show>

              <Show when={!ws.data.connected()}>
                <p class="kb-note" data-tone="warning">
                  {language.t("knowledge.workspace.agents.offline")}
                </p>
              </Show>
            </section>
          </Show>
        </div>
      </div>
    </View>
  )
}
