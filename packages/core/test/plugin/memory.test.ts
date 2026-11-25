import { describe, expect } from "bun:test"
import { SystemMessage, UserMessage } from "@aicraft/ai/effect"
import { Agent } from "@aicraft/core/agent"
import { Plugin } from "@aicraft/core/plugin"
import { PluginHooks } from "@aicraft/core/plugin/hooks"
import { PluginHost } from "@aicraft/core/plugin/host"
import { MemoryPlugin } from "@aicraft/core/plugin/memory"
import { Location } from "@aicraft/core/location"
import { MemoryService } from "@aicraft/core/memory/service"
import { MemoryLogTable } from "@aicraft/core/memory/sql"
import { Database } from "@aicraft/core/database/database"
import { Provider } from "@aicraft/core/provider"
import { Rpc } from "@aicraft/core/rpc"
import { Session } from "@aicraft/core/session"
import { Skill } from "@aicraft/core/skill"
import { Tool } from "@aicraft/core/tool"
import { Model } from "@aicraft/schema/model"
import type { SessionHooks } from "@aicraft/plugin/effect/session"
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

      const saved = (yield* rpc.call("aicraft.memory", "save", {
        scope: "global",
        projectID: null,
        text: "回复用中文",
        tags: ["偏好"],
      })) as { entry: { id: string }; duplicate: boolean }
      expect(saved.duplicate).toBe(false)

      const listed = (yield* rpc.call("aicraft.memory", "list", { projectID: null })) as {
        global: ReadonlyArray<{ text: string }>
      }
      expect(listed.global.map((entry) => entry.text)).toEqual(["回复用中文"])

      const updated = (yield* rpc.call("aicraft.memory", "update", {
        scope: "global",
        projectID: null,
        id: saved.entry.id,
        text: "回复尽量用中文",
        tags: [],
      })) as { entry: { text: string } | null }
      expect(updated.entry?.text).toBe("回复尽量用中文")

      yield* rpc.call("aicraft.memory", "remove", {
        scope: "global",
        projectID: null,
        id: saved.entry.id,
      })
      const after = (yield* rpc.call("aicraft.memory", "list", { projectID: null })) as {
        global: ReadonlyArray<unknown>
      }
      expect(after.global).toHaveLength(0)
    }),
  )
})

describe("memory plugin injection", () => {
  const injectedBlock = (event: SessionHooks["context"]) => {
    const last = event.messages.findLast((message) => message.role === "user")
    if (last?.role !== "user") return ""
    return last.content.filter((part) => part.type === "text").map((part) => part.text).slice(1).join("\n")
  }

  const context = (sessionID: Session.ID): SessionHooks["context"] => ({
    sessionID,
    agent: Agent.ID.make("build"),
    model: Model.Ref.make({ providerID: Provider.ID.make("test"), id: Model.ID.make("m1") }),
    system: [],
    messages: [
      new SystemMessage({ role: "system", content: [] }),
      new UserMessage({ role: "user", content: [{ type: "text", text: "分支命名规范" }] }),
    ],
    tools: {},
    options: {},
  })

  it.effect("lands the turn block at the tail of the last user message, stable across steps", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const location = yield* Location.Service
      const session = yield* sessions.create({ location: { directory: location.directory } })
      const hooks = yield* PluginHooks.Service
      yield* activate

      const rpc = yield* Rpc.Service
      yield* rpc.call("aicraft.memory", "save", {
        scope: "global",
        projectID: null,
        text: "分支命名规范：用短横线分隔，禁止斜杠和类型前缀",
        tags: ["git"],
      })
      const service = yield* MemoryService.Service
      // Gate: the turn pipeline is retrieval-index-driven, not a recency window, and the block
      // stays far below the legacy 4000-char per-step cost. Measured on this exact pair.
      const turn = yield* Effect.promise(() => service.subsystem.onTurn({ query: "分支命名规范", scopes: ["global"] }))
      expect(turn.injectBlock).toContain("用短横线分隔")
      expect(turn.injectBlock.length).toBeLessThanOrEqual(400)
      expect(turn.decision.channels.trigger).toBe("ran")
      expect(turn.decision.channels.lexical).toBe("ran")
      const miss = yield* Effect.promise(() => service.subsystem.onTurn({ query: "今天天气怎么样", scopes: ["global"] }))
      expect(miss.entries).toHaveLength(0)

      // Step one of the turn: the block reaches the request tail, never the system section.
      const first = context(session.id)
      yield* hooks.trigger("session", "context", first)
      const block = injectedBlock(first)
      expect(block).toContain("用短横线分隔")
      expect(block).toContain("Relevant memory")
      expect(first.system).toHaveLength(0)

      // Step two reuses the turn result: identical bytes, so the provider cache prefix holds.
      const second = context(session.id)
      yield* hooks.trigger("session", "context", second)
      expect(injectedBlock(second)).toBe(block)

      // memory_log records the one real retrieval, not the cached step reuse.
      const { db } = yield* Database.Service
      const rows = yield* db.select({ injected: MemoryLogTable.injected, mode: MemoryLogTable.mode }).from(MemoryLogTable).all()
      expect(rows.length).toBe(1)
      expect(rows[0]!.injected.length).toBeGreaterThan(0)
      expect(rows[0]!.mode).toBe("trigger+vector")

      // An unrelated turn with no index hit injects nothing rather than a recency window.
      const quiet = context(session.id)
      quiet.messages[1] = new UserMessage({ role: "user", content: [{ type: "text", text: "今天天气怎么样" }] })
      yield* hooks.trigger("session", "context", quiet)
      expect(injectedBlock(quiet)).toBe("")
    }),
  )
})
