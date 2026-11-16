import { Button } from "@opencode/ui/button"
import { Badge } from "@opencode/ui/badge"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Loader } from "@opencode/ui/loader"
import { Menu } from "@opencode/ui/menu"
import { MenuScroll } from "@opencode/ui/menu-scroll"
import { OpenCodeLogo } from "@/providers/opencode-logo"
import { showToast } from "@/shell/notifications/toast"
import { useQuery } from "@tanstack/solid-query"
import { DialogCustomProvider, customProvidersFrom, readOnlyProvidersFrom, type CustomProvider } from "./custom/dialog"
import { DialogDeleteCustomProvider } from "./custom/delete-dialog"
import { useProviders } from "@/providers/catalog/providers"
import { visibleProviders } from "@/providers/catalog/order"
import { consoleProviderGroup } from "@/providers/catalog/console"
import { useIntegrations } from "@/providers/catalog/integrations"
import { createEffect, createMemo, createSignal, on, onCleanup, untrack, type Component, For, Match, type JSX, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { formatServerError } from "@/runtime/server/errors"
import { CONSOLE_INTEGRATION } from "@/providers/connect/controller"
import { DialogConnectProvider, useProviderConnectController } from "@/providers/connect/dialog"
import { ProviderModelIcon } from "@/providers/models/provider-group"
import { SettingsList } from "@/settings/list"
import { activeProviderAccount, providerAccounts, type ProviderAccount } from "./accounts"
import { AccountNameInput } from "./account-name"
import { useProviderAccountActions } from "./account-actions"
import { SettingsPageHeader } from "@/settings/page-header"
import {
  connectedProviders,
  createProviderDisconnectState,
  transitionProviderDisconnect,
  type ProviderDisconnectEffect,
  type ProviderDisconnectEvent,
} from "./machine"
import "@/settings/settings.css"

type ProviderSource = "env" | "api" | "account" | "config" | "custom"

type ProviderItem = ReturnType<ReturnType<typeof useProviders>["connected"]>[number]

/**
 * A removal the list asks to confirm. Deleting a credential is the one action here that loses the user's data, so a
 * single menu click never performs it.
 */
type PendingRemoval =
  | {
      readonly kind: "disconnect"
      readonly providerID: string
      readonly integrationID: string
      readonly providerIDs: readonly string[]
      readonly providerName: string
    }
  | {
      readonly kind: "account"
      readonly providerID: string
      readonly integrationID: string
      readonly providerName: string
      readonly account: ProviderAccount
      readonly final: boolean
    }

const PROVIDER_NOTES = [
  { match: (id: string) => id === "opencode", key: "dialog.provider.opencode.note" },
  { match: (id: string) => id === "opencode-go", key: "dialog.provider.opencodeGo.tagline" },
  { match: (id: string) => id === "anthropic", key: "dialog.provider.anthropic.note" },
  { match: (id: string) => id === "claude-agent", key: "dialog.provider.claudeAgent.note" },
  { match: (id: string) => id.startsWith("github-copilot"), key: "dialog.provider.copilot.note" },
  { match: (id: string) => id === "openai", key: "dialog.provider.openai.note" },
  { match: (id: string) => id === "google", key: "dialog.provider.google.note" },
  { match: (id: string) => id === "openrouter", key: "dialog.provider.openrouter.note" },
  { match: (id: string) => id === "vercel", key: "dialog.provider.vercel.note" },
] as const

export const SettingsProviders: Component<{
  directory: string | undefined
  onSelectProvider?: (providerID: string) => void
  headerAction?: JSX.Element
}> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const providers = useProviders(() => props.directory)
  const integrations = useIntegrations(() => props.directory)
  const providerConnect = useProviderConnectController()
  const accountActions = useProviderAccountActions(() => props.directory)

  const [state, setState] = createStore<{
    consoleExpanded: boolean
    credentialID?: string
    renaming?: string
    held?: ProviderItem[]
    confirming?: PendingRemoval
  }>({
    consoleExpanded: false,
  })

  const [disconnects, setDisconnects] = createSignal(createProviderDisconnectState())

  // Custom providers are the ones declared in the document the server would write; everything else in a
  // configuration file stays read-only here.
  const config = useQuery(() => ({
    queryKey: [serverSdk.scope, "settings-provider-config", props.directory],
    enabled: serverSdk.connection.status() === "connected",
    queryFn: () =>
      serverSdk.api.config.get({ location: props.directory ? { directory: props.directory } : undefined }),
  }))

  onCleanup(serverSdk.event.on("config.updated", () => void config.refetch()))

  // The integration list carries the accounts but not which one is active, so the credential list supplies that bit.
  const credentials = useQuery(() => ({
    queryKey: [serverSdk.scope, "settings-provider-credentials"],
    enabled: serverSdk.connection.status() === "connected",
    queryFn: () => serverSdk.api.credential.list(),
  }))

  const isActiveCredential = (credentialID: string) =>
    credentials.data?.some((entry) => entry.id === credentialID && entry.active)

  // The custom provider entries come from the configuration document, so nothing that edits them can work until it
  // loads. Everything else on the page keeps rendering without it.
  const configReady = () => !config.isPending && !config.isError

  const custom = createMemo(() =>
    customProvidersFrom(config.isPending || config.isError ? [] : (config.data ?? [])),
  )

  const customProvider = (id: string) => custom().find((item) => item.id === id)

  // A provider the page cannot edit because only a read-only document declares it still gets a row, so it says why
  // instead of simply losing its actions.
  const readOnly = createMemo(() =>
    readOnlyProvidersFrom(config.isPending || config.isError ? [] : (config.data ?? [])),
  )

  const dispatch = (event: ProviderDisconnectEvent) => {
    const result = transitionProviderDisconnect(untrack(disconnects), event)
    setDisconnects(result.state)
    result.effects.forEach(run)
  }

  // Results that arrive after Settings closes still report through a toast, as the user asked for the change.
  const run = (effect: ProviderDisconnectEffect) => {
    if (effect.type === "disconnect.run") {
      void serverSdk.api.integration
        .get({
          integrationID: effect.integrationID,
          location: props.directory ? { directory: props.directory } : undefined,
        })
        .then(async (integration) => {
          const credentials = integration.data?.connections.filter((item) => item.type === "credential") ?? []

          if (credentials.length === 0) {
            dispatch({ type: "disconnect.failed", attempt: effect.attempt, reason: { kind: "no-credentials" } })

            return
          }

          await Promise.all(
            credentials.map((credential) => serverSdk.api.credential.remove({ credentialID: credential.id })),
          )
          dispatch({ type: "disconnect.succeeded", attempt: effect.attempt })
        })
        .catch((error) =>
          dispatch({ type: "disconnect.failed", attempt: effect.attempt, reason: { kind: "request", error } }),
        )

      return
    }

    if (effect.type === "toast.disconnected") {
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("provider.disconnect.toast.disconnected.title", { provider: effect.providerName }),
        description: language.t("provider.disconnect.toast.disconnected.description", {
          provider: effect.providerName,
        }),
      })

      return
    }

    showToast({
      title: language.t("common.requestFailed"),
      description:
        effect.reason.kind === "no-credentials"
          ? language.t("provider.disconnect.toast.noCredentials.description", { provider: effect.providerName })
          : language.tDynamic(
              "provider.disconnect.toast.failed.description",
              formatServerError(effect.reason.error, language.t),
              { provider: effect.providerName },
            ),
    })
  }

  // Console-managed providers (`opencode-go`, `console-*`) connect through the `opencode`
  // integration, so the lookup must follow `integrationID` rather than the provider id.
  const integration = (item: ProviderItem) => {
    const id = item.integrationID ?? item.id

    return integrations.list().find((entry) => entry.id === id)
  }

  const connect = (provider?: string) => {
    // The list stays as it was while the dialog connects, so a new sign-in that briefly drops the
    // Console workspace providers from the catalog can't flash rows behind the dialog.
    setState("held", available())
    providerConnect.select(provider)
    void dialog.show(
      () => (
        <DialogConnectProvider
          directory={props.directory}
          defaultLocation={props.directory === undefined}
          controller={providerConnect}
          onConnected={(providerID) => dispatch({ type: "provider.reconnected", providerID })}
        />
      ),
      () =>
        void accountActions
          .refresh()
          .catch(() => undefined)
          .finally(() => {
            void credentials.refetch()
            setState("held", undefined)
          }),
    )
  }

  const available = createMemo(() => {
    if (state.held) return state.held
    const connected = providers.connected()
    const managedConsole = consoleProviderGroup(connected)

    const consoleConnected = integrations
      .list()
      .find((item) => item.id === CONSOLE_INTEGRATION)
      ?.connections.some((connection) => connection.type === "credential" || connection.type === "env")

    return connected
      .filter(
        (provider) =>
          provider.id !== "opencode" ||
          managedConsole !== undefined ||
          consoleConnected ||
          Object.values(provider.models).some((model) => model.cost.input > 0),
      )
      .toSorted((a, b) => Number(b.id === "opencode-go") - Number(a.id === "opencode-go"))
  })

  // Tells the machine which providers the server catalog lists, so a confirmed removal stops hiding a
  // provider once the server drops it and shows it again if it is later reconnected.
  createEffect(
    on(
      () => available().map((item) => item.id),
      (providerIDs) => dispatch({ type: "catalog.synced", providerIDs }),
    ),
  )

  const connected = createMemo(() => connectedProviders(disconnects(), available()))

  const consoleGroup = createMemo(() => consoleProviderGroup(available()))

  const displayed = createMemo(() => {
    const group = consoleGroup()

    if (!group) return connected()
    const grouped = new Set(group.providers.filter((item) => item.id !== group.root.id).map((item) => item.id))

    return connected().filter((item) => !grouped.has(item.id))
  })

  const popular = createMemo(() => {
    const connectedIDs = new Set(connected().map((p) => p.id))
    // The Console account (integration `opencode`) shares its id with the Zen provider. A stored API
    // key, including one imported from a v1 auth.json, makes Zen "connected" without any account, so
    // the Popular list keeps the sign-in row until the active credential is an OAuth grant. Until the
    // integration list arrives the row is still the models.dev Zen provider, so dedupe it as before.
    const account = integrations.list().find((entry) => entry.id === CONSOLE_INTEGRATION)

    const items = providers
      .popular()
      .filter((p) => {
        if (p.id !== CONSOLE_INTEGRATION || !account) return !connectedIDs.has(p.id)

        return account.connections.find((connection) => connection.type === "credential")?.method !== "oauth"
      })
      .slice()

    items.sort((a, b) => visibleProviders.indexOf(a.id) - visibleProviders.indexOf(b.id))

    return items
  })

  const providerIDs = createMemo(() => [
    ...connected().map((item) => item.id),
    ...popular().map((item) => item.id),
    ...custom().map((item) => item.id),
  ])

  const openCustom = (provider?: CustomProvider, focusField?: "apiKey") => {
    setState("held", available())
    void dialog.show(
      () => (
        <DialogCustomProvider
          directory={props.directory}
          provider={provider}
          taken={providerIDs()}
          focusField={focusField}
        />
      ),
      () => {
        setState("held", undefined)
        void config.refetch()
      },
    )
  }

  const deleteCustom = (provider: CustomProvider) => {
    setState("held", available())
    void dialog.show(
      () => (
        <DialogDeleteCustomProvider
          directory={props.directory}
          providerID={provider.id}
          name={provider.name}
          onDeleted={() => void config.refetch()}
        />
      ),
      () => setState("held", undefined),
    )
  }

  // Connection state comes from the integration list like the TUI: credential
  // connections mean an API key or an account login, env connections mean detected
  // environment variables, and a connectionless integration is config-provided.
  const source = (item: ProviderItem): ProviderSource | undefined => {
    const current = integration(item)
    const credential = current?.connections.find((connection) => connection.type === "credential")

    if (credential) return credential.method === "key" ? "api" : "account"

    if (current?.connections.some((connection) => connection.type === "env")) return "env"

    if (current) return "config"

    if (!("source" in item)) return
    const value = item.source

    if (value === "env" || value === "api" || value === "config" || value === "custom") return value

    return
  }

  const type = (item: ProviderItem) => {
    const current = source(item)

    if (current === "env") return language.t("settings.providers.tag.environment")

    if (current === "api") return language.t("provider.connect.method.apiKey")

    if (current === "account") return language.t("settings.providers.tag.account")

    if (current === "config") return language.t("settings.providers.tag.config")

    if (current === "custom") return language.t("settings.providers.tag.custom")

    return language.t("settings.providers.tag.other")
  }

  const canDisconnect = (item: ProviderItem) => {
    const current = integration(item)

    if (current) return current.connections.some((connection) => connection.type === "credential")
    const currentSource = source(item)

    return currentSource !== "env" && currentSource !== "config"
  }

  const canManageAccounts = (item: ProviderItem) => providerAccounts(integration(item)).length > 0

  const note = (id: string) => PROVIDER_NOTES.find((item) => item.match(id))?.key

  const requestDisconnect = (item: ProviderItem, name: string) => {
    const group = consoleGroup()
    const providerIDs = group?.root.id === item.id ? group.providers.map((provider) => provider.id) : [item.id]

    setState("confirming", {
      kind: "disconnect",
      providerID: item.id,
      integrationID: item.integrationID ?? item.id,
      providerIDs,
      providerName: name,
    })
  }

  const requestRemoveAccount = (provider: ProviderItem, providerName: string, account: ProviderAccount) => {
    setState("confirming", {
      kind: "account",
      providerID: provider.id,
      integrationID: provider.integrationID ?? provider.id,
      providerName,
      account,
      final: providerAccounts(integration(provider)).length === 1,
    })
  }

  const cancelRemoval = () => setState("confirming", undefined)

  const confirmRemoval = () => {
    const pending = state.confirming

    if (!pending) return

    setState("confirming", undefined)

    if (pending.kind === "disconnect") {
      dispatch({
        type: "disconnect.requested",
        providerIDs: [...pending.providerIDs],
        integrationID: pending.integrationID,
        providerName: pending.providerName,
      })

      return
    }

    void removeAccount(pending)
  }

  const removeAccount = async (removal: Extract<PendingRemoval, { kind: "account" }>) => {
    setState({ credentialID: removal.account.id, held: available() })
    await accountActions.remove({
      integrationID: removal.integrationID,
      provider: removal.providerName,
      account: removal.account,
      final: removal.final,
    })
    void credentials.refetch()
    setState({ credentialID: undefined, held: undefined })
  }

  const activate = async (provider: ProviderItem, providerName: string, account: ProviderAccount) => {
    if (activeProviderAccount(integration(provider), isActiveCredential)?.id === account.id) return
    setState({ credentialID: account.id, held: available() })
    await accountActions.activate({
      integrationID: provider.integrationID ?? provider.id,
      provider: providerName,
      account,
    })
    void credentials.refetch()
    setState({ credentialID: undefined, held: undefined })
  }

  function AccountMenu(menuProps: { provider: ProviderItem; name?: string }) {
    const accounts = () => providerAccounts(integration(menuProps.provider))
    const active = () => activeProviderAccount(integration(menuProps.provider), isActiveCredential)
    const name = () => menuProps.name ?? menuProps.provider.name
    const renaming = () => accounts().find((account) => account.id === state.renaming)

    return (
      <Show
        when={renaming()}
        fallback={
          <AccountMenuTrigger provider={menuProps.provider} name={name()} accounts={accounts()} active={active()} />
        }
      >
        {(account) => (
          <AccountNameInput
            value={account().label}
            class="settings-provider-account-input"
            onSave={(label) => accountActions.rename(account(), label)}
            onClose={() => setState("renaming", undefined)}
          />
        )}
      </Show>
    )
  }

  function AccountMenuTrigger(menuProps: {
    provider: ProviderItem
    name: string
    accounts: ProviderAccount[]
    active: ProviderAccount | undefined
  }) {
    const accounts = () => menuProps.accounts
    const active = () => menuProps.active
    const name = () => menuProps.name
    // The same source the menu's radio group reads: only the credential list may name the current account. Guessing
    // `accounts()[0]` before it answers put a name in the trigger with no matching selected row in the menu.
    const label = () => active()?.label ?? name()

    return (
      <div class="settings-provider-account-actions">
        <Menu placement="bottom-end" gutter={6}>
          {/* The visible text is the account name, so the accessible name has to start with it (WCAG 2.5.3); the
              provider is only extra context for screen readers. */}
          <Menu.Trigger
            as={Button}
            size="normal"
            variant="ghost-muted"
            class="settings-provider-account-trigger"
            aria-label={`${label()}, ${language.t("settings.providers.account.manage", { provider: name() })}`}
          >
            <span>{label()}</span>
            <Icon name="chevron-down" size="small" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content class="settings-provider-account-menu" onEscapeKeyDown={(event) => event.stopPropagation()}>
              <Menu.Group>
                <Menu.GroupLabel>{language.t("settings.providers.account.group")}</Menu.GroupLabel>
                <MenuScroll
                  class="settings-provider-account-scroll"
                  viewportClass="settings-provider-account-viewport"
                >
                  <Menu.RadioGroup
                    class="settings-provider-account-list"
                    value={active()?.id}
                    onChange={(credentialID) => {
                      const account = accounts().find((item) => item.id === credentialID)

                      if (account) void activate(menuProps.provider, name(), account)
                    }}
                  >
                    <For each={accounts()}>
                      {(account) => (
                        <Menu.RadioItem value={account.id} closeOnSelect disabled={state.credentialID !== undefined}>
                          <span class="settings-provider-account-label">{account.label}</span>
                        </Menu.RadioItem>
                      )}
                    </For>
                  </Menu.RadioGroup>
                </MenuScroll>
              </Menu.Group>
              <Menu.Separator />
              <Menu.Item disabled={state.credentialID !== undefined} onSelect={() => connect(menuProps.provider.id)}>
                <Icon name="plus" size="small" class="shrink-0" />
                {language.t("settings.providers.account.add")}
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu>
        <Menu placement="bottom-end" gutter={6}>
          <Menu.Trigger
            as={IconButton}
            variant="ghost-muted"
            size="large"
            icon={<Icon name="outline-dots" />}
            disabled={state.credentialID !== undefined || !active()}
            aria-label={language.t("dialog.provider.accounts.options", { account: label() })}
          />
          <Menu.Portal>
            <Menu.Content
              class="settings-provider-account-menu"
              onCloseAutoFocus={(event) => state.renaming && event.preventDefault()}
            >
              <Menu.Item onSelect={() => setState("renaming", active()?.id)}>{language.t("common.rename")}</Menu.Item>
              <Menu.Item
                onSelect={() => {
                  const account = active()

                  if (account) requestRemoveAccount(menuProps.provider, name(), account)
                }}
              >
                {language.t("dialog.provider.accounts.remove")}
              </Menu.Item>
            </Menu.Content>
          </Menu.Portal>
        </Menu>
      </div>
    )
  }

  // The row keeps its layout and turns its action area into the question, the way the connect dialog's account list
  // does. The sentence truncates rather than pushing the buttons out of the row.
  function ConfirmRemoval(confirmProps: { pending: PendingRemoval }) {
    const text = () => {
      const pending = confirmProps.pending

      if (pending.kind === "disconnect") return language.t("settings.providers.disconnect.confirm")

      return pending.final
        ? language.t("settings.providers.account.removeLast.confirm")
        : language.t("settings.providers.account.remove.confirm", { account: pending.account.label })
    }

    return (
      <div class="settings-provider-confirm">
        <span role="alert" class="settings-provider-confirm-text">
          {text()}
        </span>
        <Button size="small" variant="ghost-muted" onClick={cancelRemoval}>
          {language.t("common.cancel")}
        </Button>
        <Button size="small" variant="neutral" onClick={confirmRemoval}>
          {confirmProps.pending.kind === "disconnect"
            ? language.t("common.disconnect")
            : language.t("dialog.provider.accounts.remove")}
        </Button>
      </div>
    )
  }

  const confirmingFor = (item: ProviderItem) =>
    state.confirming?.providerID === item.id ? state.confirming : undefined

  return (
    <>
      <SettingsPageHeader
        title={language.t("settings.providers.title")}
        description={language.t("settings.providers.description")}
        actions={props.headerAction}
      />

      <div class="settings-tab-body settings-tab-body--sectioned settings-providers">
        <div class="settings-section" data-component="connected-providers-section">
          <h3 class="settings-section-title">
            {language.t("settings.providers.section.connected")}
            <Show when={providers.ready() && displayed().length > 0}>
              <span class="settings-section-count">{displayed().length}</span>
            </Show>
          </h3>
          <SettingsList variant="catalog">
            <Switch>
              {/* A failed catalog leaves the lists undefined forever, which used to read as "loading". The failure
                  owns this branch so the retry is reachable. */}
              <Match when={providers.error() !== undefined}>
                <div class="settings-models-status">
                  <span>{language.t("settings.providers.catalog.failed")}</span>
                  <Button size="small" variant="neutral" onClick={() => providers.retry()}>
                    {language.t("common.retry")}
                  </Button>
                </div>
              </Match>
              <Match when={!providers.ready()}>
                <div class="settings-models-status">
                  <Loader class="size-4" />
                  <span>
                    {language.t("common.loading")}
                    {language.t("common.loading.ellipsis")}
                  </span>
                </div>
              </Match>
              <Match when={displayed().length === 0}>
                <div class="settings-provider-empty">
                  <span>{language.t("settings.providers.connected.empty")}</span>
                </div>
              </Match>
            </Switch>
            <Show when={providers.ready() && displayed().length > 0}>
              <For each={displayed()}>
                {(item) => {
                  const managedGroup = () => (consoleGroup()?.root.id === item.id ? consoleGroup() : undefined)

                  return (
                    <Show
                      when={managedGroup()}
                      fallback={
                        <div class="settings-provider-row group">
                          <div class="settings-provider-lead">
                            <ProviderModelIcon provider={item} class="settings-provider-icon shrink-0" />
                          </div>

                          <div class="settings-provider-copy">
                            <div class="settings-provider-main">
                              <span class="settings-provider-name truncate">{item.name}</span>
                              <Badge>{type(item)}</Badge>
                            </div>
                          </div>
                          <Show
                            when={confirmingFor(item)}
                            fallback={
                              <div class="settings-provider-actions">
                                {/* The custom menu leads wherever the provider is editable. A credential (an API key
                                    counts) used to route the row into the account branch, which dropped the only
                                    baseURL/model/key/delete entry the user had: the better configured the provider, the
                                    less of it could be changed. */}
                                <Show when={customProvider(item.id)}>
                                  {(provider) => (
                                    <>
                                      <Menu placement="bottom-end" gutter={6}>
                                        <Menu.Trigger
                                          as={IconButton}
                                          variant="ghost-muted"
                                          size="large"
                                          icon={<Icon name="outline-dots" />}
                                          aria-label={language.t("settings.providers.custom.title.edit")}
                                        />
                                        <Menu.Portal>
                                          <Menu.Content class="settings-provider-account-menu">
                                            <Menu.Item onSelect={() => openCustom(provider())}>
                                              {language.t("settings.providers.custom.edit")}
                                            </Menu.Item>
                                            <Menu.Item onSelect={() => openCustom(provider(), "apiKey")}>
                                              {language.t("settings.providers.custom.keyReplace")}
                                            </Menu.Item>
                                            <Menu.Separator />
                                            <Menu.Item
                                              data-variant="critical"
                                              onSelect={() => deleteCustom(provider())}
                                            >
                                              {language.t("settings.providers.custom.delete.menu")}
                                            </Menu.Item>
                                          </Menu.Content>
                                        </Menu.Portal>
                                      </Menu>
                                      <Show when={!canDisconnect(item)}>
                                        <Button
                                          size="normal"
                                          variant="neutral"
                                          onClick={() => openCustom(provider())}
                                        >
                                          {language.t("settings.providers.custom.keyMissing")}
                                        </Button>
                                      </Show>
                                    </>
                                  )}
                                </Show>
                                <Show
                                  when={canManageAccounts(item)}
                                  fallback={
                                    <>
                                      <Show when={canDisconnect(item)}>
                                        <Button
                                          size="normal"
                                          variant="ghost-muted"
                                          onClick={() => requestDisconnect(item, item.name)}
                                        >
                                          {language.t("common.disconnect")}
                                        </Button>
                                      </Show>
                                      {/* A custom provider without the configuration document cannot say where its
                                          credential came from, so it shows no hint instead of the wrong one. */}
                                      <Show when={!customProvider(item.id) && readOnly().has(item.id)}>
                                        <span class="settings-provider-env-hint">
                                          {language.t("settings.providers.custom.readOnly")}
                                        </span>
                                      </Show>
                                      <Show
                                        when={
                                          !customProvider(item.id) &&
                                          !readOnly().has(item.id) &&
                                          !canDisconnect(item) &&
                                          (configReady() || source(item) !== "custom")
                                        }
                                      >
                                        <span class="settings-provider-env-hint">
                                          {source(item) === "config"
                                            ? language.t("settings.providers.custom.configured")
                                            : language.t("settings.providers.connected.environmentDescription")}
                                        </span>
                                      </Show>
                                    </>
                                  }
                                >
                                  <>
                                    <Show when={activeProviderAccount(integration(item), isActiveCredential)?.status}>
                                      {(status) => (
                                        <Button
                                          size="normal"
                                          variant="ghost-muted"
                                          class="text-[var(--v2-state-fg-warning)]"
                                          title={status().message}
                                          onClick={() => connect(item.id)}
                                        >
                                          {language.t("dialog.provider.needsSignIn")}
                                        </Button>
                                      )}
                                    </Show>
                                    <AccountMenu provider={item} />
                                  </>
                                </Show>
                              </div>
                            }
                          >
                            {(pending) => <ConfirmRemoval pending={pending()} />}
                          </Show>
                        </div>
                      }
                    >
                      {(group) => (
                        <div class="settings-provider-console group">
                          <div class="settings-provider-console-header">
                            <div class="settings-provider-lead">
                              <span class="settings-provider-lead-icon">
                                <OpenCodeLogo class="settings-provider-icon size-4 shrink-0" />
                              </span>
                              <div class="settings-provider-console-summary">
                                <div class="settings-provider-main">
                                  <span class="settings-provider-name truncate">
                                    {language.t("provider.connect.opencode.name")}
                                  </span>
                                  <Badge>{group().workspace}</Badge>
                                </div>
                                <Show when={group().providers.length > 1}>
                                  <button
                                    type="button"
                                    class="settings-provider-console-toggle"
                                    aria-expanded={state.consoleExpanded}
                                    onClick={() => setState("consoleExpanded", (value) => !value)}
                                  >
                                    <span>
                                      {language.plural(
                                        "settings.providers.console.available",
                                        group().providers.length,
                                        { count: group().providers.length },
                                      )}
                                    </span>
                                    <Icon
                                      name="chevron-right"
                                      size="small"
                                      classList={{
                                        "settings-provider-console-chevron": true,
                                        open: state.consoleExpanded,
                                      }}
                                    />
                                  </button>
                                </Show>
                              </div>
                            </div>
                            <Show
                              when={confirmingFor(item)}
                              fallback={
                                <Show
                                  when={canManageAccounts(item)}
                                  fallback={
                                    <Button
                                      size="normal"
                                      variant="ghost-muted"
                                      onClick={() =>
                                        requestDisconnect(item, language.t("provider.connect.opencode.name"))
                                      }
                                    >
                                      {language.t("common.disconnect")}
                                    </Button>
                                  }
                                >
                                  <AccountMenu provider={item} name={language.t("provider.connect.opencode.name")} />
                                </Show>
                              }
                            >
                              {(pending) => <ConfirmRemoval pending={pending()} />}
                            </Show>
                          </div>
                          <Show when={state.consoleExpanded}>
                            <div class="settings-provider-console-list">
                              <div class="settings-provider-console-separator" aria-hidden="true" />
                              <For each={group().providers}>
                                {(provider) => (
                                  <button
                                    type="button"
                                    class="settings-provider-console-item"
                                    onClick={() => props.onSelectProvider?.(provider.id)}
                                  >
                                    <span>{provider.name.slice(group().prefix.length)}</span>
                                    <Icon
                                      name="chevron-right"
                                      size="small"
                                      class="settings-provider-console-item-chevron"
                                    />
                                  </button>
                                )}
                              </For>
                            </div>
                          </Show>
                        </div>
                      )}
                    </Show>
                  )
                }}
              </For>
            </Show>
            <div class="settings-provider-add-row" data-slot="settings-provider-add-row">
              {/* Adding, editing and deleting a custom provider all read or write the configuration document, so
                  without it the slot explains the failure and offers the refetch instead of opening a broken form. */}
              <Show
                when={config.isError}
                fallback={
                  <button type="button" onClick={() => openCustom()}>
                    <Icon name="plus" size="small" />
                    <span>{language.t("settings.providers.custom.add")}</span>
                  </button>
                }
              >
                <div class="settings-provider-add-error">
                  <span>{language.t("settings.providers.config.failed")}</span>
                  <Button size="small" variant="neutral" onClick={() => void config.refetch()}>
                    {language.t("common.retry")}
                  </Button>
                </div>
              </Show>
            </div>
          </SettingsList>
        </div>

        {/* Every provider is connected: an empty Popular card would only be a blank panel under the list. */}
        <Show when={popular().length > 0}>
          <div class="settings-section">
            <h3 class="settings-section-title">
              {language.t("settings.providers.section.popular")}
              <span class="settings-section-count">{popular().length}</span>
            </h3>
            <SettingsList variant="catalog">
              <For each={popular()}>
                {(item) => (
                  <div class="settings-provider-row settings-provider-row--popular">
                    <div class="settings-provider-lead">
                      <ProviderModelIcon provider={item} class="settings-provider-icon shrink-0" />
                    </div>

                    <div class="settings-provider-copy">
                      <div class="settings-provider-main">
                        <span class="settings-provider-name">{item.name}</span>
                        <Show when={item.id === "opencode" || item.id === "opencode-go"}>
                          <Badge variant="accent">{language.t("dialog.provider.tag.recommended")}</Badge>
                        </Show>
                      </div>
                      <Show when={note(item.id)}>
                        {(key) => <p class="settings-provider-description">{language.t(key())}</p>}
                      </Show>
                    </div>
                    <Button size="normal" variant="neutral" icon="plus" onClick={() => connect(item.id)}>
                      {language.t("common.connect")}
                    </Button>
                  </div>
                )}
              </For>
            </SettingsList>
          </div>
        </Show>
      </div>
    </>
  )
}
