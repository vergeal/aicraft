import { Icon } from "@opencode/ui/icon"
import { createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { LibraryGlyph, View } from "./bits"
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
      <div class="page-scroll scroll" data-scrollable>
        <div class="page">
          <header class="page-head">
            <div class="page-head-copy">
              <h1>{language.t("knowledge.workspace.agents.title")}</h1>
              <p>{language.t("knowledge.workspace.agents.description")}</p>
            </div>
            <div class="page-actions">
              <button class="btn btn-primary" type="button" onClick={addMenu}>
                <Icon name="plus" class="ico" />
                {language.t("knowledge.workspace.agents.add")}
              </button>
            </div>
          </header>

          <Show
            when={libraries().length > 0}
            fallback={
              <div class="empty">
                <span class="empty-glyph">
                  <Icon name="library" class="ico" />
                </span>
                <h2>{language.t("knowledge.workspace.agents.emptyLibraries.title")}</h2>
                <p>{language.t("knowledge.workspace.agents.emptyLibraries.hint")}</p>
              </div>
            }
          >
            <div class="agents-layout">
              <aside class="agent-picker" aria-label={language.t("knowledge.workspace.agents.pick")}>
                <div class="picker-head">{language.t("knowledge.workspace.agents.pick")}</div>
                <For each={libraries()}>
                  {(library) => (
                    <button
                      class="picker-row"
                      type="button"
                      aria-current={selected()?.id === library.id}
                      onClick={() => ws.ui.setStore("agentLibraryID", library.id)}
                    >
                      <LibraryGlyph />
                      <span class="name">{library.name}</span>
                      <Show when={ws.data.isLinked(library.id)}>
                        <span class="dot" data-state="ready" aria-hidden="true" />
                      </Show>
                    </button>
                  )}
                </For>
              </aside>

              <div>
                <div class="agent-section-head">
                  {language.t("knowledge.workspace.agents.granted")}
                  <span class="spacer" />
                  <span class="count">
                    {language.t("knowledge.workspace.agents.count", { count: linked().length })}
                  </span>
                </div>

                <Show
                  when={selected() && ws.data.isLinked(selected()!.id)}
                  fallback={
                    <div class="empty">
                      <span class="empty-glyph">
                        <Icon name="outline-brain" class="ico" />
                      </span>
                      <h2>{language.t("knowledge.workspace.agents.empty.title")}</h2>
                      <p>{language.t("knowledge.workspace.agents.empty.hint")}</p>
                      <div class="empty-actions">
                        <button
                          class="btn btn-ghost"
                          type="button"
                          onClick={() => void link(selected()!.id)}
                        >
                          {language.t("knowledge.workspace.agents.empty.action")}
                        </button>
                      </div>
                    </div>
                  }
                >
                  <For each={linked()}>
                    {(agent) => (
                      <div class="agent-row">
                        <span class="agent-avatar-lg">{agent.name.slice(0, 1).toLocaleUpperCase()}</span>
                        <span class="agent-copy">
                          <span class="agent-name">{agent.name}</span>
                          <span class="agent-meta">{agent.description ?? ""}</span>
                        </span>
                        <span class="agent-perm">
                          <button
                            class="btn btn-sm btn-ghost"
                            type="button"
                            onClick={() => ws.ui.notify(language.t("knowledge.workspace.agents.readonlyNote"))}
                          >
                            {language.t("knowledge.workspace.agents.readonly")}
                          </button>
                        </span>
                        <button
                          class="agent-more"
                          type="button"
                          aria-label={language.t("knowledge.workspace.agents.remove", { name: agent.name })}
                          onClick={() => void unlink(selected()!.id)}
                        >
                          <Icon name="close" class="ico" />
                        </button>
                      </div>
                    )}
                  </For>
                </Show>

                <Show when={selected() && ws.data.isLinked(selected()!.id)}>
                  <div class="agent-note">
                    <Icon name="lock" class="ico" />
                    <span>{language.t("knowledge.workspace.agents.note")}</span>
                  </div>
                </Show>

                <Show when={!ws.data.connected()}>
                  <div class="agent-note" data-tone="warning">
                    <Icon name="outline-hexagonal-warning" class="ico" />
                    <span>{language.t("knowledge.workspace.agents.offline")}</span>
                  </div>
                </Show>

                <Show when={selected() && ws.data.isLinked(selected()!.id)}>
                  <div class="agent-remove">
                    <button
                      class="text-link"
                      type="button"
                      onClick={() => void unlink(selected()!.id)}
                    >
                      {language.t("knowledge.workspace.agents.removeLibrary")}
                    </button>
                  </div>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </View>
  )
}
