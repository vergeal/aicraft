// The two retention layers are the part that outlives the hot window, so their downsample rates, windows, caps
// and drop counts are covered here. Feeding a capture at the same time proves the layers are copies: reading
// them never consumes the dump's own event budget.

import { describe, expect, test } from "bun:test"
import { createCapture } from "./buffer"
import { createRetention } from "./retention"
import type { DiagnosticsEvent } from "./types"

const event = (t: number, type: string, data: unknown = {}): DiagnosticsEvent => ({
  t,
  wall: 1_700_000_000_000 + t,
  type,
  data,
})

const types = (events: DiagnosticsEvent[]) => events.map((entry) => entry.type)

describe("warm layer", () => {
  test("keeps one perf event per ten seconds", () => {
    const retention = createRetention()

    for (const t of [0, 5_000, 10_000, 10_500]) retention.push(event(t, "perf"))

    const warm = retention.section().warm
    expect(warm.events.map((entry) => entry.t)).toEqual([0, 10_000])
    expect(warm.dropped).toBe(2)
  })

  test("keeps one dom and one layout.rect event per five seconds, on separate clocks", () => {
    const retention = createRetention()

    retention.push(event(0, "dom"))
    retention.push(event(1_000, "dom"))
    retention.push(event(1_000, "layout.rect"))
    retention.push(event(5_000, "dom"))
    retention.push(event(6_000, "layout.rect"))

    const warm = retention.section().warm
    expect(warm.events.map((entry) => [entry.t, entry.type])).toEqual([
      [0, "dom"],
      [1_000, "layout.rect"],
      [5_000, "dom"],
      [6_000, "layout.rect"],
    ])
    expect(warm.dropped).toBe(1)
  })

  test("keeps every failure-type event and every mark, scroll reset and leak suspect", () => {
    const retention = createRetention()
    const kept = ["error", "unhandledrejection", "network.error", "memory.suspect", "mark", "scroll.reset"]

    for (let index = 0; index < 6; index++) {
      for (const type of kept) retention.push(event(1_000, type))
    }

    const warm = retention.section().warm
    expect(warm.events).toHaveLength(kept.length * 6)
    expect(warm.dropped).toBe(0)
  })

  test("trims past ten minutes and counts what it evicts", () => {
    const retention = createRetention()

    retention.push(event(0, "error"))
    retention.push(event(599_999, "error"))
    retention.push(event(600_001, "error"))

    const warm = retention.section().warm
    expect(warm.events.map((entry) => entry.t)).toEqual([599_999, 600_001])
    expect(warm.dropped).toBe(1)
  })

  test("caps the layer at three thousand events", () => {
    const retention = createRetention()

    for (let index = 0; index <= 3_000; index++) retention.push(event(index * 10, "error"))

    const warm = retention.section().warm
    expect(warm.events).toHaveLength(3_000)
    expect(warm.events[0].t).toBe(10)
    expect(warm.dropped).toBe(1)
  })
})

describe("cold layer", () => {
  test("drops everything outside the failure allowlist and says so", () => {
    const retention = createRetention()

    retention.push(event(0, "dom"))
    retention.push(event(1_000, "network"))
    retention.push(event(2_000, "input.key"))

    const cold = retention.section().cold
    expect(cold.events).toEqual([])
    expect(cold.dropped).toBe(3)
  })

  test("keeps only long tasks of two hundred milliseconds or more", () => {
    const retention = createRetention()

    retention.push(event(0, "longtask", { ms: 199 }))
    retention.push(event(1_000, "longtask", { ms: 200 }))

    const cold = retention.section().cold
    expect(cold.events.map((entry) => entry.t)).toEqual([1_000])
    expect(cold.dropped).toBe(1)
  })

  test("keeps one perf event per second and one hour", () => {
    const retention = createRetention()

    retention.push(event(0, "perf"))
    retention.push(event(500, "perf"))
    retention.push(event(1_000, "perf"))
    retention.push(event(3_600_001, "error"))
    retention.push(event(3_600_002, "perf"))

    const cold = retention.section().cold
    expect(cold.events.map((entry) => [entry.t, entry.type])).toEqual([
      [1_000, "perf"],
      [3_600_001, "error"],
      [3_600_002, "perf"],
    ])
    // The first perf pair lost 500ms, the 0ms perf aged out of the hour and nothing else was kept.
    expect(cold.dropped).toBe(2)
  })

  test("caps the layer at five hundred events", () => {
    const retention = createRetention()

    for (let index = 0; index <= 500; index++) retention.push(event(index * 1_000, "error"))

    const cold = retention.section().cold
    expect(cold.events).toHaveLength(500)
    expect(cold.events[0].t).toBe(1_000)
    expect(cold.dropped).toBe(1)
  })
})

describe("layered retention", () => {
  test("reports both windows in seconds", () => {
    const retention = createRetention()
    retention.push(event(0, "error"))

    const section = retention.section()
    expect(section.warm.windowSeconds).toBe(600)
    expect(section.cold.windowSeconds).toBe(3_600)
    expect(types(section.warm.events)).toEqual(["error"])
    expect(types(section.cold.events)).toEqual(["error"])
  })

  test("keeps its own copies, so the sections never take from the capture budget", () => {
    const capture = createCapture({ windowMs: 60_000, maxEvents: 4, sources: ["network", "mark"] })
    const retention = createRetention()

    for (let t = 0; t < 10; t++) {
      const entry = { ...event(t, t === 5 ? "mark" : "network"), source: t === 5 ? "mark" : "network" }
      capture.push(entry)
      retention.push(entry)
    }

    // The hot layer trimmed itself to its own four events; the layers still hold their own copies.
    expect(capture.count()).toBe(4)
    expect(capture.dropped()).toBe(6)
    expect(retention.section().warm.events).toHaveLength(10)
    expect(retention.section().warm.dropped).toBe(0)
    expect(retention.section().cold.events).toHaveLength(1)
    expect(retention.section().cold.events[0].type).toBe("mark")
  })

  test("clear resets both layers", () => {
    const retention = createRetention()
    retention.push(event(0, "error"))
    retention.push(event(0, "dom"))
    retention.push(event(1_000, "dom"))

    retention.clear()
    const section = retention.section()

    expect(section.warm).toEqual({ windowSeconds: 600, events: [], dropped: 0 })
    expect(section.cold).toEqual({ windowSeconds: 3_600, events: [], dropped: 0 })
  })
})
