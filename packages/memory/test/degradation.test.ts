import { describe, expect, test } from "bun:test"
import { DEFAULT_SETTINGS, MemoryReference, MemorySubsystem } from "../src/index.js"
import type { Embedder } from "../src/index.js"
import { SCOPES, TURN_GOLD, fixedClock, seeded } from "./fixtures.js"

describe("degradation — the memory system must never fail the request", () => {
  test("no embedder at all: trigger and lexical channels keep carrying turns", async () => {
    const memory = await seeded()
    const trigger = await memory.onTurn({ query: "pp", scopes: SCOPES })
    expect(trigger.entries.map((record) => record.id)).toContain("mem_pp")
    const lexical = await memory.onTurn({ query: "分支命名规范", scopes: SCOPES })
    expect(lexical.entries.map((record) => record.id)).toContain("mem_branch")
  })

  test("an embedder that rejects never propagates: save degrades, turns still hit triggers", async () => {
    const failing: Embedder = { dimensions: 96, embed: () => Promise.reject(new Error("binary missing")) }
    const store = MemoryReference.createStore()
    const memory = MemorySubsystem.createSubsystem({ store, embedder: failing, clock: fixedClock() })
    const saved = await memory.save({ scope: "global", type: "preference", text: "临时命令缩写 xx = 实验", trigger: "xx" })
    expect(saved.record.embedding).toEqual([])
    const turn = await memory.onTurn({ query: "xx", scopes: SCOPES })
    expect(turn.entries.map((record) => record.id)).toContain(saved.record.id)
  })

  test("inject off renders nothing at all", async () => {
    const memory = await seeded({ settings: { ...DEFAULT_SETTINGS, inject: "off" } })
    for (const gold of TURN_GOLD) {
      const turn = await memory.onTurn({ query: gold.query, scopes: SCOPES })
      expect(turn.injectBlock).toBe("")
      expect(turn.decision.injected).toHaveLength(0)
    }
  })

  test("trigger mode auto-injects only exact surface forms, no fuzzy channels", async () => {
    const memory = await seeded({ settings: { ...DEFAULT_SETTINGS, inject: "trigger" } })
    const hit = await memory.onTurn({ query: "pp", scopes: SCOPES })
    expect(hit.entries.map((record) => record.id)).toContain("mem_pp")
    const miss = await memory.onTurn({ query: "分支怎么命名要求", scopes: SCOPES })
    expect(miss.entries.map((record) => record.id)).not.toContain("mem_branch")
  })

  test("empty query injects nothing", async () => {
    const memory = await seeded()
    const turn = await memory.onTurn({ query: "   ", scopes: SCOPES })
    expect(turn.injectBlock).toBe("")
  })
})
