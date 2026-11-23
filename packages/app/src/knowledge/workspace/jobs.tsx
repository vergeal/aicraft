import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { createEffect, createMemo, For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { FileGlyph, FileStatus, PageHead, trapModalTab, View } from "./bits"
import { useWorkspace } from "./context"
import {
  fileName,
  fileChunks,
  fileFolder,
  fileProgress,
  fileStatus,
  fileType,
  fileUpdatedAt,
  formatBytes,
  formatWhen,
  typeLabelKey,
} from "./format"
import type { KnowledgeFileStatus } from "../store"
import type { JobTab } from "./state"

const ACTIVE_STATUSES: ReadonlyArray<KnowledgeFileStatus> = ["pending", "parsing", "indexing"]

const stageLabelKey = (status: ReturnType<typeof fileStatus>) => `knowledge.workspace.jobs.stage.${status}` as const

const EMPTY_KEYS = {
  active: "knowledge.workspace.jobs.empty.active",
  failed: "knowledge.workspace.jobs.empty.failed",
  done: "knowledge.workspace.jobs.empty.done",
} as const

const STAGE_ICONS = {
  done: "check",
  failed: "outline-hexagonal-warning",
  active: "refresh",
  pending: "refresh",
} as const

type DrawerStage = "parse" | "convert" | "chunk" | "embed" | "done"

type DrawerStageRow = { key: DrawerStage; state: "done" | "active" | "pending" | "failed"; detail: string }

/** Advanced surface: every parse and index job, its progress, and why one failed. */
export function JobsView() {
  const ws = useWorkspace()
  const language = useLanguage()

  const active = createMemo(() =>
    ws.documents().filter((entry) => ACTIVE_STATUSES.includes(fileStatus(entry.file))),
  )

  const failed = createMemo(() => ws.documents().filter((entry) => fileStatus(entry.file) === "failed"))
  const done = createMemo(() => ws.documents().filter((entry) => fileStatus(entry.file) === "ready"))

  const rows = createMemo(() => {
    if (ws.ui.store.jobTab === "failed") return failed()

    if (ws.ui.store.jobTab === "done") return done()

    return active()
  })

  const tabs = createMemo(
    (): ReadonlyArray<{ id: JobTab; label: string; count: number }> => [
      { id: "active", label: language.t("knowledge.workspace.jobs.tab.active"), count: active().length },
      { id: "failed", label: language.t("knowledge.workspace.jobs.tab.failed"), count: failed().length },
      { id: "done", label: language.t("knowledge.workspace.jobs.tab.done"), count: done().length },
    ],
  )

  const retry = async (libraryID: string, path: string) => {
    const library = ws.knowledge.libraries.get(libraryID)
    const file = library?.files.find((entry) => entry.path === path)

    if (!library || !file) return
    ws.knowledge.libraries.patchFile(libraryID, path, {
      processing: { status: "pending", progress: 0, at: Date.now() },
    })
    ws.knowledge.openLibrary(library)
    await ws.knowledge.runImport([file.source || file.path])
  }

  const retryAll = async () => {
    for (const entry of failed()) {
      await retry(entry.library.id, entry.file.path)
    }

    ws.ui.notify(language.t("knowledge.workspace.jobs.retried", { count: failed().length }))
  }

  return (
    <View name="jobs">
      <div class="kb-scroll" data-scrollable>
        <div class="kb-page">
          <PageHead
            back={{ label: language.t("knowledge.workspace.title"), onClick: () => ws.ui.go("libraries") }}
            title={language.t("knowledge.workspace.jobs.title")}
            description={language.t("knowledge.workspace.jobs.description")}
            actions={
              <button
                class="kb-btn"
                type="button"
                disabled={failed().length === 0}
                onClick={() => void retryAll()}
              >
                <Icon name="refresh" class="ico" />
                <span>{language.t("knowledge.workspace.jobs.retryAll")}</span>
              </button>
            }
            meta={
              <>
                <span>{language.t("knowledge.workspace.jobs.summary.running", { count: active().length })}</span>
                <span class="kb-sep" aria-hidden="true" />
                <span>{language.t("knowledge.workspace.jobs.summary.failed", { count: failed().length })}</span>
                <span class="kb-sep" aria-hidden="true" />
                <span>{language.t("knowledge.workspace.jobs.summary.done", { count: done().length })}</span>
                <span class="kb-sep" aria-hidden="true" />
                <span>{language.t("knowledge.workspace.jobs.summary.local")}</span>
              </>
            }
          />

          <div class="kb-toolbar">
            <div class="kb-segments" role="tablist" aria-label={language.t("knowledge.workspace.jobs.tabs")}>
              <For each={tabs()}>
                {(tab) => (
                  <button
                    class="kb-segment"
                    type="button"
                    role="tab"
                    aria-selected={ws.ui.store.jobTab === tab.id}
                    onClick={() => ws.ui.setStore("jobTab", tab.id)}
                  >
                    {tab.label}
                    <span class="kb-count">{tab.count}</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          <Show
            when={rows().length > 0}
            fallback={
              <div class="kb-empty">
                <span class="kb-empty-glyph">
                  <Icon name="check" class="ico" />
                </span>
                <h2>{language.t(EMPTY_KEYS[ws.ui.store.jobTab])}</h2>
                <p>{language.t("knowledge.workspace.jobs.empty.hint")}</p>
              </div>
            }
          >
            <div class="kb-rows" role="list">
              <For each={rows()}>
                {(entry) => {
                  const status = () => fileStatus(entry.file)
                  const percent = () => (status() === "ready" ? 100 : fileProgress(entry.file))

                  return (
                    <div
                      class="kb-job"
                      role="listitem"
                      tabindex="0"
                      onClick={() => ws.ui.openDrawer(entry.library.id, entry.file.path)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") ws.ui.openDrawer(entry.library.id, entry.file.path)
                      }}
                    >
                      <span class="kb-row-glyph">
                        <FileGlyph />
                      </span>
                      <span class="kb-row-body">
                        <span class="kb-row-title">{fileName(entry.file)}</span>
                        <span class="kb-row-sub">
                          <Show
                            when={status() === "failed"}
                            fallback={
                              <>
                                {language.t(typeLabelKey(fileType(entry.file)))}
                                <span class="kb-sep" aria-hidden="true" />
                                {formatBytes(entry.file.size)}
                              </>
                            }
                          >
                            <span class="kb-error">{entry.file.processing?.error}</span>
                          </Show>
                          <span class="kb-sep" aria-hidden="true" />
                          {entry.library.name}
                        </span>
                      </span>
                      <span class="kb-job-progress">
                        <span class="kb-track">
                          <span
                            class="kb-fill"
                            data-state={status() === "failed" ? "failed" : undefined}
                            style={{ width: `${percent()}%` }}
                          />
                        </span>
                        <span class="kb-pct">{status() === "failed" ? "—" : `${percent()}%`}</span>
                      </span>
                      <span class="kb-job-status">
                        <FileStatus file={entry.file} />
                      </span>
                      <span class="kb-job-action">
                        <Show
                          when={status() === "failed"}
                          fallback={<span class="kb-row-time">{formatWhen(fileUpdatedAt(entry.file), language)}</span>}
                        >
                          <button
                            class="kb-btn kb-btn-sm"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void retry(entry.library.id, entry.file.path)
                            }}
                          >
                            {language.t("knowledge.workspace.library.retry.short")}
                          </button>
                        </Show>
                      </span>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </View>
  )
}

/** The processing detail the summary row leaves out: stages, slice count and the failure reason. */
export function JobDrawer() {
  const ws = useWorkspace()
  const language = useLanguage()
  let panel!: HTMLElement
  let opener: HTMLElement | undefined

  createEffect(() => {
    if (ws.ui.drawer()) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      queueMicrotask(() => panel?.focus())

      return
    }

    opener?.focus()
    opener = undefined
  })

  const entry = () => {
    const drawer = ws.ui.drawer()

    if (!drawer) return undefined
    const library = ws.knowledge.libraries.get(drawer.libraryID)
    const file = library?.files.find((candidate) => candidate.path === drawer.path)

    return library && file ? { library, file } : undefined
  }

  const retry = () => {
    const current = entry()

    if (!current) return
    ws.knowledge.libraries.patchFile(current.library.id, current.file.path, {
      processing: { status: "pending", progress: 0, at: Date.now() },
    })
    ws.knowledge.openLibrary(current.library)
    void ws.knowledge.runImport([current.file.source || current.file.path])
    ws.ui.closeDrawer()
  }

  const stages = createMemo((): ReadonlyArray<DrawerStageRow> => {
    const file = entry()?.file

    if (!file) return []

    const status = fileStatus(file)

    if (status === "ready") return [{ key: "done", state: "done", detail: "" }]

    if (status === "failed") {
      return [
        { key: "parse", state: "done", detail: "" },
        { key: "convert", state: "done", detail: "" },
        { key: "chunk", state: "done", detail: "" },
        { key: "embed", state: "failed", detail: file.processing?.error ?? "" },
      ]
    }

    if (status === "parsing") {
      return [
        { key: "parse", state: "active", detail: `${fileProgress(file)}%` },
        { key: "convert", state: "pending", detail: "" },
        { key: "chunk", state: "pending", detail: "" },
        { key: "embed", state: "pending", detail: "" },
      ]
    }

    if (status === "indexing") {
      return [
        { key: "parse", state: "done", detail: "" },
        { key: "convert", state: "done", detail: "" },
        { key: "chunk", state: "done", detail: "" },
        { key: "embed", state: "active", detail: `${fileProgress(file)}%` },
      ]
    }

    return [
      { key: "parse", state: "pending", detail: "" },
      { key: "convert", state: "pending", detail: "" },
      { key: "chunk", state: "pending", detail: "" },
      { key: "embed", state: "pending", detail: "" },
    ]
  })

  return (
    <Show when={entry()}>
      {(current) => (
        <>
          <div class="drawer-scrim" onClick={() => ws.ui.closeDrawer()} />
          <aside
            class="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={language.t("knowledge.workspace.jobs.drawer.title")}
            tabindex="-1"
            ref={panel}
            onKeyDown={(event) => trapModalTab(event, panel)}
          >
            <div class="drawer-head">
              <h2>{language.t("knowledge.workspace.jobs.drawer.title")}</h2>
              <button
                class="icon-btn"
                type="button"
                aria-label={language.t("knowledge.workspace.dialog.close")}
                onClick={() => ws.ui.closeDrawer()}
              >
                <Icon name="close" class="ico ico-sm" />
              </button>
            </div>

            <div class="drawer-body" data-scrollable>
              <div class="drawer-status">
                <FileStatus file={current().file} />
                <span class="drawer-task">{current().file.path}</span>
              </div>

              <div class="drawer-doc">
                <FileGlyph />
                <div>
                  <div class="name">{fileName(current().file)}</div>
                  <div class="lib">
                    {current().library.name} · {fileFolder(current().file) || "—"} ·{" "}
                    {formatBytes(current().file.size)}
                  </div>
                </div>
              </div>

              <Show when={current().file.processing?.error}>
                {(reason) => (
                  <div class="agent-note" data-tone="danger">
                    <Icon name="outline-hexagonal-warning" class="ico" />
                    <span>{reason()}</span>
                  </div>
                )}
              </Show>

              <div class="drawer-section">
                <h3>{language.t("knowledge.workspace.jobs.drawer.stages")}</h3>
                <div class="stage-list">
                  <For each={stages()}>
                    {(stage) => (
                      <div class="stage" data-state={stage.state}>
                        <span class="stage-icon">
                          <Show when={stage.state !== "pending"} fallback={<span class="ring" aria-hidden="true" />}>
                            <Show
                              when={stage.state === "active"}
                              fallback={<Icon name={STAGE_ICONS[stage.state]} class="ico ico-xs" />}
                            >
                              <Loader class="size-3.5" />
                            </Show>
                          </Show>
                        </span>
                        <span class="stage-copy">
                          <strong>
                            {language.t(`knowledge.workspace.jobs.drawer.stage.${stage.key}` as const)}
                          </strong>
                          <Show when={stage.detail}>
                            <span class={stage.state === "failed" ? "reason" : ""}>{stage.detail}</span>
                          </Show>
                        </span>
                      </div>
                    )}
                  </For>
                </div>
                <div class="drawer-progress">
                  <i
                    data-state={fileStatus(current().file) === "failed" ? "failed" : undefined}
                    style={{
                      width: `${fileStatus(current().file) === "ready" ? 100 : fileProgress(current().file)}%`,
                    }}
                  />
                </div>
              </div>

              <div class="drawer-section">
                <h3>{language.t("knowledge.workspace.jobs.drawer.index")}</h3>
                <dl class="drawer-meta">
                  <dt>{language.t("knowledge.workspace.jobs.drawer.source")}</dt>
                  <dd>{current().file.path}</dd>
                  <dt>{language.t("knowledge.workspace.jobs.drawer.chunks")}</dt>
                  <dd>{fileChunks(current().file)}</dd>
                  <dt>{language.t("knowledge.workspace.jobs.drawer.embedding")}</dt>
                  <dd>{language.t(stageLabelKey(fileStatus(current().file)))}</dd>
                  <dt>{language.t("knowledge.workspace.jobs.drawer.updated")}</dt>
                  <dd>{formatWhen(fileUpdatedAt(current().file), language)}</dd>
                </dl>
                <p class="drawer-note">{language.t("knowledge.workspace.jobs.drawer.note")}</p>
              </div>
            </div>

            <div class="drawer-foot">
              <Show
                when={fileStatus(current().file) === "failed"}
                fallback={
                  <button
                    class="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      ws.ui.closeDrawer()
                      ws.openDocument(current().library.id, current().file.path)
                    }}
                  >
                    <Icon name="file-document" class="ico" />
                    {language.t("knowledge.workspace.jobs.drawer.open")}
                  </button>
                }
              >
                <button class="btn btn-ghost" type="button" onClick={retry}>
                  <Icon name="refresh" class="ico" />
                  {language.t("knowledge.workspace.jobs.drawer.retry")}
                </button>
              </Show>
              <span class="spacer" />
              <button class="btn" type="button" onClick={() => ws.ui.closeDrawer()}>
                {language.t("knowledge.workspace.dialog.close")}
              </button>
            </div>
          </aside>
        </>
      )}
    </Show>
  )
}
