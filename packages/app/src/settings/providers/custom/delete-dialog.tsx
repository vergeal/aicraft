import { ConfirmDialog } from "@aicraft/ui/confirm-dialog"
import { createSignal } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { formatServerError } from "@/runtime/server/errors"
import { showToast } from "@/shell/notifications/toast"
import { closed, transition, type CustomProviderEffect, type CustomProviderState } from "./machine"

/** Removes a custom provider from the configuration and deletes any key stored for it. */
export function DialogDeleteCustomProvider(props: {
  directory?: string
  providerID: string
  name: string
  onDeleted?: () => void
}) {
  const language = useLanguage()
  const server = useServerSDK()

  const [state, setState] = createSignal<CustomProviderState>(
    transition(
      closed,
      { type: "delete.requested", attempt: 1, providerID: props.providerID, name: props.name },
      { taken: [] },
    ).state,
  )

  const run = (effect: CustomProviderEffect) => {
    if (effect.type !== "delete.run") return
    void removeCustomProvider(server, props.directory, effect.providerID).then(
      () => {
        setState(transition(state(), { type: "delete.succeeded", attempt: effect.attempt }, { taken: [] }).state)
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.providers.custom.toast.deleted", { provider: effect.name }),
        })
        props.onDeleted?.()
      },
      (cause: unknown) => {
        setState(transition(state(), { type: "delete.failed", attempt: effect.attempt, message: "" }, { taken: [] }).state)
        showToast({ title: language.t("common.requestFailed"), description: formatServerError(cause, language.t) })
      },
    )
  }

  const dispatch = (event: Parameters<typeof transition>[1]) => {
    const result = transition(state(), event, { taken: [] })
    setState(result.state)
    result.effects.forEach(run)
  }

  return (
    <ConfirmDialog
      title={language.t("settings.providers.custom.delete.title", { provider: props.name })}
      description={language.t("settings.providers.custom.delete.description", { provider: props.providerID })}
      confirmLabel={language.t("settings.providers.custom.delete.confirm")}
      cancelLabel={language.t("common.cancel")}
      tone="danger"
      onConfirm={() => dispatch({ type: "delete.confirmed" })}
    />
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
  await server.api.experimental.config.update({ providers: { [providerID]: null } })
}
