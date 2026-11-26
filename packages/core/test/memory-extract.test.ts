import { describe, expect } from "bun:test"
import { Database } from "@aicraft/core/database/database"
import { MemoryExtract } from "@aicraft/core/memory/extract"
import { MemoryStore } from "@aicraft/core/memory/store"
import { MemoryExtractLogTable } from "@aicraft/core/memory/sql"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { DEFAULT_SETTINGS, createSubsystem } from "@aicraft/memory"
import { Effect } from "effect"
import { testEffect } from "./lib/effect"

/**
 * The extraction job on the real SQL store, with a scripted model reply where the production
 * `session.generate` would run. Gates are the numbers: model calls issued only when the turn and
 * cooldown gate opens, every attempt audited (audit completeness = 1.0), repeated extraction
 * converging, and failures writing zero memory rows.
 */
const it = testEffect(LayerNode.compile(Database.node))

const SETTINGS = { ...DEFAULT_SETTINGS, extract: "on" as const, extractMinUserTurns: 3, extractMaxCandidates: 4 }
const PROJECT = "prj_extract"
const SCOPES = [`project:${PROJECT}`, "global"]

function harness(generate: MemoryExtract.ExtractionJobDeps["generate"]) {
  let clock = Date.UTC(2026, 10, 26, 0, 0, 0)
  let tick = 0
  return Effect.gen(function* () {
    const { db } = yield* Database.Service
    const memory = createSubsystem({
      store: MemoryStore.createSqlStore(db),
      settings: SETTINGS,
      clock: () => new Date(clock + tick++ * 60_000).toISOString(),
    })
    const job = MemoryExtract.createExtractionJob({
      generate,
      subsystem: memory,
      settings: memory.settings,
      log: (row) => Effect.tryPromise(() => MemoryStore.insertExtractLog(db, row)).pipe(Effect.orDie),
      now: () => clock,
    })
    const rows = () => db.select().from(MemoryExtractLogTable).all().pipe(Effect.orDie)
    const advance = (ms: number) => {
      clock += ms
      return Effect.void
    }
    return { memory, db, job, rows, advance }
  })
}

const memories = (items: unknown[]) => JSON.stringify({ memories: items })
const candidate = (text: string, extra: Record<string, unknown> = {}) => ({
  type: "convention",
  scope: "project",
  text,
  tags: [],
  ...extra,
})
const OK_REPLY = memories([
  candidate("dz = 拉起 dev:desktop 并附加 CDP 调试端口", { triggers: ["dz"] }),
  candidate("迁移脚本改动必须保持每次启动可重跑", { type: "decision", tags: ["migration"] }),
  candidate("周报用表格输出，结论放在第一行", { type: "preference", scope: "global" }),
])

/** Opens the gate: enough distinct turn keys. */
const turnThreeTimes = (job: { noteTurn: (s: string, k: string) => Effect.Effect<void> }, id = "ses_x") =>
  Effect.forEach(["t1", "t2", "t3"], (key) => job.noteTurn(id, key), { discard: true })

describe("MemoryExtract job", () => {
  it.effect("model calls happen only when the gate opens: zero calls below turns or inside cooldown", () =>
    Effect.gen(function* () {
      let calls = 0
      const { job, rows, advance } = yield* harness(() => {
        calls += 1
        return Effect.succeed(OK_REPLY)
      })
      // Two turns: below the minimum. The idle event must not spend a model call.
      yield* Effect.forEach(["t1", "t2"], (key) => job.noteTurn("ses_x", key), { discard: true })
      yield* job.onIdle({ sessionID: "ses_x", projectID: PROJECT })
      if (calls !== 0) throw new Error(`model calls ${calls} before the turn gate opened, expected 0`)
      expect(yield* rows()).toHaveLength(0)

      // Gate opens: one call, one audit row.
      yield* job.noteTurn("ses_x", "t3")
      yield* job.onIdle({ sessionID: "ses_x", projectID: PROJECT })
      expect(calls).toBe(1)
      expect(yield* rows()).toHaveLength(1)

      // Steps and idles inside the cooldown cost nothing, even with plenty of turns.
      yield* Effect.forEach(["t4", "t5", "t6"], (key) => job.noteTurn("ses_x", key), { discard: true })
      yield* job.onIdle({ sessionID: "ses_x", projectID: PROJECT })
      expect(calls).toBe(1)

      // Cooldown elapsed: the next idle runs again.
      yield* advance(SETTINGS.extractCooldownMs + 1)
      yield* job.onIdle({ sessionID: "ses_x", projectID: PROJECT })
      expect(calls).toBe(2)
      expect(yield* rows()).toHaveLength(2)
    }),
  )

  it.effect("applied extraction lands memory rows, triggers and a complete audit entry", () =>
    Effect.gen(function* () {
      const { memory, job, rows } = yield* harness(() => Effect.succeed(OK_REPLY))
      yield* turnThreeTimes(job)
      yield* job.onIdle({ sessionID: "ses_x", projectID: PROJECT })

      const audit = (yield* rows())[0]!
      expect(audit.outcome).toBe("applied")
      expect(audit.scope).toBe(`project:${PROJECT}+global`)
      expect(audit.saved).toHaveLength(3)
      expect(audit.merged).toBe(0)
      expect(audit.reply_chars).toBe(OK_REPLY.length)
      expect(audit.duration_ms).toBeGreaterThanOrEqual(0)

      // The extracted abbreviation must pull its entry into the turn pipeline.
      const turn = yield* Effect.promise(() => memory.onTurn({ query: "dz 一下看看界面", scopes: SCOPES }))
      expect(turn.injectBlock).toContain("dev:desktop")
      const pages = yield* Effect.promise(async () => {
        const project = await memory.list(`project:${PROJECT}`)
        const global = await memory.list("global")
        return [project, global] as const
      })
      expect(pages[0].records).toHaveLength(2)
      expect(pages[1].records).toHaveLength(1)
    }),
  )

  it.effect("repeated extraction converges: second identical run adds zero rows", () =>
    Effect.gen(function* () {
      const { memory, job, rows, advance } = yield* harness(() => Effect.succeed(OK_REPLY))
      yield* turnThreeTimes(job)
      yield* job.onIdle({ sessionID: "ses_x", projectID: PROJECT })
      yield* advance(SETTINGS.extractCooldownMs + 1)
      yield* turnThreeTimes(job)
      yield* job.onIdle({ sessionID: "ses_x", projectID: PROJECT })

      const second = (yield* rows())[1]!
      expect(second.saved).toEqual([])
      expect(second.merged).toBe(3)
      const pages = yield* Effect.promise(() => memory.list(`project:${PROJECT}`))
      expect(pages.records).toHaveLength(2)
    }),
  )

  it.effect("malformed and failed runs are audited and write no memories", () =>
    Effect.gen(function* () {
      let mode = "malformed" as "malformed" | "failed"
      const { memory, job, rows, advance } = yield* harness(() =>
        mode === "malformed" ? Effect.succeed("这段对话没有值得长期保留的内容。") : Effect.fail(new Error("provider down")),
      )
      yield* turnThreeTimes(job)
      yield* job.onIdle({ sessionID: "ses_x", projectID: PROJECT })
      expect((yield* rows())[0]!.outcome).toBe("malformed")

      mode = "failed"
      yield* advance(SETTINGS.extractCooldownMs + 1)
      yield* turnThreeTimes(job)
      yield* job.onIdle({ sessionID: "ses_x", projectID: PROJECT })
      const failed = (yield* rows())[1]!
      expect(failed.outcome).toBe("failed")
      expect(failed.saved).toEqual([])

      // A failed run still consumed its cooldown: no third attempt on the next idle.
      yield* turnThreeTimes(job)
      yield* job.onIdle({ sessionID: "ses_x", projectID: PROJECT })
      expect(yield* rows()).toHaveLength(2)
      const pages = yield* Effect.promise(async () => {
        const a = await memory.list("global")
        const b = await memory.list(`project:${PROJECT}`)
        return a.records.length + b.records.length
      })
      expect(pages).toBe(0)
    }),
  )

  it.effect("supersedes retires the old row through the SQL lifecycle", () =>
    Effect.gen(function* () {
      let target = "mem_ghost"
      const { memory, job, rows } = yield* harness(() =>
        Effect.succeed(memories([candidate("周报改为表格输出，结论先行", { type: "preference", supersedes: target })])),
      )
      const old = yield* Effect.promise(() =>
        memory.save({ scope: "project", projectID: PROJECT, type: "preference", text: "旧约定：周报按段落写" }),
      )
      target = old.record.id
      yield* turnThreeTimes(job)
      yield* job.onIdle({ sessionID: "ses_x", projectID: PROJECT })

      const audit = (yield* rows())[0]!
      expect(audit.saved).toHaveLength(1)
      expect(audit.superseded).toEqual([{ id: old.record.id, byID: audit.saved[0] }])
      const history = yield* Effect.promise(() => memory.history(old.record.id))
      expect(history.at(-1)?.status).toBe("superseded")
      expect(history.at(-1)?.supersededBy).toBe(audit.saved[0])
      // Search sees only the replacement: superseded rows leave the token index.
      const found = yield* Effect.promise(() => memory.search({ query: "周报", scopes: SCOPES }))
      expect(found.records.some((record) => record.id === old.record.id)).toBe(false)
      expect(found.records.some((record) => record.id === audit.saved[0])).toBe(true)
    }),
  )
})
