import { describe, expect } from "bun:test"
import { AppNodeBuilder } from "@aicraft/core/effect/app-node-builder"
import { Config } from "@aicraft/core/config"
import { Document, Info } from "@aicraft/schema/config"
import { Effect, Layer, Stream } from "effect"
import { SkillPlugin } from "@aicraft/core/plugin/skill"
import { Skill } from "@aicraft/core/skill"
import { testEffect } from "../lib/effect"
import { host } from "./host"

const it = testEffect(AppNodeBuilder.build(Skill.node))
const config = (plugins: Info["plugins"] = []) =>
  Layer.succeed(
    Config.Service,
    Config.Service.of({
      entries: () => Effect.succeed([new Document({ type: "document", info: new Info({ plugins }) })]),
      snapshot: () => [new Document({ type: "document", info: new Info({ plugins }) })],
      changes: () => Stream.never,
    }),
  )

describe("SkillPlugin.Plugin", () => {
  it.effect("registers built-in skills", () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      yield* SkillPlugin.Plugin.effect(
        host({
          app: { name: "test", version: "1.2.3", channel: "beta" },
          skill: {
            list: () => Effect.die("unused skill.list"),
            local: () => Effect.die("unused skill.local"),
            transform: skill.transform,
            reload: skill.reload,
          },
        }),
      ).pipe(Effect.provide(config()))
      const skills = yield* skill.list()
      const report = skills.find((item) => item.id === "report")

      expect(skills).toContainEqual(
        expect.objectContaining({
          id: "aicraft",
          name: "AI Craft 使用指南",
          path: "skill://aicraft/SKILL.md",
          description: expect.stringContaining("回答一切关于 AI Craft 自身的问题"),
        }),
      )
      expect(skills).toContainEqual(
        expect.objectContaining({
          id: "report",
          name: "问题反馈",
          path: "skill://report/SKILL.md",
          description: expect.stringContaining("当用户想报告 AI Craft 的问题或缺陷时使用"),
        }),
      )
      expect(report?.content).toContain("- AI Craft version: 1.2.3")
      expect(report?.content).toContain("- install/channel: beta")
    }),
  )

  it.effect("reports canonical configured plugin sources with existing labels and ordering", () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      yield* SkillPlugin.Plugin.effect(
        host({
          skill: {
            list: () => Effect.die("unused skill.list"),
            local: () => Effect.die("unused skill.local"),
            transform: skill.transform,
            reload: skill.reload,
          },
        }),
      )
      const report = (yield* skill.list()).find((item) => item.id === "report")
      expect(report?.content).toContain("- Active plugins: -disabled, local.ts, package-plugin, package-plugin")
    }).pipe(
      Effect.provide(
        config(["package-plugin", "-disabled", "local.ts", { package: "package-plugin", options: { enabled: true } }]),
      ),
    ),
  )
})
