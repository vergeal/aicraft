import { describe, expect, test } from "bun:test"
import type { DiagnosticsDocument } from "@opencode/diagnostics"
import { trimForDepth } from "./export"

const retention = {
  warm: { windowSeconds: 600, events: [], dropped: 0 },
  cold: { windowSeconds: 3_600, events: [], dropped: 0 },
}

function documentWith(sections: Record<string, unknown>): DiagnosticsDocument {
  return {
    schema: "opencode.diagnostics.v2",
    generatedAt: "2024-01-01T00:00:00.000Z",
    timeOrigin: 0,
    capture: { windowSeconds: 60, events: 0, dropped: 0, startedAt: "2024-01-01T00:00:00.000Z", sources: [] },
    environment: {},
    metrics: {
      fps: 60,
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
    },
    events: [],
    dom: { html: "", truncated: false, nodes: 0 },
    sections,
    notes: [],
  }
}

describe("trimForDepth", () => {
  test("hot drops the whole retention section and leaves the other sections alone", () => {
    const dump = documentWith({ state: { route: "home" }, retention })
    const trimmed = trimForDepth(dump, "hot")

    expect(trimmed.sections.retention).toBeUndefined()
    expect(trimmed.sections.state).toEqual({ route: "home" })
  })

  test("warm keeps the downsampled layer and drops the hour-long one", () => {
    const trimmed = trimForDepth(documentWith({ retention }), "warm")

    expect(trimmed.sections.retention).toEqual({ warm: retention.warm })
  })

  test("cold returns the dump the collector built", () => {
    const dump = documentWith({ retention })

    expect(trimForDepth(dump, "cold")).toBe(dump)
  })

  test("trimming never mutates the dump it was given", () => {
    const dump = documentWith({ retention })

    trimForDepth(dump, "hot")
    trimForDepth(dump, "warm")

    expect(dump.sections).toEqual({ retention })
  })
})
