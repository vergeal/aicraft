import type { AicraftEvent } from "@aicraft/client"
import { useClient } from "./client"

type EventMetadata = {
  directory: string | undefined
}
type AicraftEventMap = { [Type in AicraftEvent["type"]]: Extract<AicraftEvent, { type: Type }> }

export function useEvent() {
  const client = useClient()

  function subscribe(handler: (event: AicraftEvent, metadata: EventMetadata) => void) {
    return client.event.listen(({ details }) => {
      if (details.type === "server.connected") return
      handler(details, { directory: details.location?.directory })
    })
  }

  function on<T extends AicraftEvent["type"]>(
    type: T,
    handler: (event: AicraftEventMap[T], metadata: EventMetadata) => void,
  ) {
    return client.event.on(type, (event) => {
      handler(event, { directory: event.location?.directory })
    })
  }

  return {
    subscribe,
    on,
  }
}
