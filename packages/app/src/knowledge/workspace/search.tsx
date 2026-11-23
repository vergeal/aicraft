import { Icon } from "@opencode/ui/icon"
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { PageHead, View } from "./bits"
import { useWorkspace } from "./context"
import { transition, visibleHits, type SearchState } from "./search-machine"

const DEBOUNCE_MS = 260

/** Search runs against the same server index Agents retrieve from, so results match what they see. */
export function SearchView() {
  const ws = useWorkspace()
  const language = useLanguage()

  const [state, setState] = createSignal<SearchState>({ status: "idle" })
  const [elapsed, setElapsed] = createSignal(0)

  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let input!: HTMLInputElement

  const libraries = () => ws.knowledge.libraries.libraries().filter((library) => library.files.length > 0)
  const selectedLibraries = () => new Set(ws.ui.store.searchLibraries)
  const hits = createMemo(() => visibleHits(state()))

  const failureMessage = () => {
    const current = state()

    return current.status === "failed" ? current.message : ""
  }

  const scoped = createMemo(() => {
    const selected = selectedLibraries()

    return selected.size ? hits().filter((hit) => selected.has(hit.libraryID)) : hits()
  })

  const run = async (query: string) => {
    const current = ++attempt

    setState((state) => transition(state, { type: "query.submitted", query, attempt: current }))

    const started = Date.now()

    try {
      const found = await ws.data.search(query)

      setState((state) =>
        transition(state, { type: "query.completed", attempt: current, hits: found, elapsed: Date.now() - started }),
      )
      setElapsed(Date.now() - started)
    } catch (error) {
      setState((state) =>
        transition(state, {
          type: "query.failed",
          attempt: current,
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    }
  }

  createEffect(() => {
    const query = ws.ui.store.searchQuery.trim()

    if (timer) clearTimeout(timer)

    if (!query) {
      attempt += 1
      setState((state) => transition(state, { type: "query.cleared" }))

      return
    }

    timer = setTimeout(() => void run(query), DEBOUNCE_MS)
  })

  onCleanup(() => {
    if (timer) clearTimeout(timer)
  })

  onMount(() => input.focus())

  createEffect(() => {
    // The sidebar shortcut reopens search on an already visible view, so focus is an explicit event.
    ws.ui.store.searchFocused
    input?.focus()
  })

  const openHit = async (hit: { libraryID: string; path: string }) => {
    await ws.data.refreshLibrary(hit.libraryID).catch(() => undefined)
    ws.openDocument(hit.libraryID, hit.path)
  }

  const toggleLibrary = (libraryID: string, checked: boolean) =>
    ws.ui.setStore("searchLibraries", (current) =>
      checked ? [...new Set([...current, libraryID])] : current.filter((id) => id !== libraryID),
    )

  const clear = () => {
    ws.ui.setStore({ searchQuery: "", searchLibraries: [] })
    input?.focus()
  }

  const countOf = (libraryID: string) => hits().filter((hit) => hit.libraryID === libraryID).length

  return (
    <View name="search">
      <div class="kb-scroll" data-scrollable>
        <div class="kb-page">
          <PageHead
            back={{ label: language.t("knowledge.workspace.title"), onClick: () => ws.ui.go("libraries") }}
            title={language.t("knowledge.workspace.search.title")}
            description={language.t("knowledge.workspace.search.description")}
            actions={
              <button class="kb-btn" type="button" onClick={() => ws.ui.go("jobs")}>
                <Icon name="outline-list-changelog" class="ico" />
                <span>{language.t("knowledge.workspace.search.jobs")}</span>
              </button>
            }
          />

          <div class="kb-search">
            <Icon name="magnifying-glass" class="ico" />
            <input
              ref={input}
              type="search"
              placeholder={language.t("knowledge.workspace.search.placeholder")}
              autocomplete="off"
              spellcheck={false}
              value={ws.ui.store.searchQuery}
              onInput={(event) => ws.ui.setStore("searchQuery", event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void run(ws.ui.store.searchQuery.trim())
              }}
            />
            <Show when={ws.ui.store.searchQuery}>
              <button
                class="kb-icon kb-icon-sm"
                type="button"
                aria-label={language.t("knowledge.workspace.search.clear")}
                onClick={clear}
              >
                <Icon name="close" class="ico ico-sm" />
              </button>
            </Show>
          </div>

          <div class="kb-search-meta">
            <Show
              when={ws.ui.store.searchQuery.trim()}
              fallback={<span>{language.t("knowledge.workspace.search.idle")}</span>}
            >
              <span>{language.t("knowledge.workspace.search.found", { count: scoped().length })}</span>
              <span class="kb-sep" aria-hidden="true" />
              <span>
                {state().status === "searching"
                  ? language.t("knowledge.workspace.search.searching")
                  : language.t("knowledge.workspace.search.elapsed", { ms: elapsed() })}
              </span>
            </Show>
          </div>

          <Show when={ws.ui.store.searchQuery.trim() && libraries().length > 1}>
            <div class="kb-facets" aria-label={language.t("knowledge.workspace.search.facets")}>
              <For each={libraries()}>
                {(library) => (
                  <label class="kb-chip">
                    <input
                      type="checkbox"
                      checked={selectedLibraries().has(library.id)}
                      onChange={(event) => toggleLibrary(library.id, event.currentTarget.checked)}
                    />
                    <span>{library.name}</span>
                    <span class="kb-chip-count">{countOf(library.id)}</span>
                  </label>
                )}
              </For>
              <Show when={selectedLibraries().size > 0}>
                <button
                  class="kb-btn kb-btn-sm kb-btn-ghost"
                  type="button"
                  onClick={() => ws.ui.setStore("searchLibraries", [])}
                >
                  {language.t("knowledge.workspace.search.facet.clear")}
                </button>
              </Show>
            </div>
          </Show>

          <div class="kb-results" role="list">
            <Show
              when={state().status !== "idle"}
              fallback={
                <div class="kb-empty">
                  <span class="kb-empty-glyph">
                    <Icon name="magnifying-glass" class="ico" />
                  </span>
                  <h2>{language.t("knowledge.workspace.search.empty.title")}</h2>
                  <p>{language.t("knowledge.workspace.search.empty.hint")}</p>
                </div>
              }
            >
              <Show
                when={state().status !== "searching"}
                fallback={
                  <For each={[0, 1, 2, 3]}>
                    {() => (
                      <div class="kb-skel">
                        <span class="kb-sk" style={{ width: "32%" }} />
                        <span class="kb-sk" style={{ width: "72%" }} />
                        <span class="kb-sk" style={{ width: "54%" }} />
                      </div>
                    )}
                  </For>
                }
              >
                <Show
                  when={state().status !== "failed"}
                  fallback={
                    <div class="kb-empty">
                      <span class="kb-empty-glyph">
                        <Icon name="outline-hexagonal-warning" class="ico" />
                      </span>
                      <h2>{language.t("knowledge.workspace.search.failed.title")}</h2>
                      <p>{failureMessage()}</p>
                      <button class="kb-btn" type="button" onClick={() => void run(ws.ui.store.searchQuery)}>
                        {language.t("knowledge.workspace.search.retry")}
                      </button>
                    </div>
                  }
                >
                  <Show
                    when={scoped().length > 0}
                    fallback={
                      <div class="kb-empty">
                        <span class="kb-empty-glyph">
                          <Icon name="magnifying-glass" class="ico" />
                        </span>
                        <h2>
                          {language.t("knowledge.workspace.search.none.title", {
                            query: ws.ui.store.searchQuery.trim(),
                          })}
                        </h2>
                        <p>{language.t("knowledge.workspace.search.none.hint")}</p>
                        <button class="kb-btn" type="button" onClick={clear}>
                          {language.t("knowledge.workspace.search.facet.clear")}
                        </button>
                      </div>
                    }
                  >
                    <For each={scoped()}>
                      {(hit) => (
                        <button class="kb-result" type="button" role="listitem" onClick={() => void openHit(hit)}>
                          <span class="kb-result-head">
                            <Icon name="file-document" class="ico" />
                            <span class="kb-result-name">{hit.name}</span>
                            <span class="kb-result-lib">{hit.libraryName}</span>
                            <span class="kb-result-part">
                              {language.t("knowledge.workspace.search.part", { ordinal: hit.ordinal + 1 })}
                            </span>
                          </span>
                          <p class="kb-result-text">
                            <Highlight text={hit.text} query={ws.ui.store.searchQuery} />
                          </p>
                          <span class="kb-result-foot">{hit.path}</span>
                        </button>
                      )}
                    </For>
                  </Show>
                </Show>
              </Show>
            </Show>
          </div>
        </div>
      </div>
    </View>
  )
}

/** The query stays visible inside the passage that matched. */
function Highlight(props: { text: string; query: string }) {
  const pieces = createMemo(() => {
    const query = props.query.trim()

    if (!query) return [{ text: props.text, match: false }]

    const lower = props.text.toLocaleLowerCase()
    const needle = query.toLocaleLowerCase()
    const parts: Array<{ text: string; match: boolean }> = []
    let at = 0

    while (at < props.text.length) {
      const found = lower.indexOf(needle, at)

      if (found === -1) {
        parts.push({ text: props.text.slice(at), match: false })
        break
      }

      if (found > at) parts.push({ text: props.text.slice(at, found), match: false })
      parts.push({ text: props.text.slice(found, found + needle.length), match: true })
      at = found + needle.length
    }

    return parts
  })

  return (
    <For each={pieces()}>
      {(piece) => <Show when={piece.match} fallback={<>{piece.text}</>}><mark>{piece.text}</mark></Show>}
    </For>
  )
}
