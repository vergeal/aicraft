import type { HytProfile, HytRole, HytScene, PresetName } from "./schema.js"
import { defaultProfile } from "./schema.js"

/**
 * 三套引导预设。预设只是一组完整的初始值，不代替引导：套用后 onboarding.completed 仍是 false，
 * 用户确认后由界面写入 completed / completedAt。
 */

export interface PresetDefinition {
  readonly name: PresetName
  readonly label: string
  readonly description: string
  readonly role: HytRole
  readonly scenes: readonly HytScene[]
  readonly capabilities: HytProfile["capabilities"]
  readonly cost: HytProfile["cost"]
}

const SCENE_ORDER: readonly HytScene[] = [
  "troubleshoot",
  "task-intake",
  "duty-alerts",
  "ticket-close",
  "meeting",
  "no-miss",
]

export const presetOps: PresetDefinition = {
  name: "ops",
  label: "运维值守",
  description: "盯群里的故障与告警，按白名单代发回复，定时汇总值班消息。",
  role: "it-ops",
  scenes: ["troubleshoot", "duty-alerts"],
  capabilities: {
    digest: { enabled: true, everyHours: 4 },
    tasks: { enabled: true },
    reminders: { enabled: true },
    knowledge: { enabled: true },
    drafts: { enabled: true },
    autopilot: { enabled: true, scope: "whitelist", whitelist: [] },
    style: { enabled: true },
  },
  cost: { analysisIntervalMinutes: 60, batchSize: 40, model: "" },
}

export const presetTasks: PresetDefinition = {
  name: "tasks",
  label: "任务助理",
  description: "从聊天里收任务、跟进工单闭环，每天汇总一次，不自动发送。",
  role: "tech-support",
  scenes: ["task-intake", "ticket-close"],
  capabilities: {
    digest: { enabled: true, everyHours: 24 },
    tasks: { enabled: true },
    reminders: { enabled: true },
    knowledge: { enabled: true },
    drafts: { enabled: true },
    autopilot: { enabled: false, scope: "off", whitelist: [] },
    style: { enabled: true },
  },
  cost: { analysisIntervalMinutes: 120, batchSize: 60, model: "" },
}

export const presetFull: PresetDefinition = {
  name: "full",
  label: "全面托管",
  description: "所有场景都启用：值守、任务、工单、会议与防漏读，仍只按白名单自动发送。",
  role: "it-ops",
  scenes: [...SCENE_ORDER],
  capabilities: {
    digest: { enabled: true, everyHours: 4 },
    tasks: { enabled: true },
    reminders: { enabled: true },
    knowledge: { enabled: true },
    drafts: { enabled: true },
    autopilot: { enabled: true, scope: "whitelist", whitelist: [] },
    style: { enabled: true },
  },
  cost: { analysisIntervalMinutes: 60, batchSize: 40, model: "" },
}

export const PRESETS: readonly PresetDefinition[] = [presetOps, presetTasks, presetFull]

export function presetOf(name: PresetName): PresetDefinition {
  return PRESETS.find((preset) => preset.name === name) ?? presetOps
}

/** 套用预设得到一份完整档案；account 由安装上下文传入，预设不自行推断。 */
export function applyPreset(name: PresetName, account = "", now = Date.now()): HytProfile {
  const preset = presetOf(name)
  const profile = defaultProfile(account, preset.role, now)
  return {
    ...profile,
    scenes: [...preset.scenes],
    capabilities: {
      digest: { ...preset.capabilities.digest },
      tasks: { ...preset.capabilities.tasks },
      reminders: { ...preset.capabilities.reminders },
      knowledge: { ...preset.capabilities.knowledge },
      drafts: { ...preset.capabilities.drafts },
      autopilot: {
        ...preset.capabilities.autopilot,
        whitelist: [...preset.capabilities.autopilot.whitelist],
      },
      style: { ...preset.capabilities.style },
    },
    cost: { ...preset.cost },
    onboarding: { completed: false, preset: preset.name },
  }
}
