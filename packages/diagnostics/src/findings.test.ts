import { describe, expect, test } from "bun:test"
import { makeDumpFixture } from "../test/fixtures"
import { summarize, type Findings } from "./findings"

const ORIGIN = 1_700_000_000_000

type FixtureEvent = { t: number; wall: number; type: string; data: unknown }

function at(t: number, type: string, data: unknown): FixtureEvent {
  return { t, wall: Math.round(ORIGIN + t), type, data }
}

function dump(events: FixtureEvent[]) {
  return makeDumpFixture({
    events,
    capture: {
      windowSeconds: 60,
      events: events.length,
      dropped: 0,
      startedAt: "2023-11-14T22:12:21.000Z",
      sources: [],
    },
  })
}

function only(findings: Findings, kind: string) {
  return findings.timeline.filter((finding) => finding.kind === kind)
}

describe("summarize", () => {
  test("reports the capture window and raw event counts from the dump", () => {
    const findings = summarize(makeDumpFixture())

    expect(findings.generatedAt).toBe("2023-11-14T22:13:21.000Z")
    expect(findings.window).toEqual({ seconds: 60, events: 8, dropped: 2 })
    expect(findings.counts).toEqual({
      error: 1,
      unhandledrejection: 0,
      networkError: 1,
      longTask: 0,
      layoutShift: 1,
      mark: 0,
    })
  })

  test("produces nothing for an empty capture and says which kinds had no data", () => {
    const findings = summarize(dump([]))

    expect(findings.timeline).toEqual([])
    expect(findings.counts.error).toBe(0)
    expect(findings.notes.some((note) => note.startsWith("error.burst"))).toBe(true)
  })

  test("error.burst fires at five faults inside sixty seconds and aggregates fingerprints", () => {
    const findings = summarize(
      dump([
        at(1_000, "error", { message: "a", fingerprint: "fp1" }),
        at(2_000, "error", { message: "a", fingerprint: "fp1" }),
        at(3_000, "unhandledrejection", { reason: "x", fingerprint: "fp2" }),
        at(4_000, "network.error", { method: "POST", url: "/api/prompt?token=secret#x", ms: 10 }),
        at(5_000, "error", { message: "b", fingerprint: "fp1" }),
      ]),
    )
    const bursts = only(findings, "error.burst")

    expect(bursts).toHaveLength(1)
    expect(bursts[0].severity).toBe("error")
    expect(bursts[0].at).toEqual({ t: 1_000, wall: ORIGIN + 1_000 })
    expect(bursts[0].evidence).toMatchObject({
      fromT: 1_000,
      toT: 5_000,
      total: 5,
      error: 3,
      unhandledrejection: 1,
      networkError: 1,
    })
    expect(bursts[0].evidence.fingerprints).toEqual([
      { fingerprint: "fp1", count: 3 },
      { fingerprint: "fp2", count: 1 },
      { fingerprint: "POST /api/prompt?token", count: 1 },
    ])
  })

  test("error.burst stays quiet below the threshold and outside the window", () => {
    const findings = summarize(
      dump([
        at(1_000, "error", { message: "a", fingerprint: "fp1" }),
        at(2_000, "error", { message: "a", fingerprint: "fp2" }),
        at(3_000, "error", { message: "a", fingerprint: "fp3" }),
        at(4_000, "error", { message: "a", fingerprint: "fp4" }),
        at(71_000, "error", { message: "a", fingerprint: "fp5" }),
        at(72_000, "error", { message: "a", fingerprint: "fp6" }),
        at(73_000, "error", { message: "a", fingerprint: "fp7" }),
        at(74_000, "error", { message: "a", fingerprint: "fp8" }),
      ]),
    )

    expect(only(findings, "error.burst")).toHaveLength(0)
  })

  test("error.group keeps groups with at least two hits and ranks by count before trimming", () => {
    const findings = summarize(
      dump(
        [2, 3, 4, 5, 6, 7].map((count, index) =>
          at(1_000 * (index + 1), "error.group", { count, signature: `sig-${count}`, message: `m${count}` }),
        ),
      ),
    )
    const groups = only(findings, "error.group")

    expect(groups).toHaveLength(5)
    expect(groups.map((finding) => finding.evidence.count)).toEqual([3, 4, 5, 6, 7])
    expect(groups.map((finding) => finding.at.t)).toEqual([2_000, 3_000, 4_000, 5_000, 6_000])
    expect(groups[4].hint).toContain("sig-7")
  })

  test("network.failure aggregates by method and sanitized url, with statuses and retries", () => {
    const findings = summarize(
      dump([
        at(1_000, "network.error", { method: "POST", url: "/api/x?token=1", status: 500, ms: 40, error: "TypeError" }),
        at(1_500, "network.retry", { method: "POST", url: "/api/x?token=1", attempt: 2, gapMs: 500 }),
        at(1_600, "network.error", { method: "POST", url: "/api/x?token=1", status: 502, ms: 60, error: "TypeError" }),
        at(1_700, "network", { method: "GET", url: "/api/y", status: 404, ok: false, ms: 10 }),
      ]),
    )
    const failures = only(findings, "network.failure")

    expect(failures).toHaveLength(2)
    expect(failures[0].title).toContain("POST /api/x?token 失败 ×2")
    expect(failures[0].evidence).toMatchObject({
      method: "POST",
      url: "/api/x?token",
      count: 2,
      statuses: [500, 502],
      retries: 2,
      slowestMs: 60,
    })
    expect(failures[1].title).toContain("GET /api/y 失败 ×1（404）")
  })

  test("network.slow keeps the five slowest requests above one second", () => {
    const findings = summarize(
      dump(
        [1_100, 1_200, 1_300, 1_400, 1_500, 1_600].map((ms, index) =>
          at(1_000 * (index + 1), "network", { method: "GET", url: `/api/slow/${ms}`, status: 200, ok: true, ms }),
        ),
      ),
    )
    const slow = only(findings, "network.slow")

    expect(slow).toHaveLength(5)
    expect(slow.map((finding) => finding.evidence.ms)).toEqual([1_200, 1_300, 1_400, 1_500, 1_600])
    expect(slow[0].severity).toBe("warn")
  })

  test("layout.drift aggregates rect changes by selector and ignores scroll-only moves", () => {
    const findings = summarize(
      dump([
        at(1_000, "layout.rect", {
          changes: [
            {
              target: "div[data-slot=timeline]#0",
              from: { x: 0, y: 0, w: 100, h: 100 },
              to: { x: 0, y: 12, w: 100, h: 100 },
              stacking: false,
            },
          ],
        }),
        at(2_000, "layout.rect", {
          changes: [
            {
              target: "div[data-slot=timeline]#1",
              from: { x: 0, y: 12, w: 100, h: 100 },
              to: { x: 0, y: 30, w: 100, h: 100 },
              stacking: false,
            },
            {
              target: "div[data-slot=composer]#2",
              from: { x: 0, y: 0, w: 10, h: 10 },
              to: { x: 0, y: 0, w: 10, h: 10 },
              scroll: { from: 100, to: 0 },
            },
            {
              target: "div[data-slot=sidebar]#3",
              from: { x: 0, y: 0, w: 10, h: 10 },
              to: { x: 1, y: 0, w: 10, h: 10 },
              stacking: true,
            },
          ],
        }),
        at(2_100, "layout.shift", { value: 0.12, sources: ["div[data-slot=composer]"] }),
      ]),
    )
    const drift = only(findings, "layout.drift")

    expect(drift).toHaveLength(2)
    const timeline = drift.find((finding) => finding.evidence.selector === "div[data-slot=timeline]")
    expect(timeline?.evidence).toMatchObject({
      selector: "div[data-slot=timeline]",
      moves: 2,
      totalPx: 30,
      maxPx: 18,
      firstT: 1_000,
      lastT: 2_000,
    })
    expect(drift.some((finding) => finding.evidence.selector === "div[data-slot=composer]")).toBe(false)

    const shift = drift.find((finding) => finding.kind === "layout.drift" && finding.evidence.entries === 1)
    expect(shift?.evidence).toMatchObject({ total: 0.12, max: 0.12 })
    expect(shift?.title).toContain("累积布局偏移")
  })

  test("layout.shift only produces a finding once the total reaches 0.1", () => {
    const findings = summarize(
      dump([at(1_000, "layout.shift", { value: 0.032 }), at(2_000, "layout.shift", { value: 0.09 })]),
    )
    const shift = only(findings, "layout.drift").filter((finding) => finding.evidence.entries !== undefined)

    expect(shift).toHaveLength(1)
    expect(shift[0].evidence.total).toBe(0.122)
  })

  test("scroll.reset attributes a reset to a program call, input activity, or neither", () => {
    const timeline = "div > div > div[data-slot=timeline]"
    const reset = [
      at(1_000, "scroll", { target: timeline, top: 400, left: 0, height: 4_820 }),
      at(1_100, "scroll", { target: timeline, top: 0, left: 0, height: 4_820 }),
    ]

    const unknown = summarize(dump(reset))
    expect(only(unknown, "scroll.reset")[0].evidence).toMatchObject({
      from: 400,
      to: 0,
      inputEvents: 0,
      suspect: "unknown",
    })
    expect(only(unknown, "scroll.reset")[0].hint).toContain("既无程序化滚动证据也无输入证据")
    // A reset nobody can attribute stays actionable; one the user caused is context, so it yields to real warnings.
    expect(only(unknown, "scroll.reset")[0].severity).toBe("warn")

    const program = summarize(
      dump([
        ...reset,
        at(1_050, "scroll.program", {
          target: timeline,
          kind: "scrollTo",
          from: { top: 400, left: 0 },
          to: { top: 0, left: 0 },
          stack: [{ fn: "setScroll", file: "/src/components/timeline.tsx", line: 88 }],
        }),
      ]),
    )
    const attributed = only(program, "scroll.reset")[0]
    expect(attributed.evidence).toMatchObject({
      suspect: "program",
      program: { kind: "scrollTo", stack: [{ fn: "setScroll", file: "/src/components/timeline.tsx", line: 88 }] },
    })
    expect(attributed.hint).toContain("/src/components/timeline.tsx:88")

    const input = summarize(dump([...reset, at(1_200, "wheel", { target: timeline, dy: -1, ctrl: false })]))
    expect(only(input, "scroll.reset")[0].evidence).toMatchObject({ suspect: "input", inputEvents: 1 })
    expect(only(input, "scroll.reset")[0].hint).toContain("可能是用户滚动")
    expect(only(input, "scroll.reset")[0].severity).toBe("info")
  })

  test("scroll.reset only counts program calls inside the window and on the same target", () => {
    const reset = [
      at(1_000, "scroll", { target: "#document", top: 800, height: 9_000 }),
      at(1_100, "scroll", { target: "#document", top: 0, height: 9_000 }),
    ]

    const alias = summarize(
      dump([...reset, at(1_000, "scroll.program", { target: "window", kind: "window.scrollTo", stack: [] })]),
    )
    expect(only(alias, "scroll.reset")[0].evidence.suspect).toBe("program")

    const foreign = summarize(
      dump([...reset, at(1_000, "scroll.program", { target: "div[data-slot=composer]", kind: "scrollTo", stack: [] })]),
    )
    expect(only(foreign, "scroll.reset")[0].evidence.suspect).toBe("unknown")

    const distant = summarize(
      dump([...reset, at(8_000, "scroll.program", { target: "#document", kind: "window.scrollTo", stack: [] })]),
    )
    expect(only(distant, "scroll.reset")[0].evidence.suspect).toBe("unknown")
  })

  test("scroll.reset caps at five and ignores resets that keep a non-zero top", () => {
    const events = Array.from({ length: 6 }, (_, index) => index).flatMap((index) => [
      at(3_000 * (index + 1), "scroll", { target: `div[data-slot=list-${index}]`, top: 200, height: 900 }),
      at(3_000 * (index + 1) + 100, "scroll", { target: `div[data-slot=list-${index}]`, top: 0, height: 900 }),
    ])
    events.push(
      at(1_000, "scroll", { target: "div[data-slot=other]", top: 100, height: 900 }),
      at(1_100, "scroll", { target: "div[data-slot=other]", top: 40, height: 900 }),
    )
    const resets = only(summarize(dump(events)), "scroll.reset")

    expect(resets).toHaveLength(5)
    expect(resets[0].evidence.target).toBe("div[data-slot=list-0]")
    expect(resets.some((finding) => finding.evidence.target === "div[data-slot=other]")).toBe(false)
  })

  test("performance.stall covers long tasks, long frames and consecutive low fps", () => {
    const findings = summarize(
      dump([
        at(1_000, "longtask", { ms: 250, name: "self" }),
        at(1_100, "longtask", { ms: 120, name: "self" }),
        at(2_000, "long.frame", {
          duration: 300,
          blockingDuration: 150,
          scriptDuration: 200,
          attribution: [{ invoker: "click", ms: 200 }],
        }),
        at(3_000, "long.frame", { duration: 80, blockingDuration: 40 }),
        at(4_000, "perf", { fps: 20 }),
        at(5_000, "perf", { fps: 22 }),
        at(6_000, "perf", { fps: 40 }),
      ]),
    )
    const stalls = only(findings, "performance.stall")

    expect(stalls).toHaveLength(3)
    expect(stalls.map((finding) => finding.evidence.trigger)).toEqual(["longtask", "long.frame", "fps"])
    expect(stalls[2].evidence).toMatchObject({ fromT: 4_000, toT: 5_000, min: 20 })
    expect(stalls[2].evidence.samples).toEqual([
      { t: 4_000, fps: 20 },
      { t: 5_000, fps: 22 },
    ])
  })

  test("memory.suspect restates the recorder verdict and its rates", () => {
    const findings = summarize(
      dump([
        at(9_000, "memory.suspect", {
          spans: 3,
          seconds: 30,
          nodes: 1_200,
          detached: 40,
          nodesPerMinute: 240,
          detachedPerMinute: 12,
        }),
      ]),
    )
    const suspects = only(findings, "memory.suspect")

    expect(suspects).toHaveLength(1)
    expect(suspects[0].title).toContain("+240/min")
    expect(suspects[0].title).toContain("+12/min")
    expect(suspects[0].evidence).toMatchObject({ spans: 3, seconds: 30, nodes: 1_200, detached: 40 })
  })

  test("mark produces one info per mark event", () => {
    const findings = summarize(
      dump([at(7_000, "mark", { label: "用户点了发送" }), at(8_000, "mark", { name: "stream.stall" })]),
    )
    const marks = only(findings, "mark")

    expect(marks).toHaveLength(2)
    expect(marks.map((finding) => finding.title)).toEqual(["用户点了发送", "stream.stall"])
    expect(marks.every((finding) => finding.severity === "info")).toBe(true)
    expect(findings.counts.mark).toBe(2)
  })

  test("timeline is sorted by time even when the dump is not", () => {
    const findings = summarize(
      dump([
        at(9_000, "mark", { label: "late" }),
        at(1_000, "longtask", { ms: 300 }),
        at(5_000, "mark", { label: "middle" }),
      ]),
    )

    expect(findings.timeline.map((finding) => finding.at.t)).toEqual([1_000, 5_000, 9_000])
  })

  test("trims the timeline to sixty entries and keeps every error before marks", () => {
    const failures = Array.from({ length: 5 }, (_, index) =>
      at(200 + index * 10, "network.error", { method: "GET", url: `/api/fail/${index}`, status: 500, ms: 5 }),
    )
    const marks = Array.from({ length: 70 }, (_, index) => at(1_000 + index * 10, "mark", { label: `m${index}` }))
    const findings = summarize(dump([...marks, ...failures]))

    expect(findings.timeline).toHaveLength(60)
    expect(findings.timeline.filter((finding) => finding.severity === "error")).toHaveLength(6)
    expect(only(findings, "mark")).toHaveLength(54)
    expect(findings.notes.some((note) => note.includes("裁掉 16 条"))).toBe(true)
  })
})
