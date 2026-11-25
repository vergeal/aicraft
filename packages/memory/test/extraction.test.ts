import { describe, expect, test } from "bun:test"
import { DEFAULT_SETTINGS, MemoryExtraction, MemoryReference, MemorySubsystem } from "../src/index.js"
import { PROJECT, fixedClock } from "./fixtures.js"

/**
 * The extraction job, gated as input → output like every other subsystem behavior: scripted
 * model replies in, stored rows and audit numbers out. No server, no database, no real model —
 * the fake "replies" here stand in for the extraction pass, and the lifecycle rules are the
 * point being measured.
 */

function subsystem(options?: { settings?: Partial<typeof DEFAULT_SETTINGS> }) {
  const store = MemoryReference.createStore()
  const memory = MemorySubsystem.createSubsystem({
    store,
    settings: { ...DEFAULT_SETTINGS, ...options?.settings },
    clock: fixedClock(),
  })
  return { memory, store }
}

function reply(items: unknown[]): string {
  return JSON.stringify({ memories: items })
}

const VALID = [
  { type: "convention", scope: "global", text: "pp = push code：commit 并 push 当前任务相关文件", tags: ["git"], triggers: ["pp"] },
  { type: "preference", scope: "global", text: "回复用简体中文，结论先行", tags: ["communication"] },
  { type: "convention", scope: "project", text: "本仓库提交信息用 conventional commits，type 取 feat/fix/docs/chore/refactor/test", tags: ["git"], triggers: ["commit message"] },
  { type: "decision", scope: "project", text: "向量栈定稿为 bge-small-zh-v1.5 GGUF 经 llama-server HTTP，不用本地 CLI", tags: ["vector"] },
  { type: "decision", scope: "project", text: "kv 迁移不删源，按 id 幂等 skip，重复启动安全", tags: ["migration"] },
  { type: "project_knowledge", scope: "project", text: "数据统一存后端主库 aicraft[-<channel>].db，走现有 drizzle migration 链", tags: ["database"] },
  { type: "project_knowledge", scope: "project", text: "packages/memory 零依赖零 IO，适配器全部在 core", tags: ["architecture"] },
  { type: "historical", scope: "project", text: "上一版 kv 内核按 key 升序取样导致 recall 0.33，根因是 mem_<uuid> 键序随机", tags: ["postmortem"] },
  { type: "preference", scope: "global", text: "性能优化必须先实证诊断再动手，每步改动立即回归指标", tags: ["workflow"] },
  { type: "convention", scope: "project", text: "分支名最多三个词，短横线分隔，不用斜杠和前缀", tags: ["git"], triggers: ["分支名"] },
]

describe("MemoryExtraction", () => {
  test("acceptance gate: every valid candidate lands, stored in the right scope", async () => {
    const { memory, store } = subsystem({ settings: { extractMaxCandidates: 12 } })
    const outcome = await memory.extract({ reply: reply(VALID), sessionID: "ses_a", projectID: PROJECT })
    const acceptance = outcome.saved.length / VALID.length
    if (acceptance < 0.9) throw new Error(`acceptance ${acceptance.toFixed(2)} (${outcome.saved.length}/${VALID.length}) below gate 0.9; rejected=${JSON.stringify(outcome.rejected)}`)
    expect(outcome.rejected).toEqual([])
    const byScope = await Promise.all(["global", `project:${PROJECT}`].map((scope) => memory.list(scope, 100)))
    const all = byScope.flatMap((page) => page.records)
    expect(all).toHaveLength(VALID.length)
    // scope routing: the three global habits in global, the seven project items in project
    expect(byScope[0].records.filter((r) => r.scope === "global")).toHaveLength(3)
    expect(byScope[1].records).toHaveLength(7)
    // every stored row carries its extraction session as provenance (session index channel)
    for (const record of all) {
      const sources = await store.findCached("session", "ses_a", record.scope === "global" ? "global" : `project:${PROJECT}`, 100)
      expect(sources.some((row) => row.id === record.id)).toBe(true)
    }
  })

  test("garbage gate: junk proposals are rejected with reasons, never stored", async () => {
    const junk = [
      { type: "workflow", scope: "global", text: "旧六类设计里的 workflow 已并入 convention" },
      { scope: "global", text: "缺 type 的候选" },
      { type: "convention", scope: "global", text: "   " },
      { type: "preference", scope: "global", text: "长".repeat(1_200) },
      { type: "decision", scope: "workspace", text: "workspace scope 不在本子系统" },
      { type: "convention", scope: "project", text: "tags 类型不对", tags: "git" },
      { type: "convention", scope: "project", text: "supersedes 不像 id", supersedes: "user:123" },
    ]
    const { memory } = subsystem()
    const outcome = await memory.extract({ reply: reply(junk), sessionID: "ses_b", projectID: PROJECT })
    const expected = ["type", "type", "text", "text", "scope", "shape", "supersedes"]
    const reasons = outcome.rejected.map((entry) => entry.reason).join(",")
    if (reasons !== expected.join(",")) throw new Error(`reject reasons ${reasons} do not match ${expected.join(",")}`)
    expect(outcome.saved).toEqual([])
    expect(outcome.merged).toBe(0)
    const pages = await Promise.all(["global", `project:${PROJECT}`].map((scope) => memory.list(scope, 100)))
    expect(pages.reduce((sum, page) => sum + page.records.length, 0)).toBe(0)
  })

  test("project candidates without a project are dropped, naming the reply position", async () => {
    const { memory } = subsystem()
    const outcome = await memory.extract({
      reply: reply([
        { type: "convention", scope: "global", text: "无项目会话里的全局候选仍可写入" },
        { scope: "global", text: "缺 type 的垃圾项占住下标" },
        { type: "convention", scope: "project", text: "无项目会话里的项目候选" },
      ]),
      sessionID: "ses_c",
    })
    expect(outcome.saved).toHaveLength(1)
    // The scope rejection must point at index 2 of the reply array, not at a computed position.
    expect(outcome.rejected).toEqual([
      { index: 1, reason: "type" },
      { index: 2, reason: "scope" },
    ])
  })

  test("cap gate: a runaway reply writes at most extractMaxCandidates", async () => {
    const { memory } = subsystem()
    const many = [
      { type: "project_knowledge", scope: "project", text: "前端状态层用 SWR 拉取，禁止轮询" },
      { type: "project_knowledge", scope: "project", text: "日志级别默认 info，排障时临时开 debug" },
      { type: "decision", scope: "project", text: "注入块落最后一条 user message 尾部，不进 system 段" },
      { type: "convention", scope: "project", text: "sm = 跑 smoke 测试脚本再合并" },
      { type: "historical", scope: "project", text: "2026-10 曾因 WAL 文件膨胀把磁盘打满一次" },
      { type: "preference", scope: "project", text: "评审报告按严重度排序输出" },
    ].map((item) => ({ ...item, tags: [] as string[] }))
    const outcome = await memory.extract({ reply: reply(many), sessionID: "ses_d", projectID: PROJECT })
    expect(outcome.saved).toHaveLength(DEFAULT_SETTINGS.extractMaxCandidates)
    expect(outcome.rejected.filter((entry) => entry.reason === "limit")).toHaveLength(many.length - DEFAULT_SETTINGS.extractMaxCandidates)
  })

  test("idempotence gate: three identical runs converge to one row per fact", async () => {
    const { memory, store } = subsystem({ settings: { extractMaxCandidates: 12 } })
    const first = await memory.extract({ reply: reply(VALID), sessionID: "ses_e", projectID: PROJECT })
    expect(first.saved).toHaveLength(VALID.length)
    let rowsAfter = first.saved.length
    for (const _ of [1, 2]) {
      const again = await memory.extract({ reply: reply(VALID), sessionID: "ses_e", projectID: PROJECT })
      const duplicatesAdded = again.saved.length
      if (duplicatesAdded !== 0) throw new Error(`repeated extraction added ${duplicatesAdded} rows; stored rows must stay ${rowsAfter}`)
      expect(again.merged).toBe(VALID.length)
    }
    const pages = await Promise.all(["global", `project:${PROJECT}`].map((scope) => memory.list(scope, 100)))
    expect(pages.reduce((sum, page) => sum + page.records.length, 0)).toBe(rowsAfter)
    expect(store).toBeDefined()
  })

  test("conflict gate: supersedes retires the cited old entry, dangling ids do not block the save", async () => {
    const { memory, store } = subsystem()
    const old = await memory.save({ scope: "global", type: "preference", text: "旧结论：回复尽量详细展开", tags: ["communication"] })
    const outcome = await memory.extract({
      reply: reply([
        { type: "preference", scope: "global", text: "回复风格改为结论先行，最短可行动", tags: ["communication"], supersedes: old.record.id },
        { type: "preference", scope: "global", text: "悬空引用测试：替换一个不存在的 id", supersedes: "mem_ghost" },
      ]),
      sessionID: "ses_f",
    })
    expect(outcome.superseded).toEqual([{ id: old.record.id, byID: outcome.saved[0] }])
    expect(outcome.saved).toHaveLength(2)
    // `get` only answers active rows, so the retired entry is read through its version history.
    const retired = (await store.history(old.record.id)).at(-1)
    expect(retired?.status).toBe("superseded")
    expect(retired?.supersededBy).toBe(outcome.saved[0])
    // the ghost reference left its row untouched: two new rows, old entry only superseded once
    const current = await store.get(outcome.saved[1]!)
    expect(current?.status).toBe("active")
  })

  test("trigger gate: an extracted abbreviation pulls its entry into the turn", async () => {
    const { memory } = subsystem()
    await memory.extract({
      reply: reply([
        { type: "convention", scope: "project", text: "dz = 拉起 dev:desktop 并附加 CDP 端口", tags: ["workflow"], triggers: ["dz"] },
        { type: "convention", scope: "global", text: "ppz = 先跑 lint 再 push", tags: ["git"], triggers: ["ppz"] },
      ]),
      sessionID: "ses_g",
      projectID: PROJECT,
    })
    const queries = [
      { query: "dz 一下看看界面", expect: "dev:desktop" },
      { query: "帮我 ppz", expect: "先跑 lint" },
    ]
    const scopes = [`project:${PROJECT}`, "global"]
    let hit = 0
    for (const item of queries) {
      const turn = await memory.onTurn({ query: item.query, scopes })
      if (turn.injectBlock.includes(item.expect)) hit += 1
    }
    const recall = hit / queries.length
    if (recall < 0.85) throw new Error(`extracted-trigger recall ${recall.toFixed(2)} below gate 0.85`)
  })

  test("malformed replies write nothing and are reported", async () => {
    const cases = [
      "今天没有值得记录的内容。",
      "",
      "[1, 2, 3]",
      '{"memories": oops}',
      '{"memories": "not-an-array"}',
    ]
    const { memory } = subsystem()
    let reported = 0
    for (const text of cases) {
      const outcome = await memory.extract({ reply: text, sessionID: "ses_h", projectID: PROJECT })
      if (outcome.malformed) reported += 1
      expect(outcome.saved).toEqual([])
    }
    if (reported !== cases.length) throw new Error(`malformed detection reported ${reported}/${cases.length}`)
  })

  test("prose-wrapped and fenced replies still parse", async () => {
    const { memory } = subsystem()
    const fenced = "```json\n" + reply([VALID[0]!]) + "\n```"
    const prose = "分析如下：\n\n" + reply([VALID[1]!]) + "\n\n以上。"
    const a = await memory.extract({ reply: fenced, sessionID: "ses_i", projectID: PROJECT })
    const b = await memory.extract({ reply: prose, sessionID: "ses_i", projectID: PROJECT })
    expect(a.saved).toHaveLength(1)
    expect(b.saved).toHaveLength(1)
  })

  describe("gate arithmetic", () => {
    const settings = { extract: "on" as const, extractMinUserTurns: 3, extractCooldownMs: 600_000 }

    test("extractionDue holds the turn and cooldown floors", () => {
      expect(MemoryExtraction.extractionDue({ turns: 2, lastAtMs: 0 }, settings, 10_000_000)).toBe(false)
      expect(MemoryExtraction.extractionDue({ turns: 3, lastAtMs: 0 }, settings, 10_000_000)).toBe(true)
      expect(MemoryExtraction.extractionDue({ turns: 9, lastAtMs: 9_600_000 }, settings, 10_000_000)).toBe(false)
      expect(MemoryExtraction.extractionDue({ turns: 9, lastAtMs: 9_400_000 }, settings, 10_000_000)).toBe(true)
      expect(MemoryExtraction.extractionDue({ turns: 99, lastAtMs: 0 }, { ...settings, extract: "off" }, 10_000_000)).toBe(false)
    })

    test("hostile settings degrade to defaults, never to a disabled or unbounded job", () => {
      const resolved = MemorySubsystem.createSubsystem({
        store: MemoryReference.createStore(),
        settings: { extract: "sideways", extractMinUserTurns: 0, extractMaxCandidates: 999, extractCooldownMs: 1 } as never,
        clock: fixedClock(),
      }).settings
      expect(resolved.extract).toBe("on")
      expect(resolved.extractMinUserTurns).toBe(DEFAULT_SETTINGS.extractMinUserTurns)
      expect(resolved.extractMaxCandidates).toBe(10)
      expect(resolved.extractCooldownMs).toBe(DEFAULT_SETTINGS.extractCooldownMs)
    })
  })

  test("the prompt tail is a byte-stable constant inside the cost budget", () => {
    const again = MemoryExtraction.EXTRACT_PROMPT
    expect(again).toBe(MemoryExtraction.EXTRACT_PROMPT)
    // The tail rides on top of a cached transcript; keep it small enough that the extraction
    // call itself cannot become the expensive part of a turn.
    expect(again.length).toBeLessThanOrEqual(1_200)
    expect(again).toContain('"memories"')
  })
})
