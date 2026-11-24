import { Select } from "@aicraft/ui/select"
import { Textarea } from "@aicraft/ui/textarea"
import { TextInput } from "@aicraft/ui/text-input"
import { Button } from "@aicraft/ui/button"
import { Icon } from "@aicraft/ui/icon"
import { Loader } from "@aicraft/ui/loader"
import { Show, createMemo, type Component } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { LocalProject } from "@/shell/state/layout"
import { type ServerConnection, useServers } from "@/runtime/server/registry"
import { useSettingsServers } from "@/settings/servers/inventory"
import { useSettings } from "@/settings/model"
import { ProjectFolder } from "@aicraft/ui/project-folder"
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
            <span class="settings-project-heading-badge" aria-hidden="true">
              <ProjectFolder class="settings-project-heading-icon" />
            </span>
            <div class="settings-tab-header-copy">
              <h2 class="settings-tab-title truncate">
                <bdi dir="auto">{model.defaultName()}</bdi>
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
            <ProjectSaveActions model={model} />
            <ProjectOptions server={props.server} project={props.project} />
          </div>
        </div>
      </div>

      <div class="settings-tab-body settings-project-page" aria-busy={model.saving()}>
        <ProjectFolderMissing />
        <Show when={model.error()}>
          {(message) => (
            <div class="settings-project-save-error" role="alert">
              <Icon name="outline-hexagonal-warning" aria-hidden="true" />
              <span>{message()}</span>
            </div>
          )}
        </Show>
        <SettingsList>
          <SettingsRow
            title={language.t("project.settings.name.title")}
            description={language.t("project.settings.name.description")}
            class="settings-project-field"
          >
            <div class="settings-project-name">
              <TextInput
                data-action="settings-project-name"
                class="!w-full"
                type="text"
                appearance="large"
                value={model.draft().name}
                placeholder={model.folderName()}
                aria-label={language.t("project.settings.name.title")}
                disabled={model.saving()}
                onInput={(event) => model.setField("name", event.currentTarget.value)}
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
                value={model.draft().prompt}
                placeholder={language.t("project.settings.prompt.placeholder")}
                aria-label={language.t("project.settings.prompt.title")}
                spellcheck={false}
                disabled={model.saving()}
                onInput={(event) => model.setField("prompt", event.currentTarget.value)}
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
                value={model.draft().startup}
                placeholder={language.t("dialog.project.edit.worktree.startup.placeholder")}
                aria-label={language.t("dialog.project.edit.worktree.startup")}
                spellcheck={false}
                disabled={model.saving()}
                onInput={(event) => model.setField("startup", event.currentTarget.value)}
              />
              <div class="settings-project-field-hint flex flex-col">
                <span>{inlineVariables(language.t("project.settings.worktree.startup.hint.base"))}</span>
                <span>{inlineVariables(language.t("project.settings.worktree.startup.hint.new"))}</span>
              </div>
            </div>
          </SettingsRow>

          <AutoAcceptPermissionsSetting model={model} />
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

// The page writes only on request, so the header carries the two controls that decide a draft: discard and save.
// The check is a short receipt, not a fourth phase, so it replaces the label for a moment instead of adding chrome.
const ProjectSaveActions: Component<{ model: ReturnType<typeof createEditProjectModel> }> = (props) => {
  const language = useLanguage()

  return (
    <>
      <Show when={props.model.dirty() && !props.model.saving()}>
        <Button size="small" variant="ghost" onClick={() => props.model.discard()}>
          {language.t("common.cancel")}
        </Button>
      </Show>
      <Button
        size="small"
        variant="contrast"
        class="settings-project-save"
        data-action="settings-project-save"
        disabled={!props.model.dirty() || props.model.saving()}
        onClick={() => props.model.save()}
      >
        <Show
          when={!props.model.saving()}
          fallback={<Loader class="size-4" aria-hidden="true" />}
        >
          <Show when={props.model.status() === "saved"} fallback={language.t("common.save")}>
            <Icon name="check" aria-hidden="true" />
          </Show>
        </Show>
      </Button>
    </>
  )
}

// A project uses the app-wide default unless it is explicitly turned on or off here. The choice is part of the
// draft, so it commits with the same Save button as the text fields instead of writing the moment it is picked.
const AutoAcceptPermissionsSetting: Component<{ model: ReturnType<typeof createEditProjectModel> }> = (props) => {
  const language = useLanguage()
  const settings = useSettings()

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
    <SettingsRow
      title={language.t("command.permissions.autoaccept.enable")}
      description={language.t("project.settings.autoAccept.description")}
    >
      <Select
        data-action="settings-project-auto-accept-permissions"
        options={options()}
        current={options().find((option) => option.value === props.model.draft().autoApprove)}
        value={(option) => String(option.value)}
        label={(option) => option.label}
        placement="bottom-end"
        gutter={6}
        disabled={props.model.saving()}
        onSelect={(option) => option && props.model.setField("autoApprove", option.value)}
      />
    </SettingsRow>
  )
}

function inlineVariables(text: string) {
  return text
    .split(/(\$[A-Z][A-Z0-9_]*)/g)
    .map((part, index) => (index % 2 === 0 ? part : <code dir="ltr">{part}</code>))
}
