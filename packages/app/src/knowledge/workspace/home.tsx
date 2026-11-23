import { Icon } from "@opencode/ui/icon"
import { createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { knowledgeImports } from "../import-status"
import { FileGlyph, FileStatus, View } from "./bits"
import { useWorkspace } from "./context"
import { fileName, fileStatus, formatWhen, statusTone } from "./format"

const RECENT_LIMIT = 5

const UPDATED_LIMIT = 5

/** The first screen: what changed lately, what is still processing, and who may read it. */
export function HomeView() {
  const ws = useWorkspace()
  const language = useLanguage()
  const platform = usePlatform()

  const libraries = () => ws.knowledge.libraries.libraries()
  const documents = () => ws.documents()
  const desktop = () => platform.platform === "desktop"

  const greeting = () => {
    const hour = new Date().getHours()

    if (hour < 6) return language.t("knowledge.workspace.home.greeting.night")

    if (hour < 12) return language.t("knowledge.workspace.home.greeting.morning")

    if (hour < 18) return language.t("knowledge.workspace.home.greeting.afternoon")

    return language.t("knowledge.workspace.home.greeting.evening")
  }

  const recent = createMemo(() =>
    [...documents()]
      .filter((entry) => entry.file.openedAt)
      .sort((left, right) => (right.file.openedAt ?? 0) - (left.file.openedAt ?? 0))
      .slice(0, RECENT_LIMIT),
  )

  const updated = createMemo(() =>
    [...documents()]
      .sort((left, right) => (right.file.updatedAt ?? 0) - (left.file.updatedAt ?? 0))
      .slice(0, UPDATED_LIMIT),
  )

  const imports = createMemo(() =>
    libraries().flatMap((library) => {
      const job = knowledgeImports.get(library.id)

      return job ? [{ library, job }] : []
    }),
  )

  const processing = createMemo(() =>
    documents()
      .filter((entry) => fileStatus(entry.file) !== "ready")
      .slice(0, 3),
  )

  const linked = createMemo(() => libraries().filter((library) => ws.data.isLinked(library.id)))
  const agents = createMemo(() => (ws.data.connected() ? ws.data.agents().slice(0, 3) : []))

  return (
    <View name="home">
      <div class="page-scroll scroll" data-scrollable>
        <div class="page">
          <header class="home-head">
            <div class="home-head-copy">
              <h1>{greeting()}</h1>
              <p>
                {language.t("knowledge.workspace.home.summary", {
                  libraries: libraries().length,
                  documents: documents().length,
                })}
              </p>
            </div>
          </header>

          <button class="home-search" type="button" onClick={() => ws.ui.openSearch()}>
            <Icon name="magnifying-glass" class="ico" />
            <span class="placeholder">{language.t("knowledge.workspace.home.search")}</span>
            <span class="hint">⌘K</span>
          </button>

          <div class="home-grid">
            <div class="home-main">
              <section class="block">
                <div class="block-head">
                  <h2>{language.t("knowledge.workspace.home.recent")}</h2>
                  <span class="spacer" />
                  <button class="block-link" type="button" onClick={() => ws.ui.go("libraries")}>
                    {language.t("knowledge.workspace.home.recentAll")}
                    <Icon name="outline-arrow-right" class="ico" />
                  </button>
                </div>
                <Show
                  when={recent().length > 0}
                  fallback={
                    <p class="rail-note">{language.t("knowledge.workspace.home.recentEmpty")}</p>
                  }
                >
                  <div class="recent-list">
                    <For each={recent()}>
                      {(entry) => (
                        <button
                          class="recent-row"
                          type="button"
                          onClick={() => ws.openDocument(entry.library.id, entry.file.path)}
                        >
                          <span class="recent-glyph">
                            <FileGlyph />
                          </span>
                          <span class="recent-copy">
                            <span class="recent-name">{fileName(entry.file)}</span>
                            <span class="recent-desc">{entry.library.name}</span>
                          </span>
                          <span class="recent-meta">
                            {entry.library.name}
                            <br />
                            {formatWhen(entry.file.openedAt, language)}
                          </span>
                          <Icon name="outline-chevron-right" class="ico" />
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </section>

              <section class="block">
                <div class="block-head">
                  <h2>{language.t("knowledge.workspace.home.updated")}</h2>
                  <span class="note">{language.t("knowledge.workspace.home.updatedNote")}</span>
                </div>
                <Show
                  when={updated().length > 0}
                  fallback={<p class="rail-note">{language.t("knowledge.workspace.home.updatedEmpty")}</p>}
                >
                  <div class="doc-rows">
                    <For each={updated()}>
                      {(entry) => (
                        <button
                          class="doc-row"
                          type="button"
                          onClick={() => ws.openDocument(entry.library.id, entry.file.path)}
                        >
                          <FileGlyph />
                          <span class="doc-row-name">
                            <span>{fileName(entry.file)}</span>
                          </span>
                          <span class="doc-row-lib">{entry.library.name}</span>
                          <span class="doc-row-time">{formatWhen(entry.file.updatedAt, language)}</span>
                          <span
                            class="dot"
                            data-state={statusTone(fileStatus(entry.file))}
                            aria-hidden="true"
                          />
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </section>
            </div>

            <aside class="home-rail">
              <section class="rail-block">
                <div class="rail-head">
                  <h2>{language.t("knowledge.workspace.home.jobs")}</h2>
                  <button class="link" type="button" onClick={() => ws.ui.go("jobs")}>
                    {language.t("knowledge.workspace.home.jobsAll")}
                  </button>
                </div>
                <Show
                  when={imports().length > 0 || processing().length > 0}
                  fallback={<p class="rail-note">{language.t("knowledge.workspace.home.jobsEmpty")}</p>}
                >
                  <For each={imports()}>
                    {(entry) => {
                      const total = () => entry.job.total
                      const percent = () => (total() ? Math.round((entry.job.processed / total()) * 100) : 0)

                      return (
                        <button
                          class="mini-job"
                          type="button"
                          style={{ display: "block", width: "100%", "text-align": "start" }}
                          onClick={() => ws.ui.go("jobs")}
                        >
                          <span class="mini-job-top">
                            <span class="mini-job-name">{entry.library.name}</span>
                            <span class="mini-pct">{percent()}%</span>
                          </span>
                          <span class="mini-track">
                            <span class="mini-fill" style={{ width: `${percent()}%` }} />
                          </span>
                          <span class="mini-job-detail">
                            {language.t(`knowledge.import.stage.${entry.job.stage}`)}
                          </span>
                        </button>
                      )
                    }}
                  </For>
                  <For each={processing()}>
                    {(entry) => (
                      <button
                        class="mini-job"
                        type="button"
                        style={{ display: "block", width: "100%", "text-align": "start" }}
                        onClick={() => ws.openDocument(entry.library.id, entry.file.path)}
                      >
                        <span class="mini-job-top">
                          <span class="mini-job-name">{fileName(entry.file)}</span>
                          <span class="mini-pct">{entry.file.processing?.progress ?? 0}%</span>
                        </span>
                        <span class="mini-track">
                          <span
                            class="mini-fill"
                            data-state={fileStatus(entry.file) === "failed" ? "failed" : ""}
                            style={{ width: `${entry.file.processing?.progress ?? 0}%` }}
                          />
                        </span>
                        <span class="mini-job-detail">
                          <FileStatus file={entry.file} /> · {entry.library.name}
                        </span>
                      </button>
                    )}
                  </For>
                </Show>
              </section>

              <section class="rail-block">
                <div class="rail-head">
                  <h2>{language.t("knowledge.workspace.home.agents")}</h2>
                </div>
                <Show
                  when={linked().length > 0 && agents().length > 0}
                  fallback={<p class="rail-note">{language.t("knowledge.workspace.home.agentsEmpty")}</p>}
                >
                  <For each={agents()}>
                    {(agent) => (
                      <button
                        class="agent-mini"
                        type="button"
                        style={{ width: "100%", "text-align": "start" }}
                        onClick={() => ws.ui.go("agents")}
                      >
                        <span class="agent-avatar">{agent.name.slice(0, 1).toLocaleUpperCase()}</span>
                        <span class="agent-mini-copy">
                          <span class="agent-mini-name">{agent.name}</span>
                          <span class="agent-mini-lib">
                            {language.list(linked().map((library) => library.name))}
                          </span>
                        </span>
                        <span class="agent-mini-status">
                          {language.plural("knowledge.workspace.home.agentsLibraries", linked().length, {
                            count: linked().length,
                          })}
                        </span>
                      </button>
                    )}
                  </For>
                </Show>
                <Show when={desktop()}>
                  <p class="rail-note">{language.t("knowledge.workspace.home.agentsNote")}</p>
                  <button class="text-link" type="button" onClick={() => ws.ui.go("agents")}>
                    {language.t("knowledge.workspace.home.agentsManage")}
                    <Icon name="outline-arrow-right" class="ico" />
                  </button>
                </Show>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </View>
  )
}
