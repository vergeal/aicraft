import type { ContextEntry } from "./entry.js"

const encoder = new TextEncoder()

/**
 * The package's single size metric: UTF-8 byte length. It is the unit `LayerUsage.bytes`
 * reports in the audit (DESIGN.md §7) and matches core's existing measurement
 * (`Buffer.byteLength(..., "utf8")` in session/instruction-entry.ts), so a budget
 * declared here and the audit that explains it are the same unit.
 * Budgets are never counted in characters or tokens: for CJK content a character count
 * understates the wire cost by up to 3×, and a token count needs a provider tokenizer
 * that does not exist at this layer (§9 translation-cost clause).
 */
export const measureBytes = (text: string): number => encoder.encode(text).length

/** Audit record of one budget pass; `droppedKeys` is what the over-budget alert reads. */
export interface BudgetAudit {
  /** `ContextEntry.id`s dropped by this pass, in stream order. */
  readonly droppedKeys: ReadonlyArray<string>
  readonly used: number
  readonly budget: number
}

export interface BudgetOutcome {
  readonly kept: ReadonlyArray<ContextEntry>
  /** Same ids as `audit.droppedKeys`, kept flat for callers that only log. */
  readonly dropped: ReadonlyArray<string>
  readonly truncated: boolean
  readonly audit: BudgetAudit
}

/**
 * Apply one supplier/layer budget to an ordered entry stream (DESIGN.md §5:防控 shifts
 * from code review to "装配器按预算截断 + 审计超标告警").
 *
 * Governs `budget_exceeded` and **does not throw**: over budget is a degradation with
 * an audit trail, not a refusal of service. errors.ts left the hard-reject decision to
 * P3; this is that decision — truncate and make it visible.
 *
 * Two policies fixed here:
 * 1. A misfit entry is dropped **whole**, never cut mid-text. A severed fenced block
 *    or half a JSON tool schema misinforms the model worse than its absence, and an
 *    entry whose rendering depends on how much budget was left would break the
 *    byte-level diffing culture of §3 invariant 1.
 * 2. The cut is a **contiguous prefix**: the first entry that does not fit ends the
 *    stream and everything behind it goes with it. Skipping the misfit to keep later
 *    entries would make one supplier's growth displace nothing behind it, so the kept
 *    set is always "the first N entries" — reproducible, and monotone in budget.
 *
 * `source` attribution for a dropped id is recoverable from the input array; the
 * outcome keeps ids so the audit stays comparable across steps.
 */
export const applyBudget = (
  entries: ReadonlyArray<ContextEntry>,
  budget: number,
): BudgetOutcome => {
  const limit = Number.isFinite(budget) && budget > 0 ? budget : 0
  const kept: ContextEntry[] = []
  let used = 0
  for (const entry of entries) {
    const size = measureBytes(entry.text)
    if (used + size > limit) break
    used += size
    kept.push(entry)
  }
  const dropped = entries.slice(kept.length).map((entry) => entry.id)
  return {
    kept,
    dropped,
    truncated: dropped.length > 0,
    audit: { droppedKeys: dropped, used, budget: limit },
  }
}
