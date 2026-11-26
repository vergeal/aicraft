import { createMemo, type Component, type JSX } from "solid-js"
import { Select } from "@aicraft/ui/select"
import { Switch } from "@aicraft/ui/switch"
import { useLanguage } from "@/runtime/i18n/language"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import { SettingsPageHeader } from "@/settings/page-header"
import { PluginSettingsSections } from "@/runtime/plugin/settings-page-view"
import { MEMORY_DEFAULTS, createMemorySettingsController, type MemoryInjectionMode } from "./controllers"
import "@/settings/settings.css"

const injectionBudgetTiers = [600, 1200, 1500, 3000, 6000]

const listingLimitTiers = [50, 100, 200, 500, 2000]

const Section: Component<{ id: string; title: string; children: JSX.Element }> = (props) => (
  <section class="settings-section" aria-labelledby={props.id}>
    <h3 id={props.id} class="settings-section-title">
      {props.title}
    </h3>
    <SettingsList>{props.children}</SettingsList>
  </section>
)

/**
 * Numeric fields are tiered pickers: what a reader chooses here is an order of magnitude, not an exact
 * count. A value outside the tiers, from a hand-written config, joins them so the control always shows
 * what the server actually has.
 */
const tiers = (values: number[], current: number) =>
  values.includes(current) ? values : [...values, current].sort((a, b) => a - b)

export const SettingsMemory: Component = () => {
  const language = useLanguage()
  const memory = createMemorySettingsController()

  const modes = createMemo((): { value: MemoryInjectionMode; label: string }[] => [
    { value: "off", label: language.t("settings.memory.mode.off") },
    { value: "trigger", label: language.t("settings.memory.mode.trigger") },
    { value: "vector", label: language.t("settings.memory.mode.vector") },
  ])

  const budgets = createMemo(() => tiers(injectionBudgetTiers, memory.current().max_injected_chars))

  const limits = createMemo(() => tiers(listingLimitTiers, memory.current().max_entries))

  // The default tier says so, because picking it is how you leave the key at the backend's own value.
  const budgetLabel = (value: number) =>
    language.t(
      value === MEMORY_DEFAULTS.max_injected_chars ? "settings.memory.chars.default" : "settings.memory.chars",
      { value },
    )

  const limitLabel = (value: number) =>
    language.t(
      value === MEMORY_DEFAULTS.max_entries ? "settings.memory.entries.default" : "settings.memory.entries",
      { value },
    )

  return (
    <>
      <SettingsPageHeader
        title={language.t("settings.tab.memory")}
        description={language.t("settings.memory.description")}
      />

      <div class="settings-tab-body settings-tab-body--sectioned">
        <Section id="settings-memory-retrieval-title" title={language.t("settings.memory.section.retrieval")}>
          <SettingsRow
            title={language.t("settings.memory.row.inject.title")}
            description={language.t("settings.memory.row.inject.description")}
          >
            <Select
              data-action="settings-memory-inject"
              options={modes()}
              current={modes().find((mode) => mode.value === memory.current().auto_inject)}
              value={(mode) => mode.value}
              label={(mode) => mode.label}
              placement="bottom-end"
              gutter={6}
              onSelect={(mode) => mode && memory.set({ auto_inject: mode.value })}
            />
          </SettingsRow>
          <SettingsRow
            title={language.t("settings.memory.row.budget.title")}
            description={language.t("settings.memory.row.budget.description")}
          >
            <Select
              data-action="settings-memory-inject-budget"
              options={budgets()}
              current={memory.current().max_injected_chars}
              value={(chars) => String(chars)}
              label={budgetLabel}
              placement="bottom-end"
              gutter={6}
              onSelect={(chars) => chars !== null && memory.set({ max_injected_chars: chars })}
            />
          </SettingsRow>
          <SettingsRow
            title={language.t("settings.memory.row.listing.title")}
            description={language.t("settings.memory.row.listing.description")}
          >
            <Select
              data-action="settings-memory-max-entries"
              options={limits()}
              current={memory.current().max_entries}
              value={(entries) => String(entries)}
              label={limitLabel}
              placement="bottom-end"
              gutter={6}
              onSelect={(entries) => entries !== null && memory.set({ max_entries: entries })}
            />
          </SettingsRow>
        </Section>

        <Section id="settings-memory-extraction-title" title={language.t("settings.memory.section.extraction")}>
          <SettingsRow
            title={language.t("settings.memory.row.extract.title")}
            description={language.t("settings.memory.row.extract.description")}
          >
            <div data-action="settings-memory-extract">
              <Switch checked={memory.current().extract} onChange={(checked) => memory.set({ extract: checked })} />
            </div>
          </SettingsRow>
        </Section>

        <PluginSettingsSections page="memory" />
      </div>
    </>
  )
}
