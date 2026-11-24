import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { formatSql, measure, snapshot, trim, type Entry } from "@aicraft/core/database/slow-query"

const entry = (overrides: Partial<Entry> = {}): Entry => ({
  sql: "SELECT 1",
  durationMs: 60,
  at: 1_000,
  ...overrides,
})

describe("formatSql", () => {
  test("collapses whitespace", () => {
    expect(formatSql("SELECT\n  *\n  FROM session\n WHERE id = ?\n")).toBe("SELECT * FROM session WHERE id = ?")
  })

  test("caps a statement that would dominate the dump", () => {
    const formatted = formatSql(`SELECT ${"x".repeat(1_000)}`)
    expect(formatted).toHaveLength(401)
    expect(formatted.endsWith("…")).toBe(true)
  })

  test("leaves placeholders untouched", () => {
    expect(formatSql("INSERT INTO t (a, b) VALUES (?, ?)")).toBe("INSERT INTO t (a, b) VALUES (?, ?)")
  })
})

describe("trim", () => {
  test("drops entries that ended before the window", () => {
    const trimmed = trim([entry({ at: 0 }), entry({ at: 9_950, durationMs: 100 })], 20_000, 10_000)
    expect(trimmed.entries.map((kept) => kept.at)).toEqual([9_950])
    expect(trimmed.dropped).toBe(1)
  })

  test("keeps the newest entries when over the cap", () => {
    const trimmed = trim([entry({ at: 1 }), entry({ at: 2 }), entry({ at: 3 })], 4, 10_000, 2)
    expect(trimmed.entries.map((kept) => kept.at)).toEqual([2, 3])
    expect(trimmed.dropped).toBe(1)
  })
})

describe("measure", () => {
  test("records a statement that crosses the threshold", async () => {
    await Effect.runPromise(measure("SELECT slow", Effect.sleep("60 millis")))
    expect(snapshot().map((kept) => kept.sql)).toContain("SELECT slow")
  })

  test("leaves a fast statement alone", async () => {
    await Effect.runPromise(measure("SELECT fast", Effect.void))
    expect(snapshot().map((kept) => kept.sql)).not.toContain("SELECT fast")
  })

  test("attributes a slow statement to the span that ran it", async () => {
    await Effect.runPromise(
      measure("SELECT attributed", Effect.sleep("60 millis")).pipe(Effect.withSpan("Schedule.tick")),
    )
    const entry = snapshot().find((kept) => kept.sql === "SELECT attributed")
    expect(entry?.span).toBe("Schedule.tick")
    expect(entry?.traceID).toHaveLength(32)
    expect(entry?.spanID).toHaveLength(16)
  })
})
