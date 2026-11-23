import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { Markdown } from "@opencode/session-ui/markdown"
import { MarkdownProvider } from "@opencode/session-ui/context/markdown"
import { Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { FileStatus, View } from "./bits"
import { useWorkspace } from "./context"
import {
  fileName,
  fileChunks,
  fileFolder,
  fileType,
  fileUpdatedAt,
  formatBytes,
  formatWhen,
  typeLabelKey,
} from "./format"
import type { MenuItem } from "./state"

/**
 * One document reads as a single centred column, the same measure as an answer:
 * the processing detail belongs to the processing centre, not beside the text.
 */
export function DocView() {
  const ws = useWorkspace()
  const language = useLanguage()

  const library = () => {
    const id = ws.ui.store.libraryID

    return id ? ws.knowledge.libraries.get(id) : undefined
  }

  const file = () => {
    const lib = library()
    const path = ws.ui.store.docPath

    return path ? lib?.files.find((entry) => entry.path === path) : undefined
  }

  const retry = async () => {
    const lib = library()
    const entry = file()

    if (!lib || !entry) return
    ws.knowledge.libraries.patchFile(lib.id, entry.path, {
      processing: { status: "pending", progress: 0, at: Date.now() },
    })
    ws.knowledge.openLibrary(lib)
    await ws.knowledge.runImport([entry.source || entry.path])
  }

  const download = async () => {
    const lib = library()
    const entry = file()

    if (!lib || !entry) return
    const saved = await ws.data.exportText(lib.id, entry.path, fileName(entry))

    if (!saved) ws.ui.notify(language.t("knowledge.workspace.toast.downloadFailed"))
  }

  const more = (event: MouseEvent) => {
    const lib = library()
    const entry = file()

    if (!lib || !entry) return

    if (!(event.currentTarget instanceof HTMLElement)) return

    const rect = event.currentTarget.getBoundingClientRect()

    const items: MenuItem[] = [
      {
        label: language.t("knowledge.workspace.menu.rename"),
        icon: "edit",
        onSelect: () => ws.ui.openDialog({ type: "rename-file", libraryID: lib.id, path: entry.path }),
      },
      {
        label: language.t("knowledge.workspace.menu.move"),
        icon: "folder",
        onSelect: () => ws.ui.openDialog({ type: "move", libraryID: lib.id, paths: [entry.path] }),
      },
      {
        label: language.t(
          entry.favorite ? "knowledge.workspace.menu.unfavorite" : "knowledge.workspace.menu.favorite",
        ),
        icon: "pin",
        onSelect: () => {
          ws.knowledge.libraries.setFileFavorite(lib.id, entry.path, !entry.favorite)
          ws.ui.notify(
            language.t(entry.favorite ? "knowledge.workspace.toast.unfavorite" : "knowledge.workspace.toast.favorite", {
              name: fileName(entry),
            }),
          )
        },
      },
      {
        label: language.t("knowledge.workspace.menu.reveal"),
        icon: "outline-square-arrow",
        onSelect: () => void ws.data.reveal(entry.path, entry.source),
      },
      { separator: true },
      {
        label: language.t("knowledge.workspace.menu.trash"),
        icon: "outline-trash",
        danger: true,
        onSelect: () => ws.ui.openDialog({ type: "confirm-delete", libraryID: lib.id, paths: [entry.path] }),
      },
    ]

    ws.ui.openMenu({ x: rect.right, y: rect.bottom + 4, items })
  }

  return (
    <Show when={file()} fallback={<div class="page-scroll scroll" />}>
      {(entry) => (
        <View name="doc">
          <div class="doc-bar">
            <button class="doc-back" type="button" onClick={() => ws.ui.closeDoc()}>
              <Icon name="outline-arrow-left" class="ico ico-sm" />
              <span class="label">{library()?.name}</span>
            </button>
            <span class="spacer" />
            <span class="doc-state">
              <FileStatus file={entry()} />
            </span>
            <button class="btn" type="button" onClick={() => void download()}>
              <Icon name="outline-square-arrow" class="ico" />
              {language.t("knowledge.workspace.doc.download")}
            </button>
            <button
              class="icon-btn"
              type="button"
              aria-label={language.t("knowledge.workspace.doc.reprocess")}
              onClick={() => void retry()}
            >
              <Icon name="refresh" class="ico ico-sm" />
            </button>
            <button
              class="icon-btn"
              type="button"
              aria-label={language.t("knowledge.workspace.doc.more")}
              onClick={more}
            >
              <Icon name="outline-dots" class="ico ico-sm" />
            </button>
          </div>

          <div class="doc-scroll scroll" data-scrollable>
            <div class="doc-layout">
              <article class="doc-article">
                <h1>{fileName(entry())}</h1>
                <div class="doc-meta">
                  <span>{library()?.name}</span>
                  <span class="meta-sep" aria-hidden="true" />
                  <span>{language.t(typeLabelKey(fileType(entry())))}</span>
                  <Show when={fileFolder(entry())}>
                    <span class="meta-sep" aria-hidden="true" />
                    <span>{fileFolder(entry())}</span>
                  </Show>
                  <span class="meta-sep" aria-hidden="true" />
                  <span>
                    {language.t("knowledge.workspace.doc.updated", {
                      time: formatWhen(fileUpdatedAt(entry()), language),
                    })}
                  </span>
                  <span class="meta-sep" aria-hidden="true" />
                  <span>{formatBytes(entry().size)}</span>
                </div>

                <Show
                  when={ws.knowledge.preview().status !== "loading"}
                  fallback={
                    <div class="doc-loading">
                      <Loader class="size-4" />
                      {language.t("knowledge.workspace.doc.loading")}
                    </div>
                  }
                >
                  <Show
                    when={ws.knowledge.preview().status === "failed"}
                    fallback={
                      <MarkdownProvider>
                        <Markdown text={ws.knowledge.previewText()} cacheKey={entry().path} />
                      </MarkdownProvider>
                    }
                  >
                    <p class="doc-error">
                      {language.t("knowledge.workspace.doc.failed", { message: ws.knowledge.previewMessage() })}
                    </p>
                  </Show>
                </Show>

                <div class="doc-foot">
                  <span>
                    {language.t("knowledge.workspace.doc.foot", {
                      path: entry().path,
                      chunks: fileChunks(entry()),
                    })}
                  </span>
                  <button
                    class="doc-foot-link"
                    type="button"
                    onClick={() => void ws.data.reveal(entry().path, entry().source)}
                  >
                    {language.t("knowledge.workspace.doc.reveal")}
                  </button>
                </div>
              </article>
            </div>
          </div>
        </View>
      )}
    </Show>
  )
}
