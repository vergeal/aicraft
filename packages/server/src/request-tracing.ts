import { Context, Effect, Option, Tracer } from "effect"
import { HttpServerRequest, type HttpServerResponse } from "effect/http"

/** W3C Trace Context header, as accepted from and propagated by upstream clients. */
export const TRACEPARENT = "traceparent"

/** Trace the caller propagated for the request currently being served. */
export interface TraceContext {
  readonly traceID: string
  readonly spanID: string
  readonly sampled: boolean
}

const traceIDPattern = /^[0-9a-f]{32}$/
const spanIDPattern = /^[0-9a-f]{16}$/
const flagsPattern = /^[0-9a-f]{2}$/
const zeroPattern = /^0+$/

/**
 * Decodes a W3C `traceparent` header.
 *
 * Only version `00` with non-zero, lowercase trace and span identifiers is accepted; anything else
 * yields `undefined` so an absent or malformed header leaves the request untouched.
 */
export function parseTraceparent(value: string | undefined): TraceContext | undefined {
  if (value === undefined) return undefined
  const parts = value.split("-")
  if (parts.length !== 4) return undefined
  const [version, traceID, spanID, flags] = parts
  if (version !== "00") return undefined
  if (!traceIDPattern.test(traceID) || !spanIDPattern.test(spanID) || !flagsPattern.test(flags)) return undefined
  if (zeroPattern.test(traceID) || zeroPattern.test(spanID)) return undefined
  return { traceID, spanID, sampled: (Number.parseInt(flags, 16) & 1) === 1 }
}

/**
 * Trace context of the request being served, readable from any effect that runs inside it.
 *
 * Handlers and spans mount their work on this trace by yielding the reference, for example
 * `const trace = yield* CurrentRequestTrace`.
 */
export const CurrentRequestTrace = Context.Reference<Option.Option<TraceContext>>(
  "@aicraft/server/request-tracing/current",
  { defaultValue: () => Option.none() },
)

/**
 * Records the accepted `traceparent` on the request span and its logs, and exposes it to handlers.
 *
 * Apply inside the request span (the tracer middleware wraps whatever app or middleware it is given),
 * so the annotations land on the request span rather than on the server startup span.
 */
export const requestTrace = <E, R>(
  app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R | HttpServerRequest.HttpServerRequest>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, E, R | HttpServerRequest.HttpServerRequest> =>
  Effect.withFiber((fiber) => {
    const trace = parseTraceparent(
      Context.getUnsafe(fiber.context, HttpServerRequest.HttpServerRequest).headers[TRACEPARENT],
    )
    if (trace === undefined) return app
    return Effect.andThen(
      Effect.annotateCurrentSpan({
        "aicraft.trace.id": trace.traceID,
        "aicraft.trace.parent_span_id": trace.spanID,
      }),
      app,
    ).pipe(
      Effect.annotateLogs({ traceID: trace.traceID, spanID: trace.spanID }),
      Effect.provideService(CurrentRequestTrace, Option.some(trace)),
    )
  })

// ParentSpan is optional, so removing it never takes away a requirement of the effect.
export const withoutParentSpan = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.updateContext(
      (context: Context.Context<R>) => Context.omit(Tracer.ParentSpan)(context) as Context.Context<R>,
    ),
  )
