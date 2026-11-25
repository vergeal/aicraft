import { Effect } from "effect"
import { expect } from "bun:test"
import { Database } from "@aicraft/core/database/database"
import { MemoryStore } from "@aicraft/core/memory/store"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import {
  MemoryEvaluate,
  MemoryReference,
  createFakeEmbedder,
  createSubsystem,
  type MemoryRecord,
  type MemoryType,
  type Store,
  type Subsystem,
} from "@aicraft/memory"
import { testEffect } from "./lib/effect"

/**
 * Parity harness: the SQL adapter must be indistinguishable from the package's reference store,
 * because every metric gate in `@aicraft/memory` is asserted against the reference's read rules.
 * The same operation sequence drives both stores and each step compares the results. The only
 * legitimate difference is vector precision: sqlite keeps float32 bytes (the llama.cpp layout)
 * while the reference keeps float64 arrays, so records are compared with the embedding reduced
 * to its length.
 */
const it = testEffect(LayerNode.compile(Database.node))

/** Threshold is deliberately loose: it keeps the vector channel exercised on a 10-entry corpus.
 *  The real operating point (and the fake's ~0.2 noise floor false hits) is a bge-small spike call. */
const SETTINGS = { inject: "trigger+vector" as const, vectorThreshold: 0.08, sessionIndex: "on" as const }
const BASE = Date.UTC(2026, 4, 1)

const promise = <A>(run: () => Promise<A>) => Effect.promise(run)

/** Each side gets its own clock; identical operation sequences make them produce identical timestamps. */
function pair(db: Parameters<typeof MemoryStore.createSqlStore>[0]): { reference: Subsystem; sql: Subsystem; stores: [Store, Store] } {
  const clock = () => {
    let tick = 0
    return () => new Date(BASE + tick++ * 60_000).toISOString()
  }
  const referenceStore = MemoryReference.createStore()
  const sqlStore = MemoryStore.createSqlStore(db)
  const reference = createSubsystem({ store: referenceStore, embedder: createFakeEmbedder({ version: "fake-parity-1" }), settings: SETTINGS, clock: clock() })
  const sql = createSubsystem({ store: sqlStore, embedder: createFakeEmbedder({ version: "fake-parity-1" }), settings: SETTINGS, clock: clock() })
  return { reference, sql, stores: [referenceStore, sqlStore] }
}

function both<A>(a: Subsystem, b: Subsystem, run: (s: Subsystem) => Promise<A>) {
  return Effect.gen(function* () {
    return [yield* promise(() => run(a)), yield* promise(() => run(b))] as const
  })
}

const comparable = (record: MemoryRecord) => ({ ...record, embedding: record.embedding?.length })

const SCOPES = ["global", "project:prj_1"]

const ENTRIES: Array<{
  id: string
  scope: "global" | "project"
  projectID?: string
  type: MemoryType
  text: string
  tags: string[]
  trigger?: string
  sessionID?: string
}> = [
  { id: "e_abbr", scope: "global", type: "preference", text: "用户缩写：pp = push code，把当前任务 commit 并 push 到远端", tags: ["缩写", "git"], trigger: "pp" },
  { id: "e_bun", scope: "project", projectID: "prj_1", type: "convention", text: "本项目统一使用 bun 作为包管理器和运行时", tags: ["工具链"], trigger: "cb" },
  { id: "e_branch", scope: "project", projectID: "prj_1", type: "convention", text: "分支名用短横线分隔命名，至多三个单词，不加斜杠前缀", tags: ["git", "约定"] },
  { id: "e_commit", scope: "project", projectID: "prj_1", type: "convention", text: "提交信息用 conventional commits：type(scope): summary", tags: ["git"] },
  { id: "e_gate", scope: "project", projectID: "prj_1", type: "decision", text: "测试必须带量化指标门禁，指标不达标即失败", tags: ["测试"] },
  { id: "e_tui", scope: "project", projectID: "prj_1", type: "decision", text: "本项目不开发 TUI，不动上游发布流程", tags: ["范围"] },
  { id: "e_worktree", scope: "project", projectID: "prj_2", type: "project_knowledge", text: "主仓工作区有用户未提交改动，worktree 内开发不得触碰", tags: ["git"] },
  { id: "e_theme", scope: "global", type: "preference", text: "界面文案默认中文，技术标识符保留英文", tags: ["文案"] },
  { id: "e_scroll", scope: "project", projectID: "prj_1", type: "historical", text: "时间线落位 bug 的根因是 restore-miss 触发了 stickToEnd", tags: ["bug"] },
  { id: "e_cache", scope: "global", type: "project_knowledge", text: "每步重发全上下文，多一次检索 round-trip 就是一次全量成本", tags: ["成本"] },
]

function seed(reference: Subsystem, sql: Subsystem) {
  return Effect.gen(function* () {
    for (const entry of ENTRIES) {
      const [left, right] = yield* both(reference, sql, (s) =>
        s.save({
          scope: entry.scope,
          ...(entry.projectID === undefined ? {} : { projectID: entry.projectID }),
          type: entry.type,
          text: entry.text,
          tags: entry.tags,
          id: entry.id,
          ...(entry.trigger === undefined ? {} : { trigger: entry.trigger }),
          ...(entry.sessionID === undefined ? {} : { sessionID: entry.sessionID }),
        }),
      )
      expect(comparable(right.record)).toEqual(comparable(left.record))
      expect(right.duplicate).toBe(left.duplicate)
    }
  })
}

const CASES: MemoryEvaluate.GoldenCase[] = [
  { query: "pp 一下", expect: "e_abbr", via: "trigger" },
  { query: "cb 用什么包管理器", expect: "e_bun", via: "trigger" },
  { query: "分支怎么命名", expect: "e_branch" },
  { query: "提交信息格式", expect: "e_commit" },
  { query: "测试指标门禁", expect: "e_gate", autoInjectForbidden: true },
  { query: "TUI 要不要改", expect: "e_tui", autoInjectForbidden: true },
  { query: "界面文案语言偏好", expect: "e_theme" },
]
const NEGATIVES = ["量子色动力学晶格规范", "法式洋葱汤的做法", "板块漂移与地质年代"]

it.effect("search round-trips every record field through sqlite", () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const { reference, sql } = pair(db)
    yield* seed(reference, sql)
    const [left, right] = yield* both(reference, sql, (s) => s.search({ query: "分支怎么命名", scopes: SCOPES, limit: 5 }))
    expect(right.records.map(comparable)).toEqual(left.records.map(comparable))
    const record = right.records[0]
    expect(record?.embedding?.length).toBe(256)
    expect(record?.embedVersion).toBe("fake-parity-1")
    expect(record?.tokens.length).toBeGreaterThan(0)
    expect(record?.textHash).toBe(left.records[0]?.textHash)
  }),
)

it.effect("update bumps the version and rewrites the token index identically", () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const { reference, sql, stores } = pair(db)
    yield* seed(reference, sql)
    const [left, right] = yield* both(reference, sql, (s) =>
      s.update("e_branch", { text: "分支名至多三个单词、短横线分隔；不用 feat/ 前缀", tags: ["git", "约定"] }),
    )
    expect([right?.version, right?.status, right?.id, right?.text]).toEqual([left?.version, left?.status, left?.id, left?.text])
    const [leftHistory, rightHistory] = yield* both(reference, sql, (s) => s.history("e_branch"))
    expect(rightHistory.map((r) => [r.version, r.status, r.supersededBy])).toEqual(leftHistory.map((r) => [r.version, r.status, r.supersededBy]))
    // Bigrams unique to the superseded text ("斜杠", "不加") must not resurrect the entry, on either store.
    const [refStore, sqlStore] = stores
    const oldSurface = yield* Effect.all([
      promise(() => refStore.lexicalCandidates(["斜杠", "不加"], "project:prj_1", 10)),
      promise(() => sqlStore.lexicalCandidates(["斜杠", "不加"], "project:prj_1", 10)),
    ])
    expect(oldSurface[1].map((r) => r.id)).toEqual(oldSurface[0].map((r) => r.id))
    expect(oldSurface[0]).toEqual([])
    // The new surface ("前缀") is findable on both.
    const newSurface = yield* Effect.all([
      promise(() => refStore.lexicalCandidates(["前缀"], "project:prj_1", 10)),
      promise(() => sqlStore.lexicalCandidates(["前缀"], "project:prj_1", 10)),
    ])
    expect(newSurface[1].map((r) => r.id)).toEqual(newSurface[0].map((r) => r.id))
    expect(newSurface[0].map((r) => r.id)).toContain("e_branch")
  }),
)

it.effect("supersede by another id retires the entry identically on both stores", () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const { reference, sql } = pair(db)
    yield* seed(reference, sql)
    yield* both(reference, sql, (s) => s.save({ scope: "global", type: "preference", text: "缩写更新：pp 现在只 push 已 commit 的内容", id: "e_abbr2" }))
    const [left, right] = yield* both(reference, sql, (s) => s.supersede("e_abbr", "e_abbr2"))
    expect(right).toBe(left)
    const [leftList, rightList] = yield* both(reference, sql, (s) => s.list("global", 50))
    expect(rightList.records.map((r) => r.id)).toEqual(leftList.records.map((r) => r.id))
    const [leftBrowse, rightBrowse] = yield* both(reference, sql, (s) => s.browse({ scope: "global", status: "superseded" }))
    expect(rightBrowse.records.map((r) => [r.id, r.supersededBy])).toEqual(leftBrowse.records.map((r) => [r.id, r.supersededBy]))
    // The retired trigger no longer injects.
    const [leftTurn, rightTurn] = yield* both(reference, sql, (s) => s.onTurn({ query: "pp 一下", scopes: SCOPES }))
    expect(rightTurn.decision.injected).toEqual(leftTurn.decision.injected)
  }),
)

it.effect("remove drops the record, its triggers and its sources on both stores", () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const { reference, sql } = pair(db)
    yield* seed(reference, sql)
    const [left, right] = yield* both(reference, sql, async (s) => {
      const removed = await s.remove("e_bun")
      const turn = await s.onTurn({ query: "cb 用什么", scopes: SCOPES })
      const again = await s.remove("e_bun")
      return { removed, again, injected: turn.decision.injected, triggerHits: turn.decision.triggerHits }
    })
    expect(right).toEqual(left)
    expect(right.removed).toBe(true)
  }),
)

it.effect("vector candidates skip stale models and missing embeddings", () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const store = MemoryStore.createSqlStore(db)
    const rows: MemoryRecord[] = [
      { id: "v_stale", scope: "global", type: "convention", status: "active", version: 1, text: "旧模型的向量", tags: [], tokens: ["旧", "模型"], textHash: "h_stale", embedding: [1, 0, 0], embedVersion: "old-model", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "v_live", scope: "global", type: "convention", status: "active", version: 1, text: "现模型的向量", tags: [], tokens: ["现", "模型"], textHash: "h_live", embedding: [0, 1, 0], embedVersion: "fake-parity-1", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
      { id: "v_none", scope: "global", type: "convention", status: "active", version: 1, text: "还没嵌入", tags: [], tokens: ["还", "没"], textHash: "h_none", createdAt: "2026-01-03T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" },
    ]
    for (const row of rows) yield* promise(() => store.insert(row))
    const live = yield* promise(() => store.vectorCandidates("global", 100, "fake-parity-1"))
    expect(live.map((r) => r.id)).toEqual(["v_live"])
    const stale = yield* promise(() => store.vectorCandidates("global", 100, "old-model"))
    expect(stale.map((r) => r.id)).toEqual(["v_stale"])
    // Float32 little-endian round-trips exactly.
    expect(stale[0]?.embedding).toEqual([1, 0, 0])
    const fetched = yield* promise(() => store.get("v_stale"))
    expect(fetched?.tokens).toEqual(["旧", "模型"])
    yield* promise(() => store.remove("v_stale"))
    expect(yield* promise(() => store.get("v_stale"))).toBeUndefined()
    expect(yield* promise(() => store.history("v_stale"))).toEqual([])
  }),
)

it.effect("browse filters by type, tag and page identically on both stores", () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const { reference, sql } = pair(db)
    yield* seed(reference, sql)
    for (const filter of [
      { scope: "project:prj_1", type: "convention" as const },
      { scope: "project:prj_1", tag: "git" },
      { scope: "global", limit: 2, offset: 0 },
      { scope: "global", limit: 2, offset: 2 },
    ]) {
      const [left, right] = yield* both(reference, sql, (s) => s.browse(filter))
      expect([right.records.map((r) => r.id), right.total, right.truncated]).toEqual([left.records.map((r) => r.id), left.total, left.truncated])
    }
  }),
)

it.effect("session index renders byte-identically on both stores", () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const { reference, sql } = pair(db)
    yield* both(reference, sql, async (s) => {
      await s.save({ scope: "project", projectID: "prj_1", type: "convention", text: "会话里存的约定条目", id: "e_session", sessionID: "ses_x" })
      return s.save({ scope: "project", projectID: "prj_1", type: "preference", text: "会话里存的偏好条目", id: "e_session2", sessionID: "ses_x" })
    })
    const [left, right] = yield* both(reference, sql, (s) => s.sessionIndex({ scope: "project:prj_1", sessionID: "ses_x" }))
    expect(right.block).toBe(left.block)
    expect(right.block).toContain("会话里存的约定条目")
  }),
)

it.effect("retrieval metrics on the SQL store match the reference store exactly", () =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const { reference, sql } = pair(db)
    yield* seed(reference, sql)
    const options = { cases: CASES, negatives: NEGATIVES, searchK: 5, repeats: 2 }
    const left = yield* promise(() => MemoryEvaluate.evaluate(reference, SCOPES, options))
    const right = yield* promise(() => MemoryEvaluate.evaluate(sql, SCOPES, options))
    expect(right).toEqual(left)
    // Parity is the adapter gate. The numbers only assert what the fake can guarantee: trigger
    // hits are exact and unconditional, false injection and partition violations are zero, bytes
    // are stable. The vector channel's working point is a bge-small spike decision (see AGENTS).
    for (const golden of CASES.filter((item) => item.via === "trigger")) {
      const outcome = left.injectCases.find((item) => item.query === golden.query)
      expect(outcome?.hit).toBe(true)
    }
    expect(left.partitionViolations).toBe(0)
    expect(left.byteStability).toBe(1)
    expect(left.searchRecallAtK).toBe(1)
    console.log(
      `[memory-parity] injectRecall=${left.injectRecall.toFixed(3)} searchRecall@${left.searchK}=${left.searchRecallAtK} false=${left.falseInjection} chars=${left.meanInjectedChars}`,
    )
  }),
)
