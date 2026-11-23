import { Icon } from "@opencode/ui/icon"
import { createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { trapModalTab } from "./bits"
import { fullName, fileName, fileFolder } from "./format"
import { useWorkspace } from "./context"
import type { DialogState } from "./state"

function libraryIDOf(dialog: DialogState) {
  return "libraryID" in dialog ? dialog.libraryID : ""
}

function pathsOf(dialog: DialogState) {
  return "paths" in dialog ? dialog.paths : []
}

function pathOf(dialog: DialogState) {
  return "path" in dialog ? dialog.path : ""
}

/** One modal shell for every workspace dialog; escape and the scrim both dismiss it. */
function DialogShell(props: { title: string; children: JSX.Element; footer: JSX.Element }) {
  const ws = useWorkspace()
  const language = useLanguage()
  let modal!: HTMLDivElement
  let opener: HTMLElement | undefined

  onMount(() => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined

    const field = modal.querySelector<HTMLElement>("input, textarea, select")
    const button = modal.querySelector<HTMLElement>("button")
    const target = field ?? button ?? modal

    target.focus()
  })

  onCleanup(() => opener?.focus())

  return (
    <div
      class="scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) ws.ui.closeDialog()
      }}
    >
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabindex="-1"
        ref={modal}
        onKeyDown={(event) => trapModalTab(event, modal)}
      >
        <div class="modal-head">
          <h2>{props.title}</h2>
          <button
            class="icon-btn"
            type="button"
            aria-label={language.t("knowledge.workspace.dialog.close")}
            onClick={() => ws.ui.closeDialog()}
          >
            <Icon name="close" class="ico ico-sm" />
          </button>
        </div>
        <div class="modal-body scroll" data-scrollable>
          {props.children}
        </div>
        <div class="modal-foot">{props.footer}</div>
      </div>
    </div>
  )
}

function Footer(props: {
  confirm: string
  onConfirm: () => void
  danger?: boolean
  disabled?: boolean
  cancel?: string
}) {
  const ws = useWorkspace()
  const language = useLanguage()

  return (
    <>
      <button class="btn btn-ghost" type="button" onClick={() => ws.ui.closeDialog()}>
        {props.cancel ?? language.t("knowledge.workspace.dialog.cancel")}
      </button>
      <span class="spacer" />
      <button
        class={props.danger ? "btn btn-danger" : "btn btn-primary"}
        type="button"
        disabled={props.disabled}
        onClick={props.onConfirm}
      >
        {props.confirm}
      </button>
    </>
  )
}

export function WorkspaceDialog() {
  const ws = useWorkspace()

  return (
    <Show when={ws.ui.dialog()}>
      {(dialog) => {
        const state = () => dialog()

        return (
          <>
            <Show when={state().type === "new-library"}>
              <NewLibrary />
            </Show>
            <Show when={state().type === "rename-library"}>
              <RenameLibrary libraryID={libraryIDOf(state())} />
            </Show>
            <Show when={state().type === "delete-library"}>
              <DeleteLibrary libraryID={libraryIDOf(state())} />
            </Show>
            <Show when={state().type === "settings"}>
              <LibrarySettings libraryID={libraryIDOf(state())} />
            </Show>
            <Show when={state().type === "new-folder"}>
              <NewFolder libraryID={libraryIDOf(state())} />
            </Show>
            <Show when={state().type === "move"}>
              <MoveFiles libraryID={libraryIDOf(state())} paths={pathsOf(state())} />
            </Show>
            <Show when={state().type === "rename-file"}>
              <RenameFile libraryID={libraryIDOf(state())} path={pathOf(state())} />
            </Show>
            <Show when={state().type === "confirm-delete"}>
              <ConfirmDelete libraryID={libraryIDOf(state())} paths={pathsOf(state())} />
            </Show>
            <Show when={state().type === "confirm-purge"}>
              <ConfirmPurge libraryID={libraryIDOf(state())} path={pathOf(state())} />
            </Show>
            <Show when={state().type === "confirm-empty-trash"}>
              <ConfirmEmptyTrash />
            </Show>
          </>
        )
      }}
    </Show>
  )
}

function NewLibrary() {
  const ws = useWorkspace()
  const language = useLanguage()
  const [name, setName] = createSignal("")
  const [about, setAbout] = createSignal("")

  const create = () => {
    const trimmed = name().trim()

    if (!trimmed) return
    const id = ws.knowledge.libraries.create(trimmed, about().trim())

    ws.ui.closeDialog()
    ws.openLibrary(id)
    ws.ui.notify(language.t("knowledge.workspace.toast.libraryCreated", { name: trimmed }))
  }

  return (
    <DialogShell
      title={language.t("knowledge.new")}
      footer={
        <Footer confirm={language.t("knowledge.create")} disabled={!name().trim()} onConfirm={create} />
      }
    >
      <label class="dialog-label">
        {language.t("knowledge.name.label")}
        <input
          class="dialog-input"
          value={name()}
          placeholder={language.t("knowledge.name.placeholder")}
          onInput={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") create()
          }}
        />
      </label>
      <label class="dialog-label">
        {language.t("knowledge.new.about.label")}
        <textarea
          class="dialog-input dialog-area"
          rows={3}
          value={about()}
          placeholder={language.t("knowledge.new.about.placeholder")}
          onInput={(event) => setAbout(event.currentTarget.value)}
        />
      </label>
      <p class="dialog-hint">{language.t("knowledge.new.about.hint")}</p>
    </DialogShell>
  )
}

function RenameLibrary(props: { libraryID: string }) {
  const ws = useWorkspace()
  const language = useLanguage()
  const library = () => ws.knowledge.libraries.get(props.libraryID)
  const [name, setName] = createSignal(library()?.name ?? "")

  const save = () => {
    const trimmed = name().trim()

    if (!trimmed || !library()) return
    ws.knowledge.libraries.rename(props.libraryID, trimmed)
    ws.ui.closeDialog()
    ws.ui.notify(language.t("knowledge.workspace.toast.libraryRenamed", { name: trimmed }))
  }

  return (
    <DialogShell
      title={language.t("knowledge.workspace.dialog.renameLibrary")}
      footer={<Footer confirm={language.t("knowledge.workspace.dialog.save")} disabled={!name().trim()} onConfirm={save} />}
    >
      <label class="dialog-label">
        {language.t("knowledge.name.label")}
        <input
          class="dialog-input"
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save()
          }}
        />
      </label>
    </DialogShell>
  )
}

function LibrarySettings(props: { libraryID: string }) {
  const ws = useWorkspace()
  const language = useLanguage()
  const platform = usePlatform()
  const library = () => ws.knowledge.libraries.get(props.libraryID)
  const [name, setName] = createSignal(library()?.name ?? "")

  const save = () => {
    const trimmed = name().trim()

    if (!trimmed || !library()) return
    ws.knowledge.libraries.rename(props.libraryID, trimmed)
    ws.ui.closeDialog()
    ws.ui.notify(language.t("knowledge.workspace.toast.libraryRenamed", { name: trimmed }))
  }

  return (
    <DialogShell
      title={language.t("knowledge.workspace.dialog.settings")}
      footer={<Footer confirm={language.t("knowledge.workspace.dialog.save")} disabled={!name().trim()} onConfirm={save} />}
    >
      <Show when={library()}>
        {(current) => (
          <>
            <label class="dialog-label">
              {language.t("knowledge.name.label")}
              <input
                class="dialog-input"
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
              />
            </label>
            <div class="dialog-row">
              <span>{language.t("knowledge.workspace.dialog.favorite")}</span>
              <button
                class="btn btn-sm"
                type="button"
                aria-pressed={Boolean(current().favorite)}
                onClick={() => ws.knowledge.libraries.setFavorite(current().id, !current().favorite)}
              >
                {language.t(
                  current().favorite ? "knowledge.workspace.menu.unfavorite" : "knowledge.workspace.menu.favorite",
                )}
              </button>
            </div>
            <div class="dialog-row">
              <span>{language.t("knowledge.workspace.dialog.documents")}</span>
              <span>{current().files.filter((file) => !file.deletedAt).length}</span>
            </div>
            <div class="dialog-row">
              <span>{language.t("knowledge.workspace.dialog.sources")}</span>
              <span class="dialog-paths">
                <For each={current().sources}>{(source) => <span>{source}</span>}</For>
              </span>
            </div>
            <p class="dialog-hint">
              {language.t("knowledge.workspace.dialog.indexNote", {
                state: platform.platform === "desktop" ? language.t("knowledge.workspace.dialog.local") : "—",
              })}
            </p>
          </>
        )}
      </Show>
    </DialogShell>
  )
}

function DeleteLibrary(props: { libraryID: string }) {
  const ws = useWorkspace()
  const language = useLanguage()
  const platform = usePlatform()
  const library = () => ws.knowledge.libraries.get(props.libraryID)

  const remove = async () => {
    const current = library()

    if (!current) return
    ws.ui.closeDialog()

    if (ws.data.isLinked(current.id)) await ws.data.unlink(current.id).catch(() => undefined)
    await platform.deleteKnowledgeFiles?.(
      current.id,
      current.files.map((file) => file.path),
    ).catch(() => undefined)
    ws.knowledge.libraries.remove(current.id)
    ws.ui.go("libraries")
    ws.ui.notify(language.t("knowledge.workspace.toast.libraryDeleted", { name: current.name }))
  }

  return (
    <DialogShell
      title={language.t("knowledge.delete")}
      footer={
        <Footer
          confirm={language.t("knowledge.delete")}
          danger
          onConfirm={() => void remove()}
        />
      }
    >
      <p class="dialog-copy">
        {language.t("knowledge.delete.confirm", { name: library()?.name ?? "" })}
      </p>
    </DialogShell>
  )
}

function NewFolder(props: { libraryID: string }) {
  const ws = useWorkspace()
  const language = useLanguage()
  const [name, setName] = createSignal("")

  const create = () => {
    const trimmed = name().trim()

    if (!trimmed) return
    ws.knowledge.libraries.addFolder(props.libraryID, trimmed)
    ws.ui.setStore("folder", trimmed)
    ws.ui.closeDialog()
    ws.ui.notify(language.t("knowledge.workspace.toast.folderCreated", { name: trimmed }))
  }

  return (
    <DialogShell
      title={language.t("knowledge.workspace.dialog.newFolder")}
      footer={<Footer confirm={language.t("knowledge.create")} disabled={!name().trim()} onConfirm={create} />}
    >
      <label class="dialog-label">
        {language.t("knowledge.workspace.dialog.folderName")}
        <input
          class="dialog-input"
          value={name()}
          placeholder={language.t("knowledge.workspace.dialog.folderPlaceholder")}
          onInput={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") create()
          }}
        />
      </label>
    </DialogShell>
  )
}

function MoveFiles(props: { libraryID: string; paths: string[] }) {
  const ws = useWorkspace()
  const language = useLanguage()
  const library = () => ws.knowledge.libraries.get(props.libraryID)
  const folders = () => library()?.folders ?? []
  const [target, setTarget] = createSignal("")
  const [fresh, setFresh] = createSignal("")

  const move = () => {
    const folder = fresh().trim() || target()

    if (folder) ws.knowledge.libraries.addFolder(props.libraryID, folder)
    ws.knowledge.libraries.patchFiles(props.libraryID, props.paths, { folder: folder || undefined })
    ws.ui.closeDialog()
    ws.ui.clearSelection()
    ws.ui.notify(language.t("knowledge.workspace.toast.moved", { count: props.paths.length }))
  }

  return (
    <DialogShell
      title={language.t("knowledge.workspace.dialog.move")}
      footer={<Footer confirm={language.t("knowledge.workspace.dialog.moveAction")} onConfirm={move} />}
    >
      <p class="dialog-copy">
        {language.t("knowledge.workspace.dialog.moveCopy", { count: props.paths.length })}
      </p>
      <label class="dialog-label">
        {language.t("knowledge.workspace.dialog.targetFolder")}
        <select class="dialog-input" value={target()} onChange={(event) => setTarget(event.currentTarget.value)}>
          <option value="">{language.t("knowledge.workspace.dialog.root")}</option>
          <For each={folders()}>{(folder) => <option value={folder}>{folder}</option>}</For>
        </select>
      </label>
      <label class="dialog-label">
        {language.t("knowledge.workspace.dialog.orNewFolder")}
        <input
          class="dialog-input"
          value={fresh()}
          placeholder={language.t("knowledge.workspace.dialog.folderPlaceholder")}
          onInput={(event) => setFresh(event.currentTarget.value)}
        />
      </label>
    </DialogShell>
  )
}

function RenameFile(props: { libraryID: string; path: string }) {
  const ws = useWorkspace()
  const language = useLanguage()

  const file = () =>
    ws.knowledge.libraries.get(props.libraryID)?.files.find((entry) => entry.path === props.path)

  const [name, setName] = createSignal(file() ? fileName(file()!) : "")

  const save = () => {
    const entry = file()
    const trimmed = name().trim()

    if (!entry || !trimmed) return
    const original = fullName(entry)
    const dot = original.lastIndexOf(".")
    const ext = dot > 0 ? original.slice(dot) : ""
    const label = ext && !trimmed.endsWith(ext) ? `${trimmed}${ext}` : trimmed

    ws.knowledge.libraries.patchFile(props.libraryID, props.path, { label })
    ws.ui.closeDialog()
    ws.ui.notify(language.t("knowledge.workspace.toast.renamed", { name: trimmed }))
  }

  return (
    <DialogShell
      title={language.t("knowledge.workspace.dialog.renameFile")}
      footer={<Footer confirm={language.t("knowledge.workspace.dialog.save")} disabled={!name().trim()} onConfirm={save} />}
    >
      <label class="dialog-label">
        {language.t("knowledge.name.label")}
        <input
          class="dialog-input"
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save()
          }}
        />
      </label>
      <p class="dialog-hint">
        {language.t("knowledge.workspace.dialog.renameHint", { folder: fileFolder(file()!) || "—" })}
      </p>
    </DialogShell>
  )
}

function ConfirmDelete(props: { libraryID: string; paths: string[] }) {
  const ws = useWorkspace()
  const language = useLanguage()

  const confirm = () => {
    ws.knowledge.libraries.trashFiles(props.libraryID, props.paths)
    ws.ui.closeDialog()
    ws.ui.clearSelection()
    ws.ui.notify(language.t("knowledge.workspace.toast.trashed", { count: props.paths.length }))
  }

  return (
    <DialogShell
      title={language.t("knowledge.workspace.dialog.deleteTitle", { count: props.paths.length })}
      footer={<Footer confirm={language.t("knowledge.workspace.dialog.deleteAction")} danger onConfirm={confirm} />}
    >
      <p class="dialog-copy">
        {language.t("knowledge.workspace.dialog.deleteCopy", { count: props.paths.length })}
      </p>
    </DialogShell>
  )
}

function ConfirmPurge(props: { libraryID: string; path: string }) {
  const ws = useWorkspace()
  const language = useLanguage()
  const platform = usePlatform()

  const confirm = () => {
    ws.knowledge.libraries.removeFiles(props.libraryID, [props.path])
    void platform.deleteKnowledgeFiles?.(props.libraryID, [props.path]).catch(() => undefined)
    ws.ui.closeDialog()
    ws.ui.notify(language.t("knowledge.workspace.toast.purged"))
  }

  return (
    <DialogShell
      title={language.t("knowledge.workspace.dialog.purgeTitle")}
      footer={
        <Footer confirm={language.t("knowledge.workspace.dialog.purgeAction")} danger onConfirm={confirm} />
      }
    >
      <p class="dialog-copy">{language.t("knowledge.workspace.dialog.purgeCopy")}</p>
    </DialogShell>
  )
}

function ConfirmEmptyTrash() {
  const ws = useWorkspace()
  const language = useLanguage()
  const platform = usePlatform()

  const confirm = () => {
    for (const library of ws.knowledge.libraries.libraries()) {
      const paths = library.files.filter((file) => file.deletedAt).map((file) => file.path)

      if (!paths.length) continue
      ws.knowledge.libraries.removeFiles(library.id, paths)
      void platform.deleteKnowledgeFiles?.(library.id, paths).catch(() => undefined)
    }

    ws.ui.closeDialog()
    ws.ui.notify(language.t("knowledge.workspace.toast.trashEmptied"))
  }

  return (
    <DialogShell
      title={language.t("knowledge.workspace.dialog.emptyTrashTitle")}
      footer={<Footer confirm={language.t("knowledge.workspace.dialog.emptyTrashAction")} danger onConfirm={confirm} />}
    >
      <p class="dialog-copy">{language.t("knowledge.workspace.dialog.emptyTrashCopy")}</p>
    </DialogShell>
  )
}
