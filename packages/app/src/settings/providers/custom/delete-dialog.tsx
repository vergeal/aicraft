import { Button } from "@opencode/ui/button"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
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
        dialog.close()
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

  // `deleting` owns the request, so a repeated confirm finds nothing to start.
  const pending = () => state().type === "deleting"

  return (
    <Dialog class="settings-provider-custom-delete-dialog">
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("settings.providers.custom.delete.title", { provider: props.name })}
          description={language.t("settings.providers.custom.delete.description", { provider: props.providerID })}
        />
      </DialogHeader>
      <DialogFooter>
        <Button size="normal" variant="ghost-muted" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button
          size="normal"
          variant="danger"
          disabled={pending()}
          onClick={() => dispatch({ type: "delete.confirmed" })}
        >
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
  await server.api.experimental.config.update({ providers: { [providerID]: null } })
}
