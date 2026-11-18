import { Select } from "@opencode/ui/select"
import { Textarea } from "@opencode/ui/textarea"
import { TextInput } from "@opencode/ui/text-input"
import { Show, createMemo, type Component } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { LocalProject } from "@/shell/state/layout"
import { type ServerConnection, useServers } from "@/runtime/server/registry"
import { useSettingsServers } from "@/settings/servers/inventory"
import { useServerCtx } from "@/runtime/server/runtime"
import { projectSettingsKey, useSettings } from "@/settings/model"
import { ProjectFolder } from "@opencode/ui/project-folder"
import { ProjectFolderMissing } from "./project-folder-missing"
import { ProjectOptions } from "./project-options"
import { ProjectKnowledge } from "./project-knowledge"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import { createEditProjectModel } from "./project-model"
import "./project.css"

export const SettingsProjectGeneral: Component<{
  project: LocalProject
  server: ServerConnection.Any
  onOpenServer: () => void
}> = (props) => {
  const language = useLanguage()
  const model = createEditProjectModel(props)
  const servers = useSettingsServers()
  const registry = useServers()

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="settings-project-heading">
            <ProjectFolder class="settings-project-heading-icon" />
            <div class="settings-tab-header-copy">
              <h2 class="settings-tab-title truncate">
                <bdi dir="auto">{model.store.name || model.defaultName()}</bdi>
              </h2>
              <div class="settings-project-subtitle">
                <bdi dir="ltr" class="settings-project-path">
                  {props.project.worktree}
                </bdi>
                <Show when={servers().length > 1}>
                  <button type="button" class="project-settings-server-link" onClick={() => props.onOpenServer()}>
                    <bdi dir="auto">{registry.label(props.server)}</bdi>
                  </button>
                </Show>
              </div>
            </div>
          </div>
          <div class="settings-tab-header-actions">
            <ProjectOptions server={props.server} project={props.project} />
          </div>
        </div>
      </div>

      <div class="settings-tab-body" aria-busy={model.store.saving > 0}>
        <ProjectFolderMissing />
        <SettingsList>
          <SettingsRow
            title={language.t("project.settings.name.title")}
            description={language.t("project.settings.name.description")}
          >
            <div class="project-settings-name">
              <TextInput
                data-action="settings-project-name"
                type="text"
                appearance="base"
                value={model.store.name}
                placeholder={model.folderName()}
                aria-label={language.t("project.settings.name.title")}
                onInput={(event) => model.setStore("name", event.currentTarget.value)}
                onBlur={model.saveName}
              />
            </div>
          </SettingsRow>

          <Show when={props.project.id !== "global"}>
            <SettingsRow
              title={language.t("project.settings.prompt.title")}
              description={language.t("project.settings.prompt.description")}
              class="settings-project-field"
            >
              <Textarea
                data-action="settings-project-prompt"
                class="!w-full"
                rows={6}
                autoResize
                autoResizeMax={360}
                value={model.store.prompt}
                placeholder={language.t("project.settings.prompt.placeholder")}
                aria-label={language.t("project.settings.prompt.title")}
                spellcheck={false}
                onInput={(event) => model.setStore("prompt", event.currentTarget.value)}
                onBlur={model.savePrompt}
              />
            </SettingsRow>
          </Show>

          <SettingsRow
            title={language.t("dialog.project.edit.worktree.startup")}
            description={language.t("project.settings.worktree.startup.description")}
            class="settings-project-field"
          >
            <div class="settings-project-field-body">
              <Textarea
                class="!w-full [&_[data-slot=textarea-v2-textarea]]:font-mono"
                rows={5}
                value={model.store.startup}
                placeholder={language.t("dialog.project.edit.worktree.startup.placeholder")}
                aria-label={language.t("dialog.project.edit.worktree.startup")}
                spellcheck={false}
                onInput={(event) => model.setStore("startup", event.currentTarget.value)}
                onBlur={model.saveStartup}
              />
              <div class="settings-project-field-hint flex flex-col">
                <span>{inlineVariables(language.t("project.settings.worktree.startup.hint.base"))}</span>
                <span>{inlineVariables(language.t("project.settings.worktree.startup.hint.new"))}</span>
              </div>
            </div>
          </SettingsRow>

          <AutoAcceptPermissionsSetting project={props.project} server={props.server} />
        </SettingsList>

        <Show when={props.project.id !== "global" ? props.project.id : undefined}>
          {(projectID) => (
            <section class="settings-section">
              <h3 class="settings-section-title">{language.t("project.settings.knowledge.title")}</h3>
              <p class="settings-section-description">{language.t("project.settings.knowledge.description")}</p>
              <SettingsList>
                <ProjectKnowledge projectID={projectID()} />
              </SettingsList>
            </section>
          )}
        </Show>
      </div>
    </>
  )
}

// A project uses the app-wide default unless it is explicitly turned on or off here.
const AutoAcceptPermissionsSetting: Component<{ project: LocalProject; server: ServerConnection.Any }> = (props) => {
  const language = useLanguage()
  const settings = useSettings()
  const serverCtx = useServerCtx(() => props.server)

  const key = createMemo(() => {
    const scope = serverCtx()?.sdk.scope

    return scope ? projectSettingsKey(scope, props.project.id) : undefined
  })

  const options = createMemo(() => [
    {
      value: undefined,
      label: settings.permissions.autoApproveDefault()
        ? language.t("project.settings.autoAccept.default.on")
        : language.t("project.settings.autoAccept.default.off"),
    },
    { value: true, label: language.t("project.settings.autoAccept.on") },
    { value: false, label: language.t("project.settings.autoAccept.off") },
  ])

  return (
    <Show when={key()}>
      {(project) => (
        <SettingsRow
          title={language.t("command.permissions.autoaccept.enable")}
          description={language.t("project.settings.autoAccept.description")}
        >
          <Select
            data-action="settings-project-auto-accept-permissions"
            options={options()}
            current={options().find((option) => option.value === settings.permissions.autoApproveOverride(project()))}
            value={(option) => String(option.value)}
            label={(option) => option.label}
            placement="bottom-end"
            gutter={6}
            onSelect={(option) => option && settings.permissions.setAutoApproveOverride(project(), option.value)}
          />
        </SettingsRow>
      )}
    </Show>
  )
}

function inlineVariables(text: string) {
  return text
    .split(/(\$[A-Z][A-Z0-9_]*)/g)
    .map((part, index) => (index % 2 === 0 ? part : <code dir="ltr">{part}</code>))
}
