import { optional } from "@opencode/schema/schema"
import { Schema } from "effect"

/**
 * 引导档案：首次安装时用户回答的结果，是 AI 行为、提示词片段、定时任务与成本预算的唯一来源。
 * 纯数据层，不含界面与运行时；界面与会话都从这里 import 类型和函数。
 * 优先级：profile 字段 > ocplugin.json configuration 的同名项 > 默认值，见 ./merge.ts。
 */

export const ROLES = ["it-ops", "tech-support", "engineering", "management", "business", "other"] as const
export const SCENES = [
  "troubleshoot",
  "task-intake",
  "duty-alerts",
  "ticket-close",
  "meeting",
  "no-miss",
] as const
export const PRESET_NAMES = ["ops", "tasks", "full"] as const
export const AUTOPILOT_SCOPES = ["off", "whitelist", "all"] as const

export type HytRole = (typeof ROLES)[number]
export type HytScene = (typeof SCENES)[number]
export type PresetName = (typeof PRESET_NAMES)[number]
export type AutopilotScope = (typeof AUTOPILOT_SCOPES)[number]

export const HytProfile = Schema.Struct({
  version: Schema.Literal(1),
  account: Schema.String,
  role: Schema.Literals(ROLES),
  scenes: Schema.Array(Schema.Literals(SCENES)),
  capabilities: Schema.Struct({
    digest: Schema.Struct({ enabled: Schema.Boolean, everyHours: Schema.Number }),
    tasks: Schema.Struct({ enabled: Schema.Boolean }),
    reminders: Schema.Struct({ enabled: Schema.Boolean }),
    knowledge: Schema.Struct({ enabled: Schema.Boolean }),
    drafts: Schema.Struct({ enabled: Schema.Boolean }),
    autopilot: Schema.Struct({
      enabled: Schema.Boolean,
      scope: Schema.Literals(AUTOPILOT_SCOPES),
      whitelist: Schema.Array(Schema.String),
    }),
    style: Schema.Struct({ enabled: Schema.Boolean }),
  }),
  cost: Schema.Struct({
    analysisIntervalMinutes: Schema.Number,
    batchSize: Schema.Number,
    model: Schema.String,
  }),
  knowledge: Schema.Struct({
    builtin: Schema.Boolean,
    paths: Schema.Array(Schema.String),
    mcpTools: Schema.Array(Schema.String),
  }),
  onboarding: Schema.Struct({
    completed: Schema.Boolean,
    completedAt: optional(Schema.Number),
    preset: optional(Schema.Literals(PRESET_NAMES)),
  }),
  updatedAt: Schema.Number,
})

export type HytProfile = typeof HytProfile.Type

/** 未经过引导、也没有选预设时的中性档案：所有自动化关闭，只保留内置知识库。 */
export function defaultProfile(account: string, role: HytRole = "it-ops", now = Date.now()): HytProfile {
  return {
    version: 1,
    account,
    role,
    scenes: [],
    capabilities: {
      digest: { enabled: false, everyHours: 24 },
      tasks: { enabled: false },
      reminders: { enabled: false },
      knowledge: { enabled: false },
      drafts: { enabled: false },
      autopilot: { enabled: false, scope: "off", whitelist: [] },
      style: { enabled: false },
    },
    cost: { analysisIntervalMinutes: 30, batchSize: 50, model: "" },
    knowledge: { builtin: true, paths: [], mcpTools: [] },
    onboarding: { completed: false },
    updatedAt: now,
  }
}
