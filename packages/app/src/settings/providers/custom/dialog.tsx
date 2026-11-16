import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { MenuScroll } from "@opencode/ui/menu-scroll"
import { TextField } from "@opencode/ui/text-field"
import { createMemo, createSignal, For, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { formatServerError } from "@/runtime/server/errors"
import { showToast } from "@/shell/notifications/toast"
import type { ExperimentalConfigUpdateInput } from "@opencode/client/promise"
import { baseURLError, idError, providerConfig, type CustomProviderDraft } from "./draft"
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
  const step = () => {
    const current = state()
    if (current.type === "editing") return current.step
    // A save owns the models step: falling back to "details" would make the footer render the fields step while the
    // request still runs, which is the jump back this dialog used to show.
    return "models"
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

  const run = (effect: CustomProviderEffect) => {
    if (effect.type === "discover.run") {
      const attempt = effect.attempt
      void server.api.experimental.provider
        .models({ baseURL: effect.baseURL, apiKey: effect.apiKey })
        .then((models) => dispatch({ type: "discover.succeeded", attempt, models }))
        .catch(() => dispatch({ type: "discover.failed", attempt }))
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
  // A field only complains after the user leaves it, or when Continue cannot advance and says why: an empty form on open
  // is not an error yet.
  const [touched, setTouched] = createStore({ id: false, baseURL: false })
  const models = createMemo(() => draft()?.models ?? [])
  const discovered = createMemo(() => {
    const result = discovery()
    return result.type === "ready" ? result.models : []
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

  const stepNumber = () => (step() === "models" ? 2 : 1)

  // Continue stays enabled on an invalid form: it is the only way to reveal the field errors, which otherwise wait for a
  // blur the user has no reason to perform. Clicking it marks every field as touched and puts the caret on the first
  // one that still needs an answer.
  const advance = () => {
    const value = draft()
    if (!value) return

    const first = idError(value, props.taken, mode)
      ? "settings-provider-custom-id"
      : baseURLError(value)
        ? "settings-provider-custom-base-url"
        : undefined

    if (!first) {
      dispatch({ type: "step.next" })
      return
    }

    setTouched({ id: true, baseURL: true })
    document.getElementById(first)?.focus()
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
        <div class="settings-provider-custom-heading">
          <DialogTitleGroup
            title={
              mode === "edit"
                ? language.t("settings.providers.custom.title.edit")
                : language.t("settings.providers.custom.title.create")
            }
            description={
              step() === "models"
                ? language.t("settings.providers.custom.description.models")
                : language.t("settings.providers.custom.description")
            }
          />
          {/* Two dots and a count: the models step is a second screen, and the header says so before the body changes. */}
          <div
            class="settings-provider-custom-steps"
            role="group"
            aria-label={language.t("settings.providers.custom.steps.count", {
              current: stepNumber(),
              total: 2,
            })}
          >
            <span class="settings-provider-custom-steps-dots" aria-hidden="true">
              <span data-active={stepNumber() === 1 ? "" : undefined} />
              <span data-active={stepNumber() === 2 ? "" : undefined} />
            </span>
            <span class="settings-provider-custom-steps-count">
              {language.t("settings.providers.custom.steps.progress", { current: stepNumber(), total: 2 })}
            </span>
          </div>
        </div>
      </DialogHeader>
      <DialogBody class="min-h-0 flex-1 overflow-y-auto" data-scrollable>
        <Show when={draft()}>
          {(value) => (
            <Show
              when={step() === "models"}
              fallback={
                <div
                  class="settings-provider-custom-fields"
                  onKeyDown={(event: KeyboardEvent) => {
                    if (event.key !== "Enter" || event.isComposing) return
                    event.preventDefault()
                    advance()
                  }}
                >
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
                    description={language.t("settings.providers.custom.id.hint")}
                    error={touched.id ? fieldError(idError(value(), props.taken, mode)) : undefined}
                    validationState={touched.id && idError(value(), props.taken, mode) ? "invalid" : undefined}
                    value={value().id}
                    disabled={mode === "edit"}
                    class="settings-provider-custom-mono"
                    onInput={(event) => set({ id: event.currentTarget.value })}
                    onBlur={() => setTouched("id", true)}
                  />
                  <TextField
                    id="settings-provider-custom-base-url"
                    label={language.t("settings.providers.custom.baseURL")}
                    placeholder={language.t("settings.providers.custom.baseURL.placeholder")}
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
                    description={language.t("settings.providers.custom.apiKey.hint")}
                    value={value().apiKey}
                    onInput={(event) => set({ apiKey: event.currentTarget.value })}
                  />
                </div>
              }
            >
              <div class="settings-provider-custom-models">
                <div class="settings-provider-custom-models-header">
                  <span>{language.t("settings.providers.custom.models")}</span>
                  <Show when={models().length > 0}>
                    <span class="settings-provider-custom-models-count">
                      {language.plural("settings.providers.custom.models.count", models().length, {
                        count: models().length,
                      })}
                    </span>
                  </Show>
                  <Show when={discovery().type !== "loading"} fallback={<Loader class="size-4" />}>
                    <Button size="small" variant="ghost-muted" onClick={() => dispatch({ type: "discover.start" })}>
                      {language.t("settings.providers.custom.models.fetch")}
                    </Button>
                  </Show>
                </div>
                <Show when={discovery().type === "failed"}>
                  <p class="settings-provider-custom-note" data-tone="danger">
                    {language.t("settings.providers.custom.models.fetchFailed")}
                  </p>
                </Show>
                <Show when={discovered().length > 0}>
                  <MenuScroll class="settings-provider-custom-model-list" viewportClass="max-h-[240px] pe-1">
                    <For each={discovered()}>
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
                {/* An empty selection is a neutral note, not an error: the user has not failed at anything yet. It sits
                    directly under the list it describes, not under the manual field, where it read as a caption for
                    "Add model ID". */}
                <Show when={models().length === 0}>
                  <p class="settings-provider-custom-note">{language.t("settings.providers.custom.models.empty")}</p>
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
                    variant="ghost-muted"
                    icon="plus"
                    aria-label={language.t("settings.providers.custom.models.manual")}
                    onClick={addManual}
                  >
                    {language.t("settings.providers.custom.models.manual.add")}
                  </Button>
                </div>
              </div>
            </Show>
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
        <Button size="normal" variant="ghost-muted" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Show when={step() === "models"}>
          <Button
            size="normal"
            variant="ghost-muted"
            disabled={busy(state())}
            onClick={() => dispatch({ type: "step.back" })}
          >
            {language.t("settings.providers.custom.back")}
          </Button>
        </Show>
        <Show
          when={step() === "details"}
          fallback={
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
          }
        >
          <Button size="normal" variant="submit" onClick={advance}>
            {language.t("settings.providers.custom.next")}
          </Button>
        </Show>
      </DialogFooter>
    </Dialog>
  )
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
