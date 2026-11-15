import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { MenuScroll } from "@opencode/ui/menu-scroll"
import { TextField } from "@opencode/ui/text-field"
import { createMemo, createSignal, For, Show, untrack } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { formatServerError } from "@/runtime/server/errors"
import { showToast } from "@/shell/notifications/toast"
import type { ExperimentalConfigUpdateInput } from "@opencode/client/promise"
import { baseURLError, idError, modelsError, providerConfig, type CustomProviderDraft } from "./draft"
import {
  busy,
  canContinue,
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
    return current.type === "editing" ? current.step : "details"
  }
  const error = () => {
    const current = state()
    return current.type === "editing" ? current.error : undefined
  }
  const discovery = () => {
    const current = state()
    return current.type === "editing" ? current.discovery : ({ type: "idle" } as const)
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

  // The validators return key names, so the field shows the message the specific failure asks for.
  const fieldError = (
    key:
      | "settings.providers.custom.id.invalid"
      | "settings.providers.custom.id.taken"
      | "settings.providers.custom.baseURL.invalid"
      | undefined,
  ) => (key ? language.t(key) : undefined)

  return (
    <Dialog class="settings-provider-custom-dialog" containerClass="settings-provider-custom-dialog" variant="settings">
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={
            mode === "edit"
              ? language.t("settings.providers.custom.title.edit")
              : language.t("settings.providers.custom.title.create")
          }
          description={language.t("settings.providers.custom.description")}
        />
      </DialogHeader>
      <DialogBody class="min-h-0 flex-1 overflow-y-auto" data-scrollable>
        <Show when={draft()}>
          {(value) => (
            <Show
              when={step() === "models"}
              fallback={
                <div class="settings-provider-custom-fields">
                  <TextField
                    label={language.t("settings.providers.custom.name")}
                    placeholder={language.t("settings.providers.custom.name.placeholder")}
                    value={value().name}
                    onInput={(event) => set({ name: event.currentTarget.value })}
                  />
                  <TextField
                    label={language.t("settings.providers.custom.id")}
                    placeholder={language.t("settings.providers.custom.id.placeholder")}
                    description={language.t("settings.providers.custom.id.hint")}
                    error={fieldError(idError(value(), props.taken, mode))}
                    value={value().id}
                    disabled={mode === "edit"}
                    class="settings-provider-custom-mono"
                    onInput={(event) => set({ id: event.currentTarget.value })}
                  />
                  <TextField
                    label={language.t("settings.providers.custom.baseURL")}
                    placeholder={language.t("settings.providers.custom.baseURL.placeholder")}
                    error={fieldError(baseURLError(value()))}
                    value={value().baseURL}
                    class="settings-provider-custom-mono"
                    onInput={(event) => set({ baseURL: event.currentTarget.value })}
                  />
                  <TextField
                    label={language.t("settings.providers.custom.apiKey")}
                    type="password"
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
                  <Show when={discovery().type !== "loading"} fallback={<Loader class="size-4" />}>
                    <Button size="small" variant="ghost-muted" onClick={() => dispatch({ type: "discover.start" })}>
                      {language.t("settings.providers.custom.models.fetch")}
                    </Button>
                  </Show>
                </div>
                <Show when={discovery().type === "failed"}>
                  <p class="settings-provider-custom-note">
                    {language.t("settings.providers.custom.models.fetchFailed")}
                  </p>
                </Show>
                <Show when={discovered().length > 0}>
                  <MenuScroll class="settings-provider-custom-model-list" viewportClass="max-h-[240px]">
                    <For each={discovered()}>
                      {(model) => (
                        <label class="settings-provider-custom-model">
                          <Checkbox
                            checked={models().includes(model.id)}
                            onChange={(checked) => toggleModel(model.id, checked)}
                          />
                          <span class="settings-provider-custom-model-id">{model.name ?? model.id}</span>
                        </label>
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
                  />
                </div>
                <Show when={modelsError(value())}>
                  <p class="settings-provider-custom-error">
                    {language.t("settings.providers.custom.models.required")}
                  </p>
                </Show>
                <Show when={models().length > 0}>
                  <p class="settings-provider-custom-note">
                    {language.plural("settings.providers.custom.models.count", models().length, {
                      count: models().length,
                    })}
                  </p>
                </Show>
              </div>
            </Show>
          )}
        </Show>
      </DialogBody>
      <DialogFooter>
        <Show when={error()}>{(message) => <p class="settings-provider-custom-error">{message()}</p>}</Show>
        <Button size="normal" variant="ghost-muted" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Show when={step() === "models"}>
          <Button size="normal" variant="ghost-muted" onClick={() => dispatch({ type: "step.back" })}>
            {language.t("settings.providers.custom.back")}
          </Button>
        </Show>
        <Show
          when={step() === "details"}
          fallback={
            <Button
              size="normal"
              variant="neutral"
              disabled={busy(state()) || !canSubmit(state(), context)}
              onClick={() => dispatch({ type: "submit.requested" })}
            >
              {mode === "edit"
                ? language.t("settings.providers.custom.save")
                : language.t("settings.providers.custom.create")}
            </Button>
          }
        >
          <Button
            size="normal"
            variant="neutral"
            disabled={!canContinue(state(), context)}
            onClick={() => dispatch({ type: "step.next" })}
          >
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

/** Reads the custom providers the editor may change: those declared in the document the server would write. */
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

export type CustomProvider = ReturnType<typeof customProvidersFrom>[number]
