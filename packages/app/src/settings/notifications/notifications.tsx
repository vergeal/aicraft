import { Component } from "solid-js"
import { Select } from "@opencode/ui/select"
import { Switch } from "@opencode/ui/switch"
import { useLanguage } from "@/runtime/i18n/language"
import { useSettings } from "@/settings/model"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import {
  createSoundSettingsController,
  soundOptions,
  type SoundSelectOption,
  type SoundSettingsController,
} from "@/settings/general/controllers"
import { SOUND_SERIES } from "@/shell/notifications/sound"
import { SettingsPageHeader } from "@/settings/page-header"
import "@/settings/settings.css"

/** The numbered part of a sound id, so a row under its series label reads "01" rather than "Alert 01". */
const number = (option: SoundSelectOption) => option.id.split("-").at(-1) ?? option.id

const series = (option: SoundSelectOption) =>
  SOUND_SERIES.find((entry) => option.id.startsWith(`${entry.prefix}-`))

const soundSettings = {
  agent: {
    action: "settings-sounds-agent",
    title: "settings.general.sounds.agent.title",
    description: "settings.general.sounds.agent.description",
  },
  permissions: {
    action: "settings-sounds-permissions",
    title: "settings.general.sounds.permissions.title",
    description: "settings.general.sounds.permissions.description",
  },
  questions: {
    action: "settings-sounds-questions",
    title: "settings.general.sounds.questions.title",
    description: "settings.general.sounds.questions.description",
  },
  errors: {
    action: "settings-sounds-errors",
    title: "settings.general.sounds.errors.title",
    description: "settings.general.sounds.errors.description",
  },
} as const

const SoundSetting: Component<{
  kind: "agent" | "permissions" | "questions" | "errors"
  channel: SoundSettingsController["agent"]
}> = (props) => {
  const language = useLanguage()
  const config = () => soundSettings[props.kind]

  return (
    <SettingsRow title={language.t(config().title)} description={language.t(config().description)}>
      <Select
        data-action={config().action}
        options={soundOptions}
        current={props.channel.current()}
        value={(option) => option.id}
        label={(option) => language.t(option.label)}
        groupBy={(option) => {
          const entry = series(option)

          return entry ? language.t(entry.label) : ""
        }}
        children={(option) => (
          <span title={language.t(option.label)}>
            {option.id === "none" ? language.t(option.label) : number(option)}
          </span>
        )}
        onSelect={props.channel.select}
        placement="bottom-end"
        gutter={6}
      />
    </SettingsRow>
  )
}

export const SettingsNotifications: Component = () => {
  const language = useLanguage()
  const settings = useSettings()
  const sounds = createSoundSettingsController()

  return (
    <>
      <SettingsPageHeader
        title={language.t("settings.tab.notifications")}
        description={language.t("settings.notifications.description")}
      />

      <div class="settings-tab-body settings-tab-body--sectioned">
        <div class="settings-section">
          <h3 class="settings-section-title">{language.t("settings.general.section.notifications")}</h3>
          <SettingsList>
            <SettingsRow
              title={language.t("settings.general.notifications.agent.title")}
              description={language.t("settings.general.notifications.agent.description")}
            >
              <div data-action="settings-notifications-agent">
                <Switch
                  checked={settings.notifications.agent()}
                  onChange={(checked) => settings.notifications.setAgent(checked)}
                />
              </div>
            </SettingsRow>

            <SettingsRow
              title={language.t("settings.general.notifications.permissions.title")}
              description={language.t("settings.general.notifications.permissions.description")}
            >
              <div data-action="settings-notifications-permissions">
                <Switch
                  checked={settings.notifications.permissions()}
                  onChange={(checked) => settings.notifications.setPermissions(checked)}
                />
              </div>
            </SettingsRow>

            <SettingsRow
              title={language.t("settings.general.notifications.questions.title")}
              description={language.t("settings.general.notifications.questions.description")}
            >
              <div data-action="settings-notifications-questions">
                <Switch
                  hideLabel
                  checked={settings.notifications.questions()}
                  onChange={(checked) => settings.notifications.setQuestions(checked)}
                >
                  {language.t("settings.general.notifications.questions.title")}
                </Switch>
              </div>
            </SettingsRow>

            <SettingsRow
              title={language.t("settings.general.notifications.errors.title")}
              description={language.t("settings.general.notifications.errors.description")}
            >
              <div data-action="settings-notifications-errors">
                <Switch
                  checked={settings.notifications.errors()}
                  onChange={(checked) => settings.notifications.setErrors(checked)}
                />
              </div>
            </SettingsRow>
          </SettingsList>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">{language.t("settings.general.section.sounds")}</h3>
          <SettingsList>
            <SoundSetting kind="agent" channel={sounds.agent} />
            <SoundSetting kind="permissions" channel={sounds.permissions} />
            <SoundSetting kind="questions" channel={sounds.questions} />
            <SoundSetting kind="errors" channel={sounds.errors} />
            <SettingsRow
              title={language.t("settings.general.sounds.interface.title")}
              description={language.t("settings.general.sounds.interface.description")}
            >
              <div data-action="settings-sounds-interface">
                <Switch
                  checked={settings.sounds.interfaceEnabled()}
                  onChange={(checked) => settings.sounds.setInterfaceEnabled(checked)}
                />
              </div>
            </SettingsRow>
          </SettingsList>
        </div>
      </div>
    </>
  )
}
