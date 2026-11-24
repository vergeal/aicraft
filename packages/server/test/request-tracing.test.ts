import { expect, test } from "bun:test"
import { Effect, Logger, Option, References, Scope, Tracer } from "effect"
import { HttpMiddleware, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http"
import { it } from "../../core/test/lib/effect"
import { ServerProcess } from "../src/process"
import {
  CurrentRequestTrace,
  parseTraceparent,
  requestTrace,
  withoutParentSpan,
  type TraceContext,
} from "../src/request-tracing"

test("requests ignore ambient parents and continue inbound trace context", async () => {
  const spans: Tracer.NativeSpan[] = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  const app = Effect.gen(function* () {
    yield* Scope.Scope
    return yield* HttpMiddleware.tracer(Effect.succeed(HttpServerResponse.empty()))
  })
  const request = (traceparent?: string) =>
    app.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(
          new Request("http://localhost/trace", {
            headers: traceparent === undefined ? undefined : { traceparent },
          }),
        ),
      ),
      withoutParentSpan,
    )

  await Effect.runPromise(
    Effect.gen(function* () {
      yield* request()
      yield* request()
      yield* request("00-11111111111111111111111111111111-2222222222222222-01")
      yield* Effect.yieldNow
    }).pipe(Effect.withSpan("fixture.lifecycle"), Effect.provideService(Tracer.Tracer, tracer), Effect.scoped),
  )

  const requests = spans.filter((span) => span.kind === "server")
  expect(requests).toHaveLength(3)
  expect(requests[0]?.traceId).not.toBe(requests[1]?.traceId)
  expect(Option.getOrUndefined(requests[0]?.parent ?? Option.none())).toBeUndefined()
  expect(Option.getOrUndefined(requests[1]?.parent ?? Option.none())).toBeUndefined()
  expect(requests[2]?.traceId).toBe("11111111111111111111111111111111")
  expect(Option.getOrUndefined(requests[2]?.parent ?? Option.none())?.spanId).toBe("2222222222222222")
})

it.live("handler spans nest under their request, not under server startup", () => {
  const spans: Tracer.NativeSpan[] = []
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return Effect.gen(function* () {
    const server = yield* ServerProcess.start<never, never>({
      hostname: "127.0.0.1",
      port: 0,
      password: "secret",
      app: { version: "test" },
      database: { path: ":memory:" },
      fs: { filewatcher: false },
    })
    const response = yield* Effect.promise(() =>
      fetch(new URL("/api/session", HttpServer.formatAddress(server.address)), {
        method: "POST",
        headers: { authorization: `Basic ${btoa("aicraft:secret")}`, "content-type": "application/json" },
        body: JSON.stringify({ title: "Traced" }),
      }),
    )
    expect(response.status).toBe(200)

    const startup = spans.find((span) => span.name === "ServerProcess.start")
    const request = spans.find((span) => span.kind === "server" && span.attributes.get("http.route") === "/api/session")
    const create = spans.find((span) => span.name === "Session.create")
    expect(request).toBeDefined()
    expect(Option.isNone(request!.parent)).toBe(true)
    expect(create?.traceId).toBe(request!.traceId)
    expect(create?.traceId).not.toBe(startup?.traceId)
  }).pipe(Effect.withTracer(tracer), Effect.scoped)
})

const inbound = "00-11111111111111111111111111111111-2222222222222222-01"

test("decodes only well-formed W3C traceparent values", () => {
  expect(parseTraceparent(inbound)).toEqual({
    traceID: "11111111111111111111111111111111",
    spanID: "2222222222222222",
    sampled: true,
  })
  expect(parseTraceparent("00-11111111111111111111111111111111-2222222222222222-00")?.sampled).toBe(false)
  expect(parseTraceparent(undefined)).toBeUndefined()
  expect(parseTraceparent("")).toBeUndefined()
  expect(parseTraceparent("01-11111111111111111111111111111111-2222222222222222-01")).toBeUndefined()
  expect(parseTraceparent("00-1111-2222222222222222-01")).toBeUndefined()
  expect(parseTraceparent("00-11111111111111111111111111111111-2222-01")).toBeUndefined()
  expect(parseTraceparent("00-11111111111111111111111111111111-2222222222222222-0g")).toBeUndefined()
  expect(parseTraceparent("00-11111111111111111111111111111111-2222222222222222-01-extra")).toBeUndefined()
  expect(parseTraceparent("00-00000000000000000000000000000000-2222222222222222-01")).toBeUndefined()
  expect(parseTraceparent("00-11111111111111111111111111111111-0000000000000000-01")).toBeUndefined()
  expect(parseTraceparent("00-1111111111111111111111111111111A-2222222222222222-01")).toBeUndefined()
})

test("records an accepted traceparent on the request span, its logs and handlers", async () => {
  const spans: Tracer.NativeSpan[] = []
  const annotations: Array<Record<string, unknown>> = []
  const logger = Logger.make<unknown, void>((options) => {
    annotations.push({ ...options.fiber.getRef(References.CurrentLogAnnotations) })
  })
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  const seen: Array<Option.Option<TraceContext>> = []
  const app = Effect.gen(function* () {
    yield* Scope.Scope
    return yield* HttpMiddleware.tracer(
      requestTrace(
        Effect.gen(function* () {
          seen.push(yield* CurrentRequestTrace)
          yield* Effect.log("handled")
          return HttpServerResponse.empty()
        }),
      ),
    )
  })
  const request = (traceparent: string) =>
    app.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request("http://localhost/trace", { headers: { traceparent } })),
      ),
      withoutParentSpan,
      Effect.provide(Logger.layer([logger], { mergeWithExisting: false })),
      Effect.provideService(Tracer.Tracer, tracer),
      Effect.scoped,
    )

  await Effect.runPromise(request(inbound))

  expect(Option.getOrUndefined(seen[0]!)).toEqual({
    traceID: "11111111111111111111111111111111",
    spanID: "2222222222222222",
    sampled: true,
  })
  const span = spans.find((candidate) => candidate.kind === "server")!
  expect(span.attributes.get("aicraft.trace.id")).toBe("11111111111111111111111111111111")
  expect(span.attributes.get("aicraft.trace.parent_span_id")).toBe("2222222222222222")
  expect(annotations).toEqual([{ traceID: "11111111111111111111111111111111", spanID: "2222222222222222" }])
})

test("leaves a request without a usable traceparent unchanged", async () => {
  const spans: Tracer.NativeSpan[] = []
  const annotations: Array<Record<string, unknown>> = []
  const logger = Logger.make<unknown, void>((options) => {
    annotations.push({ ...options.fiber.getRef(References.CurrentLogAnnotations) })
  })
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  const seen: Array<Option.Option<TraceContext>> = []
  const app = Effect.gen(function* () {
    yield* Scope.Scope
    return yield* HttpMiddleware.tracer(
      requestTrace(
        Effect.gen(function* () {
          seen.push(yield* CurrentRequestTrace)
          yield* Effect.log("handled")
          return HttpServerResponse.empty()
        }),
      ),
    )
  })

  await Effect.runPromise(
    app.pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request("http://localhost/trace", { headers: { traceparent: "b3" } })),
      ),
      withoutParentSpan,
      Effect.provide(Logger.layer([logger], { mergeWithExisting: false })),
      Effect.provideService(Tracer.Tracer, tracer),
      Effect.scoped,
    ),
  )

  expect(Option.isNone(seen[0]!)).toBe(true)
  expect(annotations).toEqual([{}])
  const span = spans.find((candidate) => candidate.kind === "server")!
  expect(span.attributes.get("aicraft.trace.id")).toBeUndefined()
  expect(span.attributes.get("aicraft.trace.parent_span_id")).toBeUndefined()
})
