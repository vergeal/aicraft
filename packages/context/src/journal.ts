import type { JournalEntry } from "./entry.js"
import type { AbsorbKind } from "./snapshot.js"
import { bumpLineage, type Lineage } from "./lineage.js"

/**
 * 账本折叠：同一 key 的矛盾条目（卸载→重装、改回原值）结算为净变化——终值与
 * baseline 值相同的 key 净零消失，其余 key 只留最后一条观测与其最新叙述。
 * L4 替换式渲染与 absorb 结算共用这套规则（DESIGN.md §3 不变式 3）。
 */
export const fold = (
  entries: ReadonlyArray<JournalEntry>,
  baseline: ReadonlyMap<string, string | undefined>,
): ReadonlyArray<JournalEntry> => {
  const ordered = [...entries].sort((a, b) => a.observedAt - b.observedAt)
  const last = new Map<string, JournalEntry>()
  for (const entry of ordered) last.set(entry.key, entry)
  return [...last.values()].filter((entry) => baseline.get(entry.key) !== entry.value)
}

export interface Absorbed {
  readonly lineage: Lineage
  /** 结算进新 baseline 的净变化 key（审计口径：absorb 后这些 key 不再出现在 L4）。 */
  readonly settled: ReadonlyArray<string>
}

/**
 * absorb 纯函数内核：拨双时钟并给出结算清单。快照与账本的实际重写由宿主（core）
 * 在唯一写路径里执行——DESIGN.md §3 不变式 2。
 */
export const absorb = (
  lineage: Lineage,
  baseline: ReadonlyMap<string, string | undefined>,
  facts: ReadonlyArray<JournalEntry>,
  kind: AbsorbKind,
): Absorbed => ({
  lineage: bumpLineage(lineage, kind),
  settled: fold(facts, baseline).map((entry) => entry.key),
})
