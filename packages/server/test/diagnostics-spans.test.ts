import { describe, expect, test } from "bun:test"
import { Effect, Tracer } from "effect"
import type { SpanRecord } from "../src/diagnostics/spans"
import { makeTracer, spanSnapshot, toRecord, trim } from "../src/diagnostics/spans"

const span = (overrides: Partial<SpanRecord> = {}): SpanRecord => ({
  traceID: "00000000000000000000000000000001",
  spanID: "0000000000000001",
  name: "Work",
  startWall: 1_000,
  durationMs: 10,
  attributes: {},
  status: "ok",
  ...overrides,
})

const finished = (durationMs: number, failed = false) => ({
  name: "Vcs.refreshBranch",
  spanID: "0000000000000002",
  traceID: "00000000000000000000000000000002",
  startTime: 1_000_000_000n,
  endTime: 1_000_000_000n + BigInt(Math.round(durationMs * 1e6)),
  attributes: new Map<string, unknown>([
    ["opencode.trace.id", "4bf92f3577b34da6a3ce929d0e0e4736"],
    ["client", { id: 1 }],
  ]),
  failed,
})

describe("toRecord", () => {
  test("drops a successful span at or below the threshold", () => {
    expect(toRecord(finished(5))).toBeUndefined()
  })

  test("keeps every failure regardless of duration", () => {
    const record = toRecord(finished(0.4, true))
    expect(record?.status).toBe("error")
    expect(record?.durationMs).toBe(0.4)
  })

  test("keeps a slow span, flattening attributes and deriving wall time", () => {
    const record = toRecord(finished(12.5))
    expect(record).toEqual({
      traceID: "00000000000000000000000000000002",
      spanID: "0000000000000002",
      name: "Vcs.refreshBranch",
      startWall: 1_000,
      durationMs: 12.5,
      attributes: { "opencode.trace.id": "4bf92f3577b34da6a3ce929d0e0e4736", client: "[object Object]" },
      status: "ok",
    })
  })
})

describe("trim", () => {
  test("drops spans that ended before the window", () => {
    const trimmed = trim([span({ startWall: 0 }), span({ startWall: 69_999, durationMs: 2 })], 70_000)
    expect(trimmed.spans.map((entry) => entry.startWall)).toEqual([69_999])
    expect(trimmed.dropped).toBe(1)
  })

  test("keeps the newest spans when over the cap", () => {
    const trimmed = trim([span({ spanID: "a" }), span({ spanID: "b" }), span({ spanID: "c" })], 2_000, 60_000, 2)
    expect(trimmed.spans.map((entry) => entry.spanID)).toEqual(["b", "c"])
    expect(trimmed.dropped).toBe(1)
  })

  test("keeps everything that fits", () => {
    const trimmed = trim([span(), span()], 2_000)
    expect(trimmed.spans).toHaveLength(2)
    expect(trimmed.dropped).toBe(0)
  })
})

test("the recording tracer keeps slow spans and every failure", async () => {
  const tracer = makeTracer(Tracer.make({ span: (options) => new Tracer.NativeSpan(options) }))
  const before = spanSnapshot()
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.sleep("20 millis").pipe(Effect.withSpan("Test.slow"))
      yield* Effect.fail("boom").pipe(Effect.withSpan("Test.failed"), Effect.ignore)
      yield* Effect.void.pipe(Effect.withSpan("Test.fast"))
    }).pipe(Effect.withTracer(tracer)),
  )
  const after = spanSnapshot()
  expect(after.spans.filter((entry) => entry.name.startsWith("Test."))).toMatchObject([
    { name: "Test.slow", status: "ok" },
    { name: "Test.failed", status: "error" },
  ])
  expect(after.dropped - before.dropped).toBe(1)
})
