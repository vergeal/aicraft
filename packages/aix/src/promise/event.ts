import type { AicraftEvent } from "@aicraft/client"
import type { SelectedEvent, SubscribeOptions } from "@aicraft/client/promise/api"

type EventType = Exclude<AicraftEvent["type"], "server.connected">

export interface EventDomain {
  readonly subscribe: <Type extends EventType = EventType>(
    options?: SubscribeOptions<Type>,
  ) => AsyncIterable<SelectedEvent<AicraftEvent, Type>>
}
