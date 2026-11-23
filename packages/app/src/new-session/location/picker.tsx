import { Badge } from "@opencode/ui/badge"
import { Icon } from "@opencode/ui/icon"
import { Keybind } from "@opencode/ui/keybind"
import { MenuScroll } from "@opencode/ui/menu-scroll"
import { displayName } from "@opencode/ui/project-avatar"
import { ProjectFolder } from "@opencode/ui/project-folder"
import { TextInput } from "@opencode/ui/text-input"
import { createTypeahead } from "@opencode/ui/typeahead"
import { createEventListener } from "@solid-primitives/event-listener"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { getFilename } from "@opencode/util/path"
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js"
import { createStore } from "solid-js/store"
import type { PromptProject, PromptProjectController, PromptServer } from "@/new-session/project/selector"
import type { NewSessionWorkspaceController } from "@/new-session/workspace/controller"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useCommand } from "@/shell/commands/command"
import { workspaceSelectionDirectories } from "@/workspaces/paths"
import "@/shell/commands/dialog.css"
import "@/shell/palette-menu.css"
import "@/new-session/card.css"
import "@/new-session/location/picker.css"

type LocationEntry =
  | { id: string; type: "project"; project: PromptProject }
  | { id: string; type: "add" }
  | { id: string; type: "server"; server: PromptServer }
  | { id: string; type: "workspace"; value: string; directory: string }

/**
 * The new-session location picker: a small card anchored to the project and worktree chips. The project card lists every
 * project from the ready servers flat; the worktree card lists the worktree destinations for one Git project.
 */
export function useNewSessionLocationPicker(input: {
  project: PromptProjectController
  workspace: NewSessionWorkspaceController
  onDone: () => void
}) {
  const [state, setState] = createStore<{
    open: boolean
    /** The project the card opens on, when the worktree chip opened it. */
    drilled?: PromptProject
    onWorkspace?: (value: string) => void
  }>({ open: false })

  return {
    state,
    project: input.project,
    workspace: input.workspace,
    open(options?: { project?: PromptProject; onWorkspace?: (value: string) => void }) {
      setState({ open: true, drilled: options?.project, onWorkspace: options?.onWorkspace })
    },
    setOpen(open: boolean) {
      if (open) return setState("open", true)
      setState({ open: false, drilled: undefined, onWorkspace: undefined })
      input.onDone()
    },
    /** Closes the card and returns focus to the composer. Picking a destination also ends with this. */
    finish() {
      setState({ open: false, drilled: undefined, onWorkspace: undefined })
      input.onDone()
    },
  }
}

export type NewSessionLocationPicker = ReturnType<typeof useNewSessionLocationPicker>

export function NewSessionLocationCard(props: { picker: NewSessionLocationPicker; drilled?: PromptProject }) {
  const language = useLanguage()
  const command = useCommand()
  const global = useGlobal()
  const servers = useServers()
  const serverSDK = useServerSDK()

  const [store, setStore] = createStore<{
    /** The project whose worktrees the card lists; only the worktree chip opens the card with it. */
    drilled?: PromptProject
    picking?: boolean
    query: string
    /** The project list to restore when stepping back out of the server step. */
    back?: { query: string; active: string }
  }>({
    query: "",
    drilled: props.drilled,
  })

  const [searched, setSearched] = createSignal(false)

  const connection = (project: PromptProject) =>
    project.server ? servers.list.find((item) => ServerConnection.key(item) === project.server!.key) : serverSDK.server

  const context = (project: PromptProject) => {
    const target = connection(project)

    return target ? global.serverCtx(ServerConnection.key(target)) : undefined
  }

  const [listed, listedActions] = createResource(
    () => store.drilled,
    async (project) => ({
      projectID: project.id,
      items:
        (await context(project)
          ?.sdk.api.worktree.list({ projectID: project.id! })
          .catch(() => undefined)) ??
        project.worktrees ??
        [],
    }),
  )

  // `latest` only skips Suspense once the resource has resolved at least once. Before that it behaves like a plain
  // read, which suspends the dialog and makes it flash on the first drill into a project.
  const listedItems = (project: PromptProject) => {
    if (listed.state !== "ready" && listed.state !== "refreshing") return project.worktrees ?? []
    const loaded = listed.latest

    return loaded?.projectID === project.id ? loaded.items : (project.worktrees ?? [])
  }

  onCleanup(
    serverSDK.event.listen((event) => {
      if (event.type === "worktree.updated" && event.data.projectID === store.drilled?.id) void listedActions.refetch()
    }),
  )

  const matches = (...values: (string | undefined)[]) => {
    const query = store.query.trim().toLowerCase()

    return !query || values.some((value) => value?.toLowerCase().includes(query))
  }

  // One flat list, already ordered used-first by the controller. Remote projects also match their server's name.
  const projectEntries = createMemo<LocationEntry[]>(() => [
    ...props.picker.project
      .projects()
      .filter((project) => matches(displayName(project), project.worktree, tagged(project.server)?.name))
      .map((project) => ({ id: projectEntryID(project), type: "project" as const, project })),
    { id: "add", type: "add" as const },
  ])

  const serverEntries = createMemo<LocationEntry[]>(() =>
    props.picker.project
      .servers()
      .filter((server) => matches(server.name))
      .map((server) => ({ id: `server:${server.key}`, type: "server" as const, server })),
  )

  const workspaceEntries = createMemo<LocationEntry[]>(() => {
    const project = store.drilled

    if (!project) return []
    const directories = workspaceSelectionDirectories(project, listedItems(project))

    return [
      { id: "main", type: "workspace" as const, value: "main", directory: project.worktree },
      { id: "create", type: "workspace" as const, value: "create", directory: project.worktree },
      ...directories.map((directory) => ({
        id: `worktree:${directory}`,
        type: "workspace" as const,
        value: directory,
        directory,
      })),
    ].filter((entry) => matches(workspaceTitle(project, entry.value), entry.directory))
  })

  const entries = () => {
    if (store.drilled) return workspaceEntries()

    if (store.picking) return serverEntries()

    return projectEntries()
  }

  const title = () => (store.picking ? language.t("session.new.location.servers") : undefined)

  const placeholder = () => {
    if (store.drilled) return language.t("session.new.workspace.search.placeholder")

    if (store.picking) return language.t("session.new.location.servers.search")

    return language.t("session.new.project.search")
  }

  const choosesServer = () => props.picker.project.servers().length > 1
  command.register("new-session-location", () => [
    {
      id: "project.open",
      title: language.t("command.project.open"),
      category: language.t("command.category.project"),
      keybind: "mod+o",
      onSelect: () => choose({ id: "add", type: "add" }),
    },
  ])
  createEventListener(document, "keydown", (event) => {
    if (event.isComposing || !command.matches("project.open", event)) return
    event.preventDefault()
    event.stopPropagation()
    command.trigger("project.open", "keybind")
  })

  // Every step opens on its first row; the user's choice holds while it stays in the results.
  const typeahead = createTypeahead<LocationEntry>({
    items: entries,
    key: (entry) => entry.id,
    onSelect: choose,
  })

  const activeEntry = typeahead.activeItem

  let resultsRef: HTMLDivElement | undefined
  let inputRef: HTMLInputElement | undefined

  // The popover hands focus back to the chips, so the search field takes it when the card mounts.
  onMount(() => inputRef?.focus())

  createEffect(() => {
    if (!activeEntry()) return

    const frame = requestAnimationFrame(() =>
      resultsRef?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" }),
    )

    onCleanup(() => cancelAnimationFrame(frame))
  })

  function workspaceTitle(project: PromptProject, value: string) {
    if (value === "main") return displayName(project)

    if (value === "create") return language.t("workspace.new")

    return getFilename(value)
  }

  function pick() {
    setStore({
      picking: true,
      query: "",
      back: { query: store.query, active: "add" },
    })
    inputRef?.focus()
  }

  function back() {
    const active = store.back?.active ?? "add"

    setStore({ picking: undefined, query: store.back?.query ?? "", back: undefined })
    typeahead.setActive(active)
    inputRef?.focus()
  }

  function choose(entry: LocationEntry | undefined) {
    if (!entry) return

    if (entry.type === "add" && choosesServer()) {
      pick()

      return
    }

    if (entry.type === "add") {
      props.picker.finish()
      props.picker.project.add()

      return
    }

    if (entry.type === "server") {
      props.picker.finish()
      props.picker.project.add(entry.server.key)

      return
    }

    if (entry.type === "project") {
      props.picker.project.select(entry.project)
      props.picker.finish()

      return
    }

    const project = store.drilled

    if (!project) return

    if (props.picker.project.isSelected(project)) props.picker.workspace.selection.set(entry.value)

    if (!props.picker.project.isSelected(project)) props.picker.project.select(project, entry.value)
    props.picker.state.onWorkspace?.(entry.value)
    props.picker.finish()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    // SAFETY: this handler is only attached to the search TextInput's <input>, so currentTarget is that element.
    const target = event.currentTarget as HTMLInputElement
    const atEnd = target.selectionStart === target.value.length && target.selectionEnd === target.value.length
    const atStart = target.selectionStart === 0 && target.selectionEnd === 0
    const active = activeEntry()
    const forward = language.direction() === "rtl" ? "ArrowLeft" : "ArrowRight"
    const backward = language.direction() === "rtl" ? "ArrowRight" : "ArrowLeft"

    if (!store.picking) return typeahead.onKeyDown(event)

    if (event.key === forward && atEnd && active?.type === "add") {
      event.preventDefault()
      pick()

      return
    }

    if ((event.key === backward && atStart) || (event.key === "Backspace" && !target.value) || event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      back()

      return
    }

    typeahead.onKeyDown(event)
  }

  return (
    <div class="new-session-location">
      <div class="palette-menu-search">
        <TextInput
          ref={inputRef}
          value={store.query}
          autofocus
          autocomplete="off"
          spellcheck={false}
          appearance="large"
          aria-label={placeholder()}
          placeholder={placeholder()}
          leadingIcon={<Icon name="magnifying-glass" />}
          role="combobox"
          aria-expanded="true"
          data-owns-escape={store.picking ? "" : undefined}
          aria-controls={typeahead.listID}
          aria-activedescendant={typeahead.activeID()}
          onInput={(event) => {
            setStore("query", event.currentTarget.value)
            setSearched(true)
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div class="new-session-location-divider" aria-hidden="true" />
      {/* Results resize with the query; the height transition matches the branch card's search. */}
      <div
        class="overflow-hidden duration-[200ms] ease-[cubic-bezier(0.645,0.045,0.355,1)] motion-reduce:transition-none"
        classList={{ "transition-[height]": searched(), "transition-none": !searched() }}
      >
        <div
          ref={(element) =>
            createResizeObserver(element, (rect) =>
              element.parentElement?.style.setProperty("height", `${rect.height}px`),
            )
          }
        >
          <MenuScroll
            class="new-session-location-scroll"
            viewportClass="command-palette-scroll"
            viewportRef={(el) => (resultsRef = el)}
          >
            <div id={typeahead.listID} class="command-palette-results" role="listbox">
              <div class="command-palette-group">
                <Show when={title()}>{(value) => <div class="command-palette-group-title">{value()}</div>}</Show>
                <Show
                  when={entries().length > 0}
                  fallback={
                    // The worktree list may still be loading; hold the row's height without flashing a label.
                    <div class="command-palette-state" classList={{ invisible: !!store.drilled && listed.loading }}>
                      {language.t("palette.empty")}
                    </div>
                  }
                >
                  <For each={entries()}>
                    {(entry, index) => (
                      <>
                        <Show
                          when={
                            index() > 0 &&
                            (entry.type === "add" ||
                              (entry.type === "workspace" &&
                                entry.value !== "main" &&
                                entry.value !== "create" &&
                                ["main", "create"].includes(entries()[index() - 1]!.id)))
                          }
                        >
                          <div class="new-session-location-action-divider" role="separator" />
                        </Show>
                        <button
                          type="button"
                          id={typeahead.optionID(entry)}
                          class="command-palette-row palette-menu-row"
                          data-size="compact"
                          classList={{
                            "new-session-location-option": entry.type === "add",
                            "new-session-location-workspace": entry.type === "workspace",
                          }}
                          role="option"
                          aria-selected={activeEntry()?.id === entry.id}
                          data-active={activeEntry()?.id === entry.id ? "" : undefined}
                          onMouseMove={(event) => {
                            // Ignore hover from a static cursor when keyboard scrolling moves rows underneath it.
                            if (event.movementX === 0 && event.movementY === 0) return
                            typeahead.setActive(entry.id)
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                          onFocus={() => typeahead.setActive(entry.id)}
                          onClick={() => choose(entry)}
                        >
                          <Switch>
                            <Match when={entry.type === "project" && entry}>
                              {(item) => <ProjectRow project={item().project} path={item().project.worktree} />}
                            </Match>
                            <Match when={entry.type === "add"}>
                              <div class="command-palette-row-main">
                                <Icon name="plus" class="command-palette-row-icon" />
                                <div class="command-palette-row-text">
                                  <span class="command-palette-title palette-menu-title">
                                    {language.t("session.new.project.add")}
                                  </span>
                                </div>
                              </div>
                              <Show when={command.keybindParts("project.open").length}>
                                <Keybind
                                  keys={command.keybindParts("project.open")}
                                  variant="neutral"
                                  class="shrink-0"
                                />
                              </Show>
                            </Match>
                            <Match when={entry.type === "server" && entry}>
                              {(item) => (
                                <div class="command-palette-row-main">
                                  <Icon name={serverIcon(item().server)} class="command-palette-row-icon" />
                                  <div class="command-palette-row-text">
                                    <span class="command-palette-title palette-menu-title">{item().server.name}</span>
                                    <Show when={item().server.hint}>
                                      {(hint) => <span class="command-palette-description">{hint()}</span>}
                                    </Show>
                                  </div>
                                </div>
                              )}
                            </Match>
                            <Match when={entry.type === "workspace" && store.drilled && entry}>
                              {(item) => (
                                <Show
                                  when={item().value === "main"}
                                  fallback={
                                    <WorkspaceRow
                                      title={workspaceTitle(store.drilled!, item().value)}
                                      value={item().value}
                                      description={
                                        item().value === "create"
                                          ? language.t("session.new.workspace.new.tooltip")
                                          : item().directory
                                      }
                                    />
                                  }
                                >
                                  <ProjectRow project={store.drilled!} path={item().directory} />
                                </Show>
                              )}
                            </Match>
                          </Switch>
                        </button>
                      </>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          </MenuScroll>
        </div>
      </div>
    </div>
  )
}

function ProjectRow(props: { project: PromptProject; path: string }) {
  return (
    <div class="command-palette-row-main">
      <ProjectFolder class="shrink-0" />
      <div class="command-palette-row-text">
        <span class="new-session-location-name">
          <span class="command-palette-title palette-menu-title">{displayName(props.project)}</span>
          <ServerTag server={props.project.server} />
        </span>
        <span class="command-palette-description" dir="ltr">
          {props.path}
        </span>
      </div>
    </div>
  )
}

/** The server a project lives on; projects on the current server have none. */
function ServerTag(props: { server?: PromptServer }) {
  return (
    <Show when={tagged(props.server)}>
      {(server) => (
        <Badge class="new-session-location-tag" variant="subtle" title={server().label}>
          <Icon name={serverIcon(server())} size="small" />
          <span>{server().name}</span>
        </Badge>
      )}
    </Show>
  )
}

function workspaceIcon(value: string) {
  if (value === "main") return "monitor"

  if (value === "create") return "plus"

  return "outline-worktree"
}

function WorkspaceRow(props: { title: string; value: string; description: string }) {
  return (
    <>
      <div class="command-palette-row-main">
        <Icon name={workspaceIcon(props.value)} class="command-palette-row-icon" />
        <div class="command-palette-row-text">
          <span class="command-palette-title palette-menu-title">{props.title}</span>
          <span class="command-palette-description" dir="ltr">
            {props.description}
          </span>
        </div>
      </div>
    </>
  )
}

function projectEntryID(project: PromptProject) {
  return `project:${project.server?.key ?? ""}:${project.worktree}`
}

function tagged(server?: PromptServer) {
  return server?.kind === "current" ? undefined : server
}

function serverIcon(server: PromptServer) {
  if (server.kind === "current") return "monitor"

  return server.kind === "plugin" ? "terminal" : "globe"
}
