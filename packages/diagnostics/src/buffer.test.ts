// The capture window has no DOM dependencies, so its trimming rules and per-source funnel are covered here
// instead of in the renderer.

import { describe, expect, test } from "bun:test"
import { createCapture } from "./buffer"

const entry = (source: string, t: number, type = "test") => ({
  t,
  wall: 1_700_000_000_000 + t,
  type,
  data: { source },
  source,
})

describe("capture window", () => {
  test("keeps the newest events when the size limit is hit and attributes evictions", () => {
    const capture = createCapture({ windowMs: 60_000, maxEvents: 3, sources: ["dom", "input"] })

    for (let t = 0; t < 5; t++) capture.push(entry(t % 2 === 0 ? "dom" : "input", t))

    expect(capture.count()).toBe(3)
    expect(capture.dropped()).toBe(2)
    expect(capture.events().map((event) => event.t)).toEqual([2, 3, 4])
    expect(capture.sources()).toEqual([
      { name: "dom", observed: 0, recorded: 3, dropped: 1 },
      { name: "input", observed: 0, recorded: 2, dropped: 1 },
    ])
  })

  test("trims by age as well as by count", () => {
    const capture = createCapture({ windowMs: 1_000, maxEvents: 100, sources: ["dom"] })

    capture.push(entry("dom", 0))
    capture.push(entry("dom", 500))
    capture.push(entry("dom", 1_500))

    expect(capture.events().map((event) => event.t)).toEqual([500, 1_500])
    expect(capture.dropped()).toBe(1)
    expect(capture.sources()).toEqual([{ name: "dom", observed: 0, recorded: 3, dropped: 1 }])
  })

  test("reports observed separately from recorded and never leaks the source field", () => {
    const capture = createCapture({ windowMs: 60_000, maxEvents: 10, sources: ["layout"] })

    capture.observe("layout", 7)
    capture.push(entry("layout", 0))
    capture.observe("layout")

    expect(capture.sources()).toEqual([{ name: "layout", observed: 8, recorded: 1, dropped: 0 }])
    expect(Object.keys(capture.events()[0]).sort()).toEqual(["data", "t", "type", "wall"])
  })

  test("registers an unknown source instead of dropping its numbers", () => {
    const capture = createCapture({ windowMs: 60_000, maxEvents: 10, sources: ["dom"] })

    capture.push(entry("late", 0))

    expect(capture.sources().map((stat) => stat.name)).toEqual(["dom", "late"])
  })

  test("clear empties the window and resets the counters", () => {
    const capture = createCapture({ windowMs: 60_000, maxEvents: 1, sources: ["dom"] })

    capture.push(entry("dom", 0))
    capture.push(entry("dom", 1))
    capture.clear()

    expect(capture.count()).toBe(0)
    expect(capture.dropped()).toBe(0)
    expect(capture.sources()).toEqual([{ name: "dom", observed: 0, recorded: 0, dropped: 0 }])
    expect(capture.events()).toEqual([])
  })
})
