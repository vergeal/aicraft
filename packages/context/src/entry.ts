import type { Layer } from "./layer.js"

/**
 * 内核的统一内容单元。core 侧 adapter 负责把领域对象翻译到这里；
 * layer 标注决定装配落点，source 进审计。
 */
export interface ContextEntry {
  readonly id: string
  readonly layer: Layer
  readonly text: string
  readonly source: string
}

/** L2 能力声明。schema 以序列化文本驻留，便于字节级漂移检测。 */
export interface ToolDecl {
  readonly name: string
  readonly source: string
  readonly schemaJson: string
}

/** L4 状态声明：替换式语义，同一 key 至多一条生效。 */
export interface StateClaim {
  readonly key: string
  readonly text: string
  readonly source: string
}

/** L5 动态描述（日期、环境变化）：热变更，不进历史快照。 */
export type DynamicFacts = ReadonlyArray<ContextEntry>

/** L6 记忆注入：memory 子系统检索产出，命中即携带、transient、永不落 L3。 */
export type MemoryInjection = ReadonlyArray<ContextEntry>

/** L7 本轮问答输入。轮末由 core 转为 durable 条目进 L3，内核不负责。 */
export interface TurnInput {
  readonly role: "user" | "synthetic"
  readonly content: ReadonlyArray<ContextEntry>
}

/** 账本条目：L1–L3 源变化的观测记录，模型不可见，absorb 时结算。 */
export interface JournalEntry {
  readonly key: string
  readonly observedAt: number
  readonly render: string
}

/** compaction 版本推进时的历史折叠参数（epoch 时钟拨动的唯一载体）。 */
export interface HistoryFold {
  readonly summary: ContextEntry
  readonly keepFromSeq: number
  readonly kept: ReadonlyArray<ContextEntry>
}
