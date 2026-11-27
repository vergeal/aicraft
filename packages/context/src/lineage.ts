import type { AbsorbKind, BumpReason } from "./snapshot.js"

/** 快照谱系的时钟位置。纯数据；推进规则集中在本文件，宿主不得自行算号。 */
export interface Lineage {
  readonly epoch: number
  readonly prefixVersion: number
  readonly parentVersion: number | undefined
  readonly bumpReason: BumpReason
}

export const initialLineage = (): Lineage => ({
  epoch: 1,
  prefixVersion: 1,
  parentVersion: undefined,
  bumpReason: "initial",
})

/**
 * 双时钟推进：compaction 同拨 epoch 与 prefixVersion；advance 只拨 prefixVersion（epoch 边界未发生折叠）。
 * 谱系树示例见 DESIGN.md §2。
 */
export const bumpLineage = (lineage: Lineage, kind: AbsorbKind): Lineage => ({
  epoch: kind === "compaction" ? lineage.epoch + 1 : lineage.epoch,
  prefixVersion: lineage.prefixVersion + 1,
  parentVersion: lineage.prefixVersion,
  bumpReason: kind,
})
