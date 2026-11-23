/**
 * 插件设置：清单里声明的 configuration 是用户级扁平配置，aicraft.json 里的插件 options 是项目级入口配置。
 * 两者合并时用户级优先，因为它们来自设置界面，是用户最后一次明确的意图。
 */

export interface Settings {
  readonly chfileRoot: string
  readonly account: string
  readonly autoStartBridge: boolean
  readonly bridgePath: string
  readonly whitelist: readonly string[]
  readonly autoReplyEnabled: boolean
  readonly knowledgePaths: readonly string[]
  readonly mcpKnowledgeTools: readonly string[]
  readonly analysisBatchSize: number
  readonly analysisIntervalMinutes: number
}

export const DEFAULTS: Settings = {
  chfileRoot: "",
  account: "",
  autoStartBridge: true,
  bridgePath: "",
  whitelist: [],
  autoReplyEnabled: false,
  knowledgePaths: [],
  mcpKnowledgeTools: [],
  analysisBatchSize: 50,
  analysisIntervalMinutes: 30,
}

export function readSettings(config: Record<string, unknown>, options: Record<string, unknown> = {}): Settings {
  const merged = { ...options, ...config }
  return {
    chfileRoot: text(merged.chfileRoot, DEFAULTS.chfileRoot),
    account: text(merged.account, DEFAULTS.account),
    autoStartBridge: flag(merged.autoStartBridge, DEFAULTS.autoStartBridge),
    bridgePath: text(merged.bridgePath, DEFAULTS.bridgePath),
    whitelist: list(merged.whitelist),
    autoReplyEnabled: flag(merged.autoReplyEnabled, DEFAULTS.autoReplyEnabled),
    knowledgePaths: list(merged.knowledgePaths),
    mcpKnowledgeTools: list(merged.mcpKnowledgeTools),
    analysisBatchSize: bounded(merged.analysisBatchSize, DEFAULTS.analysisBatchSize, 5, 500),
    analysisIntervalMinutes: bounded(merged.analysisIntervalMinutes, DEFAULTS.analysisIntervalMinutes, 1, 1_440),
  }
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" ? value.trim() : fallback
}

function flag(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

function list(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
}

function bounded(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}
