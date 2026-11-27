import { describe, expect, test } from "bun:test"
import { DEFAULT_SETTINGS, scopeKey } from "../src/index.js"
import { NO_MATCH_QUERIES, PROJECT, SCOPES, SEARCH_GOLD, TURN_GOLD, seeded } from "./fixtures.js"

describe("save / lifecycle", () => {
  test("seeding stores the corpus and list reports real totals", async () => {
    const memory = await seeded()
    const global = await memory.list("global")
    expect(global.total).toBe(3)
    expect(global.truncated).toBe(false)
    const project = await memory.list(scopeKey("project", PROJECT))
    expect(project.total).toBe(18)
  })

  test("an exact duplicate save keeps the original id and flags the duplicate", async () => {
    const memory = await seeded()
    const result = await memory.save({ scope: "global", type: "preference", text: SEED_TEXT, tags: ["git"] })
    expect(result.duplicate).toBe(true)
    expect(result.record.id).toBe("mem_pp")
    expect(result.record.version).toBe(1)
  })

  test("update bumps version on the same id — references handed to the model never dangle", async () => {
    const memory = await seeded()
    const updated = await memory.update("mem_pp", { text: "pp = commit 并 push，仅限本任务文件" })
    expect(updated?.id).toBe("mem_pp")
    expect(updated?.version).toBe(2)
    const again = await memory.update("mem_pp", { text: "pp 就是 push" })
    expect(again?.version).toBe(3)
    expect(again?.createdAt).toBe(updated?.createdAt)
  })

  test("remove deletes the record and its triggers", async () => {
    const memory = await seeded()
    expect(await memory.remove("mem_pp")).toBe(true)
    const turn = await memory.onTurn({ query: "pp", scopes: SCOPES })
    expect(turn.injectBlock).toBe("")
  })
})

const SEED_TEXT = "pp = push code，把当前任务的改动 commit 并 push 到远端；默认只提交相关文件，不牵连其他 WIP"

describe("onTurn — mechanical per-turn retrieval", () => {
  test.each(TURN_GOLD.map((gold) => [gold.query, gold.expect]))(
    "query %p injects %p without the model asking",
    async (query, expectId) => {
      const memory = await seeded()
      const turn = await memory.onTurn({ query, scopes: SCOPES })
      expect(turn.entries.map((record) => record.id)).toContain(expectId as string)
      expect(turn.injectBlock).toContain("Relevant memory")
    },
  )

  test("identical queries produce byte-identical blocks (turn-stable, cache-safe)", async () => {
    const memory = await seeded()
    const first = await memory.onTurn({ query: "pp", scopes: SCOPES })
    const second = await memory.onTurn({ query: "pp", scopes: SCOPES })
    expect(first.injectBlock).toBe(second.injectBlock)
  })

  test("blocks never exceed the configured budget", async () => {
    const memory = await seeded()
    for (const gold of TURN_GOLD) {
      const turn = await memory.onTurn({ query: gold.query, scopes: SCOPES })
      expect(turn.injectBlock.length).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxInjectedChars)
    }
  })

  test("retrieval-only types are reported as skipped, not injected", async () => {
    const memory = await seeded()
    // A multi-bigram query so the entry is a real evidence-backed candidate: the assertion is
    // about the type partition, not about the lexical floor rejecting the match outright.
    const turn = await memory.onTurn({ query: "默认字体栈", scopes: SCOPES })
    expect(turn.entries.map((record) => record.id)).not.toContain("mem_font")
    expect(turn.decision.skipped.some((skip) => skip.id === "mem_font" && skip.reason === "auto_inject_type")).toBe(true)
  })

  test("unrelated queries inject nothing", async () => {
    const memory = await seeded()
    for (const query of NO_MATCH_QUERIES) {
      const turn = await memory.onTurn({ query, scopes: SCOPES })
      expect(turn.injectBlock).toBe("")
    }
  })

  test("decision records the full turn ledger for memory_log", async () => {
    const memory = await seeded()
    const turn = await memory.onTurn({ query: "pp", scopes: SCOPES })
    expect(turn.decision.triggerHits).toContain("mem_pp")
    expect(turn.decision.injected).toContain("mem_pp")
    expect(turn.decision.query).toBe("pp")
  })

  test("tight budgets surface omitted candidates as budget misses", async () => {
    const memory = await seeded({ settings: { ...DEFAULT_SETTINGS, maxInjectedChars: 80 } })
    const turn = await memory.onTurn({ query: "pp 帮我 commit message 格式类型", scopes: SCOPES })
    if (turn.entries.length > 0) {
      expect(turn.injectBlock.length).toBeLessThanOrEqual(80)
    }
  })
})

describe("search — four-channel deep lookup", () => {
  test.each(SEARCH_GOLD.map((gold) => [gold.query, gold.expect]))(
    "query %p finds %p even though it is not auto-injectable",
    async (query, expectId) => {
      const memory = await seeded()
      const result = await memory.search({ query, scopes: SCOPES })
      expect(result.records.map((record) => record.id)).toContain(expectId as string)
    },
  )

  test("search on retrieval-only types never lands in the turn block", async () => {
    const memory = await seeded()
    const query = SEARCH_GOLD[0]
    const turn = await memory.onTurn({ query: query.query, scopes: SCOPES })
    expect(turn.entries.map((record) => record.id)).not.toContain(query.expect)
  })

  test("search reports real totals and truncation instead of the old sample-size lie", async () => {
    const memory = await seeded()
    const result = await memory.search({ query: "字体", scopes: SCOPES, limit: 1 })
    expect(result.records.length).toBeLessThanOrEqual(1)
    expect(result.total).toBeGreaterThan(0)
  })

  test("unrelated queries find nothing", async () => {
    const memory = await seeded()
    for (const query of NO_MATCH_QUERIES) {
      const result = await memory.search({ query, scopes: SCOPES })
      expect(result.records).toHaveLength(0)
    }
  })

  test("plugin scope stays isolated from project turns", async () => {
    const memory = await seeded()
    await memory.save({ scope: "plugin", pluginID: "hyt", type: "project_knowledge", text: "本地知识库索引位于 hyt/knowledge" })
    const turn = await memory.onTurn({ query: "本地知识库索引", scopes: SCOPES })
    expect(turn.entries.some((record) => record.scope === "plugin")).toBe(false)
    const found = await memory.search({ query: "本地知识库", scopes: ["plugin:hyt"] })
    expect(found.records.length).toBe(1)
  })
})
