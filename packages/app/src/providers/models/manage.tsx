import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { Switch } from "@opencode/ui/switch"
import { TextInput } from "@opencode/ui/text-input"
import { MenuScroll } from "@opencode/ui/menu-scroll"
import { useFilteredList } from "@opencode/ui/hooks"
import { createMemo, For, Show, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal } from "@/providers/models/selection"
import { popularProviders } from "@/providers/catalog/providers"
import { useLanguage } from "@/runtime/i18n/language"
import { useDialog } from "@opencode/ui/context/dialog"
import { DialogConnectProvider } from "@/providers/connect/dialog"
import { decode64 } from "@/runtime/persistence/base64"
import { CONSOLE_GROUP_KEY, consoleModelGroup, ProviderModelSections } from "@/providers/models/provider-group"
import { useProviders } from "@/providers/catalog/providers"
import "@/settings/settings.css"
import "@/shell/search-list.css"
import "./manage.css"

type ModelItem = ReturnType<ReturnType<typeof useLocal>["model"]["list"]>[number]

const modelKey = (item: ModelItem) => `${item.provider.id}:${item.id}`

export const DialogManageModels: Component = () => {
  const local = useLocal()
  const language = useLanguage()
  const dialog = useDialog()
  const [store, setStore] = createStore<{ collapsed: Record<string, boolean>; active?: string }>({ collapsed: {} })
  const directory = () => decode64(local.slug())
  const providers = useProviders(directory)

  const handleConnectProvider = () => {
    void dialog.show(() => <DialogConnectProvider directory={directory()} />)
  }

  const providerList = (providerID: string) => local.model.list().filter((x) => x.provider.id === providerID)

  const providerVisible = (providerID: string) =>
    providerList(providerID).every((x) => local.model.visible({ modelID: x.id, providerID: x.provider.id }))

  const setProviderVisibility = (providerID: string, checked: boolean) => {
    providerList(providerID).forEach((x) => {
      local.model.setVisibility({ modelID: x.id, providerID: x.provider.id }, checked)
    })
  }

  const setModelVisibility = (item: ModelItem, checked: boolean) => {
    local.model.setVisibility({ modelID: item.id, providerID: item.provider.id }, checked)
  }

  const list = useFilteredList<ModelItem>({
    items: () => local.model.list(),
    key: modelKey,
    filterKeys: ["provider.name", "name", "id"],
    sortBy: (a, b) => a.name.localeCompare(b.name),
    groupBy: (x) => x.provider.id,
    sortGroupsBy: (a, b) => {
      const aRank = popularProviders.indexOf(a.category)
      const bRank = popularProviders.indexOf(b.category)
      const aPopular = aRank >= 0
      const bPopular = bRank >= 0

      if (aPopular && !bPopular) return -1

      if (!aPopular && bPopular) return 1

      if (aPopular && bPopular) return aRank - bRank

      return a.items[0].provider.name.localeCompare(b.items[0].provider.name)
    },
  })

  const managed = createMemo(() => consoleModelGroup(local.model.list()))
  const searching = () => list.filter().length > 0
  const expanded = (key: string) => searching() || !store.collapsed[key]

  // Rows share a single tab stop. They render in group order, and a Console provider group renders only while the
  // Console section above it is open, so these are exactly the rows Tab can reach.
  const renderedKeys = createMemo(() => {
    const consoleOpen = expanded(CONSOLE_GROUP_KEY)
    const nested = new Set(managed()?.providers.map((group) => group.id) ?? [])

    return list.grouped.latest
      .filter((group) => expanded(group.category) && (consoleOpen || !nested.has(group.category)))
      .flatMap((group) => group.items.map(modelKey))
  })

  // A focused row can leave the list (a search, or its group collapsing), so the stop falls back to the first row still
  // rendered instead of leaving every row at -1 and stranding the list outside the tab order.
  const tabStop = createMemo(() => {
    const active = store.active

    return active !== undefined && renderedKeys().includes(active) ? active : renderedKeys()[0]
  })

  function ModelRows(props: { items: ModelItem[] }) {
    const visible = (item: ModelItem) => local.model.visible({ modelID: item.id, providerID: item.provider.id })
    const current = (item: ModelItem) => {
      const selected = local.model.current()

      return !!selected && selected.provider.id === item.provider.id && selected.id === item.id
    }
    // One tab stop for the whole list: rows are reached with the arrow keys instead of Tab, so hundreds of models
    // never stand between the list and the control after it.
    const tabIndex = (item: ModelItem) => (tabStop() === modelKey(item) ? 0 : -1)
    const moveFocus = (row: HTMLElement, target: "next" | "previous" | "first" | "last") => {
      const rows = Array.from(
        row.closest(".settings-manage-models-viewport")?.querySelectorAll<HTMLElement>("[data-manage-model-row]") ?? [],
      )
      const index = rows.indexOf(row)

      if (index === -1 || rows.length === 0) return

      // Clamp at both ends: a row keeps focus where it is instead of jumping to the opposite end of the list.
      const next =
        target === "first"
          ? 0
          : target === "last"
            ? rows.length - 1
            : target === "next"
              ? Math.min(index + 1, rows.length - 1)
              : Math.max(index - 1, 0)

      rows[next]?.focus()
    }

    return (
      <div class="manage-models-rows" role="group" aria-label={props.items[0].provider.name}>
        <For each={props.items}>
          {(item) => {
            const checked = () => visible(item)

            return (
              <div
                data-manage-model-row=""
                role="switch"
                aria-checked={checked()}
                aria-current={current(item) ? "true" : undefined}
                tabindex={tabIndex(item)}
                class="search-list-row"
                onMouseDown={(event) => event.preventDefault()}
                onFocus={() => setStore("active", modelKey(item))}
                onClick={() => setModelVisibility(item, !checked())}
                onKeyDown={(event) => {
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault()
                    setModelVisibility(item, !checked())

                    return
                  }

                  const target =
                    event.key === "ArrowDown"
                      ? "next"
                      : event.key === "ArrowUp"
                        ? "previous"
                        : event.key === "Home"
                          ? "first"
                          : event.key === "End"
                            ? "last"
                            : undefined

                  if (!target) return
                  event.preventDefault()
                  moveFocus(event.currentTarget, target)
                }}
              >
                <div class="search-list-row-text">
                  <span
                    class="manage-model-current"
                    title={current(item) ? language.t("settings.models.current") : undefined}
                  >
                    <Show when={current(item)}>
                      <Icon name="check" size="small" />
                    </Show>
                  </span>
                  <span class="search-list-title" data-weight="regular" title={item.name}>
                    {item.name}
                  </span>
                  {/* Rows from several providers share names, so the group header alone cannot tell them apart. */}
                  <span class="search-list-detail">{item.provider.name}</span>
                </div>
                {/* The row is the switch; the control is inert so it is neither a second tab stop nor a nested control. */}
                <div class="search-list-trailing" inert aria-hidden="true">
                  <Switch checked={checked()} onChange={(value) => setModelVisibility(item, value)} hideLabel>
                    {item.name}
                  </Switch>
                </div>
              </div>
            )
          }}
        </For>
      </div>
    )
  }

  return (
    <Dialog size="large" variant="settings" class="settings-manage-models-dialog search-dialog">
      <DialogHeader hideClose={true} closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("dialog.model.manage")}
          description={language.t("dialog.model.manage.description")}
        />
        <Button variant="neutral" size="small" icon="plus" onClick={handleConnectProvider}>
          {language.t("command.provider.connect")}
        </Button>
      </DialogHeader>
      <DialogBody class="flex min-h-0 flex-1 flex-col">
        <div class="manage-models-search search-dialog-search">
          <TextInput
            type="search"
            appearance="base"
            class="!w-full self-stretch"
            leadingIcon={<Icon name="magnifying-glass" />}
            value={list.filter()}
            onInput={(event) => list.onInput(event.currentTarget.value)}
            placeholder={language.t("common.search.placeholder")}
            spellcheck={false}
            autocorrect="off"
            autocomplete="off"
            autocapitalize="off"
            autofocus
            aria-label={language.t("dialog.model.search.placeholder")}
            showClearButton={!!list.filter()}
            clearIcon="circle-xmark"
            clearLabel={language.t("common.clear")}
            onClearClick={() => list.clear()}
          />
        </div>
        <div class="relative flex min-h-0 flex-1 flex-col">
          <MenuScroll
            class="min-h-0 flex-1"
            viewportClass="settings-panel settings-models settings-manage-models-viewport"
          >
            <Show
              when={providers.error() === undefined}
              fallback={
                <div class="settings-models-status">
                  <span>{language.t("settings.providers.catalog.failed")}</span>
                  <Button size="small" variant="neutral" onClick={() => providers.retry()}>
                    {language.t("common.retry")}
                  </Button>
                </div>
              }
            >
              <Show
                when={providers.ready()}
                fallback={
                  <div class="settings-models-status">
                    <Loader class="size-4" />
                    <span>
                      {language.t("common.loading")}
                      {language.t("common.loading.ellipsis")}
                    </span>
                  </div>
                }
              >
                <Show
                  when={list.flat().length > 0}
                  fallback={
                    <div class="settings-models-status">
                      <span>{language.t("dialog.model.empty")}</span>
                      <Show when={list.filter()}>
                        <span class="settings-models-status-filter">&quot;{list.filter()}&quot;</span>
                      </Show>
                    </div>
                  }
                >
                  <ProviderModelSections
                    groups={list.grouped.latest}
                    managed={managed()}
                    expanded={expanded}
                    disabled={searching()}
                    onExpandedChange={(key, value) => setStore("collapsed", key, !value)}
                    onSetVisibility={setProviderVisibility}
                    action={(group) => (
                      <Switch
                        checked={providerVisible(group.category)}
                        onChange={(checked) => setProviderVisibility(group.category, checked)}
                        disabled={searching()}
                        hideLabel
                      >
                        {group.items[0].provider.name}
                      </Switch>
                    )}
                    rows={(items) => <ModelRows items={items} />}
                  />
                </Show>
              </Show>
            </Show>
          </MenuScroll>
        </div>
      </DialogBody>
    </Dialog>
  )
}
