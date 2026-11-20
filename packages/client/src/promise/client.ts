export * as OpenCode from "./client.js"

import { SharedEvents } from "../shared-events.js"
import { withTraceparent, type TraceContext } from "../trace.js"
import { OpenCode } from "./generated/index.js"
import type { ClientOptions as GeneratedClientOptions } from "./generated/client.js"
import { makeRpc } from "./rpc.js"

export type { RequestOptions } from "./generated/client.js"

export interface ClientOptions extends GeneratedClientOptions {
  /** Supplies the trace context for each outgoing request. Omit it to send requests without `traceparent`. */
  readonly trace?: () => TraceContext | undefined
}

export function make(options: ClientOptions) {
  const { trace, ...rest } = options
  const raw = OpenCode.make(
    trace === undefined ? rest : { ...rest, fetch: withTraceparent(rest.fetch ?? globalThis.fetch, trace) },
  )
  const events = SharedEvents.make((signal, onActivity) => raw.event.subscribe(undefined, { signal, onActivity }))
  return {
    ...raw,
    rpc: Object.assign(makeRpc(raw, events), raw.rpc),
    event: events,
  }
}
