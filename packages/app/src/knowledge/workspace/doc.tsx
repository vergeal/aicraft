import { Icon } from "@aicraft/ui/icon"
import { Loader } from "@aicraft/ui/loader"
import { Markdown } from "@aicraft/session-ui/markdown"
import { MarkdownProvider } from "@aicraft/session-ui/context/markdown"
import { Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { trapModalTab } from "./bits"
import { useWorkspace } from "./context"
import {
  fileName,
  fileChunks,
  fileFolder,
  fileType,
  formatBytes,
  formatWhen,
  fileUpdatedAt,
  statusLabelKey,
  fileStatus,
  typeLabelKey,
} from "./format"
import type { MenuItem } from "./state"

/**
 * One document reads in a drawer over the list it came from: the library keeps its place, and
 * closing the drawer returns to exactly what was open before.
 */
export function DocView() {
  const ws = useWorkspace()
  const language = useLanguage()
  let panel!: HTMLElement
  let opener: HTMLElement | undefined

  const library = () => {
    const id = ws.ui.store.libraryID

    return id ? ws.knowledge.libraries.get(id) : undefined
  }

  const file = () => {
    const lib = library()
    const path = ws.ui.store.docPath

    return path ? lib?.files.find((entry) => entry.path === path) : undefined
  }

  createEffect(() => {
    if (ws.ui.store.docPath) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      queueMicrotask(() => panel?.focus())

      return
    }

    opener?.focus()
    opener = undefined
  })

  const close = () => ws.ui.closeDoc()

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
        label: language.t(entry.favorite ? "knowledge.workspace.menu.unfavorite" : "knowledge.workspace.menu.favorite"),
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
    <Show when={file()}>
      {(entry) => (
        <>
          <div class="kb-scrim" data-open="" onClick={close} />
          <aside
            class="kb-drawer"
            data-open=""
            role="dialog"
            aria-modal="true"
            aria-label={fileName(entry())}
            tabindex="-1"
            ref={panel}
            onKeyDown={(event) => trapModalTab(event, panel)}
          >
            <header class="kb-drawer-head">
              <div class="kb-drawer-title">
                <h2>{fileName(entry())}</h2>
                <p>
                  {library()?.name}
                  {` › ${fileFolder(entry()) || language.t("knowledge.workspace.dialog.root")}，`}
                  {language.t(typeLabelKey(fileType(entry())))}
                  {`，${formatBytes(entry().size)}，`}
                  {language.plural("knowledge.workspace.chunks", fileChunks(entry()), {
                    count: fileChunks(entry()),
                  })}
                </p>
              </div>
              <button
                class="kb-icon-btn"
                type="button"
                aria-label={language.t("knowledge.workspace.dialog.close")}
                onClick={close}
              >
                <Icon name="close" class="ico" />
              </button>
            </header>

            <div class="kb-drawer-body" data-scrollable>
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
            </div>

            <footer class="kb-drawer-foot">
              <span class="kb-foot-note">
                {language.t(statusLabelKey(fileStatus(entry())))}
                {`，`}
                {language.t("knowledge.workspace.doc.updated", {
                  time: formatWhen(fileUpdatedAt(entry()), language),
                })}
              </span>
              <button
                class="kb-icon-btn"
                type="button"
                aria-pressed={Boolean(entry().favorite) ? "true" : "false"}
                aria-label={language.t(
                  entry().favorite ? "knowledge.workspace.menu.unfavorite" : "knowledge.workspace.menu.favorite",
                )}
                onClick={() => {
                  const lib = library()

                  if (!lib) return
                  ws.knowledge.libraries.setFileFavorite(lib.id, entry().path, !entry().favorite)
                }}
              >
                <Icon name="pin" class="ico ico-sm" />
              </button>
              <button
                class="kb-icon-btn"
                type="button"
                aria-label={language.t("knowledge.workspace.doc.reprocess")}
                onClick={() => void retry()}
              >
                <Icon name="refresh" class="ico ico-sm" />
              </button>
              <button class="kb-neutral" type="button" onClick={() => void download()}>
                {language.t("knowledge.workspace.doc.download")}
              </button>
              <button
                class="kb-icon-btn"
                type="button"
                aria-label={language.t("knowledge.workspace.doc.more")}
                onClick={more}
              >
                <Icon name="outline-dots" class="ico" />
              </button>
            </footer>
          </aside>
        </>
      )}
    </Show>
  )
}
