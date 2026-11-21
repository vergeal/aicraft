import { Component, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { makeEventListener } from "@solid-primitives/event-listener"
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
        {/* Choosing a sound plays it once; this replays the current one without changing the stored value.
            `large` is the 28px control, so the button matches the 28px select beside it. */}
        <IconButton
          type="button"
          variant="ghost-muted"
          size="large"
          aria-label={language.t("settings.general.sounds.previewFor", { name: language.t(config().title) })}
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
  const [state, setState] = createStore<{
    permission: NotificationPermission | "unsupported"
    requesting: boolean
    requestFailed: boolean
  }>({
    permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    requesting: false,
    requestFailed: false,
  })

  // The permission can change outside this page, by another window or in the OS settings, so re-read it on return.
  // `focus` covers the OS-settings round trip: an unfocused window keeps `visibilityState === "visible"`, so the
  // visibility listener alone leaves a stale denied state behind. Both paths only read; only the button asks.
  onMount(() => {
    const refresh = () => {
      if (typeof Notification === "undefined") return

      setState("permission", Notification.permission)
      // The failure line only means something while the permission is still `default`. Once the OS grants it
      // and the user later revokes it back to `default`, leaving the flag set would show a failure note for a
      // request that did not fail this time.
      if (Notification.permission !== "default") setState("requestFailed", false)
    }

    makeEventListener(window, "visibilitychange", () => {
      if (document.visibilityState !== "visible") return

      refresh()
    })

    makeEventListener(window, "focus", refresh)
  })

  // The button disables while the browser prompt is open, and a request that fails is reported on its own line
  // rather than reading as a refusal.
  const request = () => {
    if (state.requesting || typeof Notification === "undefined") return

    setState({ requesting: true, requestFailed: false })
    void Promise.resolve()
      .then(() => Notification.requestPermission())
      .then(
        (result) => setState("permission", result),
        () => setState("requestFailed", true),
      )
      .finally(() => setState("requesting", false))
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
                  disabled={state.permission === "unsupported" || state.permission === "denied"}
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
                  disabled={state.permission === "unsupported" || state.permission === "denied"}
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
                  disabled={state.permission === "unsupported" || state.permission === "denied"}
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
                  disabled={state.permission === "unsupported" || state.permission === "denied"}
                  onChange={(checked) => settings.notifications.setErrors(checked)}
                />
              </div>
            </SettingsRow>
          </SettingsList>
          {/* The switches above say what the app would send; this says whether the OS lets it. */}
          <Show when={state.permission === "unsupported"}>
            <p class="settings-notifications-note">{language.t("settings.notifications.unsupported")}</p>
          </Show>
          <Show when={state.permission === "denied"}>
            <p class="settings-notifications-note" role="status">
              {language.t("settings.notifications.denied")}
            </p>
          </Show>
          <Show when={state.permission === "default"}>
            {/* The live region wraps the sentence, not the button: a status region is announced, not operated.
                A failed request keeps the button so the user can ask again; clearing `requestFailed` happens only
                inside `request`, so hiding the button would leave the failure line with no way out. */}
            <div class="settings-notifications-note">
              <Show
                when={!state.requestFailed}
                fallback={<span role="alert">{language.t("settings.notifications.requestFailed")}</span>}
              >
                <span role="status">{language.t("settings.notifications.prompt")}</span>
              </Show>
              <Button
                size="small"
                variant="ghost-muted"
                disabled={state.requesting}
                aria-busy={state.requesting}
                onClick={request}
              >
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
          </SettingsList>
        </div>
      </div>
    </>
  )
}
