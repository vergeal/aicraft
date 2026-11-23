import { describe, expect } from "bun:test"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { MemoryPlugin } from "@opencode/core/plugin/memory"
import { Rpc } from "@opencode/core/rpc"
import { Skill } from "@opencode/core/skill"
import { Tool } from "@opencode/core/tool"
import { Effect } from "effect"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

const activate = Effect.gen(function* () {
  const plugins = yield* Plugin.Service
  yield* MemoryPlugin.Plugin.effect(yield* PluginHost.make(plugins, "test"))
})

describe("memory plugin", () => {
  it.live("registers the memory tools and skill", () =>
    Effect.gen(function* () {
      yield* activate
      const tools = yield* Tool.Service
      const names = (yield* tools.list()).map((tool) => tool.id)
      for (const name of ["memory_save", "memory_list", "memory_search", "memory_update", "memory_forget"])
        expect(names).toContain(name)

      const skills = yield* Skill.Service
      expect((yield* skills.list()).map((skill) => String(skill.id))).toContain("memory")
    }),
  )

  it.live("serves the settings RPC over the same storage", () =>
    Effect.gen(function* () {
      yield* activate
      const rpc = yield* Rpc.Service

      const saved = (yield* rpc.call("opencode.memory", "save", {
        scope: "global",
        projectID: null,
        text: "回复用中文",
        tags: ["偏好"],
      })) as { entry: { id: string }; duplicate: boolean }
      expect(saved.duplicate).toBe(false)

      const listed = (yield* rpc.call("opencode.memory", "list", { projectID: null })) as {
        global: ReadonlyArray<{ text: string }>
      }
      expect(listed.global.map((entry) => entry.text)).toEqual(["回复用中文"])

      const updated = (yield* rpc.call("opencode.memory", "update", {
        scope: "global",
        projectID: null,
        id: saved.entry.id,
        text: "回复尽量用中文",
        tags: [],
      })) as { entry: { text: string } | null }
      expect(updated.entry?.text).toBe("回复尽量用中文")

      yield* rpc.call("opencode.memory", "remove", {
        scope: "global",
        projectID: null,
        id: saved.entry.id,
      })
      const after = (yield* rpc.call("opencode.memory", "list", { projectID: null })) as {
        global: ReadonlyArray<unknown>
      }
      expect(after.global).toHaveLength(0)
    }),
  )
})
