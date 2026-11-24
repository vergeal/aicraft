import { Component, Show, createMemo, createResource } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { Select } from "@aicraft/ui/select"
import { Switch } from "@aicraft/ui/switch"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { PluginSettingsSections } from "@/runtime/plugin/settings-page-view"
import { type CollapseTiming, type FollowUpBehavior, type TimelineWidth, type TranscriptViewMode, type WorkspaceDefaultDestination, useSettings } from "@/settings/model"
import { formatKeybind } from "@/shell/commands/command"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import { createShellOptions } from "./behavior"
import type { ShellSettingsController } from "./controllers"
import { SettingsPageHeader } from "@/settings/page-header"
import "@/settings/settings.css"

const AutoApprovePermissionsSetting: Component = () => {
  const language = useLanguage()
  const settings = useSettings()

  return (
    <SettingsRow
      title={language.t("command.permissions.autoaccept.enable")}
      description={language.t("settings.permissions.autoAccept.default.description")}
    >
      <div data-action="settings-auto-accept-permissions">
        <Switch
          checked={settings.permissions.autoApproveDefault()}
          onChange={(checked) => settings.permissions.setAutoApproveDefault(checked)}
        />
      </div>
    </SettingsRow>
  )
}

const WorkspaceDestinationSetting: Component = () => {
  const language = useLanguage()
  const settings = useSettings()

  const options = createMemo((): { value: WorkspaceDefaultDestination; label: string }[] => [
    { value: "local", label: language.t("settings.workspaces.default.local") },
    { value: "new", label: language.t("settings.workspaces.default.new") },
  ])

  return (
    <SettingsRow
      title={language.t("settings.workspaces.default.title")}
      description={language.t("settings.workspaces.default.description")}
    >
      <Select
        data-action="settings-workspace-destination"
        options={options()}
        current={options().find((option) => option.value === settings.workspaces.defaultDestination())}
        value={(option) => option.value}
        label={(option) => option.label}
        placement="bottom-end"
        gutter={6}
        onSelect={(option) => option && settings.workspaces.setDefaultDestination(option.value)}
      />
    </SettingsRow>
  )
}

export const ShellSetting: Component<{
  controller: ShellSettingsController
  /** Search reveals the row with the default action; the Servers page names the other servers' rows apart. */
  action?: string
}> = (props) => {
  const language = useLanguage()

  const options = createMemo(() =>
    createShellOptions({
      shells: props.controller.shells(),
      current: props.controller.current(),
    }),
  )

  return (
    <SettingsRow
      title={language.t("settings.general.row.shell.title")}
      description={language.t("settings.general.row.shell.description")}
    >
      <Select
        data-action={props.action ?? "settings-shell"}
        options={options()}
        current={options().find((option) => option.value === props.controller.current()) ?? options()[0]}
        placement="bottom-end"
        gutter={6}
        value={(option) => option.id}
        label={(option) => {
          if (option.id === "auto") return language.t("settings.general.row.shell.autoDefault")

          if (!option.terminalOnly) return option.name

          return `${option.name} (${language.t("settings.general.row.shell.terminalOnly")})`
        }}
        onSelect={(option) => option && props.controller.select(option.value)}
      />
    </SettingsRow>
  )
}

const FollowUpBehaviorSetting: Component = () => {
  const language = useLanguage()
  const settings = useSettings()

  const options = createMemo((): { value: FollowUpBehavior; label: string }[] => [
    { value: "queue", label: language.t("settings.general.row.followUpBehavior.queue") },
    { value: "steer", label: language.t("settings.general.row.followUpBehavior.steer") },
  ])

  return (
    <SettingsRow
      title={language.t("settings.general.row.followUpBehavior.title")}
      description={language.t("settings.general.row.followUpBehavior.description", {
        keybind: formatKeybind("mod+enter", language.t),
      })}
    >
      <Select
        data-action="settings-follow-up-behavior"
        options={options()}
        current={options().find((option) => option.value === settings.general.followUpBehavior())}
        value={(option) => option.value}
        label={(option) => option.label}
        placement="bottom-end"
        gutter={6}
        onSelect={(option) => option && settings.general.setFollowUpBehavior(option.value)}
      />
    </SettingsRow>
  )
}

const TranscriptViewSetting: Component = () => {
  const language = useLanguage()
  const settings = useSettings()

  const options = createMemo((): { value: TranscriptViewMode; label: string }[] => [
    { value: "compact", label: language.t("settings.general.row.transcriptView.compact") },
    { value: "standard", label: language.t("settings.general.row.transcriptView.standard") },
    { value: "detailed", label: language.t("settings.general.row.transcriptView.detailed") },
    { value: "verbose", label: language.t("settings.general.row.transcriptView.verbose") },
  ])

  return (
    <SettingsRow
      title={language.t("settings.general.row.transcriptView.title")}
      description={language.t("settings.general.row.transcriptView.description")}
    >
      <Select
        data-action="settings-transcript-view"
        options={options()}
        current={options().find((option) => option.value === settings.general.transcriptView())}
        value={(option) => option.value}
        label={(option) => option.label}
        placement="bottom-end"
        gutter={6}
        onSelect={(option) => option && settings.general.setTranscriptView(option.value)}
      />
    </SettingsRow>
  )
}

const TimelineWidthSetting: Component = () => {
  const language = useLanguage()
  const settings = useSettings()

  const options = createMemo((): { value: TimelineWidth; label: string }[] => [
    { value: "focused", label: language.t("settings.timeline.row.width.focused") },
    { value: "comfortable", label: language.t("settings.timeline.row.width.comfortable") },
    { value: "wide", label: language.t("settings.timeline.row.width.wide") },
  ])

  return (
    <SettingsRow
      title={language.t("settings.timeline.row.width.title")}
      description={language.t("settings.timeline.row.width.description")}
    >
      <Select
        data-action="settings-timeline-width"
        options={options()}
        current={options().find((option) => option.value === settings.general.timelineWidth())}
        value={(option) => option.value}
        label={(option) => option.label}
        placement="bottom-end"
        gutter={6}
        onSelect={(option) => option && settings.general.setTimelineWidth(option.value)}
      />
    </SettingsRow>
  )
}

const CollapseTimingSetting: Component = () => {
  const language = useLanguage()
  const settings = useSettings()

  const options = createMemo((): { value: CollapseTiming; label: string }[] => [
    { value: "completion", label: language.t("settings.general.row.collapseTiming.completion") },
    { value: "next-input", label: language.t("settings.general.row.collapseTiming.nextInput") },
  ])

  return (
    <SettingsRow
      title={language.t("settings.general.row.collapseTiming.title")}
      description={language.t("settings.general.row.collapseTiming.description")}
    >
      <Select
        data-action="settings-collapse-timing"
        options={options()}
        current={options().find((option) => option.value === settings.general.collapseTiming())}
        value={(option) => option.value}
        label={(option) => option.label}
        placement="bottom-end"
        gutter={6}
        onSelect={(option) => option && settings.general.setCollapseTiming(option.value)}
      />
    </SettingsRow>
  )
}

const LanguageSetting = () => {
  const language = useLanguage()

  const options = createMemo(() =>
    language.locales.map((locale) => ({
      value: locale,
      label: language.label(locale),
    })),
  )

  return (
    <SettingsRow
      title={language.t("settings.general.row.language.title")}
      description={language.t("settings.general.row.language.description")}
    >
      <Select
        data-action="settings-language"
        options={options()}
        placement="bottom-end"
        gutter={6}
        current={options().find((option) => option.value === language.locale())}
        value={(option) => option.value}
        label={(option) => option.label}
        onSelect={(option) => option && language.setLocale(option.value)}
      />
    </SettingsRow>
  )
}

export const SettingsGeneral: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()
  const settings = useSettings()
  const mobile = createMediaQuery("(max-width: 767px)")
  const desktop = createMemo(() => platform.platform === "desktop")

  const [pinchZoom, { mutate: setPinchZoom }] = createResource(
    () => desktop() && "getPinchZoomEnabled" in platform,
    () => Promise.resolve(platform.getPinchZoomEnabled?.() ?? false).catch(() => false),
    { initialValue: false },
  )

  const onPinchZoomChange = (checked: boolean) => {
    setPinchZoom(checked)
    const update = platform.setPinchZoomEnabled?.(checked)

    if (!update) return
    void update.catch(() => setPinchZoom(!checked))
  }

  const [spellcheck, { mutate: setSpellcheck }] = createResource(
    () => desktop() && "getSpellcheckEnabled" in platform,
    () => platform.getSpellcheckEnabled?.().catch(() => true) ?? true,
    { initialValue: true },
  )

  const onSpellcheckChange = (checked: boolean) => {
    setSpellcheck(checked)
    void platform.setSpellcheckEnabled?.(checked).catch(() => setSpellcheck(!checked))
  }

  const GeneralSection = () => (
    <div class="settings-section">
      <SettingsList>
        <LanguageSetting />
        <WorkspaceDestinationSetting />
        <PluginSettingsSections page="general" section="general" />
      </SettingsList>
    </div>
  )

  const BehaviorSection = () => (
    <div class="settings-section">
      <h3 class="settings-section-title">{language.t("settings.general.group.behavior")}</h3>
      <SettingsList>
        <AutoApprovePermissionsSetting />

        <SettingsRow
          title={language.t("settings.general.row.showCustomAgents.title")}
          description={language.t("settings.general.row.showCustomAgents.description")}
        >
          <div data-action="settings-show-custom-agents">
            <Switch
              checked={settings.general.showCustomAgents()}
              onChange={(checked) => settings.general.setShowCustomAgents(checked)}
            />
          </div>
        </SettingsRow>

        <FollowUpBehaviorSetting />
        <TranscriptViewSetting />
        <TimelineWidthSetting />
        <CollapseTimingSetting />
      </SettingsList>
    </div>
  )

  const DesktopSection = () => (
    <div class="settings-section">
      <h3 class="settings-section-title">{language.t("settings.general.group.desktop")}</h3>
      <SettingsList>
        <SettingsRow
          title={language.t("settings.general.row.pinchZoom.title")}
          description={language.t("settings.general.row.pinchZoom.description")}
        >
          <div data-action="settings-pinch-zoom">
            <Switch checked={pinchZoom.latest} onChange={onPinchZoomChange} />
          </div>
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.general.row.spellcheck.title")}
          description={language.t("settings.general.row.spellcheck.description")}
        >
          <div data-action="settings-spellcheck">
            <Switch checked={spellcheck.latest} onChange={onSpellcheckChange} />
          </div>
        </SettingsRow>
      </SettingsList>
    </div>
  )

  return (
    <>
      <SettingsPageHeader
        title={language.t("settings.nav.general")}
        description={language.t("settings.preferences.description")}
      />
      <div class="settings-tab-body">
        <GeneralSection />
        <BehaviorSection />

        <Show when={desktop()}>
          <DesktopSection />
        </Show>

        <Show when={mobile()}>
          <div class="settings-section">
            <SettingsList>
              <SettingsRow
                title={language.t("settings.general.row.mobileTitlebarBottom.title")}
                description={language.t("settings.general.row.mobileTitlebarBottom.description")}
              >
                <div data-action="settings-mobile-titlebar-bottom">
                  <Switch
                    checked={settings.general.mobileTitlebarPosition() === "bottom"}
                    onChange={(checked) => settings.general.setMobileTitlebarPosition(checked ? "bottom" : "top")}
                  />
                </div>
              </SettingsRow>
            </SettingsList>
          </div>
        </Show>

        <PluginSettingsSections page="general" />
      </div>
    </>
  )
}
