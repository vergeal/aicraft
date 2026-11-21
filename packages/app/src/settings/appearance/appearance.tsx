import { Component, For, Show } from "solid-js"
import { Select } from "@opencode/ui/select"
import { FontPicker } from "./font-picker"
import { useLanguage } from "@/runtime/i18n/language"
import { ExternalLink } from "@/runtime/platform/external-link"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import { createAppearanceSettingsController, type AppearanceSettingsController } from "@/settings/general/controllers"
import { SettingsPageHeader } from "@/settings/page-header"
import "@/settings/settings.css"
import "./appearance.css"

const schemeOptions: ("system" | "light" | "dark")[] = ["system", "light", "dark"]

const reduceMotionOptions = [
  { value: "system" as const, label: "settings.appearance.row.reduceMotion.system" as const },
  { value: "always" as const, label: "settings.appearance.row.reduceMotion.always" as const },
  { value: "never" as const, label: "settings.appearance.row.reduceMotion.never" as const },
]

const fontSizeOptions = [12, 13, 14, 16]

const fontSettings = {
  ui: {
    action: "settings-ui-font",
    title: "settings.general.row.uiFont.title",
    description: "settings.general.row.uiFont.description",
    font: "ui",
    input: "setUI",
  },
  code: {
    action: "settings-code-font",
    title: "settings.general.row.font.title",
    description: "settings.general.row.font.description",
    font: "code",
    input: "setCode",
  },
  terminal: {
    action: "settings-terminal-font",
    title: "settings.general.row.terminalFont.title",
    description: "settings.general.row.terminalFont.description",
    font: "terminal",
    input: "setTerminal",
  },
} as const

const FontSetting: Component<{
  kind: "ui" | "code" | "terminal"
  fonts: AppearanceSettingsController["fonts"]
}> = (props) => {
  const language = useLanguage()
  const config = () => fontSettings[props.kind]

  return (
    <SettingsRow title={language.t(config().title)} description={language.t(config().description)}>
      <div class="settings-font-field">
        <FontPicker
          action={config().action}
          label={language.t(config().title)}
          value={props.fonts[config().font]().value}
          family={props.fonts[config().font]().family}
          placeholder={props.fonts[config().font]().placeholder}
          monospaceFirst={props.kind === "code"}
          systemMonospace={props.kind !== "ui"}
          onSelect={(family) => props.fonts[config().input](family)}
        />
      </div>
    </SettingsRow>
  )
}

export const SettingsAppearance: Component = () => {
  const language = useLanguage()
  const appearance = createAppearanceSettingsController()

  return (
    <>
      <SettingsPageHeader
        title={language.t("settings.general.section.appearance")}
        description={language.t("settings.appearance.description")}
      />

      <div class="settings-tab-body">
        <div class="settings-section">
          <h3 class="settings-section-title">{language.t("settings.appearance.section.theme")}</h3>
          <SettingsList>
            <SettingsRow
              title={language.t("settings.general.row.colorScheme.title")}
              description={language.t("settings.general.row.colorScheme.description")}
            >
              <Select
                data-action="settings-color-scheme"
                options={schemeOptions}
                current={schemeOptions.find((option) => option === appearance.scheme.current())}
                placement="bottom-end"
                gutter={6}
                label={(option) => {
                  if (option === "system") return language.t("theme.scheme.system")

                  if (option === "light") return language.t("theme.scheme.light")

                  return language.t("theme.scheme.dark")
                }}
                onSelect={(option) => option && appearance.scheme.select(option)}
              />
            </SettingsRow>

            <SettingsRow
              title={language.t("settings.general.row.theme.title")}
              description={
                <>
                  {language.t("settings.general.row.theme.description")}{" "}
                  <ExternalLink class="settings-link" href="https://opencode.ai/v2/docs/themes">
                    {language.t("common.learnMore")}
                  </ExternalLink>
                </>
              }
            >
              <Select
                data-action="settings-theme"
                options={appearance.theme.options()}
                current={appearance.theme.current()}
                placement="bottom-end"
                gutter={6}
                value={(option) => option.id}
                label={(option) => option.name}
                onSelect={appearance.theme.select}
                // A name list says little; three swatches show what each theme looks like.
                children={(option) => (
                  <span class="settings-theme-option">
                    <span class="settings-theme-option-name">{option.name}</span>
                    <Show when={appearance.theme.swatches(option.id)}>
                      {(colors) => (
                        <span class="settings-theme-swatches" aria-hidden="true">
                          <For each={colors()}>
                            {(color) => <span class="settings-theme-swatch" style={{ background: color }} />}
                          </For>
                        </span>
                      )}
                    </Show>
                  </span>
                )}
              />
            </SettingsRow>
          </SettingsList>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">{language.t("settings.appearance.section.fonts")}</h3>
          <SettingsList>
            <FontSetting kind="ui" fonts={appearance.fonts} />
            <FontSetting kind="code" fonts={appearance.fonts} />
            <FontSetting kind="terminal" fonts={appearance.fonts} />
          </SettingsList>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">{language.t("settings.appearance.section.display")}</h3>
          <SettingsList>
            <SettingsRow
              title={language.t("settings.appearance.row.fontSize.title")}
              description={language.t("settings.appearance.row.fontSize.description")}
            >
              <Select
                data-action="settings-font-size"
                options={fontSizeOptions}
                current={appearance.fontSize.current()}
                placement="bottom-end"
                gutter={6}
                value={(size) => String(size)}
                label={(size) => String(size)}
                onSelect={(size) => size && appearance.fontSize.select(size)}
              />
            </SettingsRow>

            <Show when={appearance.zoom.available()}>
              <SettingsRow
                title={language.t("settings.appearance.row.zoom.title")}
                description={language.t("settings.appearance.row.zoom.description")}
              >
                <Select
                  data-action="settings-zoom"
                  options={appearance.zoom.options}
                  current={appearance.zoom.current()}
                  placement="bottom-end"
                  gutter={6}
                  value={(level) => String(level)}
                  label={appearance.zoom.label}
                  onSelect={(level) => level && appearance.zoom.select(level)}
                />
              </SettingsRow>
            </Show>

            <SettingsRow
              title={language.t("settings.appearance.row.reduceMotion.title")}
              description={language.t("settings.appearance.row.reduceMotion.description")}
            >
              <Select
                data-action="settings-reduce-motion"
                options={reduceMotionOptions}
                current={reduceMotionOptions.find((option) => option.value === appearance.reduceMotion.current())}
                placement="bottom-end"
                gutter={6}
                value={(option) => option.value}
                label={(option) => language.t(option.label)}
                onSelect={(option) => option && appearance.reduceMotion.select(option.value)}
              />
            </SettingsRow>
          </SettingsList>
        </div>
      </div>
    </>
  )
}
