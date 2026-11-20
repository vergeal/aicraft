// LoAF reading is pure: the entry shape is the only input, so truncation, attribution and the phase split are
// covered without a PerformanceObserver.

import { describe, expect, test } from "bun:test"
import { SCRIPT_LIMIT, attribute, createSplitWindow, loafPhases, readLoafEntry, type LoafEntry } from "./loaf"

const entry = (input: {
  startTime?: number
  duration: number
  blockingDuration?: number
  renderStart?: number
  styleAndLayoutStart?: number
  scripts?: Array<{
    duration: number
    invoker?: string
    sourceURL?: string
    sourceFunctionName?: string
    sourceCharPosition?: number
  }>
}): LoafEntry =>
  ({
    name: "long-animation-frame",
    entryType: "long-animation-frame",
    startTime: input.startTime ?? 0,
    duration: input.duration,
    blockingDuration: input.blockingDuration,
    renderStart: input.renderStart,
    styleAndLayoutStart: input.styleAndLayoutStart,
    scripts: input.scripts,
  }) as unknown as LoafEntry

describe("long animation frame", () => {
  test("keeps five scripts but attributes all of them", () => {
    const frame = readLoafEntry(
      entry({
        duration: 220,
        scripts: Array.from({ length: 7 }, (_, index) => ({
          duration: 10,
          invoker: index === 6 ? "MessagePort.onmessage" : "Function",
        })),
      }),
    )

    expect(frame.scripts).toHaveLength(SCRIPT_LIMIT)
    expect(frame.scriptCount).toBe(7)
    expect(frame.scriptDuration).toBe(70)
    expect(frame.attribution).toEqual([
      { invoker: "Function", ms: 60 },
      { invoker: "MessagePort.onmessage", ms: 10 },
    ])
  })

  test("bounds script sources and falls back when an invoker is missing", () => {
    const long = "a".repeat(400)
    const frame = readLoafEntry(
      entry({
        duration: 100,
        scripts: [{ duration: 40, sourceURL: long, sourceCharPosition: -3.4 }],
      }),
    )

    expect(frame.scripts[0].invoker).toBe("unknown")
    expect(frame.scripts[0].sourceURL).toHaveLength(161)
    expect(frame.scripts[0].sourceURL.endsWith("…")).toBe(true)
    expect(frame.scripts[0].sourceCharPosition).toBe(0)
  })

  test("splits the frame into script, style/layout and the rest", () => {
    const frame = readLoafEntry(
      entry({
        startTime: 1_000,
        duration: 200,
        blockingDuration: 120,
        renderStart: 1_050,
        styleAndLayoutStart: 1_150,
        scripts: [{ duration: 50 }, { duration: 30 }],
      }),
    )

    expect(loafPhases(frame)).toEqual({ script: 80, layout: 50, paint: 70 })
  })

  test("clamps a layout phase that would exceed the frame and reports zero progress as zero", () => {
    expect(
      loafPhases(readLoafEntry(entry({ duration: 60, styleAndLayoutStart: 1, scripts: [{ duration: 10 }] }))),
    ).toEqual({ script: 10, layout: 50, paint: 0 })

    expect(loafPhases(readLoafEntry(entry({ duration: 60 })))).toEqual({ script: 0, layout: 0, paint: 60 })
  })

  test("attributes the most expensive invoker first and keeps the limit", () => {
    expect(
      attribute([
        { duration: 5, invoker: "b", sourceURL: "", sourceFunctionName: "", sourceCharPosition: 0 },
        { duration: 20, invoker: "a", sourceURL: "", sourceFunctionName: "", sourceCharPosition: 0 },
        { duration: 15, invoker: "a", sourceURL: "", sourceFunctionName: "", sourceCharPosition: 0 },
        { duration: 30, invoker: "c", sourceURL: "", sourceFunctionName: "", sourceCharPosition: 0 },
      ]),
    ).toEqual([
      { invoker: "a", ms: 35 },
      { invoker: "c", ms: 30 },
      { invoker: "b", ms: 5 },
    ])
  })
})

describe("main-thread split window", () => {
  test("is null, not zero, until a long frame lands in the window", () => {
    const split = createSplitWindow()

    expect(split.read()).toEqual({ script: null, layout: null, paint: null, frames: 0 })
  })

  test("reads accumulated long-frame time as percentages and resets after a sample", () => {
    const split = createSplitWindow()
    split.add(readLoafEntry(entry({ duration: 100, scripts: [{ duration: 50 }] })))
    split.add(readLoafEntry(entry({ duration: 100, scripts: [{ duration: 100 }] })))

    expect(split.read()).toEqual({ script: 75, layout: 0, paint: 25, frames: 2 })

    split.reset()
    expect(split.read()).toEqual({ script: null, layout: null, paint: null, frames: 0 })
  })
})
