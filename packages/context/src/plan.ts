import type { ContextEntry, ToolDecl } from "./entry.js"
import type { Layer } from "./layer.js"
import type { BumpReason } from "./snapshot.js"

/** provider 无关的中立消息；parts 携带层/来源标注，审计可按段归属。 */
export interface PlanMessage {
  readonly role: "system" | "user" | "assistant"
  readonly parts: ReadonlyArray<ContextEntry>
}

export interface LayerUsage {
  readonly layer: Layer
  readonly bytes: number
  readonly sources: ReadonlyArray<string>
}

/** 每次装配的审计输出：提示词实验的验证面（DESIGN.md §7 迁移映射末行）。 */
export interface LayerAudit {
  readonly layers: ReadonlyArray<LayerUsage>
  readonly epoch: number
  readonly prefixVersion: number
  readonly bumpReason: BumpReason
  /** 待结算账本条数：advance/compaction 的收益预览。 */
  readonly journalPending: number
}

export interface RequestPlan {
  readonly system: ReadonlyArray<ContextEntry>
  readonly tools: ReadonlyArray<ToolDecl>
  readonly messages: ReadonlyArray<PlanMessage>
  readonly audit: LayerAudit
}
