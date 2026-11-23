import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { KV } from "@opencode/core/kv"
import { Memory } from "@opencode/core/memory"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(KV.node))

const legacyRoot = "plugin:006300680061006e00670068006f006e0067002e006d0065006d006f00720079:entry/"
const now = "2026-01-01T00:00:00.000Z"

describe("Memory", () => {
  it.effect("saves once per text and merges tags into the existing entry", () =>
    Effect.gen(function* () {
      const kv = yield* KV.Service
      const first = yield* Memory.save(kv, {
        scope: "project",
        projectID: "prj_a",
        text: "本项目用 bun",
        tags: ["工具链"],
        now,
      })
      expect(first.duplicate).toBe(false)

      const second = yield* Memory.save(kv, {
        scope: "project",
        projectID: "prj_a",
        text: "  本项目用 bun  ",
        tags: ["约定", "工具链"],
        now: "2026-01-02T00:00:00.000Z",
      })
      expect(second.duplicate).toBe(true)
      expect(second.entry.id).toBe(first.entry.id)
      expect(second.entry.tags).toEqual(["工具链", "约定"])

      const project = yield* Memory.readScope(kv, Memory.projectPrefix("prj_a"), 10)
      expect(project).toHaveLength(1)
    }),
  )

  it.effect("lists both scopes newest first and keeps projects apart", () =>
    Effect.gen(function* () {
      const kv = yield* KV.Service
      yield* Memory.save(kv, { scope: "global", projectID: "", text: "回复用中文", tags: [], now })
      yield* Memory.save(kv, { scope: "project", projectID: "prj_a", text: "用 bun", tags: [], now: "2026-01-02T00:00:00.000Z" })
      yield* Memory.save(kv, { scope: "project", projectID: "prj_b", text: "用 pnpm", tags: [], now })

      const rows = yield* Memory.list(kv, "prj_a", "all", 10)
      expect(rows.map((row) => row.entry.text)).toEqual(["用 bun", "回复用中文"])
      expect((yield* Memory.list(kv, "prj_b", "project", 10)).map((row) => row.entry.text)).toEqual(["用 pnpm"])
    }),
  )

  it.effect("finds, updates, and removes an entry by id", () =>
    Effect.gen(function* () {
      const kv = yield* KV.Service
      const saved = yield* Memory.save(kv, { scope: "global", projectID: "", text: "简短回复", tags: [], now })
      const located = yield* Memory.findEntry(kv, "prj_a", saved.entry.id)
      expect(located?.scope).toBe("global")

      const updated = yield* Memory.update(kv, {
        scope: "global",
        projectID: "",
        id: saved.entry.id,
        text: "回复尽量简短",
        tags: ["偏好"],
        now: "2026-01-03T00:00:00.000Z",
      })
      expect(updated?.text).toBe("回复尽量简短")
      expect(updated?.tags).toEqual(["偏好"])

      yield* Memory.remove(kv, { scope: "global", projectID: "", id: saved.entry.id })
      expect(yield* Memory.findEntry(kv, "prj_a", saved.entry.id)).toBeUndefined()
    }),
  )

  it.effect("keeps each plugin's memories in its own prefix", () =>
    Effect.gen(function* () {
      const kv = yield* KV.Service
      const saved = yield* Memory.savePlugin(kv, "changhong.hyt", { text: "群聊默认回短句", tags: ["风格"], now })
      yield* Memory.savePlugin(kv, "acme.notes", { text: "笔记用 markdown", tags: [], now: "2026-01-02T00:00:00.000Z" })

      const hyt = yield* Memory.readScope(kv, Memory.pluginPrefix("changhong.hyt"), 10)
      expect(hyt.map((entry) => entry.text)).toEqual(["群聊默认回短句"])
      expect(yield* Memory.findPluginEntry(kv, "acme.notes", saved.entry.id)).toBeUndefined()

      const groups = yield* Memory.readPlugins(kv, 10)
      expect(groups.map((group) => group.plugin)).toEqual(["acme.notes", "changhong.hyt"])
      expect(groups[1]!.entries.map((entry) => entry.text)).toEqual(["群聊默认回短句"])
    }),
  )

  it.effect("updates and removes only the owning plugin's entry", () =>
    Effect.gen(function* () {
      const kv = yield* KV.Service
      const saved = yield* Memory.savePlugin(kv, "changhong.hyt", { text: "用中文", tags: [], now })
      const updated = yield* Memory.updatePlugin(kv, "changhong.hyt", {
        id: saved.entry.id,
        text: "用简体中文",
        tags: ["语言"],
        now: "2026-01-02T00:00:00.000Z",
      })
      expect(updated?.text).toBe("用简体中文")
      expect(updated?.tags).toEqual(["语言"])
      expect(
        yield* Memory.updatePlugin(kv, "acme.notes", { id: saved.entry.id, text: "被改", tags: [], now }),
      ).toBeUndefined()

      yield* Memory.removePlugin(kv, "changhong.hyt", saved.entry.id)
      expect(yield* Memory.readScope(kv, Memory.pluginPrefix("changhong.hyt"), 10)).toHaveLength(0)
    }),
  )

  it.effect("imports entries from the previous plugin namespace once", () =>
    Effect.gen(function* () {
      const kv = yield* KV.Service
      yield* kv.set(`${legacyRoot}global/mem_old`, {
        id: "mem_old",
        text: "旧记忆",
        tags: ["旧"],
        createdAt: now,
        updatedAt: now,
      })
      yield* kv.set(`${legacyRoot}project/prj_a/mem_project`, {
        id: "mem_project",
        text: "旧项目记忆",
        tags: [],
        createdAt: now,
        updatedAt: now,
      })

      yield* Memory.migrate(kv)
      expect((yield* Memory.readScope(kv, Memory.globalPrefix, 10)).map((entry) => entry.text)).toEqual(["旧记忆"])
      expect(
        (yield* Memory.readScope(kv, Memory.projectPrefix("prj_a"), 10)).map((entry) => entry.text),
      ).toEqual(["旧项目记忆"])

      // The marker keeps a later entry with the same key from being overwritten by the legacy copy.
      yield* kv.set(`${legacyRoot}global/mem_old`, {
        id: "mem_old",
        text: "旧记忆（改）",
        tags: [],
        createdAt: now,
        updatedAt: now,
      })
      yield* Memory.migrate(kv)
      expect((yield* Memory.readScope(kv, Memory.globalPrefix, 10)).map((entry) => entry.text)).toEqual(["旧记忆"])
    }),
  )

  test("renders the protocol even with no memories", () => {
    expect(Memory.render({ project: [], global: [], budget: 4_000 })).toContain("## 记忆协议")
  })

  test("renders both scopes within the budget", () => {
    const entry = (id: string, text: string) => ({ id, text, tags: [], createdAt: now, updatedAt: now })
    const text = Memory.render({
      project: [entry("a", "项目约定")],
      global: [entry("b", "全局偏好")],
      budget: 4_000,
    })
    expect(text).toContain("### 项目记忆")
    expect(text).toContain("### 全局记忆")
    expect(text).toContain("- 项目约定")
    expect(text).toContain("- 全局偏好")
  })
})
