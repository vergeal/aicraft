import { describe, expect, test } from "bun:test"
import { traceSegments } from "../src/diagnostics/segments"
import type { SpanRecord } from "../src/diagnostics/spans"

const span = (overrides: Partial<SpanRecord>): SpanRecord => ({
  traceID: "trace",
  spanID: "span",
  name: "Work",
  startWall: 1_000,
  durationMs: 10,
  attributes: {},
  status: "ok",
  ...overrides,
})

describe("traceSegments", () => {
  test("groups model transport spans by trace and phase, slowest trace first", () => {
    const segments = traceSegments([
      span({ traceID: "b", name: "SessionModelTransport.connect", durationMs: 20 }),
      span({ traceID: "b", name: "SessionModelTransport.send", durationMs: 40 }),
      span({ traceID: "b", name: "Vcs.refreshBranch", durationMs: 500 }),
      span({ traceID: "a", name: "SessionModelTransport.send", durationMs: 10 }),
    ])
    expect(segments).toEqual([
      {
        traceID: "b",
        totalMs: 60,
        segments: [
          { phase: "send", spans: 1, durationMs: 40 },
          { phase: "connect", spans: 1, durationMs: 20 },
        ],
      },
      { traceID: "a", totalMs: 10, segments: [{ phase: "send", spans: 1, durationMs: 10 }] },
    ])
  })

  test("sums repeated phases in one trace", () => {
    const [trace] = traceSegments([
      span({ traceID: "t", name: "SessionModelTransport.send", durationMs: 30 }),
      span({ traceID: "t", name: "SessionModelTransport.send", durationMs: 15 }),
    ])
    expect(trace).toEqual({ traceID: "t", totalMs: 45, segments: [{ phase: "send", spans: 2, durationMs: 45 }] })
  })

  test("ignores spans that are not model transport", () => {
    expect(traceSegments([span({ name: "LocationWatcher.reconcile" })])).toEqual([])
  })
})
