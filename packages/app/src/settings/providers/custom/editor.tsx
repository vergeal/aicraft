import { Button } from "@aicraft/ui/button"
import { ConfirmDialog } from "@aicraft/ui/confirm-dialog"
import { useDialog } from "@aicraft/ui/context/dialog"
import { Icon } from "@aicraft/ui/icon"
import { IconButton } from "@aicraft/ui/icon-button"
import { Loader } from "@aicraft/ui/loader"
import { TextInput } from "@aicraft/ui/text-input"
import { Predicate } from "effect"
import { createEffect, createSignal, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { formatServerError } from "@/runtime/server/errors"
import { showToast } from "@/shell/notifications/toast"
import { ProviderAccountList } from "../account-list"
import { useProviderAccountActions } from "../account-actions"
import type { ProviderAccount } from "../accounts"
import {
  baseURLError,
  detailsValid,
  idError,
  modelsError,
  providerConfig,
  suggestProviderID,
  suggestProviderName,
  type CustomProviderDraft,
} from "./draft"
import {
  busy,
  canSubmit,
  closed,
  dirty,
  transition,
  type CustomProviderEffect,
  type CustomProviderEvent,
  type CustomProviderState,
} from "./machine"
import { ProviderModelPicker } from "./models"
import type { CustomProvider } from "./record"
import "./editor.css"

type ProviderPatch = NonNullable<
  NonNullable<import("@aicraft/client/promise").ExperimentalConfigUpdateInput["providers"]>[string]
>

/**
 * Creating or editing one custom OpenAI-compatible provider. It is a settings page rather than a dialog: the form owns
 * more fields than a sheet may hold, and the model list needs room to be read. The endpoint is written to the global
 * configuration and the key to the credential store, so the two never mix.
 */
export function CustomProviderEditor(props: {
  directory?: string
  /** Omitted for a new provider. */
  provider?: CustomProvider
  /**
   * The key an edited provider already stores. Reading the endpoint borrows it while the key field stays empty, the
   * same way an unchanged field keeps the stored key on save. It is never written into the draft or shown in the field.
   */
  existingApiKey?: string
  /**
   * True while the credential list that supplies the stored key is still loading. A read would otherwise go out without
   * it and come back as an invalid key, which is the wrong thing to tell the user.
   */
  existingKeyLoading?: boolean
  /** Every provider ID the configuration already declares. */
  taken: readonly string[]
  /**
   * The accounts this provider already stores. Accounts belong to the provider, not to the form: they are listed and
   * changed here so the row's menu does not have to hold a second, denser account surface.
   */
  accounts?: { integrationID: string; activeID?: string; items: readonly ProviderAccount[] }
  /** The stored secret per account, so each row can mask it and reveal it on request. */
  accountSecret?: (account: ProviderAccount) => string | undefined
  /** Adds an account with a name and a key without leaving the page. */
  onCreateAccount?: (input: { label: string; key: string }) => Promise<boolean>
  /** A credential change makes the list that supplies the stored key stale, so the caller reloads it. */
  onAccountChanged?: () => void
  /** Opens the confirmation the provider row owns; a deleted provider leaves this page through the caller. */
  onRequestDelete?: () => void
  /** Returns to the provider list. */
  onClose: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const server = useServerSDK()

  const context = { taken: props.taken }
  const mode = props.provider ? "edit" : "create"

  // A signal, not a store: the machine returns a whole new state for each event, and a store write would merge the
  // previous variant's keys into the next one.
  const [state, setState] = createSignal<CustomProviderState>(
    transition(
      closed,
      props.provider
        ? {
            type: "open.edit",
            attempt: 1,
            provider: {
              id: props.provider.id,
              name: props.provider.name ?? props.provider.id,
              baseURL: props.provider.baseURL ?? "",
              models: props.provider.models,
            },
          }
        : { type: "open.create", attempt: 1 },
      context,
    ).state,
  )

  const run = (effect: CustomProviderEffect) => {
    if (effect.type === "discover.run") {
      const attempt = effect.attempt

      void server.api.experimental.provider
        .models({ baseURL: effect.baseURL, apiKey: effect.apiKey ?? props.existingApiKey })
        .then((models) => dispatch({ type: "discover.succeeded", attempt, models }))
        .catch((cause: unknown) => {
          dispatch({ type: "discover.failed", attempt, message: discoveryFailure(cause, language) })
        })

      return
    }

    if (effect.type === "save.run") {
      const attempt = effect.attempt
      const saved = effect.draft

      void server.api.experimental.config
        .update({
          providers: {
            // SAFETY: providerConfig builds the entry from the validated draft plus the untouched config maps, in
            // the shape the config update endpoint declares for a custom provider.
            [saved.id]: providerConfig(saved, props.provider?.info) as ProviderPatch,
          },
        })
        .then(() => {
          if (!saved.apiKey) return

          return connectKey(server, props.directory, saved.id, saved.apiKey)
        })
        .then(
          () => dispatch({ type: "submit.succeeded", attempt }),
          (cause: unknown) =>
            dispatch({ type: "submit.failed", attempt, message: formatServerError(cause, language.t) }),
        )

      return
    }

    // This page cannot produce a delete effect; the delete confirmation owns that lifecycle.
    if (effect.type === "delete.run") return

    const name = effect.providerName

    if (effect.type === "toast.created")
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.providers.custom.toast.created.title", { provider: name }),
        description: language.t("settings.providers.custom.toast.created.description"),
      })

    if (effect.type === "toast.saved")
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.providers.custom.toast.saved", { provider: name }),
      })

    if (effect.type === "toast.deleted")
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.providers.custom.toast.deleted", { provider: name }),
      })
    props.onClose()
  }

  const dispatch = (event: CustomProviderEvent) => {
    const result = transition(untrack(state), event, context)
    setState(result.state)
    result.effects.forEach(run)
  }

  const draft = () => {
    const current = state()

    return current.type === "editing" || current.type === "saving" ? current.draft : undefined
  }

  const error = () => {
    const current = state()

    return current.type === "editing" ? current.error : undefined
  }

  // A save keeps what the read already fetched: the model list stays on screen while the request runs instead of
  // collapsing to the empty state and jumping the page's height.
  const discovery = () => {
    const current = state()

    return current.type === "editing" || current.type === "saving" ? current.discovery : ({ type: "idle" } as const)
  }

  // An edit borrows the stored key for the read, so a request started before that key loads would go out anonymous and
  // be reported as a bad key. A key the user already typed needs no wait.
  const keyPending = () => mode === "edit" && props.existingKeyLoading === true && !draft()?.apiKey
  const keyAvailable = () => !!draft()?.apiKey.trim() || !!props.existingApiKey

  // A field only complains after the user leaves it: an empty form on open is not an error yet.
  const [touched, setTouched] = createStore({ id: false, baseURL: false })

  // The identity follows the endpoint until the user writes it: an id and a name are the two fields a pasted base URL
  // can fill by itself, and leaving both automatic keeps the form to one decision per step.
  const [auto, setAuto] = createStore({ id: mode === "create", name: mode === "create" })

  const startDiscovery = () => dispatch({ type: "discover.start" })

  // Leaving the address field reads whatever the endpoint offers, so the model section answers "does this work?"
  // without a second action. An address that cannot parse yet, a read already running, or no key at all all skip it.
  const probeOnLeave = () => {
    setTouched("baseURL", true)

    const current = state()

    if (current.type !== "editing" || current.discovery.type !== "idle") return

    if (baseURLError(current.draft)) return

    if (keyPending() || !keyAvailable()) return
    startDiscovery()
  }

  const changeBaseURL = (value: string) => {
    const patch: Partial<CustomProviderDraft> = { baseURL: value }

    if (mode === "create" && auto.id) {
      const id = suggestProviderID(value)
      patch.id = id

      if (auto.name) patch.name = suggestProviderName(id)
    }

    dispatch({ type: "draft.changed", patch })
  }

  const changeID = (value: string) => {
    setAuto("id", false)
    const patch: Partial<CustomProviderDraft> = { id: value }

    if (auto.name) patch.name = suggestProviderName(value)

    dispatch({ type: "draft.changed", patch })
  }

  const changeName = (value: string) => {
    setAuto("name", false)
    dispatch({ type: "draft.changed", patch: { name: value } })
  }

  const toggleModel = (id: string, checked: boolean) => {
    const value = draft()

    if (!value) return
    dispatch({
      type: "draft.changed",
      patch: { models: checked ? [...value.models, id] : value.models.filter((item) => item !== id) },
    })
  }

  const addManual = (id: string) => {
    const value = draft()

    if (!value || value.models.includes(id)) return
    dispatch({ type: "draft.changed", patch: { models: [...value.models, id] } })
  }

  const submit = () => dispatch({ type: "submit.requested" })

  // Leaving with work in the form asks first, so a stray Escape or a Cancel cannot throw it away.
  const requestClose = () => {
    if (!dirty(state())) return props.onClose()

    void dialog.show(() => (
      <ConfirmDialog
        title={language.t("settings.providers.custom.discard.title")}
        description={language.t("settings.providers.custom.discard.description")}
        confirmLabel={language.t("settings.providers.custom.discard.confirm")}
        cancelLabel={language.t("settings.providers.custom.discard.cancel")}
        onConfirm={() => props.onClose()}
      />
    ))
  }

  // Accounts save as they are changed: they are not part of the form, whose Cancel leaves them untouched.
  const accountActions = useProviderAccountActions(() => props.directory)
  const [accountBusy, setAccountBusy] = createSignal<string>()
  const [closeWhenEmpty, setCloseWhenEmpty] = createSignal(false)
  const providerName = () => props.provider?.name ?? props.provider?.id ?? ""

  createEffect(() => {
    if (!closeWhenEmpty()) return

    // Removing the last account deletes the provider, so the accounts prop can disappear instead of becoming empty.
    if (!props.accounts || props.accounts.items.length === 0) props.onClose()
  })

  const switchAccount = async (account: ProviderAccount) => {
    const accounts = props.accounts

    if (!accounts || accounts.activeID === account.id || accountBusy()) return
    setAccountBusy(account.id)
    await accountActions.activate({ integrationID: accounts.integrationID, provider: providerName(), account })
    props.onAccountChanged?.()
    setAccountBusy(undefined)
  }

  const removeAccount = async (account: ProviderAccount) => {
    const accounts = props.accounts

    if (!accounts) return
    const final = accounts.items.length === 1
    setAccountBusy(account.id)

    if (final) setCloseWhenEmpty(true)
    await accountActions.remove({ integrationID: accounts.integrationID, provider: providerName(), account, final })
    props.onAccountChanged?.()
    setAccountBusy(undefined)
  }

  // The validators return key names, so a field shows the message the specific failure asks for.
  const fieldError = (key: Parameters<typeof language.t>[0] | undefined) => (key ? language.t(key) : undefined)

  const title = () =>
    mode === "edit"
      ? language.t("settings.providers.custom.title.edit")
      : language.t("settings.providers.custom.title.create")

  const submitLabel = () =>
    mode === "edit"
      ? language.t("settings.providers.custom.save.config")
      : language.t("settings.providers.custom.create")

  return (
    <div
      class="settings-provider-editor"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented || dialog.active) return
        // The settings shell closes Settings on Escape; this page owns Escape while a provider is open.
        event.preventDefault()
        event.stopPropagation()
        requestClose()
      }}
    >
      <header class="settings-provider-editor-head">
        <button type="button" class="settings-back settings-provider-editor-back" onClick={requestClose}>
          <Icon name="arrow-left" size="small" class="settings-back-icon" />
          <span>{language.t("settings.providers.custom.back")}</span>
        </button>
        <h2 class="settings-tab-title">{title()}</h2>
        <p class="settings-tab-description">{language.t("settings.providers.custom.description")}</p>
      </header>

      <div class="settings-provider-editor-body" data-scrollable>
        <div class="settings-provider-editor-column">
          <Show when={error()}>
            {(message) => (
              <div class="settings-provider-editor-alert" role="alert">
                <Icon name="circle-exclamation" size="small" />
                <div class="settings-provider-editor-alert-copy">
                  <span>{message()}</span>
                </div>
              </div>
            )}
          </Show>

          <Show when={draft()}>
            {(value) => (
              <>
                <section class="settings-provider-editor-section">
                  <h3 class="settings-provider-editor-section-title">
                    {language.t("settings.providers.custom.section.endpoint")}
                  </h3>
                  <EditorField
                    id="settings-provider-editor-base-url"
                    label={language.t("settings.providers.custom.baseURL")}
                    required
                    mono
                    hint={language.t("settings.providers.custom.baseURL.hint")}
                    error={touched.baseURL ? fieldError(baseURLError(value())) : undefined}
                    value={value().baseURL}
                    placeholder={language.t("settings.providers.custom.baseURL.placeholder")}
                    disabled={busy(state())}
                    onInput={changeBaseURL}
                    onBlur={probeOnLeave}
                    onEnter={submit}
                  />
                  {/* A saved provider's key belongs to its accounts, which the section below edits directly. Keeping the
                      field here as well would leave two places to change one credential, one of them behind a Cancel
                      button that cannot undo it. */}
                  <Show when={mode === "create"}>
                    <EditorField
                      id="settings-provider-editor-api-key"
                      label={language.t("settings.providers.custom.apiKey")}
                      password
                      hint={language.t("settings.providers.custom.apiKey.hint")}
                      value={value().apiKey}
                      placeholder={language.t("settings.providers.custom.apiKey.placeholder")}
                      disabled={busy(state())}
                      onInput={(apiKey) => dispatch({ type: "draft.changed", patch: { apiKey } })}
                      onEnter={submit}
                    />
                  </Show>
                </section>

                <section class="settings-provider-editor-section">
                  <h3 class="settings-provider-editor-section-title">
                    {language.t("settings.providers.custom.section.identity")}
                  </h3>
                  <EditorField
                    id="settings-provider-editor-name"
                    label={language.t("settings.providers.custom.name")}
                    hint={language.t("settings.providers.custom.name.hint")}
                    value={value().name}
                    placeholder={language.t("settings.providers.custom.name.placeholder")}
                    disabled={busy(state())}
                    onInput={changeName}
                    onEnter={submit}
                  />
                  <EditorField
                    id="settings-provider-editor-id"
                    label={language.t("settings.providers.custom.id")}
                    required
                    mono
                    hint={
                      mode === "edit"
                        ? language.t("settings.providers.custom.id.locked")
                        : language.t("settings.providers.custom.id.hint")
                    }
                    error={touched.id ? fieldError(idError(value(), props.taken, mode)) : undefined}
                    value={value().id}
                    placeholder={language.t("settings.providers.custom.id.placeholder")}
                    readOnly={mode === "edit"}
                    disabled={busy(state())}
                    onInput={changeID}
                    onBlur={() => setTouched("id", true)}
                    onEnter={submit}
                  />
                </section>

                <section class="settings-provider-editor-section">
                  <div class="settings-provider-editor-section-head">
                    <h3 class="settings-provider-editor-section-title">
                      {language.t("settings.providers.custom.models")}
                    </h3>
                    <Show when={value().models.length > 0}>
                      <span class="settings-provider-editor-section-aside">
                        {language.plural("settings.providers.custom.models.selected", value().models.length)}
                      </span>
                    </Show>
                  </div>
                  <ProviderModelPicker
                    models={value().models}
                    discovery={discovery()}
                    keyPending={keyPending()}
                    disabled={busy(state())}
                    onToggle={toggleModel}
                    onDiscover={startDiscovery}
                    onAddManual={addManual}
                  />
                  <p class="settings-provider-editor-hint">
                    {language.t(
                      detailsValid(value(), props.taken, mode) && modelsError(value())
                        ? "settings.providers.custom.models.required"
                        : "settings.providers.custom.models.hint",
                    )}
                  </p>
                </section>

                <Show when={props.accounts && props.accounts.items.length > 0 ? props.accounts : undefined}>
                  {(accounts) => (
                    <section class="settings-provider-editor-section">
                      <div class="settings-provider-editor-section-head">
                        <h3 class="settings-provider-editor-section-title">
                          {language.t("settings.providers.account.group")}
                        </h3>
                        <span class="settings-provider-editor-section-aside">
                          {language.t("settings.providers.account.instant")}
                        </span>
                      </div>
                      <ProviderAccountList
                        accounts={accounts().items}
                        activeID={accounts().activeID}
                        size="compact"
                        disabled={accountBusy() !== undefined}
                        removeConfirm={(account, final) =>
                          language.t(
                            final
                              ? "settings.providers.account.removeLast.confirm"
                              : "settings.providers.account.remove.confirm",
                            { account: account.label },
                          )
                        }
                        onActivate={(account) => void switchAccount(account)}
                        onRename={async (account, label) => {
                          const renamed = await accountActions.rename(account, label)

                          if (renamed) props.onAccountChanged?.()

                          return renamed
                        }}
                        onRemove={(account) => void removeAccount(account)}
                        secret={props.accountSecret}
                        create={props.onCreateAccount}
                      />
                    </section>
                  )}
                </Show>

                <Show when={props.onRequestDelete}>
                  {(requestDelete) => (
                    <section class="settings-provider-editor-danger">
                      <h3 class="settings-provider-editor-section-title">
                        {language.t("settings.providers.custom.section.danger")}
                      </h3>
                      <p class="settings-provider-editor-hint">
                        {language.t("settings.providers.custom.danger.description")}
                      </p>
                      <div>
                        <Button
                          variant="danger"
                          size="large"
                          disabled={busy(state())}
                          onClick={() => requestDelete()?.()}
                        >
                          {language.t("settings.providers.custom.danger.delete")}
                        </Button>
                      </div>
                    </section>
                  )}
                </Show>
              </>
            )}
          </Show>
        </div>
      </div>

      <footer class="settings-provider-editor-bar">
        <div class="settings-provider-editor-actions">
          {/* Cancel never waits on the request: a save that lands afterwards refreshes the list through the server's
              config.updated event. */}
          <Button variant="neutral" size="large" onClick={requestClose}>
            {language.t("common.cancel")}
          </Button>
          <Button
            variant="submit"
            size="large"
            disabled={busy(state()) || !canSubmit(state(), context)}
            onClick={submit}
          >
            <Show when={busy(state())}>
              <Loader class="size-4" />
            </Show>
            {submitLabel()}
          </Button>
        </div>
      </footer>
    </div>
  )
}

/**
 * One labelled control: the label above, the field under it, then the hint or the error that replaces it. A label is
 * never a placeholder, and an error always carries an icon so the field does not rely on colour alone.
 */
function EditorField(props: {
  id: string
  label: string
  value: string
  placeholder?: string
  hint?: string
  error?: string
  required?: boolean
  mono?: boolean
  password?: boolean
  readOnly?: boolean
  disabled?: boolean
  onInput: (value: string) => void
  onBlur?: () => void
  onEnter?: () => void
}) {
  const language = useLanguage()
  const [revealed, setRevealed] = createSignal(false)
  const description = () => props.id + "-description"
  const type = () => (props.password && !revealed() ? "password" : "text")

  return (
    <div class="settings-provider-editor-field">
      <label for={props.id} class="settings-provider-editor-label">
        <span>{props.label}</span>
        <Show when={props.required}>
          <span class="settings-provider-editor-required" aria-hidden="true">
            *
          </span>
        </Show>
      </label>
      <TextInput
        id={props.id}
        type={type()}
        appearance="large"
        classList={{ "settings-provider-editor-mono": !!props.mono }}
        value={props.value}
        placeholder={props.placeholder}
        invalid={!!props.error}
        readOnly={props.readOnly}
        disabled={props.disabled}
        spellcheck={false}
        autocapitalize="off"
        autocomplete="off"
        aria-describedby={props.error || props.hint ? description() : undefined}
        aria-required={props.required ? true : undefined}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onBlur={() => props.onBlur?.()}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key !== "Enter" || event.isComposing) return
          event.preventDefault()
          props.onEnter?.()
        }}
        trailing={
          <Show when={props.password}>
            <IconButton
              variant="ghost-muted"
              size="small"
              icon={<Icon name={revealed() ? "outline-eye-slash" : "outline-eye"} />}
              aria-label={language.t(
                revealed() ? "settings.providers.custom.apiKey.hide" : "settings.providers.custom.apiKey.reveal",
              )}
              aria-pressed={revealed()}
              disabled={props.disabled}
              onClick={() => setRevealed((value) => !value)}
            />
          </Show>
        }
      />
      <Show when={props.error}>
        {(message) => (
          <p class="settings-provider-editor-error" id={description()} role="alert">
            <Icon name="circle-exclamation" size="small" />
            <span>{message()}</span>
          </p>
        )}
      </Show>
      <Show when={!props.error && props.hint}>
        {(hint) => (
          <p class="settings-provider-editor-hint" id={description()}>
            {hint()}
          </p>
        )}
      </Show>
    </div>
  )
}

/**
 * The server names which kind of read failure it hit, so the page can say the same thing in the user's language instead
 * of showing the English message the route carries for other clients. A cause without a known kind keeps that message.
 */
function discoveryFailure(cause: unknown, language: ReturnType<typeof useLanguage>) {
  if (Predicate.hasProperty(cause, "kind") && Predicate.isString(cause.kind)) {
    if (cause.kind === "provider.models.auth") return language.t("settings.providers.custom.models.failed.auth")

    if (cause.kind === "provider.models.address") return language.t("settings.providers.custom.models.failed.address")

    if (cause.kind === "provider.models.timeout") return language.t("settings.providers.custom.models.failed.timeout")

    if (cause.kind === "provider.models.connection")
      return language.t("settings.providers.custom.models.failed.connection")
  }

  return formatServerError(cause, language.t, language.t("settings.providers.custom.models.fetchFailed"))
}

/**
 * Stores the key once the server has registered the provider's integration. Connecting a key dies when the integration
 * is unknown, and the integration only appears after the configuration reload lands, so this waits for it briefly.
 */
async function connectKey(
  server: ReturnType<typeof useServerSDK>,
  directory: string | undefined,
  providerID: string,
  key: string,
) {
  const location = directory ? { directory } : undefined

  // 20 attempts with a short pause is long enough for a reload and still bounded, so the page cannot hang.
  for (let attempt = 0; attempt < 20; attempt++) {
    const integration = await server.api.integration.get({ integrationID: providerID, location }).catch(() => undefined)

    if (integration?.data) {
      await server.api.integration.connect.key({ integrationID: providerID, location, key })

      return
    }

    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  throw new Error("The provider integration did not register: " + providerID)
}
