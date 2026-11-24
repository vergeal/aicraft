import { useQuery } from "@tanstack/solid-query"
import { createEffect, onCleanup, type Accessor } from "solid-js"
import { useServerSDK } from "@/runtime/server/client"

/**
 * The providers this server's own configuration declares, i.e. the custom OpenAI-compatible ones the user added.
 *
 * The client ships a two-provider allowlist (`catalog/order.ts`), so a configured custom provider is otherwise
 * invisible to every picker: the connect list filters rows by that allowlist, and the model picker sheets list from
 * it too. Those lists now ask `offersProvider` instead, which adds exactly the ids this hook returns.
 *
 * It reads the same query as the Settings > Providers page, down to the cache key, so the two surfaces share one
 * fetch and one `config.updated` invalidation rather than holding two views of the same document.
 */
export function useCustomProviders(directory: Accessor<string | undefined>) {
  const server = useServerSDK()

  const config = useQuery(() => ({
    queryKey: [server.scope, "settings-provider-config", directory()],
    enabled: server.connection.status() === "connected",
    queryFn: async () => {
      const entries = await server.api.config.get({
        location: directory() ? { directory: directory() } : undefined,
      })

      // `customProvidersFrom` is exported by the custom-provider form module. Importing it statically would drag that
      // form onto the composer's model-picker path, and this runs while the sheet is being built.
      const { customProvidersFrom } = await import("@/settings/providers/custom/dialog")

      return customProvidersFrom(entries)
    },
  }))

  createEffect(() => {
    onCleanup(server.event.on("config.updated", () => void config.refetch()))
  })

  return {
    ready: () => !config.isPending,
    list: () => config.data ?? [],
  }
}
