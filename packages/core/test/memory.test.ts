import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { KV } from "@aicraft/core/kv"
import { Memory } from "@aicraft/core/memory"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(KV.node))

const now = "2026-01-01T00:00:00.000Z"

/**
 * The kv surface that survived the SQL cutover: plugin namespaces, read by the plugin host's
 * `ctx.memory` and the settings RPC. Project and global behavior is gated in `@aicraft/memory`
 * and `test/memory-store.test.ts` instead.
 */
describe("Memory plugin kv surface", () => {
  it.effect("saves once per text and merges tags into the existing entry", () =>
    Effect.gen(function* () {
      const kv = yield* KV.Service
      const first = yield* Memory.savePlugin(kv, "changhong.aicraft.hyt", {
        text: "本项目用 bun",
        tags: ["工具链"],
        now,
      })
      expect(first.duplicate).toBe(false)

      const second = yield* Memory.savePlugin(kv, "changhong.aicraft.hyt", {
        text: "  本项目用 bun  ",
        tags: ["约定", "工具链"],
        now: "2026-01-02T00:00:00.000Z",
      })
      expect(second.duplicate).toBe(true)
      expect(second.entry.id).toBe(first.entry.id)
      expect(second.entry.tags).toEqual(["工具链", "约定"])

      const prefix = yield* Memory.readScope(kv, Memory.pluginPrefix("changhong.aicraft.hyt"), 10)
      expect(prefix).toHaveLength(1)
    }),
  )

  it.effect("returns the newest entries when the prefix is larger than the window", () =>
    Effect.gen(function* () {
      // Regression for the kv sampling defect: keys are `mem_<uuid>`, so the old ascending
      // key order gave a random subset; the newest entries must win regardless of key order.
      const kv = yield* KV.Service
      for (const index of Array.from({ length: 260 }, (_, i) => i))
        yield* Memory.savePlugin(kv, "acme.notes", {
          text: `第 ${index + 1} 条独立事实，编号 ${index + 1}`,
          tags: [],
          now: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString(),
        })
      const newest = yield* Memory.readScope(kv, Memory.pluginPrefix("acme.notes"), 50)
      expect(newest).toHaveLength(50)
      expect(newest[0]?.text).toBe("第 260 条独立事实，编号 260")
      const times = newest.map((entry) => entry.updatedAt)
      expect(times).toEqual([...times].sort().reverse())
    }),
  )

  it.effect("keeps each plugin's memories in its own prefix", () =>
    Effect.gen(function* () {
      const kv = yield* KV.Service
      const saved = yield* Memory.savePlugin(kv, "changhong.aicraft.hyt", { text: "群聊默认回短句", tags: ["风格"], now })
      yield* Memory.savePlugin(kv, "acme.notes", { text: "笔记用 markdown", tags: [], now: "2026-01-02T00:00:00.000Z" })

      const hyt = yield* Memory.readScope(kv, Memory.pluginPrefix("changhong.aicraft.hyt"), 10)
      expect(hyt.map((entry) => entry.text)).toEqual(["群聊默认回短句"])
      expect(yield* Memory.findPluginEntry(kv, "acme.notes", saved.entry.id)).toBeUndefined()

      const groups = yield* Memory.readPlugins(kv, 10)
      expect(groups.map((group) => group.plugin)).toEqual(["acme.notes", "changhong.aicraft.hyt"])
      expect(groups[1]!.entries.map((entry) => entry.text)).toEqual(["群聊默认回短句"])
    }),
  )

  it.effect("updates and removes only the owning plugin's entry", () =>
    Effect.gen(function* () {
      const kv = yield* KV.Service
      const saved = yield* Memory.savePlugin(kv, "changhong.aicraft.hyt", { text: "用中文", tags: [], now })
      const updated = yield* Memory.updatePlugin(kv, "changhong.aicraft.hyt", {
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

      yield* Memory.removePlugin(kv, "changhong.aicraft.hyt", saved.entry.id)
      expect(yield* Memory.readScope(kv, Memory.pluginPrefix("changhong.aicraft.hyt"), 10)).toHaveLength(0)
    }),
  )

  it.effect("skips undecodable values instead of hiding the rest of the scope", () =>
    Effect.gen(function* () {
      const kv = yield* KV.Service
      yield* kv.set(`${Memory.pluginRoot}acme.notes/mem_broken`, { nope: true })
      yield* Memory.savePlugin(kv, "acme.notes", { text: "正常条目", tags: [], now })
      expect((yield* Memory.readScope(kv, Memory.pluginPrefix("acme.notes"), 10)).map((e) => e.text)).toEqual([
        "正常条目",
      ])
    }),
  )

  describe("helpers", () => {
    const entry = (text: string, tags: string[]) => ({ id: "mem_x", text, tags, createdAt: now, updatedAt: now })

    test("matches text and tags case-insensitively, empty query matches all", () => {
      expect(Memory.matches(entry("This project uses Bun", ["ToolChain"]), "BUN")).toBe(true)
      expect(Memory.matches(entry("This project uses Bun", ["toolchain"]), "node")).toBe(false)
      expect(Memory.matches(entry("anything", []), "   ")).toBe(true)
    })

    test("normalizes tags by trimming, deduplicating and capping", () => {
      expect(Memory.normalizeTags([" a ", "a", "", "b".repeat(40)]).join("|")).toBe("a")
      expect(Memory.normalizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(8)
    })
  })
})
