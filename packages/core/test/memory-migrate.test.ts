import { Effect } from "effect"
import { expect } from "bun:test"
import { Database } from "@aicraft/core/database/database"
import { KV } from "@aicraft/core/kv"
import { MemoryMigrate } from "@aicraft/core/memory/migrate"
import { MemoryStore } from "@aicraft/core/memory/store"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { AppNodeBuilder } from "@aicraft/core/effect/app-node-builder"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, KV.node])))

const legacy = (id: string, text: string, tags: string[], updatedAt: string) => ({
  id,
  text,
  tags,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt,
})

it.effect("imports global, project and plugin kv entries once and is re-runnable", () =>
  Effect.gen(function* () {
    const kv = yield* KV.Service
    const { db } = yield* Database.Service
    const store = MemoryStore.createSqlStore(db)
    yield* kv.set("memory/entry/global/mem_a", legacy("mem_a", "回复尽量简短", ["偏好"], "2026-02-01T00:00:00.000Z"))
    yield* kv.set(`memory/entry/project/${encodeURIComponent("prj/1")}/mem_b`, legacy("mem_b", "本项目用 bun 装依赖", ["工具链"], "2026-02-02T00:00:00.000Z"))
    yield* kv.set("memory/entry/plugin/mem_c", legacy("mem_c", "群聊默认回短句", ["风格"], "2026-02-03T00:00:00.000Z"))
    yield* kv.set("memory/entry/plugin/acme.notes/mem_d", legacy("mem_d", "笔记用 markdown", [], "2026-02-04T00:00:00.000Z"))
    // Corrupt payload and a foreign shape under the namespace: skipped, never aborting the import.
    yield* kv.set("memory/entry/global/mem_bad", { nope: true })
    yield* kv.set("memory/entry/unknown/x", legacy("mem_x", "不认识的命名空间", [], "2026-02-05T00:00:00.000Z"))

    const first = yield* MemoryMigrate.migrateKv(kv, store)
    expect(first).toEqual({ scanned: 6, imported: 3, skipped: 0 })

    const a = yield* Effect.promise(() => store.get("mem_a"))
    expect(a?.scope).toBe("global")
    expect(a?.type).toBe("convention")
    expect(a?.status).toBe("active")
    expect(a?.version).toBe(1)
    expect(a?.updatedAt).toBe("2026-02-01T00:00:00.000Z")
    expect(a?.tokens.length).toBeGreaterThan(0)
    expect(a?.embedding).toBeUndefined()
    const b = yield* Effect.promise(() => store.get("mem_b"))
    expect(b?.scope).toBe("project")
    expect(b?.projectID).toBe("prj/1")
    const d = yield* Effect.promise(() => store.get("mem_d"))
    expect(d?.scope).toBe("plugin")
    expect(d?.pluginID).toBe("acme.notes")
    // Project scope sees the migrated entry through the lexical index — the retrieval path works
    // on imported rows, not just freshly saved ones.
    const candidates = yield* Effect.promise(() => store.lexicalCandidates(["装", "依赖"], "project:prj/1", 10))
    expect(candidates.map((r) => r.id)).toEqual(["mem_b"])
    expect(yield* Effect.promise(() => store.get("mem_bad"))).toBeUndefined()
    expect(yield* Effect.promise(() => store.get("mem_x"))).toBeUndefined()
    expect(yield* Effect.promise(() => store.get("mem_c"))).toBeUndefined()

    const second = yield* MemoryMigrate.migrateKv(kv, store)
    expect(second).toEqual({ scanned: 6, imported: 0, skipped: 3 })
  }),
)
