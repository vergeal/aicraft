import { afterEach, describe, expect, it, setSystemTime } from "bun:test"
import { createRing, logTime, recentLogLines } from "./diagnostics-ring"

// The ring and the log filter read `Date.now()` themselves, so the tests move the system clock
// instead of taking an injectable clock.
const START = new Date("2026-11-20T10:00:00.000Z").getTime()

afterEach(() => setSystemTime())

describe("createRing", () => {
  it("drops samples once they leave the window and counts them", () => {
    setSystemTime(START)
    const ring = createRing<{ at: number; id: string }>({ windowMs: 60_000, max: 10 })

    ring.push({ at: Date.now(), id: "a" })
    setSystemTime(START + 61_000)

    expect(ring.values()).toEqual([])
    expect(ring.stats()).toEqual({ observed: 1, recorded: 1, dropped: 1 })
  })

  it("keeps the newest samples when the size limit is reached", () => {
    setSystemTime(START)
    const ring = createRing<{ at: number; id: string }>({ windowMs: 60_000, max: 2 })

    for (const id of ["a", "b", "c"]) ring.push({ at: Date.now(), id })

    expect(ring.values().map((sample) => sample.id)).toEqual(["b", "c"])
    expect(ring.stats()).toEqual({ observed: 3, recorded: 3, dropped: 1 })
  })

  it("counts filtered candidates as observed without recording them", () => {
    setSystemTime(START)
    const ring = createRing<{ at: number; id: string }>({ windowMs: 60_000, max: 10 })

    ring.observe(4)
    ring.push({ at: Date.now(), id: "slow" })

    expect(ring.values().map((sample) => sample.id)).toEqual(["slow"])
    expect(ring.stats()).toEqual({ observed: 5, recorded: 1, dropped: 0 })
  })
})

describe("logTime", () => {
  it("parses electron-log's local-time prefix", () => {
    const local = new Date(2026, 10, 20, 10, 0, 0, 123)

    expect(logTime("[2026-11-20 10:00:00.123] [info] layers ready")).toBe(local.getTime())
  })

  it("ignores continuation lines and other formats", () => {
    expect(logTime("    at runIpc (/app/main.js:1:2)")).toBeNull()
    expect(logTime("2026-11-20 10:00:00 hello")).toBeNull()
  })
})

describe("recentLogLines", () => {
  it("keeps the last lines written inside the window, oldest first", () => {
    setSystemTime(START)
    const at = (offsetMs: number) => START + offsetMs

    const entries = [
      { source: "main", at: at(-70_000), line: "outside the window" },
      { source: "renderer", at: at(-30_000), line: "first inside" },
      { source: "main", at: at(-1_000), line: "second inside" },
    ]

    expect(recentLogLines(entries, { windowMs: 60_000, max: 10 })).toEqual({
      lines: [
        { source: "renderer", at: at(-30_000), line: "first inside" },
        { source: "main", at: at(-1_000), line: "second inside" },
      ],
      truncated: false,
    })
  })

  it("reports truncation when the window holds more lines than the limit", () => {
    setSystemTime(START)
    const at = (offsetMs: number) => START + offsetMs

    const entries = [at(-40_000), at(-20_000), at(-1_000)].map((time, index) => ({
      source: "main",
      at: time,
      line: `line ${index}`,
    }))

    const slice = recentLogLines(entries, { windowMs: 60_000, max: 2 })

    expect(slice.lines.map((entry) => entry.line)).toEqual(["line 1", "line 2"])
    expect(slice.truncated).toBe(true)
  })
})
