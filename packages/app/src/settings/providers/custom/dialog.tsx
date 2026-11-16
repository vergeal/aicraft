import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { MenuScroll } from "@opencode/ui/menu-scroll"
import { TextField } from "@opencode/ui/text-field"
import { Predicate } from "effect"
import { createMemo, createSignal, For, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { formatServerError } from "@/runtime/server/errors"
import { showToast } from "@/shell/notifications/toast"
import type { ExperimentalConfigUpdateInput } from "@opencode/client/promise"
import { baseURLError, detailsValid, idError, modelsError, providerConfig, type CustomProviderDraft } from "./draft"
import {
  busy,
  canSubmit,
  closed,
  transition,
  type CustomProviderEffect,
  type CustomProviderEvent,
  type CustomProviderState,
} from "./machine"

type CustomProviderInfo = {
  id: string
  name?: string
  baseURL?: string
  models: readonly string[]
  info?: { settings?: Readonly<Record<string, unknown>>; models?: Readonly<Record<string, unknown>> }
}

type ProviderPatch = NonNullable<NonNullable<ExperimentalConfigUpdateInput["providers"]>[string]>

/**
 * Creates or edits one custom OpenAI-compatible provider. The endpoint is written to the global configuration and the
 * key to the credential store, so the two never mix.
 */
export function DialogCustomProvider(props: {
  directory?: string
  /** Omitted for a new provider. */
  provider?: CustomProviderInfo
  /**
   * The key an edited provider already stores. Discovery borrows it while the key field stays empty, the same way an
   * unchanged field keeps the stored key on save. It is never written into the draft or shown in the field.
   */
  existingApiKey?: string
  /**
   * True while the credential list that supplies `existingApiKey` is still loading. Discovery would otherwise go out
   * without the stored key and come back as an invalid key, which is the wrong thing to tell the user.
   */
  existingKeyLoading?: boolean
  /** Every provider ID the configuration already declares. */
  taken: readonly string[]
  /** Opens with this field focused, so "Replace API key" lands on the key instead of the top of the form. */
  focusField?: "apiKey"
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
        ? { type: "open.edit", attempt: 1, provider: props.provider }
        : { type: "open.create", attempt: 1 },
      context,
    ).state,
  )

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
  // A save keeps what discovery already fetched: the model list stays on screen while the request runs instead of
  // collapsing to the empty state and jumping the sheet's height.
  const discovery = () => {
    const current = state()
    return current.type === "editing" || current.type === "saving" ? current.discovery : ({ type: "idle" } as const)
  }

  // The machine only records that discovery failed; the reason belongs to the request that produced it.
  const [discoveryError, setDiscoveryError] = createStore<{ message?: string }>({})

  // An edit borrows the stored key for discovery, so a fetch started before that key loads would go out anonymous and
  // be reported as a bad key. A key the user already typed needs no wait.
  const keyPending = () => mode === "edit" && props.existingKeyLoading === true && !draft()?.apiKey

  const run = (effect: CustomProviderEffect) => {
    if (effect.type === "discover.run") {
      const attempt = effect.attempt
      setDiscoveryError("message", undefined)
      void server.api.experimental.provider
        .models({ baseURL: effect.baseURL, apiKey: effect.apiKey ?? props.existingApiKey })
        .then((models) => dispatch({ type: "discover.succeeded", attempt, models }))
        .catch((cause: unknown) => {
          setDiscoveryError("message", discoveryFailure(cause, language))
          dispatch({ type: "discover.failed", attempt })
        })
      return
    }

    if (effect.type === "save.run") {
      const attempt = effect.attempt
      const saved = effect.draft
      void server.api.experimental.config
        .update({
          providers: {
            [saved.id]: providerConfig(saved, props.provider?.info) as ProviderPatch,
          },
        })
        .then(() => {
          if (!saved.apiKey) return
          return connectKey(server, props.directory, saved.id, saved.apiKey)
        })
        .then(
          () => dispatch({ type: "submit.succeeded", attempt }),
          (cause: unknown) => dispatch({ type: "submit.failed", attempt, message: formatServerError(cause, language.t) }),
        )
      return
    }

    // This dialog cannot produce a delete effect; the delete confirmation owns that lifecycle.
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
    dialog.close()
  }

  const set = (patch: Partial<CustomProviderDraft>) => dispatch({ type: "draft.changed", patch })

  const [manual, setManual] = createSignal("")
  // A field only complains after the user leaves it: an empty form on open is not an error yet.
  const [touched, setTouched] = createStore({ id: false, baseURL: false })
  const models = createMemo(() => draft()?.models ?? [])
  const discovered = createMemo(() => {
    const result = discovery()
    return result.type === "ready" ? result.models : []
  })

  // The search only narrows what the endpoint returned; it never hides a selection the user already made.
  const [query, setQuery] = createSignal("")
  const visible = createMemo(() => {
    const needle = query().trim().toLowerCase()
    if (!needle) return discovered()
    return discovered().filter(
      (model) => model.id.toLowerCase().includes(needle) || model.name?.toLowerCase().includes(needle),
    )
  })

  const toggleModel = (id: string, checked: boolean) => {
    const value = draft()
    if (!value) return
    set({ models: checked ? [...value.models, id] : value.models.filter((item) => item !== id) })
  }

  const addManual = () => {
    const id = manual().trim()
    const value = draft()
    if (!id || !value || value.models.includes(id)) return
    set({ models: [...value.models, id] })
    setManual("")
  }

  // The validators return key names, so the field shows the message the specific failure asks for.
  const fieldError = (
    key:
      | "settings.providers.custom.id.required"
      | "settings.providers.custom.id.invalid"
      | "settings.providers.custom.id.taken"
      | "settings.providers.custom.baseURL.invalid"
      | undefined,
  ) => (key ? language.t(key) : undefined)

  return (
    <Dialog class="settings-provider-custom-dialog" containerClass="settings-provider-custom-dialog" variant="settings">
      <DialogHeader closeLabel={language.t("common.close")}>
        <span class="settings-provider-custom-mark" aria-hidden="true">
          <Show when={mode === "edit"} fallback={<Icon name="plus" size="small" />}>
            {props.provider?.name?.trim().charAt(0).toUpperCase()}
          </Show>
        </span>
        <div class="settings-provider-custom-heading">
          <DialogTitleGroup
            title={
              mode === "edit"
                ? language.t("settings.providers.custom.title.edit")
                : language.t("settings.providers.custom.title.create")
            }
            description={language.t("settings.providers.custom.description")}
          />
        </div>
      </DialogHeader>
      <DialogBody class="min-h-0 flex-1 overflow-y-auto" data-scrollable>
        <Show when={draft()}>
          {(value) => (
            <>
              <section class="settings-provider-custom-section">
                <div class="settings-provider-custom-section-head">
                  <h2 class="settings-provider-custom-section-title">
                    {language.t("settings.providers.custom.section.details")}
                  </h2>
                </div>
                <div
                  class="settings-provider-custom-fields"
                  onKeyDown={(event: KeyboardEvent) => {
                    if (event.key !== "Enter" || event.isComposing) return
                    // One screen has one action: Enter submits the form the footer's button submits.
                    if (!canSubmit(state(), context)) return
                    event.preventDefault()
                    dispatch({ type: "submit.requested" })
                  }}
                >
                  <div class="settings-provider-custom-grid">
                    <TextField
                      label={language.t("settings.providers.custom.name")}
                      placeholder={language.t("settings.providers.custom.name.placeholder")}
                      value={value().name}
                      onInput={(event) => set({ name: event.currentTarget.value })}
                    />
                    <TextField
                      id="settings-provider-custom-id"
                      label={language.t("settings.providers.custom.id")}
                      placeholder={language.t("settings.providers.custom.id.placeholder")}
                      description={
                        mode === "edit"
                          ? language.t("settings.providers.custom.id.locked")
                          : language.t("settings.providers.custom.id.hint")
                      }
                      error={touched.id ? fieldError(idError(value(), props.taken, mode)) : undefined}
                      validationState={touched.id && idError(value(), props.taken, mode) ? "invalid" : undefined}
                      value={value().id}
                      readOnly={mode === "edit"}
                      class="settings-provider-custom-mono"
                      onInput={(event) => set({ id: event.currentTarget.value })}
                      onBlur={() => setTouched("id", true)}
                    />
                  </div>
                  <TextField
                    id="settings-provider-custom-base-url"
                    label={language.t("settings.providers.custom.baseURL")}
                    placeholder={language.t("settings.providers.custom.baseURL.placeholder")}
                    description={language.t("settings.providers.custom.baseURL.hint")}
                    error={touched.baseURL ? fieldError(baseURLError(value())) : undefined}
                    validationState={touched.baseURL && baseURLError(value()) ? "invalid" : undefined}
                    value={value().baseURL}
                    class="settings-provider-custom-mono"
                    onInput={(event) => set({ baseURL: event.currentTarget.value })}
                    onBlur={() => setTouched("baseURL", true)}
                  />
                  <TextField
                    label={language.t("settings.providers.custom.apiKey")}
                    type="password"
                    autofocus={props.focusField === "apiKey"}
                    placeholder={
                      mode === "edit"
                        ? language.t("settings.providers.custom.apiKey.keep")
                        : language.t("settings.providers.custom.apiKey.placeholder")
                    }
                    description={
                      mode === "edit"
                        ? language.t("settings.providers.custom.apiKey.hint.edit")
                        : language.t("settings.providers.custom.apiKey.hint")
                    }
                    value={value().apiKey}
                    onInput={(event) => set({ apiKey: event.currentTarget.value })}
                  />
                </div>
              </section>

              <section class="settings-provider-custom-section">
                <div class="settings-provider-custom-section-head">
                  <h2 class="settings-provider-custom-section-title">{language.t("settings.providers.custom.models")}</h2>
                  <Show when={discovered().length > 0}>
                    <span class="settings-provider-custom-section-count">
                      {language.t("settings.providers.custom.models.summary", {
                        selected: models().length,
                        total: discovered().length,
                      })}
                    </span>
                  </Show>
                </div>
                <div class="settings-provider-custom-models">
                  <Show when={models().length > 0}>
                    <div class="settings-provider-custom-selected">
                      <For each={models()}>
                        {(id) => (
                          <span class="settings-provider-custom-chip">
                            <span class="settings-provider-custom-model-id">{id}</span>
                            <button
                              type="button"
                              aria-label={language.t("settings.providers.custom.models.remove")}
                              onClick={() => toggleModel(id, false)}
                            >
                              <Icon name="outline-xmark" size="small" />
                            </button>
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                  <div class="settings-provider-custom-toolbar">
                    <div class="settings-provider-custom-search">
                      <TextField
                        hideLabel
                        label={language.t("settings.providers.custom.models.search")}
                        placeholder={language.t("settings.providers.custom.models.search")}
                        value={query()}
                        onInput={(event) => setQuery(event.currentTarget.value)}
                      />
                    </div>
                    <Button
                      size="small"
                      variant="outline"
                      class="settings-provider-custom-fetch"
                      disabled={discovery().type === "loading" || keyPending()}
                      onClick={() => dispatch({ type: "discover.start" })}
                    >
                      <Show when={discovery().type === "loading"} fallback={<Icon name="refresh" size="small" />}>
                        <span class="settings-provider-custom-spinner" aria-hidden="true" />
                      </Show>
                      {discovery().type === "loading"
                        ? language.t("settings.providers.custom.models.fetching")
                        : discovered().length > 0
                          ? language.t("settings.providers.custom.models.refetch")
                          : language.t("settings.providers.custom.models.fetch")}
                    </Button>
                  </div>
                  <Show when={keyPending()}>
                    <p class="settings-provider-custom-empty">
                      {language.t("settings.providers.custom.models.keyPending")}
                    </p>
                  </Show>
                  <Show when={discovery().type === "failed"}>
                    <p class="settings-provider-custom-alert" role="alert">
                      <Icon name="circle-exclamation" size="small" />
                      <span>
                        {discoveryError.message ?? language.t("settings.providers.custom.models.fetchFailed")}
                      </span>
                    </p>
                  </Show>
                  <Show when={visible().length > 0}>
                    <MenuScroll class="settings-provider-custom-model-list" viewportClass="max-h-[208px] p-1.5">
                      <For each={visible()}>
                        {(model) => (
                          <Checkbox
                            class="settings-provider-custom-model"
                            checked={models().includes(model.id)}
                            onChange={(checked) => toggleModel(model.id, checked)}
                          >
                            <span class="settings-provider-custom-model-id">{model.name ?? model.id}</span>
                          </Checkbox>
                        )}
                      </For>
                    </MenuScroll>
                  </Show>
                  <Show when={discovered().length > 0 && visible().length === 0}>
                    <p class="settings-provider-custom-empty">
                      {language.t("settings.providers.custom.models.noMatch")}
                    </p>
                  </Show>
                  <div class="settings-provider-custom-manual">
                    <TextField
                      hideLabel
                      label={language.t("settings.providers.custom.models.manual")}
                      placeholder={language.t("settings.providers.custom.models.manual")}
                      value={manual()}
                      class="settings-provider-custom-mono"
                      onInput={(event) => setManual(event.currentTarget.value)}
                      onKeyDown={(event: KeyboardEvent) => {
                        if (event.key !== "Enter") return
                        event.preventDefault()
                        addManual()
                      }}
                    />
                    <Button
                      size="small"
                      variant="outline"
                      class="settings-provider-custom-add"
                      aria-label={language.t("settings.providers.custom.models.manual")}
                      onClick={addManual}
                    >
                      {language.t("settings.providers.custom.models.manual.add")}
                    </Button>
                  </div>
                </div>
                <Show
                  when={modelsError(value()) && detailsValid(value(), props.taken, mode)}
                  fallback={
                    <p class="settings-provider-custom-hint">{language.t("settings.providers.custom.models.hint")}</p>
                  }
                >
                  {/* The disabled primary action explains itself only once the rest of the form is valid, so an empty
                      new dialog does not open on a red line. */}
                  <p class="settings-provider-custom-hint" data-tone="danger">
                    {language.t("settings.providers.custom.models.required")}
                  </p>
                </Show>
              </section>
            </>
          )}
        </Show>
      </DialogBody>
      <DialogFooter>
        <Show when={error()}>
          {(message) => (
            <p role="alert" class="settings-provider-custom-error">
              {message()}
            </p>
          )}
        </Show>
        {/* Cancel never waits on the request: the machine closes from any state, and a save that lands afterwards
            refreshes the list through the server's `config.updated` event. */}
        <Button size="normal" variant="outline" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button
          size="normal"
          variant="submit"
          disabled={busy(state()) || !canSubmit(state(), context)}
          onClick={() => dispatch({ type: "submit.requested" })}
        >
          <Show when={busy(state())}>
            <Loader class="size-4" />
          </Show>
          {mode === "edit"
            ? language.t("settings.providers.custom.save")
            : language.t("settings.providers.custom.create")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

/**
 * The server names which kind of discovery failure it hit, so the dialog can say the same thing in the user's
 * language instead of showing the English message the route carries for other clients. A cause without a known kind
 * keeps that message, then the dialog's own line.
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
 * Stores the key once the server has registered the provider's integration. `connect.key` dies when the integration
 * is unknown, and the integration only appears after the configuration reload lands, so this waits for it briefly.
 */
async function connectKey(
  server: ReturnType<typeof useServerSDK>,
  directory: string | undefined,
  providerID: string,
  key: string,
) {
  const location = directory ? { directory } : undefined
  // 20 attempts with a short pause is long enough for a reload and still bounded, so the dialog cannot hang.
  for (let attempt = 0; attempt < 20; attempt++) {
    const integration = await server.api.integration.get({ integrationID: providerID, location }).catch(() => undefined)
    if (integration?.data) {
      await server.api.integration.connect.key({ integrationID: providerID, location, key })
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`The provider integration did not register: ${providerID}`)
}

/** Reads the custom providers the editor may change: those declared in a global document the server writes. */
export function customProvidersFrom(entries: readonly unknown[]) {
  return (entries as Array<{
    type?: string
    writable?: boolean
    info?: {
      providers?: Record<
        string,
        { name?: string; settings?: Record<string, unknown>; models?: Record<string, unknown> }
      >
    }
  }>).flatMap((entry) => {
    if (entry.type !== "document" || !entry.writable) return []
    return Object.entries(entry.info?.providers ?? {}).map(([id, provider]) => {
      const baseURL = provider.settings?.baseURL
      return {
        id,
        name: provider.name ?? id,
        baseURL: typeof baseURL === "string" ? baseURL : undefined,
        models: Object.keys(provider.models ?? {}),
        info: provider,
      }
    })
  })
}

/** Providers a document declares but the editor cannot change: a project file, a managed policy. */
export function readOnlyProvidersFrom(entries: readonly unknown[]) {
  return new Set(
    // SAFETY: `entries` is the `config.get` JSON view of `Config.Entry[]`; only the document fields read here exist on
    // it, and a directory entry simply has neither `writable` nor `info.providers`.
    (entries as Array<{ type?: string; writable?: boolean; info?: { providers?: Record<string, unknown> } }>).flatMap(
      (entry) => (entry.type !== "document" || entry.writable ? [] : Object.keys(entry.info?.providers ?? {})),
    ),
  )
}

export type CustomProvider = ReturnType<typeof customProvidersFrom>[number]
