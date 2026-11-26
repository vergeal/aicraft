import { Button } from "@aicraft/ui/button"
import { Checkbox } from "@aicraft/ui/checkbox"
import { Icon } from "@aicraft/ui/icon"
import { Loader } from "@aicraft/ui/loader"
import { MenuScroll } from "@aicraft/ui/menu-scroll"
import { SegmentedControl, SegmentedControlItem } from "@aicraft/ui/segmented-control"
import { SelectionIndicator } from "@aicraft/ui/selection-indicator"
import { TextInput } from "@aicraft/ui/text-input"
import { createMemo, For, Match, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import type { Discovery } from "./machine"

/** The four rows a read leaves behind while it runs, so the list keeps its height instead of collapsing. */
const SKELETON_ROWS = 4

type ModelRow = { readonly id: string; readonly name: string; readonly manual: boolean }

/**
 * Picking the models one endpoint offers. The list is the only place a model is chosen or dropped, so the page never
 * grows a second surface that repeats what the checkboxes already say.
 */
export function ProviderModelPicker(props: {
  models: readonly string[]
  discovery: Discovery
  /** True while the stored key an edit borrows is still loading, so a read would go out without it. */
  keyPending: boolean
  disabled: boolean
  onToggle: (id: string, checked: boolean) => void
  onDiscover: () => void
  onAddManual: (id: string) => void
}) {
  const language = useLanguage()

  const [store, setStore] = createStore<{
    query: string
    scope: "all" | "selected"
    manual: string
    active: string
  }>({ query: "", scope: "all", manual: "", active: "" })

  let viewport: HTMLDivElement | undefined
  // The indicator is laid into the content box, which scrolls with the rows, not into the viewport around it.
  const content = () => viewport?.firstElementChild as HTMLElement | undefined

  const discovered = createMemo(() => (props.discovery.type === "ready" ? props.discovery.models : []))

  // A model Id typed by hand is not in the endpoint's list, but it is still one of this provider's models: it belongs
  // in the same list, marked, rather than in a separate row of chips above it.
  const all = createMemo<ModelRow[]>(() => {
    const read = discovered()
    const known = new Set(read.map((model) => model.id))

    return [
      ...read.map((model) => ({ id: model.id, name: model.name ?? model.id, manual: false })),
      ...props.models.filter((id) => !known.has(id)).map((id) => ({ id, name: id, manual: true })),
    ]
  })

  const rows = createMemo(() => {
    const needle = store.query.trim().toLowerCase()

    return all().filter(
      (row) =>
        (store.scope === "all" || props.models.includes(row.id)) &&
        (!needle || row.id.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle)),
    )
  })

  const moveActive = (step: 1 | -1) => {
    const ids = rows().map((row) => row.id)

    if (ids.length === 0) return
    const index = ids.indexOf(store.active)
    const next = ids[(index + step + ids.length) % ids.length]

    setStore("active", next)
    viewport
      ?.querySelector<HTMLInputElement>(`[data-model-id="${CSS.escape(next)}"] input`)
      ?.focus({ preventScroll: true })
  }

  const addManual = (event: SubmitEvent) => {
    event.preventDefault()
    const id = store.manual.trim()

    if (!id || props.models.includes(id) || props.disabled) return
    props.onAddManual(id)
    setStore("manual", "")
  }

  const action = () => {
    if (props.discovery.type === "loading") return language.t("settings.providers.custom.models.fetching")

    return discovered().length > 0
      ? language.t("settings.providers.custom.models.refetch")
      : language.t("settings.providers.custom.models.fetch")
  }

  return (
    <div class="settings-provider-editor-models">
      <div class="settings-provider-editor-models-bar">
        <TextInput
          type="search"
          appearance="large"
          class="settings-provider-editor-models-search"
          leadingIcon={<Icon name="magnifying-glass" size="small" />}
          showClearButton
          value={store.query}
          placeholder={language.t("settings.providers.custom.models.search")}
          aria-label={language.t("settings.providers.custom.models.search")}
          onInput={(event) => setStore("query", event.currentTarget.value)}
          onClearClick={() => setStore("query", "")}
        />
        <Button
          variant="neutral"
          size="large"
          disabled={props.disabled || props.discovery.type === "loading" || props.keyPending}
          onClick={() => props.onDiscover()}
        >
          <Show when={props.discovery.type === "loading"} fallback={<Icon name="refresh" size="small" />}>
            <Loader class="size-4" />
          </Show>
          {action()}
        </Button>
      </div>

      <div class="settings-provider-editor-models-meta">
        <SegmentedControl
          value={store.scope}
          onChange={(value) => value && setStore("scope", value as "all" | "selected")}
          class="settings-provider-editor-models-filter"
        >
          <SegmentedControlItem value="all">
            {language.t("settings.providers.custom.models.filter.all")}
            <span class="settings-provider-editor-models-count">{all().length}</span>
          </SegmentedControlItem>
          <SegmentedControlItem value="selected">
            {language.t("settings.providers.custom.models.filter.selected")}
            <span class="settings-provider-editor-models-count">{props.models.length}</span>
          </SegmentedControlItem>
        </SegmentedControl>
        <Show when={props.keyPending}>
          <span class="settings-provider-editor-models-note" role="status">
            {language.t("settings.providers.custom.models.keyPending")}
          </span>
        </Show>
      </div>

      <Show when={props.discovery.type === "failed" ? props.discovery : undefined}>
        {(failed) => (
          <div class="settings-provider-editor-alert" role="alert">
            <Icon name="circle-exclamation" size="small" />
            <div class="settings-provider-editor-alert-copy">
              <span>{failed().message}</span>
              <span class="settings-provider-editor-alert-hint">
                {language.t("settings.providers.custom.models.fetchFailed")}
              </span>
            </div>
            <Button variant="neutral" size="small" onClick={() => props.onDiscover()}>
              {language.t("common.retry")}
            </Button>
          </div>
        )}
      </Show>

      <Switch>
        <Match when={props.discovery.type === "loading"}>
          <div class="settings-provider-editor-models-skeleton" aria-hidden="true">
            <For each={Array.from({ length: SKELETON_ROWS })}>{() => <span />}</For>
          </div>
        </Match>
        <Match when={rows().length > 0}>
          <MenuScroll
            class="settings-provider-editor-models-list"
            viewportClass="settings-provider-editor-models-viewport"
            viewportRef={(element) => (viewport = element)}
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
              event.preventDefault()
              moveActive(event.key === "ArrowDown" ? 1 : -1)
            }}
            onFocusIn={(event) => {
              const row = (event.target as HTMLElement).closest<HTMLElement>("[data-model-id]")
              if (row?.dataset.modelId) setStore("active", row.dataset.modelId)
            }}
          >
            <SelectionIndicator
              container={content}
              selector={'[data-model-id][data-active]'}
              attribute="data-active"
              class="settings-provider-editor-models-marker"
            />
            <For each={rows()}>
              {(row) => (
                <Checkbox
                  appearance="compact"
                  class="settings-provider-editor-model"
                  data-model-id={row.id}
                  data-active={store.active === row.id || undefined}
                  checked={props.models.includes(row.id)}
                  disabled={props.disabled}
                  onChange={(checked) => props.onToggle(row.id, checked)}
                >
                  <span class="settings-provider-editor-model-id">{row.name}</span>
                  <Show when={row.manual}>
                    <span class="settings-provider-editor-model-tag">
                      {language.t("settings.providers.custom.models.manual.tag")}
                    </span>
                  </Show>
                  <Show when={row.name !== row.id}>
                    <span class="settings-provider-editor-model-code">{row.id}</span>
                  </Show>
                </Checkbox>
              )}
            </For>
          </MenuScroll>
        </Match>
        <Match when={discovered().length > 0}>
          <p class="settings-provider-editor-models-empty">
            {store.scope === "selected"
              ? language.t("settings.providers.custom.models.noneSelected")
              : language.t("settings.providers.custom.models.noMatch")}
          </p>
        </Match>
        <Match when={true}>
          <p class="settings-provider-editor-models-empty">
            {language.t("settings.providers.custom.models.none")}
          </p>
        </Match>
      </Switch>

      <form class="settings-provider-editor-models-add" onSubmit={addManual}>
        <TextInput
          appearance="large"
          class="settings-provider-editor-mono"
          value={store.manual}
          placeholder={language.t("settings.providers.custom.models.manual")}
          aria-label={language.t("settings.providers.custom.models.manual")}
          disabled={props.disabled}
          onInput={(event) => setStore("manual", event.currentTarget.value)}
        />
        <Button
          variant="neutral"
          size="large"
          type="submit"
          disabled={props.disabled || store.manual.trim() === ""}
        >
          {language.t("settings.providers.custom.models.manual.add")}
        </Button>
      </form>
    </div>
  )
}
