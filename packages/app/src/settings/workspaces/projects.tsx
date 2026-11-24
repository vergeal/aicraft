import { Show, createEffect, createMemo, type Component, type JSX } from "solid-js"
import { Key } from "@solid-primitives/keyed"
import { createStore } from "solid-js/store"
import { Button } from "@aicraft/ui/button"
import { Icon } from "@aicraft/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import { useServer } from "@/runtime/server/current"
import { ServerConnection } from "@/runtime/server/registry"
import { displayName } from "@aicraft/ui/project-avatar"
import { ProjectFolder } from "@aicraft/ui/project-folder"
import { homeProjectDirectories } from "@/shell/layout/helpers"
import type { LocalProject } from "@/shell/state/layout"
import { useDirectoryPicker } from "@/workspaces/selection/picker"
import { addProjects } from "@/home/projects/add"
import { SettingsSearchEmpty } from "../search-empty"
import { SettingsSearchField } from "../search-field"
import { SettingsProjectRow } from "./project-row"
import "@/settings/search.css"
import { SettingsList } from "@/settings/list"
import { SettingsPageHeader } from "@/settings/page-header"
import "@/settings/settings.css"
import "./project.css"

export const SettingsProjects: Component<{
  server: ServerConnection.Any
  active: boolean
  onOpenProject: (project: LocalProject) => void
  headerAction?: JSX.Element
}> = (props) => {
  const language = useLanguage()
  // The server provider mounts this page again for a new controller.
  const context = useServer().ctx
  const pickDirectory = useDirectoryPicker()
  const [store, setStore] = createStore({ filter: "", others: false })

  let focus: string | undefined

  const projects = createMemo(() => context.projects.unique())
  const used = createMemo(() => new Set(context.projects.used().map((project) => project.id)))

  const others = createMemo(() => projects().filter((project) => !used().has(project.id)))
  const searchable = createMemo(() => projects().length > 7 || others().length > 0)
  const query = createMemo(() => (searchable() ? store.filter.trim().toLowerCase() : ""))

  const filtered = createMemo(() =>
    projects().filter(
      (project) =>
        !query() || [displayName(project), project.worktree].some((value) => value.toLowerCase().includes(query())),
    ),
  )

  const added = createMemo(() => filtered().filter((project) => used().has(project.id)))
  const otherResults = createMemo(() => filtered().filter((project) => !used().has(project.id)))

  createEffect(() => {
    if (!searchable()) setStore("filter", "")
  })

  const addProject = () =>
    pickDirectory({
      server: props.server,
      title: language.t("command.project.open"),
      multiple: true,
      onSelect: (result) => {
        const directories = homeProjectDirectories(result)

        void addProjects(context, directories).then((project) => {
          if (project && directories.length === 1) props.onOpenProject(project)
        })
      },
    })

  return (
    <>
      <SettingsPageHeader
        stacked={searchable()}
        title={language.t("settings.projects.title")}
        description={language.t("settings.projects.description")}
        actions={
          <>
            <Show when={projects().length > 0}>
              <Button variant="contrast" icon="plus" onClick={addProject}>
                {language.t("home.project.add")}
              </Button>
            </Show>
            {props.headerAction}
          </>
        }
      >
        <Show when={searchable()}>
          <SettingsSearchField
            value={store.filter}
            active={props.active}
            onInput={(value) => setStore("filter", value)}
            placeholder={language.t("settings.projects.search.placeholder")}
          />
        </Show>
      </SettingsPageHeader>

      <div class="settings-tab-body">
        <Show
          when={filtered().length > 0}
          fallback={
            <Show
              when={!store.filter.trim() && projects().length === 0}
              fallback={
                <Show
                  when={store.filter.trim()}
                  fallback={
                    <div class="py-12 text-center text-v2-text-text-muted text-13-regular">
                      {language.t("settings.projects.empty")}
                    </div>
                  }
                >
                  <div class="settings-tab-search-empty">
                    <SettingsSearchEmpty query={store.filter} />
                  </div>
                </Show>
              }
            >
              <div class="settings-project-empty-card">
                <ProjectFolder class="mb-1 !size-6 [&_[data-slot=icon-svg]]:!size-5" />
                <div class="text-13-medium text-v2-text-text-base">{language.t("settings.projects.empty.title")}</div>
                <div class="text-13-regular text-v2-text-text-muted">
                  {language.t("settings.projects.empty.description")}
                </div>
                <Button variant="contrast" icon="plus" class="mt-4" onClick={addProject}>
                  {language.t("home.project.add")}
                </Button>
              </div>
            </Show>
          }
        >
          <div class="settings-section-stack">
            <Show when={added().length > 0}>
              <SettingsList>
                <Key each={added()} by="worktree">
                  {(project) => (
                    <SettingsProjectRow
                      project={project()}
                      server={props.server}
                      onOpen={props.onOpenProject}
                      onMount={(button) => {
                        if (focus !== project().worktree) return
                        focus = undefined
                        requestAnimationFrame(() => button.focus())
                      }}
                    />
                  )}
                </Key>
              </SettingsList>
            </Show>
            <Show when={otherResults().length > 0}>
              <section class="settings-section">
                <Show
                  when={!query()}
                  fallback={<h3 class="settings-section-title">{language.t("settings.projects.other")}</h3>}
                >
                  <button
                    type="button"
                    class="settings-projects-group-trigger"
                    aria-expanded={store.others}
                    onClick={() => setStore("others", (value) => !value)}
                  >
                    <span class="settings-projects-group-chevron" classList={{ open: store.others }}>
                      <Icon name="fill-triangle-down" size="small" />
                    </span>
                    <span class="settings-section-title">{language.t("settings.projects.other")}</span>
                    <span class="settings-section-count">{others().length}</span>
                  </button>
                </Show>
                <Show when={store.others || query()}>
                  <SettingsList>
                    <Key each={otherResults()} by="worktree">
                      {(project) => (
                        <SettingsProjectRow
                          project={project()}
                          server={props.server}
                          onOpen={props.onOpenProject}
                          onAdd={() => (focus = project().worktree)}
                        />
                      )}
                    </Key>
                  </SettingsList>
                </Show>
              </section>
            </Show>
          </div>
        </Show>
      </div>
    </>
  )
}
