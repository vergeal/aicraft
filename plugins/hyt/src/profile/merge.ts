import type { HytProfile, HytRole, HytScene, PresetName } from "./schema.js"
import { defaultProfile } from "./schema.js"
import { applyPreset } from "./presets.js"

/**
 * 合并与优先级：
 *   默认值 → 预设 → configuration（粗粒度安装期开关）→ 已保存的 profile（引导结果，逐字段优先）。
 * mergeProfile 只覆盖 patch 里出现的字段，所以引导后的细粒度结果不会被粗粒度开关冲掉。
 */

export interface ProfilePatch {
  readonly version?: 1
  readonly account?: string
  readonly role?: HytRole
  readonly scenes?: readonly HytScene[]
  readonly capabilities?: {
    readonly digest?: { readonly enabled?: boolean; readonly everyHours?: number }
    readonly tasks?: { readonly enabled?: boolean }
    readonly reminders?: { readonly enabled?: boolean }
    readonly knowledge?: { readonly enabled?: boolean }
    readonly drafts?: { readonly enabled?: boolean }
    readonly autopilot?: {
      readonly enabled?: boolean
      readonly scope?: HytProfile["capabilities"]["autopilot"]["scope"]
      readonly whitelist?: readonly string[]
    }
    readonly style?: { readonly enabled?: boolean }
  }
  readonly cost?: {
    readonly analysisIntervalMinutes?: number
    readonly batchSize?: number
    readonly model?: string
  }
  readonly knowledge?: {
    readonly builtin?: boolean
    readonly paths?: readonly string[]
    readonly mcpTools?: readonly string[]
  }
  readonly onboarding?: {
    readonly completed?: boolean
    readonly completedAt?: number
    readonly preset?: PresetName
  }
  readonly updatedAt?: number
}

export function mergeProfile(base: HytProfile, patch: ProfilePatch, now = Date.now()): HytProfile {
  const capabilities = patch.capabilities
  const cost = patch.cost
  const knowledge = patch.knowledge
  const onboarding = patch.onboarding
  const completedAt = onboarding?.completedAt ?? base.onboarding.completedAt
  const preset = onboarding?.preset ?? base.onboarding.preset
  return {
    version: patch.version ?? base.version,
    account: patch.account ?? base.account,
    role: patch.role ?? base.role,
    scenes: patch.scenes === undefined ? base.scenes : [...patch.scenes],
    capabilities: {
      digest: {
        enabled: capabilities?.digest?.enabled ?? base.capabilities.digest.enabled,
        everyHours: capabilities?.digest?.everyHours ?? base.capabilities.digest.everyHours,
      },
      tasks: { enabled: capabilities?.tasks?.enabled ?? base.capabilities.tasks.enabled },
      reminders: { enabled: capabilities?.reminders?.enabled ?? base.capabilities.reminders.enabled },
      knowledge: { enabled: capabilities?.knowledge?.enabled ?? base.capabilities.knowledge.enabled },
      drafts: { enabled: capabilities?.drafts?.enabled ?? base.capabilities.drafts.enabled },
      autopilot: {
        enabled: capabilities?.autopilot?.enabled ?? base.capabilities.autopilot.enabled,
        scope: capabilities?.autopilot?.scope ?? base.capabilities.autopilot.scope,
        whitelist:
          capabilities?.autopilot?.whitelist === undefined
            ? base.capabilities.autopilot.whitelist
            : [...capabilities.autopilot.whitelist],
      },
      style: { enabled: capabilities?.style?.enabled ?? base.capabilities.style.enabled },
    },
    cost: {
      analysisIntervalMinutes:
        cost?.analysisIntervalMinutes ?? base.cost.analysisIntervalMinutes,
      batchSize: cost?.batchSize ?? base.cost.batchSize,
      model: cost?.model ?? base.cost.model,
    },
    knowledge: {
      builtin: knowledge?.builtin ?? base.knowledge.builtin,
      paths: knowledge?.paths === undefined ? base.knowledge.paths : [...knowledge.paths],
      mcpTools: knowledge?.mcpTools === undefined ? base.knowledge.mcpTools : [...knowledge.mcpTools],
    },
    onboarding: {
      completed: onboarding?.completed ?? base.onboarding.completed,
      ...(completedAt === undefined ? {} : { completedAt }),
      ...(preset === undefined ? {} : { preset }),
    },
    updatedAt: patch.updatedAt ?? now,
  }
}

/**
 * configuration 是安装期的粗粒度开关，映射到 profile 里语义对应的字段：
 * whitelist、autoReplyEnabled、knowledgePaths、mcpKnowledgeTools、analysisBatchSize、analysisIntervalMinutes。
 * 类型不对或没出现的键不覆盖。
 */
export function applyConfiguration(
  base: HytProfile,
  config: Readonly<Record<string, unknown>>,
): HytProfile {
  const whitelist = strings(config.whitelist)
  const autoReply = flag(config.autoReplyEnabled)
  const paths = strings(config.knowledgePaths)
  const mcpTools = strings(config.mcpKnowledgeTools)
  const batchSize = number(config.analysisBatchSize, 5, 500)
  const interval = number(config.analysisIntervalMinutes, 1, 1_440)
  const autopilot = base.capabilities.autopilot
  return {
    ...base,
    capabilities: {
      ...base.capabilities,
      autopilot: {
        enabled: autoReply ?? autopilot.enabled,
        scope:
          autoReply === undefined
            ? autopilot.scope
            : autoReply
              ? autopilot.scope === "off"
                ? "whitelist"
                : autopilot.scope
              : "off",
        whitelist: whitelist ?? autopilot.whitelist,
      },
    },
    cost: {
      analysisIntervalMinutes: interval ?? base.cost.analysisIntervalMinutes,
      batchSize: batchSize ?? base.cost.batchSize,
      model: base.cost.model,
    },
    knowledge: {
      builtin: base.knowledge.builtin,
      paths: paths ?? base.knowledge.paths,
      mcpTools: mcpTools ?? base.knowledge.mcpTools,
    },
  }
}

export interface ResolveProfileInput {
  readonly account: string
  readonly role?: HytRole
  readonly preset?: PresetName
  readonly config?: Readonly<Record<string, unknown>>
  /** 已保存的引导结果；传进来即覆盖所有同名项。 */
  readonly saved?: HytProfile
  readonly now?: number
}

/** 一条链路算出最终档案，调用方不需要自己记优先级。 */
export function resolveProfile(input: ResolveProfileInput): HytProfile {
  const now = input.now ?? Date.now()
  const base = input.preset === undefined
    ? defaultProfile(input.account, input.role, now)
    : applyPreset(input.preset, input.account, now)
  const withRole =
    input.role === undefined
      ? base
      : mergeProfile(base, { role: input.role }, now)
  const withConfig = applyConfiguration(withRole, input.config ?? {})
  return input.saved === undefined ? withConfig : mergeProfile(withConfig, input.saved, now)
}

function flag(value: unknown) {
  return typeof value === "boolean" ? value : undefined
}

function strings(value: unknown) {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
}

function number(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, Math.floor(value)))
}
