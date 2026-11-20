import { describe, expect, test } from "bun:test"
import type { DiagnosticsMetrics } from "../types"
import { createScrollInput } from "./input"
import type { RecorderContext } from "./types"

const METRICS = {} as DiagnosticsMetrics

function harness() {
  const events: Array<{ type: string; data: unknown }> = []
  let clock = 0
  let observed = 0
  const ctx = {
    record(type: string, data: unknown) {
      events.push({ type, data })
    },
    observed() {
      observed++
    },
    ignored: () => false,
    pathOf: () => "div > div > div[data-slot=timeline]",
    nodeLabel: () => "div[data-slot=timeline]",
    now: () => clock,
    extra: {},
    metrics: { read: () => METRICS, update: () => METRICS, publish: () => METRICS },
  } satisfies RecorderContext

  return {
    scrollInput: createScrollInput(ctx),
    events,
    observed: () => observed,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

describe("scroll input evidence", () => {
  test("wheel keeps the direction of deltaY and is throttled to one per 250ms", () => {
    const { scrollInput, events, observed, advance } = harness()

    scrollInput.wheel(-120, false, null)
    advance(100)
    scrollInput.wheel(-120, false, null)
    advance(200)
    scrollInput.wheel(240, true, null)

    expect(events).toEqual([
      { type: "wheel", data: { target: "div > div > div[data-slot=timeline]", dy: -1, ctrl: false } },
      { type: "wheel", data: { target: "div > div > div[data-slot=timeline]", dy: 1, ctrl: true } },
    ])
    expect(observed()).toBe(3)
  })

  test("touchmove is throttled to one per 250ms and keeps only the target", () => {
    const { scrollInput, events, observed, advance } = harness()

    scrollInput.touchmove(null)
    advance(249)
    scrollInput.touchmove(null)
    advance(1)
    scrollInput.touchmove(null)

    expect(events).toEqual([
      { type: "touchmove", data: { target: "div > div > div[data-slot=timeline]" } },
      { type: "touchmove", data: { target: "div > div > div[data-slot=timeline]" } },
    ])
    expect(observed()).toBe(3)
  })

  test("a wheel and a touch stream are throttled independently", () => {
    const { scrollInput, events } = harness()

    scrollInput.wheel(100, false, null)
    scrollInput.touchmove(null)

    expect(events.map((event) => event.type)).toEqual(["wheel", "touchmove"])
  })
})
