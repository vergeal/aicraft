/** W3C Trace Context (`traceparent`) propagation for the promise client's request transport. */
export const TRACEPARENT = "traceparent"

/**
 * The trace a frontend operation wants its outgoing requests attributed to.
 *
 * `sampled` defaults to `true`, matching the `01` flags the renderer generates.
 */
export interface TraceContext {
  readonly traceID: string
  readonly spanID: string
  readonly sampled?: boolean
}

/** Encodes a W3C `traceparent` header value. */
export function formatTraceparent(context: TraceContext): string {
  return `00-${context.traceID}-${context.spanID}-${context.sampled === false ? "00" : "01"}`
}

/**
 * Wraps a `fetch` so every request carries the trace context the caller supplies at send time.
 *
 * Without a context the request is forwarded untouched, and a `traceparent` the caller already set
 * is preserved, so tracing never changes existing request behavior or retry semantics.
 */
/** What Bun's `preconnect` accepts; the helper is absent in browsers, so the whole member is optional. */
type PreconnectOptions = { dns?: boolean; tcp?: boolean; http?: boolean; https?: boolean }
type Preconnect = { preconnect?: (url: string | URL, options?: PreconnectOptions) => void }

export function withTraceparent(
  fetch: typeof globalThis.fetch,
  trace: () => TraceContext | undefined,
): typeof globalThis.fetch {
  // Read the helper off the wrapped fetch instead of the global type: the desktop typecheck resolves
  // `fetch` from the DOM lib, which does not declare it.
  const preconnect = (fetch as typeof globalThis.fetch & Preconnect).preconnect

  return Object.assign(
    (input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => {
      const context = trace()
      if (context === undefined) return fetch(input, init)
      const headers = new Headers(init?.headers)
      if (!headers.has(TRACEPARENT)) headers.set(TRACEPARENT, formatTraceparent(context))
      return fetch(input, { ...init, headers })
    },
    {
      // Keep Bun's connection warm-up working; the browser has no such helper, so this is a no-op there.
      preconnect: (url: string | URL, options?: PreconnectOptions) => preconnect?.(url, options),
    },
  )
}
