import { describe, expect, test } from "bun:test"
import { MemoryInject } from "../src/index.js"
import type { MemoryRecord } from "../src/index.js"

const entry = (id: string, text: string, tags: string[] = []): MemoryRecord => ({
  id,
  scope: "global",
  type: "convention",
  status: "active",
  version: 1,
  text,
  tags,
  textHash: id,
  tokens: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})

describe("renderBlock", () => {
  test("empty input renders the empty string — inject nothing, not an empty section", () => {
    const rendered = MemoryInject.renderBlock([], 1500)
    expect(rendered.block).toBe("")
    expect(rendered.injected).toHaveLength(0)
  })

  test("entries fit within budget", () => {
    const rendered = MemoryInject.renderBlock([entry("a", "甲条目内容"), entry("b", "乙条目内容")], 1500)
    expect(rendered.injected.map((record) => record.id)).toEqual(["a", "b"])
    expect(rendered.omitted).toHaveLength(0)
  })

  test("over-budget entries are omitted and reported, never silently truncated mid-entry beyond the cap", () => {
    const big = entry("x", "长".repeat(500))
    const rendered = MemoryInject.renderBlock([entry("a", "短条目"), big], 200)
    expect(rendered.injected.map((record) => record.id)).toEqual(["a"])
    expect(rendered.omitted.map((record) => record.id)).toEqual(["x"])
  })

  test("a budget smaller than the section header injects nothing rather than a header alone", () => {
    const rendered = MemoryInject.renderBlock([entry("a", "短条目")], 40)
    expect(rendered.block).toBe("")
    expect(rendered.injected).toHaveLength(0)
  })

  test("the rendered block never exceeds the budget it was given", () => {
    const entries = [entry("a", "第一条", ["git"]), entry("b", "第二条"), entry("c", "第三条", ["ui"])]
    for (const budget of [140, 200, 400, 1500]) {
      expect(MemoryInject.renderBlock(entries, budget).block.length).toBeLessThanOrEqual(budget)
    }
  })

  test("lines over MAX_ENTRY_CHARS get ellipsis-capped", () => {
    const line = MemoryInject.entryLine(entry("a", "长".repeat(1000)))
    expect(line.length).toBeLessThanOrEqual(MemoryInject.MAX_ENTRY_CHARS + 40)
    expect(line).toContain("…")
  })

  test("same input renders byte-identical blocks — the prompt-cache stability contract", () => {
    const entries = [entry("a", "第一条", ["git"]), entry("b", "第二条"), entry("a2", "第三条", ["ui"])]
    expect(MemoryInject.renderBlock(entries, 1500).block).toBe(MemoryInject.renderBlock(entries, 1500).block)
  })

  test("short protocol stays a compact fixed section", () => {
    expect(MemoryInject.PROTOCOL_SHORT.length).toBeLessThan(450)
    expect(MemoryInject.PROTOCOL_SHORT).toContain("Memory protocol")
  })
})
