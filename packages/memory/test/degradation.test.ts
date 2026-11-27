import { describe, expect, test } from "bun:test"
import { DEFAULT_SETTINGS, MemoryReference, MemorySubsystem } from "../src/index.js"
import type { Embedder, Store } from "../src/index.js"
import { SCOPES, TURN_GOLD, fixedClock, seeded } from "./fixtures.js"

const BROKEN: Embedder = {
  dimensions: 256,
  version: "missing-binary",
  embed: () => Promise.reject(new Error("llama-embedding binary not shipped")),
  embedAll: () => Promise.reject(new Error("llama-embedding binary not shipped")),
}

function harness(overrides: Partial<Store>): Store {
  const store = MemoryReference.createStore()
  return { ...store, ...overrides }
}

describe("degradation — the memory system must never fail the request", () => {
  test("no embedder at all: trigger and lexical channels keep carrying turns", async () => {
    const memory = await seeded()
    const trigger = await memory.onTurn({ query: "pp", scopes: SCOPES })
    expect(trigger.entries.map((record) => record.id)).toContain("mem_pp")
    expect(trigger.decision.channels.vector).toBe("skipped")
    expect(trigger.decision.channels.lexical).toBe("ran")
    const lexical = await memory.onTurn({ query: "分支命名规范", scopes: SCOPES })
    expect(lexical.entries.map((record) => record.id)).toContain("mem_branch")
  })

  test("an embedder that rejects falls back to the lexical index instead of losing the turn", async () => {
    const memory = MemorySubsystem.createSubsystem({
      store: MemoryReference.createStore(),
      embedder: BROKEN,
      clock: fixedClock(),
    })
    const saved = await memory.save({ scope: "global", type: "preference", text: "临时命令缩写 xx = 实验性重启", trigger: "xx" })
    expect(saved.record.embedding).toBeUndefined()
    expect(saved.record.embedVersion).toBeUndefined()
    const trigger = await memory.onTurn({ query: "xx", scopes: SCOPES })
    expect(trigger.entries.map((record) => record.id)).toContain(saved.record.id)
    expect(trigger.decision.channels.vector).toBe("failed")
    expect(trigger.decision.channels.lexical).toBe("ran")
    const fuzzy = await memory.onTurn({ query: "实验性重启", scopes: SCOPES })
    expect(fuzzy.entries.map((record) => record.id)).toContain(saved.record.id)
  })

  test("a store read that rejects costs one channel, not the turn", async () => {
    const memory = MemorySubsystem.createSubsystem({
      store: harness({ lexicalCandidates: async () => Promise.reject(new Error("database is locked")) }),
      clock: fixedClock(),
    })
    const saved = await memory.save({ scope: "global", type: "preference", text: "缩写 qq = 快速回复", trigger: "qq" })
    const turn = await memory.onTurn({ query: "qq", scopes: SCOPES })
    expect(turn.entries.map((record) => record.id)).toContain(saved.record.id)
    expect(turn.decision.channels.lexical).toBe("failed")
  })

  test("inject off renders nothing at all", async () => {
    const memory = await seeded({ settings: { ...DEFAULT_SETTINGS, inject: "off" } })
    for (const gold of TURN_GOLD) {
      const turn = await memory.onTurn({ query: gold.query, scopes: SCOPES })
      expect(turn.injectBlock).toBe("")
      expect(turn.decision.injected).toHaveLength(0)
      expect(turn.decision.injectedChars).toBe(0)
    }
  })

  test("trigger mode auto-injects only exact surface forms, no fuzzy channels", async () => {
    const memory = await seeded({ settings: { ...DEFAULT_SETTINGS, inject: "trigger" } })
    const hit = await memory.onTurn({ query: "pp", scopes: SCOPES })
    expect(hit.entries.map((record) => record.id)).toContain("mem_pp")
    const miss = await memory.onTurn({ query: "分支命名规范", scopes: SCOPES })
    expect(miss.entries.map((record) => record.id)).not.toContain("mem_branch")
    expect(miss.decision.channels.vector).toBe("skipped")
    expect(miss.decision.channels.lexical).toBe("skipped")
  })

  test("a single shared bigram is coincidence, not evidence: terse phatic queries never auto-inject", async () => {
    // Regression: "继续" tokenizes to one bigram and scored every entry containing it at 1.0,
    // injecting an unrelated timeline note that says "…气泡下方继续" (live memory_log, 2026-11-27).
    const memory = MemorySubsystem.createSubsystem({
      store: MemoryReference.createStore(),
      clock: fixedClock(),
    })
    await memory.save({ scope: "global", type: "convention", text: "引导气泡夹在两段工作之间，工作在气泡下方继续折叠" })
    const turn = await memory.onTurn({ query: "继续", scopes: SCOPES })
    expect(turn.entries).toHaveLength(0)
    expect(turn.injectBlock).toBe("")
    // Two shared bigrams still carry the fallback — the gold-set path stays alive.
    const rich = await memory.onTurn({ query: "气泡下方继续折叠", scopes: SCOPES })
    expect(rich.entries.map((record) => record.text)).toContain("引导气泡夹在两段工作之间，工作在气泡下方继续折叠")
    // The gate is token-class evidence, not query length or a word list: a lone ASCII word
    // token carries identity and still hits, exactly like the reported noise-word case fails.
    const consul = await memory.save({ scope: "global", type: "preference", text: "wpskb 生产的 consul 配置在 etcd 迁移后要保持双写" })
    const word = await memory.onTurn({ query: "consul", scopes: SCOPES })
    expect(word.entries.map((record) => record.id)).toContain(consul.record.id)
    // search is the explicit path and keeps single-bigram hits.
    const found = await memory.search({ query: "继续", scopes: SCOPES })
    expect(found.records).toHaveLength(1)
  })

  test("empty query injects nothing", async () => {
    const memory = await seeded()
    const turn = await memory.onTurn({ query: "   ", scopes: SCOPES })
    expect(turn.injectBlock).toBe("")
  })
})
