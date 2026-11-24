import { Icon } from "@aicraft/ui/icon"
import { Loader } from "@aicraft/ui/loader"
import { Markdown } from "@aicraft/session-ui/markdown"
import { MarkdownProvider } from "@aicraft/session-ui/context/markdown"
import { Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { FileStatus, PageHead, View } from "./bits"
import { useWorkspace } from "./context"
import { fileName, fileChunks, fileType, fileUpdatedAt, formatWhen, typeLabelKey } from "./format"
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
    <Show when={file()} fallback={<div class="kb-scroll" />}>
      {(entry) => (
        <View name="doc">
          <div class="kb-scroll" data-scrollable>
            <div class="kb-page kb-doc-page">
              <PageHead
                back={{ label: library()?.name ?? language.t("knowledge.workspace.title"), onClick: () => ws.ui.closeDoc() }}
                title={fileName(entry())}
                actions={
                  <>
                    <button class="kb-btn" type="button" onClick={() => void download()}>
                      <Icon name="outline-square-arrow" class="ico" />
                      <span>{language.t("knowledge.workspace.doc.download")}</span>
                    </button>
                    <button
                      class="kb-icon"
                      type="button"
                      aria-label={language.t("knowledge.workspace.doc.reprocess")}
                      onClick={() => void retry()}
                    >
                      <Icon name="refresh" class="ico" />
                    </button>
                    <button
                      class="kb-icon"
                      type="button"
                      aria-label={language.t("knowledge.workspace.doc.more")}
                      onClick={more}
                    >
                      <Icon name="outline-dots" class="ico" />
                    </button>
                  </>
                }
                meta={
                  <>
                    <FileStatus file={entry()} />
                    <span class="kb-sep" aria-hidden="true" />
                    <span>{language.t(typeLabelKey(fileType(entry())))}</span>
                    <span class="kb-sep" aria-hidden="true" />
                    <span>
                      {language.t("knowledge.workspace.doc.updated", {
                        time: formatWhen(fileUpdatedAt(entry()), language),
                      })}
                    </span>
                  </>
                }
              />

              <Show
                when={ws.knowledge.preview().status !== "loading"}
                fallback={
                  <div class="kb-doc-loading">
                    <Loader class="size-4" />
                    {language.t("knowledge.workspace.doc.loading")}
                  </div>
                }
              >
                <Show
                  when={ws.knowledge.preview().status === "failed"}
                  fallback={
                    <article class="kb-article">
                      <MarkdownProvider>
                        <Markdown text={ws.knowledge.previewText()} cacheKey={entry().path} />
                      </MarkdownProvider>
                    </article>
                  }
                >
                  <p class="kb-doc-error">
                    {language.t("knowledge.workspace.doc.failed", { message: ws.knowledge.previewMessage() })}
                  </p>
                </Show>
              </Show>

              <p class="kb-foot">
                <span>
                  {language.t("knowledge.workspace.doc.foot", {
                    path: entry().path,
                    chunks: fileChunks(entry()),
                  })}
                </span>
                <span class="kb-spacer" />
                <button
                  class="kb-btn kb-btn-sm kb-btn-ghost"
                  type="button"
                  onClick={() => void ws.data.reveal(entry().path, entry().source)}
                >
                  {language.t("knowledge.workspace.doc.reveal")}
                </button>
              </p>
            </div>
          </div>
        </View>
      )}
    </Show>
  )
}
