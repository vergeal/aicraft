import type { ContextEntry, HistoryFold, ToolDecl } from "./entry.js"

/** 版本断裂原因：审计与谱系追溯用（DESIGN.md §2 双时钟）。 */
export type BumpReason = "initial" | "advance" | "compaction"

/**
 * 会话上下文快照：L1–L3 不动产层的唯一事实源。
 * 首聊经 `start` 建立 v1；版本内只读；写路径只有 `absorb`。
 */
export interface Snapshot {
  readonly sessionID: string
  readonly epoch: number
  readonly prefixVersion: number
  readonly parentVersion: number | undefined
  readonly bumpReason: BumpReason
  readonly l1: ReadonlyArray<ContextEntry>
  readonly l2: ReadonlyArray<ToolDecl>
  /** L3 折叠段（压缩摘要 + 保留原文）；段外新历史经 assemble 输入的 history 追加。 */
  readonly l3Fold: ReadonlyArray<ContextEntry>
  /** 折叠段覆盖到的最后一个 durable seq，L3 投影的起点。 */
  readonly l3FoldThroughSeq: number
}

/** 版本推进的两种命令。 */
export type AbsorbKind = "advance" | "compaction"

/** absorb 命令：advance 只拨 prefixVersion；compaction 同时拨 epoch 并要求折叠参数。 */
export type AbsorbCommand = { readonly kind: "advance" } | { readonly kind: "compaction"; readonly fold: HistoryFold }
