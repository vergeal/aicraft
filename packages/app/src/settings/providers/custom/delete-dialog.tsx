import { Button } from "@aicraft/ui/button"
import { useDialog } from "@aicraft/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@aicraft/ui/dialog"
import { Icon } from "@aicraft/ui/icon"
import { Loader } from "@aicraft/ui/loader"
import { createSignal, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { formatServerError } from "@/runtime/server/errors"
import { showToast } from "@/shell/notifications/toast"
import { busy, closed, transition, type CustomProviderEffect, type CustomProviderState } from "./machine"
import "./editor.css"

/**
 * Removes a custom provider from the configuration and deletes any key stored for it. The confirmation owns its own
 * request: a failed delete keeps the sheet open and reports inside it, so the page never pairs a closed dialog with a
 * toast that explains what went wrong.
 */
export function DialogDeleteCustomProvider(props: {
  directory?: string
  providerID: string
  name: string
  /** How many models and stored credentials the removal takes with it. */
  models: number
  accounts: number
  onDeleted?: () => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const server = useServerSDK()

  const [state, setState] = createSignal<CustomProviderState>(
    transition(
      closed,
      { type: "delete.requested", attempt: 1, providerID: props.providerID, name: props.name },
      { taken: [] },
    ).state,
  )

  const run = (effect: CustomProviderEffect) => {
    if (effect.type === "delete.run") {
      void removeCustomProvider(server, props.directory, effect.providerID).then(
        () => dispatch({ type: "delete.succeeded", attempt: effect.attempt }),
        (cause: unknown) => {
          dispatch({ type: "delete.failed", attempt: effect.attempt, message: formatServerError(cause, language.t) })
        },
      )

      return
    }

    if (effect.type !== "toast.deleted") return

    dialog.close()
    showToast({
      variant: "success",
      icon: "circle-check",
      title: language.t("settings.providers.custom.toast.deleted", { provider: effect.providerName }),
    })
    props.onDeleted?.()
  }

  const dispatch = (event: Parameters<typeof transition>[1]) => {
    const result = transition(state(), event, { taken: [] })
    setState(result.state)
    result.effects.forEach(run)
  }

  const error = () => {
    const current = state()
    return current.type === "confirmingDelete" ? current.error : undefined
  }

  return (
    <Dialog fit class="settings-provider-delete-dialog" preventBackdropDismiss={busy(state())}>
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={language.t("settings.providers.custom.delete.title", { provider: props.name })}
          description={language.t("settings.providers.custom.delete.description", { provider: props.providerID })}
        />
      </DialogHeader>
      <DialogBody flush>
        <ul data-component="settings-provider-delete-details">
          <Show when={props.models > 0}>
            <li>
              <Icon name="circle-exclamation" size="small" />
              <span>{language.plural("settings.providers.custom.delete.models", props.models)}</span>
            </li>
          </Show>
          <Show when={props.accounts > 0}>
            <li>
              <Icon name="circle-exclamation" size="small" />
              <span>{language.plural("settings.providers.custom.delete.accounts", props.accounts)}</span>
            </li>
          </Show>
        </ul>
      </DialogBody>
      <DialogFooter>
        <Show when={error()}>{(message) => <p role="alert">{message()}</p>}</Show>
        <Button variant="neutral" autofocus disabled={busy(state())} onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button variant="danger" disabled={busy(state())} onClick={() => dispatch({ type: "delete.confirmed" })}>
          <Show when={busy(state())}>
            <Loader class="size-4" />
          </Show>
          {language.t("settings.providers.custom.delete.confirm")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

async function removeCustomProvider(
  server: ReturnType<typeof useServerSDK>,
  directory: string | undefined,
  providerID: string,
) {
  const location = directory ? { directory } : undefined
  const integration = await server.api.integration
    .get({ integrationID: providerID, location })
    .catch(() => undefined)
  const credentials = integration?.data?.connections.filter((item) => item.type === "credential") ?? []
  await Promise.all(credentials.map((credential) => server.api.credential.remove({ credentialID: credential.id })))
  // Remove the provider last: the integration only disappears once the configuration no longer declares it.
  await server.api.config.update({ providers: { [providerID]: null } })
}
