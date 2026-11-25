import { describe, expect, test } from "bun:test"
import { DEFAULT_SETTINGS, MemoryQuery, MemoryReference } from "../src/index.js"
import { SCOPES, seeded } from "./fixtures.js"

/**
 * Mechanics of the vector channel, driven by the deterministic fake. The fake is not a
 * semantic model: its cosine values land far below a real embedding model's (measured
 * 2026-11: relevant 0.12-0.27, unrelated floor up to ~0.20 on a bulk corpus), so these tests
 * override the threshold for the fake instead of asserting DEFAULT_SETTINGS values. Which
 * absolute threshold bge-small needs is a golden-set spike question, not a unit-test question.
 */
const FAKE = { ...DEFAULT_SETTINGS, vectorThreshold: 0.1, vectorTopK: 3 }

describe("vector channel — trigger+vector mode", () => {
  test("an entry the model never asked for reaches the block through cosine similarity", async () => {
    const memory = await seeded({ embedder: true, settings: FAKE })
    const turn = await memory.onTurn({ query: "重启应用", scopes: SCOPES })
    expect(turn.entries.map((record) => record.id)).toContain("mem_restart")
    expect(turn.decision.vectorHits).toContain("mem_restart")
    expect(turn.decision.mode).toBe("trigger+vector")
  })

  test("a non-injectable type found by vectors is skipped, not injected", async () => {
    const memory = await seeded({ embedder: true, settings: FAKE })
    const turn = await memory.onTurn({ query: "重启应用", scopes: SCOPES })
    expect(turn.entries.map((record) => record.id)).not.toContain("mem_cdp")
    expect(turn.decision.skipped).toContainEqual({ id: "mem_cdp", reason: "auto_inject_type" })
  })

  test("candidates under the threshold are reported as below_threshold — the calibration ledger", async () => {
    const memory = await seeded({ embedder: true, settings: { ...FAKE, vectorThreshold: 0.18 } })
    const turn = await memory.onTurn({ query: "颜色硬编码", scopes: SCOPES })
    expect(turn.entries.map((record) => record.id)).toContain("mem_cssvars")
    expect(turn.decision.skipped.some((skip) => skip.reason === "below_threshold")).toBe(true)
  })

  test("a query with no similarity anywhere injects nothing", async () => {
    const memory = await seeded({ embedder: true, settings: FAKE })
    const turn = await memory.onTurn({ query: "今天天气怎么样", scopes: SCOPES })
    expect(turn.injectBlock).toBe("")
    expect(turn.decision.vectorHits).toHaveLength(0)
  })

  test("vectors never override the type partition for the trigger channel", async () => {
    const memory = await seeded({ embedder: true, settings: { ...FAKE, vectorThreshold: 0.05 } })
    const turn = await memory.onTurn({ query: "pp", scopes: SCOPES })
    expect(turn.entries.map((record) => record.id)).toContain("mem_pp")
    expect(turn.decision.triggerHits).toEqual(["mem_pp"])
  })

  test("identical queries stay byte-identical across turns with the vector channel on", async () => {
    const memory = await seeded({ embedder: true, settings: FAKE })
    const first = await memory.onTurn({ query: "分支命名规范", scopes: SCOPES })
    const second = await memory.onTurn({ query: "分支命名规范", scopes: SCOPES })
    expect(first.injectBlock).toBe(second.injectBlock)
    expect(first.injectBlock.length).toBeLessThanOrEqual(FAKE.maxInjectedChars)
  })

  test("search keeps retrieval-only types reachable while the turn block stays empty for them", async () => {
    const memory = await seeded({ embedder: true, settings: FAKE })
    const result = await memory.search({ query: "液态玻璃", scopes: SCOPES })
    expect(result.records.map((record) => record.id)).toContain("mem_plastic")
    const turn = await memory.onTurn({ query: "液态玻璃", scopes: SCOPES })
    expect(turn.entries.map((record) => record.id)).not.toContain("mem_plastic")
  })
})

describe("cosine", () => {
  test("identical vectors score 1 and orthogonal vectors score 0", () => {
    expect(MemoryQuery.cosine([1, 2, 2], [1, 2, 2])).toBeCloseTo(1)
    expect(MemoryQuery.cosine([1, 0], [0, 1])).toBe(0)
  })

  test("a zero vector never divides by zero", () => {
    expect(MemoryQuery.cosine([0, 0], [1, 1])).toBe(0)
  })

  test("the fake embedder is deterministic and normalized", async () => {
    const embedder = MemoryReference.createFakeEmbedder()
    const first = await embedder.embed("分支命名规范")
    const second = await embedder.embed("分支命名规范")
    expect(first).toEqual(second)
    expect(first).toHaveLength(embedder.dimensions)
    expect(Math.sqrt(first.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1)
  })
})
