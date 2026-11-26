import { describe, expect, test } from "bun:test"
import { DEFAULT_SETTINGS, MemoryLifecycle, MemoryReference, MemorySubsystem, MemoryTokens, scopeKey } from "../src/index.js"
import { PROJECT, SCOPES, SEED, bulkFiller, corpus, fixedClock, seeded } from "./fixtures.js"

describe("versioning — ids never dangle", () => {
  test("each update writes a new version row and supersedes the previous one", async () => {
    const memory = await seeded()
    await memory.update("mem_pp", { text: "pp = commit 并 push，仅限本任务文件" })
    await memory.update("mem_pp", { text: "pp 就是 push 当前任务改动" })
    const history = await memory.history("mem_pp")
    expect(history.map((record) => record.version)).toEqual([1, 2, 3])
    expect(history.map((record) => record.status)).toEqual(["superseded", "superseded", "active"])
    expect(history[0].createdAt).toBe(history[2].createdAt)
    expect(history.at(-1)?.text).toBe("pp 就是 push 当前任务改动")
  })

  test("a tags-only edit keeps the stored vector instead of paying for a re-embed", async () => {
    const memory = await seeded({ embedder: true })
    const before = await memory.history("mem_branch")
    const after = await memory.update("mem_branch", { tags: ["git", "naming"] })
    expect(after?.embedding).toEqual(before[0].embedding)
    expect(after?.embedVersion).toBe(before[0].embedVersion)
  })

  test("a text change re-embeds and stamps the current model version", async () => {
    const memory = await seeded({ embedder: true })
    const after = await memory.update("mem_branch", { text: "分支名至多三词，短横线分隔" })
    expect(after?.embedVersion).toBe(MemoryReference.createFakeEmbedder().version)
    expect(after?.embedding?.length).toBe(256)
  })

  test("superseded versions never surface in reads or in the turn block", async () => {
    const memory = await seeded()
    await memory.update("mem_i18n", { text: "文案走 i18n，zh.ts 必须同步补简体中文值" })
    const listing = await memory.list(scopeKey("project", PROJECT), 200)
    expect(listing.records.filter((record) => record.id === "mem_i18n")).toHaveLength(1)
    const turn = await memory.onTurn({ query: "界面文案 zh.ts", scopes: SCOPES })
    expect(turn.injectBlock).toContain("必须同步补")
    expect(turn.injectBlock).not.toContain("新增 key")
  })
})

describe("supersede — contradictions resolve to one live entry", () => {
  test("the replaced entry leaves every read path and points at its replacement", async () => {
    const memory = await seeded()
    const fresh = await memory.save({
      scope: "project",
      projectID: PROJECT,
      type: "convention",
      text: "分支名允许斜杠前缀，例如 feat 斜杠 x",
    })
    expect(await memory.supersede("mem_branch", fresh.record.id)).toBe(true)
    const listing = await memory.list(scopeKey("project", PROJECT), 200)
    expect(listing.records.some((record) => record.id === "mem_branch")).toBe(false)
    expect((await memory.history("mem_branch")).at(-1)?.supersededBy).toBe(fresh.record.id)
    const turn = await memory.onTurn({ query: "分支命名规范", scopes: SCOPES })
    expect(turn.entries.map((record) => record.id)).not.toContain("mem_branch")
    const found = await memory.search({ query: "分支命名规范", scopes: SCOPES })
    expect(found.records.map((record) => record.id)).not.toContain("mem_branch")
  })

  test("superseding is refused for a missing target, a missing replacement, and for itself", async () => {
    const memory = await seeded()
    expect(await memory.supersede("mem_branch", "mem_missing")).toBe(false)
    expect(await memory.supersede("mem_missing", "mem_branch")).toBe(false)
    expect(await memory.supersede("mem_branch", "mem_branch")).toBe(false)
  })

  test("a superseded entry loses its triggers, so a retired abbreviation stops injecting", async () => {
    const memory = await seeded()
    const fresh = await memory.save({ scope: "global", type: "preference", text: "pp 现在表示 push 到评审分支" })
    await memory.supersede("mem_pp", fresh.record.id)
    const turn = await memory.onTurn({ query: "pp", scopes: SCOPES })
    expect(turn.decision.triggerHits).not.toContain("mem_pp")
    expect(turn.entries.map((record) => record.id)).toContain(fresh.record.id)
  })
})

describe("dedup — near-duplicates are refused, not merged", () => {
  test("an exact repeat returns the original id with mode exact", async () => {
    const memory = await seeded()
    const result = await memory.save({
      scope: "global",
      type: "preference",
      text: "回复风格：结论先行，能用表格就不写长段落，保留代码与命令原文",
    })
    expect(result.duplicate).toBe(true)
    expect(result.duplicateMode).toBe("exact")
    expect(result.record.id).toBe("mem_reply")
  })

  test("a paraphrase reports the existing entry and its score, and adds no row", async () => {
    const memory = await seeded()
    const before = await memory.list("global", 200)
    const result = await memory.save({
      scope: "global",
      type: "preference",
      text: "回复风格：结论先行，能用表格就不写长段落，保留代码与命令原文，别写废话",
    })
    expect(result.duplicate).toBe(true)
    expect(result.duplicateMode).toBe("near")
    expect(result.duplicateScore).toBeGreaterThanOrEqual(DEFAULT_SETTINGS.nearDuplicateThreshold)
    expect((await memory.list("global", 200)).total).toBe(before.total)
  })

  test("a related but distinct fact still gets its own row", async () => {
    const memory = await seeded()
    const result = await memory.save({
      scope: "global",
      type: "preference",
      text: "评审意见写在行内评论里，不用总体评论，避免二次沟通",
    })
    expect(result.duplicate).toBe(false)
  })

  test("containment is symmetric: a subset collapses on either save direction, a distinct fact does not", () => {
    const detailed = MemoryTokens.tokenize("commit message 采用 conventional 格式 type scope summary 类型限 feat fix docs chore refactor test")
    const subset = MemoryTokens.tokenize("commit message 格式")
    expect(MemoryLifecycle.containment(subset, detailed)).toBe(MemoryLifecycle.containment(detailed, subset))
    // A terse restatement of an existing entry is a duplicate by design: the detailed record
    // is the better one, and the caller updates instead of inserting.
    expect(MemoryLifecycle.containment(subset, detailed)).toBe(1)
    const distinct = MemoryTokens.tokenize("commit 摘要保持一句话 不写实现细节")
    expect(MemoryLifecycle.containment(distinct, detailed)).toBeLessThan(DEFAULT_SETTINGS.nearDuplicateThreshold)
  })

  test("the bulk corpus does not collapse under dedup — scale is a design input", async () => {
    const memory = MemorySubsystem.createSubsystem({ store: MemoryReference.createStore(), clock: fixedClock() })
    let inserted = 0
    for (const entry of bulkFiller()) {
      const result = await memory.save({
        scope: entry.scope,
        projectID: entry.scope === "project" ? PROJECT : undefined,
        type: entry.type,
        text: entry.text,
        tags: entry.tags,
        id: entry.id,
      })
      inserted += result.duplicate ? 0 : 1
    }
    expect(inserted).toBe(400)
  })

  test("a differently-worded paraphrase falls to the vector gate when containment misses", async () => {
    // The real failure shape: six sessions saving one habit in six phrasings, each clear of
    // the 0.85 lexical gate. Fixed unit vectors stand in for the semantic model here — the
    // fake embedder is not semantic, so its scores would prove nothing (see AGENTS.md).
    const store = MemoryReference.createStore({ records: [semanticRow("mem_habit", [1, 0])] })
    const memory = MemorySubsystem.createSubsystem({ store, embedder: fixedVectorEmbedder([1, 0]), clock: fixedClock() })
    const result = await memory.save({ scope: "global", type: "convention", text: "换一种说法记录同一个习惯要求" })
    expect(result.duplicate).toBe(true)
    expect(result.duplicateMode).toBe("semantic")
    expect(result.record.id).toBe("mem_habit")
    expect((await memory.list("global", 200)).total).toBe(1)
  })

  test("a related fact below the semantic gate still gets its own row", async () => {
    // [0.8, 0.6] scores 0.8 against the fresh vector — same neighborhood, different fact.
    // The conservative default threshold exists so this case keeps inserting.
    const store = MemoryReference.createStore({ records: [semanticRow("mem_neighbour", [0.8, 0.6])] })
    const memory = MemorySubsystem.createSubsystem({ store, embedder: fixedVectorEmbedder([1, 0]), clock: fixedClock() })
    const result = await memory.save({ scope: "global", type: "convention", text: "另一件相关但不是同一件事的记录" })
    expect(result.duplicate).toBe(false)
    expect((await memory.list("global", 200)).total).toBe(2)
  })

  test("dedup spans scopes: re-saving a global entry into a project returns the global row", async () => {
    const memory = await seeded()
    const text = "周报每周五下午交，格式随意但内容要实"
    await memory.save({ scope: "global", type: "convention", text })
    const result = await memory.save({ scope: "project", projectID: PROJECT, type: "convention", text })
    expect(result.duplicate).toBe(true)
    expect(result.duplicateMode).toBe("exact")
    expect(result.record.scope).toBe("global")
    const project = await memory.list(scopeKey("project", PROJECT), 200)
    expect(project.records.some((record) => record.text === text)).toBe(false)
  })

  test("a global save dedups against the project it came from, and stores no project id", async () => {
    const memory = await seeded()
    const branch = SEED.find((entry) => entry.id === "mem_branch")!
    const result = await memory.save({
      scope: "global",
      projectID: PROJECT,
      type: "convention",
      text: branch.text,
    })
    expect(result.duplicate).toBe(true)
    expect(result.record.id).toBe("mem_branch")
    const saved = await memory.save({ scope: "global", projectID: PROJECT, type: "convention", text: "缩写 kk = 快速 kill 掉卡住的预览进程" })
    expect(saved.record.projectID).toBeUndefined()
  })
})

describe("embedding staleness — a model swap invalidates vectors, not entries", () => {
  test("rows from another embedVersion are excluded from scoring and listed for rebuild", async () => {
    const built = await corpus({ embedder: true })
    const migrated = MemorySubsystem.createSubsystem({
      store: built.store,
      embedder: MemoryReference.createFakeEmbedder({ version: "bge-small-zh-v1.5" }),
      clock: fixedClock(),
    })
    expect((await migrated.staleVectorIds(SCOPES)).length).toBeGreaterThan(0)
    const turn = await migrated.onTurn({ query: "分支命名规范", scopes: SCOPES })
    expect(turn.decision.channels.vector).toBe("ran")
    expect(turn.decision.vectorHits).toHaveLength(0)
    expect(turn.entries.map((record) => record.id)).not.toContain("mem_branch")
  })

  test("staleEmbeddings flags missing vectors as well as foreign ones", () => {
    const records = [row("mem_a", "v1", [1, 0]), row("mem_b", "v2", [1, 0]), row("mem_c", "v1", []), row("mem_d", "v1", [1, 0], "superseded")]
    expect(MemoryLifecycle.staleEmbeddings(records, "v1")).toEqual(["mem_b", "mem_c"])
  })
})

describe("browse — what the settings page reads", () => {
  test("filters by type and tag, pages with offset, and reports totals beyond the page", async () => {
    const memory = await seeded()
    const scope = scopeKey("project", PROJECT)
    const conventions = await memory.browse({ scope, type: "convention" })
    expect(conventions.records.every((record) => record.type === "convention")).toBe(true)
    expect(conventions.total).toBe(SEED.filter((entry) => entry.scope === "project" && entry.type === "convention").length)
    const first = await memory.browse({ scope, limit: 5 })
    const second = await memory.browse({ scope, limit: 5, offset: 5 })
    expect(first.records).toHaveLength(5)
    expect(second.records.map((record) => record.id)).not.toContain(first.records[0].id)
    expect(second.truncated).toBe(true)
    expect((await memory.browse({ scope, tag: "design" })).records.map((record) => record.id)).toEqual(["mem_cssvars"])
  })

  test("superseded rows are visible only when asked for", async () => {
    const memory = await seeded()
    await memory.update("mem_cssvars", { text: "颜色与间距一律走语义变量，禁止魔法数字" })
    const scope = scopeKey("project", PROJECT)
    expect((await memory.browse({ scope, tag: "design" })).total).toBe(1)
    const retired = await memory.browse({ scope, status: "superseded" })
    expect(retired.records.map((record) => record.id)).toContain("mem_cssvars")
  })
})

describe("session index — the one-time channel, off by default", () => {
  test("renders nothing while the setting is off", async () => {
    const memory = await seeded()
    await memory.save({ scope: "global", type: "decision", text: "本轮决定用 bigram 辅助列", sessionID: "ses_one" })
    const index = await memory.sessionIndex({ scope: "global", sessionID: "ses_one" })
    expect(index.block).toBe("")
    expect(index.injected).toHaveLength(0)
  })

  test("lists what this session saved, and nothing another session saved", async () => {
    const memory = MemorySubsystem.createSubsystem({
      store: MemoryReference.createStore(),
      settings: { ...DEFAULT_SETTINGS, sessionIndex: "on" },
      clock: fixedClock(),
    })
    const first = await memory.save({ scope: "global", type: "preference", text: "缩写 zz = 收尾提交", sessionID: "ses_one" })
    await memory.save({ scope: "global", type: "preference", text: "缩写 yy = 回滚上一笔", sessionID: "ses_two" })
    const index = await memory.sessionIndex({ scope: "global", sessionID: "ses_one" })
    expect(index.injected.map((record) => record.id)).toEqual([first.record.id])
    expect(index.block).toContain("zz")
    expect(index.block).not.toContain("yy")
  })

  test("the session index respects its own budget", async () => {
    const memory = MemorySubsystem.createSubsystem({
      store: MemoryReference.createStore(),
      settings: { ...DEFAULT_SETTINGS, sessionIndex: "on", maxInjectedChars: 170 },
      clock: fixedClock(),
    })
    for (const letter of ["a", "b", "c", "d"])
      await memory.save({ scope: "global", type: "preference", text: `缩写 ${letter} = 一项独立的长期习惯记录 ${letter}${letter}` , sessionID: "ses_budget" })
    const index = await memory.sessionIndex({ scope: "global", sessionID: "ses_budget" })
    expect(index.block.length).toBeLessThanOrEqual(170)
    expect(index.omitted.length).toBeGreaterThan(0)
  })
})

function semanticRow(id: string, embedding: number[]) {
  return row(id, "fixed-1", embedding)
}

/** The save tests need a vector they can predict: shared-token overlap through the fake
 *  embedder is untestable arithmetic, so these rows arrive at a known cosine instead. */
function fixedVectorEmbedder(vector: number[]) {
  return {
    dimensions: vector.length,
    version: "fixed-1",
    embed: async () => [...vector],
    embedAll: async (texts: readonly string[]) => texts.map(() => [...vector]),
  }
}

function row(id: string, embedVersion: string, embedding: number[], status: "active" | "superseded" = "active") {  return {
    id,
    scope: "global" as const,
    type: "convention" as const,
    status,
    version: 1,
    text: id,
    tags: [],
    textHash: id,
    tokens: [],
    embedding,
    embedVersion,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}
