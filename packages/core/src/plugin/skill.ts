/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill.js"

import { SkillPackage } from "@aicraft/plugin/skill-package"
import { define, type Context } from "@aicraft/plugin/effect/plugin"
import { Document } from "@aicraft/schema/config"
import { Effect } from "effect"
import { Config } from "../config.js"
import os from "os"
import aicraftContent from "./skill/aicraft.md" with { type: "text" }
import reportContent from "./skill/report.md" with { type: "text" }
import creatorContent from "./skill/creator.md" with { type: "text" }

export const AicraftContent = aicraftContent
export const ReportContent = reportContent
export const CreatorContent = creatorContent

export const Plugin = define({
  id: "aicraft.skill",
  effect: Effect.fn(function* (ctx) {
    const reportContent = yield* reportContentWithDiagnostics(ctx.app)
    // Each built-in skill is the same SKILL.md package a published skill ships, read the same way.
    yield* ctx.skill.transform((editor) => {
      editor.add(SkillPackage.read("aicraft", AicraftContent))
      editor.add(SkillPackage.read("report", reportContent))
      editor.add(SkillPackage.read("creator", CreatorContent))
    })
  }),
})

const reportContentWithDiagnostics = Effect.fn("SkillPlugin.reportContentWithDiagnostics")(function* (
  app: Context["app"],
) {
  const plugins = yield* configuredPlugins()
  // Under emulation on Windows ARM64, os.arch() reads x64 but PROCESSOR_IDENTIFIER still names the ARM host.
  const emulated =
    process.platform === "win32" && os.arch() === "x64" && process.env.PROCESSOR_IDENTIFIER?.startsWith("ARM")
  return [
    ReportContent,
    "",
    "## Runtime diagnostics snapshot",
    "",
    "These values were captured while registering the built-in report skill. Verify them before filing.",
    "",
    `- AI Craft version: ${app.version}`,
    `- install/channel: ${app.channel}`,
    `- OS: ${os.type()} ${os.release()} (${os.platform()} ${os.arch()}${emulated ? ", emulated on ARM64" : ""})`,
    `- Terminal: ${terminal()}`,
    `- Shell: ${shell()}`,
    `- Active plugins: ${plugins.length === 0 ? "none found in configuration" : plugins.join(", ")}`,
  ].join("\n")
})

const configuredPlugins = Effect.fn("SkillPlugin.configuredPlugins")(function* () {
  const config = yield* Config.Service
  return (yield* config.entries())
    .filter((entry): entry is Document => entry.type === "document")
    .flatMap((entry) => entry.info.plugins ?? [])
    .map((entry) => (typeof entry === "string" ? entry : entry.package))
    .toSorted()
})

function terminal() {
  return (
    [
      process.env.TERM_PROGRAM ? `TERM_PROGRAM=${process.env.TERM_PROGRAM}` : undefined,
      process.env.TERM ? `TERM=${process.env.TERM}` : undefined,
      process.env.COLORTERM ? `COLORTERM=${process.env.COLORTERM}` : undefined,
    ]
      .filter((item): item is string => item !== undefined)
      .join(", ") || "Unavailable: the terminal environment variable is not set"
  )
}

function shell() {
  return (
    process.env.SHELL ??
    process.env.ComSpec ??
    process.env.COMSPEC ??
    "Unavailable: the shell environment variable is not set"
  )
}
