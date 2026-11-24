import { Show, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { InlineInput } from "@aicraft/ui/inline-input"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection } from "@/runtime/server/registry"
import type { LocalProject } from "@/shell/state/layout"
import { displayName } from "@aicraft/ui/project-avatar"
import { ProjectFolder } from "@aicraft/ui/project-folder"
import { ContextMenu } from "@aicraft/ui/context-menu"
import { Project } from "@aicraft/schema/project"
import { useDeleteProject } from "@/home/projects/delete"
import { useRenameProject } from "@/home/projects/rename"
import { ProjectOptions, projectMenuItems } from "./project-options"

export function SettingsProjectRow(props: {
  project: LocalProject
  server: ServerConnection.Any
  onOpen: (project: LocalProject) => void
  onAdd?: () => void
  onMount?: (button: HTMLButtonElement) => void
}) {
  const language = useLanguage()
  const global = useGlobal()
  const platform = usePlatform()

  const [store, setStore] = createStore<{
    menu: boolean
    editor?: { draft: string; saving: boolean }
  }>({
    menu: false,
  })

  const renameProject = useRenameProject()

  let button: HTMLButtonElement | undefined
  let input: HTMLInputElement | undefined

  onMount(() => {
    if (button) props.onMount?.(button)
  })

  const openEditor = () => {
    setStore("editor", { draft: displayName(props.project), saving: false })
    requestAnimationFrame(() => {
      input?.focus()
      input?.select()
    })
  }

  const closeEditor = () => {
    if (store.editor?.saving) return
    setStore("editor", undefined)
  }

  const saveEditor = async () => {
    if (!store.editor || store.editor.saving) return
    const name = store.editor.draft.trim()

    if (!name || name === displayName(props.project)) {
      closeEditor()
      requestAnimationFrame(() => button?.focus())

      return
    }

    setStore("editor", "saving", true)
    const context = global.serverCtx(ServerConnection.key(props.server))

    if (!context) return

    const saved = await renameProject(context, props.project, name)
    const restore = document.activeElement === document.body || document.activeElement === input

    if (saved) setStore("editor", undefined)

    if (!saved) setStore("editor", "saving", false)

    if (!restore) return
    requestAnimationFrame(() => (saved ? button : input)?.focus())
  }

  const deleteProject = useDeleteProject()

  const items = projectMenuItems({
    server: props.server,
    project: props.project,
    onAdd: props.onAdd,
    onEdit: () => props.onOpen(props.project),
    onRename: openEditor,
    onDelete: props.project.id === Project.ID.global ? undefined : () => deleteProject(props.server, props.project),
  })

  // Desktop draws the platform menu; only the web build needs the in-app one.
  const showNativeMenu = async (position: { x: number; y: number }) => {
    const show = platform.showContextMenu

    if (!show) return
    const menu = items()

    const chosen = await show(
      menu.flatMap((item) => [
        ...(item.separated ? [{ type: "separator" as const }] : []),
        { id: item.id, label: item.label, enabled: !item.disabled },
      ]),
      position,
    )

    menu.find((item) => item.id === chosen)?.onSelect()
  }

  // A settings row: the leading area opens the project and names it, the options menu trails it. The path is the
  // second line, so two projects with the same folder name stay apart without hovering for a tooltip.
  const content = () => (
    <>
      <Show
        when={!store.editor}
        fallback={
          <div class="project-row-editor">
            <ProjectFolder />
            <InlineInput
              ref={input}
              aria-label={language.t("common.rename")}
              dir="auto"
              value={store.editor?.draft ?? ""}
              disabled={store.editor?.saving}
              class="project-row-editor-input"
              style={{ "--inline-input-shadow": "none", "border-radius": "0", "text-align": "start" }}
              onInput={(event) => setStore("editor", "draft", event.currentTarget.value)}
              onKeyDown={(event) => {
                event.stopPropagation()

                if (event.isComposing || event.keyCode === 229) return

                if (event.key === "Enter") {
                  event.preventDefault()
                  void saveEditor()

                  return
                }

                if (event.key !== "Escape") return
                event.preventDefault()
                closeEditor()
                requestAnimationFrame(() => button?.focus())
              }}
              onBlur={closeEditor}
            />
          </div>
        }
      >
        <button
          ref={button}
          type="button"
          aria-label={displayName(props.project)}
          title={props.project.worktree}
          class="project-row-open"
          onClick={() => props.onOpen(props.project)}
        >
          <ProjectFolder />
          <span class="project-row-text">
            <bdi class="project-row-name">{displayName(props.project)}</bdi>
            <bdi dir="ltr" class="project-row-path">
              {props.project.worktree}
            </bdi>
          </span>
        </button>
        <ProjectOptions
          server={props.server}
          project={props.project}
          open={store.menu}
          onOpenChange={(open) => setStore("menu", open)}
          onAdd={props.onAdd}
          onEdit={() => props.onOpen(props.project)}
          onRename={openEditor}
          onDelete={
            props.project.id === Project.ID.global ? undefined : () => deleteProject(props.server, props.project)
          }
        />
      </Show>
    </>
  )

  // The row itself is the right-click target and the settings row, so it stays a direct child of the settings list
  // and keeps its divider.
  return (
    <Show
      when={!platform.showContextMenu}
      fallback={
        <div
          role="listitem"
          data-component="settings-row"
          data-project-row
          data-menu={store.menu ? "true" : undefined}
          onContextMenu={(event) => {
            event.preventDefault()
            void showNativeMenu({ x: event.clientX, y: event.clientY })
          }}
        >
          {content()}
        </div>
      }
    >
      <ContextMenu>
        <ContextMenu.Trigger
          role="listitem"
          data-component="settings-row"
          data-project-row
          data-menu={store.menu ? "true" : undefined}
        >
          {content()}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content>
            {items().map((item) => (
              <>
                {item.separated ? <ContextMenu.Separator /> : null}
                <ContextMenu.Item disabled={item.disabled} onSelect={item.onSelect}>
                  <ContextMenu.ItemLabel>{item.label}</ContextMenu.ItemLabel>
                </ContextMenu.Item>
              </>
            ))}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu>
    </Show>
  )
}
