// The freeze thresholds and the three-window cap, covered without a renderer: the freezer only needs an event
// stream and a metrics stream, and the snapshot it keeps is supplied by the caller.

import { describe, expect, test } from "bun:test"
import { createCapture } from "./buffer"
import { createFreezer, type FreezeSnapshot } from "./freeze"
import type { DiagnosticsEvent, DiagnosticsMetrics } from "./types"

const EMPTY: DiagnosticsMetrics = {
  fps: 0,
  frame: 0,
  p95: 0,
  slow: 0,
  stutters: 0,
  longTasks: 0,
  longTaskMax: 0,
  input: 0,
  cls: 0,
  lag: 0,
  heapUsed: 0,
  heapLimit: 0,
  nodes: 0,
  viewport: "",
  trend: [],
}

const event = (t: number, type: string, data: unknown = {}): DiagnosticsEvent => ({
  t,
  wall: 1_700_000_000_000 + t,
  type,
  data,
})

const metrics = (patch: Partial<DiagnosticsMetrics> = {}): DiagnosticsMetrics => ({ ...EMPTY, ...patch })

function harness(snapshot: () => Partial<FreezeSnapshot> = () => ({})) {
  const freezer = createFreezer({
    captureFreeze: () => ({ at: 0, events: [], metrics: EMPTY, ...snapshot() }),
  })

  return { freezer, reasons: () => freezer.section().items.map((item) => item.reason) }
}

describe("freeze thresholds", () => {
  test("needs two consecutive low-fps reports, and one report resets the count", () => {
    const { freezer, reasons } = harness()

    freezer.sample(metrics({ fps: 25 }))
    expect(reasons()).toEqual([])

    freezer.sample(metrics({ fps: 31 }))
    freezer.sample(metrics({ fps: 25 }))
    expect(reasons()).toEqual([])

    freezer.sample(metrics({ fps: 24 }))
    expect(reasons()).toEqual(["fps"])

    // The count starts over, so a third low report does not freeze again.
    freezer.sample(metrics({ fps: 20 }))
    expect(reasons()).toEqual(["fps"])
  })

  test("ignores an unmeasured fps of zero", () => {
    const { freezer, reasons } = harness()

    freezer.sample(metrics({ fps: 0 }))
    freezer.sample(metrics({ fps: 0 }))

    expect(reasons()).toEqual([])
  })

  test("freezes on a single cls increment of 0.1 or more", () => {
    const { freezer, reasons } = harness()

    freezer.sample(metrics({ cls: 0.05 }))
    expect(reasons()).toEqual([])

    freezer.sample(metrics({ cls: 0.15 }))
    expect(reasons()).toEqual(["cls"])

    freezer.sample(metrics({ cls: 0.2 }))
    expect(reasons()).toEqual(["cls"])

    freezer.sample(metrics({ cls: 0.3 }))
    expect(reasons()).toEqual(["cls", "cls"])
  })

  test("freezes when five error-type events land inside sixty seconds", () => {
    const { freezer, reasons } = harness()

    for (const at of [0, 1_000, 2_000, 3_000]) freezer.note(event(at, "error"))
    expect(reasons()).toEqual([])

    freezer.note(event(4_000, "network.error"))
    expect(reasons()).toEqual(["errors"])
  })

  test("counts errors across the three types and ignores the ones outside the window", () => {
    const { freezer, reasons } = harness()

    freezer.note(event(0, "error"))
    freezer.note(event(61_000, "unhandledrejection"))
    freezer.note(event(61_100, "network.error"))
    freezer.note(event(61_200, "error"))
    freezer.note(event(61_300, "error"))
    expect(reasons()).toEqual([])

    freezer.note(event(61_400, "error"))
    expect(reasons()).toEqual(["errors"])
  })

  test("freezes on a long task of 200ms but not on a shorter one", () => {
    const { freezer, reasons } = harness()

    freezer.note(event(1_000, "longtask", { ms: 199 }))
    expect(reasons()).toEqual([])

    freezer.note(event(2_000, "longtask", { ms: 200 }))
    expect(reasons()).toEqual(["longtask"])

    freezer.note(event(3_000, "longtask", { ms: "long" }))
    expect(reasons()).toEqual(["longtask"])
  })
})

describe("freeze windows", () => {
  test("keeps three windows and counts the evicted ones", () => {
    const { freezer } = harness()

    for (const ms of [200, 201, 202, 203]) freezer.note(event(ms, "longtask", { ms }))

    const section = freezer.section()
    expect(section.items).toHaveLength(3)
    expect(section.count).toBe(4)
    expect(section.dropped).toBe(1)
  })

  test("keeps the newest window when the cap is hit", () => {
    let at = 0
    const { freezer } = harness(() => ({ at: (at += 1) }))

    for (let index = 0; index < 4; index++) freezer.freeze("mark")

    expect(freezer.section().items.map((item) => item.at)).toEqual([2, 3, 4])
    expect(freezer.section().dropped).toBe(1)
  })

  test("copies the window without touching the hot layer and trims it to sixty seconds", () => {
    const hot = [event(10_000, "dom"), event(120_000, "error"), event(150_000, "perf")]
    const before = hot.map((entry) => ({ ...entry }))
    const { freezer } = harness(() => ({ at: 150_000, events: hot, metrics: metrics({ fps: 12 }) }))

    freezer.freeze("mark")

    expect(hot).toEqual(before)
    const frozen = freezer.section().items[0]
    expect(frozen.events.map((entry) => entry.t)).toEqual([120_000, 150_000])
    expect(frozen.metrics.fps).toBe(12)
  })

  test("a mark and its freeze land together, and the frozen window holds the mark once", () => {
    const capture = createCapture({ windowMs: 60_000, maxEvents: 100, sources: ["dom", "mark"] })
    let at = 0
    const freezer = createFreezer({
      captureFreeze: () => ({ at, events: capture.events(), metrics: EMPTY }),
    })

    capture.push({ ...event(1_000, "dom"), source: "dom" })
    at = 2_000
    capture.push({ ...event(2_000, "mark", { label: "click" }), source: "mark" })
    freezer.freeze("mark")

    const frozen = freezer.section().items[0]
    expect(frozen.reason).toBe("mark")
    expect(frozen.events.map((entry) => entry.type)).toEqual(["dom", "mark"])
    expect(frozen.events.filter((entry) => entry.type === "mark")).toHaveLength(1)
    // The freeze is a copy: the hot layer still holds exactly the two pushed events.
    expect(capture.count()).toBe(2)
    expect(capture.dropped()).toBe(0)
  })

  test("clear resets the windows and the counters", () => {
    const { freezer } = harness()

    freezer.note(event(1_000, "longtask", { ms: 400 }))
    freezer.clear()

    expect(freezer.section()).toEqual({ count: 0, dropped: 0, items: [] })
  })
})
