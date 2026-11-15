import { Component, createSignal, Show } from "solid-js"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
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
  const current = () => props.channel.current()

  return (
    <SettingsRow title={language.t(config().title)} description={language.t(config().description)}>
      <div class="settings-sounds-control">
        <Select
          data-action={config().action}
          class="settings-sounds-select"
          aria-label={language.t(config().title)}
          options={soundOptions}
          current={current()}
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
        {/* Choosing a sound plays it once; this replays the current one without changing the stored value. */}
        <IconButton
          type="button"
          variant="ghost-muted"
          size="small"
          class="settings-sounds-preview"
          aria-label={language.t("settings.general.sounds.preview")}
          disabled={current().id === "none"}
          icon={<Icon name="outline-wave-audio" size="small" />}
          onClick={() => props.channel.preview(current().id)}
        />
      </div>
    </SettingsRow>
  )
}

export const SettingsNotifications: Component = () => {
  const language = useLanguage()
  const settings = useSettings()
  const sounds = createSoundSettingsController()
  // The OS gate behind every system notification: a switch that reads "on" still sends nothing while it is denied.
  const [permission, setPermission] = createSignal<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  )
  const request = async () => {
    if (typeof Notification === "undefined") return

    setPermission(await Notification.requestPermission())
  }

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
                  disabled={permission() === "unsupported"}
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
                  disabled={permission() === "unsupported"}
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
                  checked={settings.notifications.questions()}
                  disabled={permission() === "unsupported"}
                  onChange={(checked) => settings.notifications.setQuestions(checked)}
                />
              </div>
            </SettingsRow>

            <SettingsRow
              title={language.t("settings.general.notifications.errors.title")}
              description={language.t("settings.general.notifications.errors.description")}
            >
              <div data-action="settings-notifications-errors">
                <Switch
                  checked={settings.notifications.errors()}
                  disabled={permission() === "unsupported"}
                  onChange={(checked) => settings.notifications.setErrors(checked)}
                />
              </div>
            </SettingsRow>
          </SettingsList>
          {/* The switches above say what the app would send; this says whether the OS lets it. */}
          <Show when={permission() === "unsupported"}>
            <p class="settings-notifications-note">{language.t("settings.notifications.unsupported")}</p>
          </Show>
          <Show when={permission() === "denied"}>
            <p class="settings-notifications-note" role="status">
              {language.t("settings.notifications.denied")}
            </p>
          </Show>
          <Show when={permission() === "default"}>
            <div class="settings-notifications-note" role="status">
              <span>{language.t("settings.notifications.prompt")}</span>
              <Button size="small" variant="ghost-muted" onClick={() => void request()}>
                {language.t("settings.notifications.request")}
              </Button>
            </div>
          </Show>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">{language.t("settings.general.section.sounds")}</h3>
          {/* Two groups share four event names; this says the sound group stands on its own. */}
          <p class="settings-notifications-note">{language.t("settings.general.sounds.independent")}</p>
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
