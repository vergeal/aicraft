import { Component } from "solid-js"
import { Switch } from "@aicraft/ui/switch"
import { useLanguage } from "@/runtime/i18n/language"
import { SettingsList } from "@/settings/list"
import { useSettings } from "@/settings/model"
import { SettingsRow } from "@/settings/row"
import { SettingsPageHeader } from "@/settings/page-header"
import "@/settings/settings.css"

export const experimentalSettingsAvailable = true

export const SettingsExperimental: Component = () => {
  const language = useLanguage()
  const settings = useSettings()

  return (
    <>
      <SettingsPageHeader
        title={language.t("settings.tab.experimental")}
        description={language.t("settings.experimental.description")}
      />

      <div class="settings-tab-body">
        <div class="settings-section">
          <SettingsList>
            <SettingsRow
              title={language.t("settings.experimental.row.newIcons.title")}
              description={language.t("settings.experimental.row.newIcons.description")}
            >
              <div data-action="settings-new-icons">
                <Switch
                  checked={settings.general.newIcons()}
                  onChange={(checked) => settings.general.setNewIcons(checked)}
                />
              </div>
            </SettingsRow>
            <SettingsRow
              title={language.t("settings.experimental.row.foldUserMessages.title")}
              description={language.t("settings.experimental.row.foldUserMessages.description")}
            >
              <div data-action="settings-fold-user-messages">
                <Switch
                  checked={settings.general.foldUserMessages()}
                  onChange={(checked) => settings.general.setFoldUserMessages(checked)}
                />
              </div>
            </SettingsRow>
            <SettingsRow
              title={language.t("settings.experimental.row.newQuestionUI.title")}
              description={language.t("settings.experimental.row.newQuestionUI.description")}
            >
              <div data-action="settings-new-question-ui">
                <Switch
                  checked={settings.general.newQuestionUI()}
                  onChange={(checked) => settings.general.setNewQuestionUI(checked)}
                  hideLabel
                >
                  {language.t("settings.experimental.row.newQuestionUI.title")}
                </Switch>
              </div>
            </SettingsRow>
          </SettingsList>
        </div>
      </div>
    </>
  )
}
