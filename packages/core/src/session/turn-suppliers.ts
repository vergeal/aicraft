export * as SessionTurnSuppliers from "./turn-suppliers.js"

import { Budget, LAYERS, Suppliers, rank, type ContextEntry, type LayerUsage } from "@aicraft/context"
import { Instructions } from "../instructions/index.js"
import { MAX_STEPS_PROMPT } from "./runner/max-steps.js"

/**
 * Conservative per-supplier byte ceiling until the kernel routes real streams through
 * `auditSupplied` with tuned numbers (DESIGN §5 每层预算). It bounds only the
 * unbounded-spam case the budgets exist to close, without cutting today's largest
 * legitimate guidance catalogs.
 */
export const DEFAULT_SUPPLIER_BUDGET = 16 * 1024

/**
 * Build the declared turn-supplier set from instruction sources (DESIGN §5, the two faces).
 * Sources declaring a frozen prefix layer (L1–L3) belong to the static-registration face:
 * their content enters the ledger and moves only on version advance, so they are skipped —
 * `validateRegistration` rejects those layers by design and must never see them. Sources
 * with no declaration default to the same face, so a future undeclared source cannot sneak
 * an unbudgeted turn slot. Only turn-layer sources reach `Suppliers.register`, which is
 * where `validateRegistration` runs (§8: a frozen-slot declaration dies at registration).
 */
export const buildRegistry = (sources: Instructions.List): Suppliers.SupplierRegistry =>
  sources.reduce<Suppliers.SupplierRegistry>(
    (registry, source) =>
      source.layer === undefined || !Suppliers.isTurnLayer(source.layer)
        ? registry
        : Suppliers.register(registry, { id: source.key, layer: source.layer, budget: DEFAULT_SUPPLIER_BUDGET }),
    Suppliers.emptyRegistry,
  )

/** One supplier's cut, tagged with the supplier id for the over-budget alert. */
export interface SupplierCut {
  readonly id: string
  readonly audit: Budget.BudgetAudit
}

export interface SuppliedAudit {
  /** Kept entries in assembly order: layer rank, then supplier declaration order. */
  readonly kept: ReadonlyArray<ContextEntry>
  /** Per-layer usage of the kept stream — the shape `LayerAudit.layers` reports (§7). */
  readonly layers: ReadonlyArray<LayerUsage>
  /** Only the suppliers the budget cut; empty when everything fit. */
  readonly overbudget: ReadonlyArray<SupplierCut>
  readonly truncated: boolean
}

/**
 * Budget one turn's supplied entry stream and fold the result into audit records
 * (DESIGN §5: 装配器按预算截断 + 审计超标告警). Each supplier's entries pack against that
 * supplier's registered byte budget; entries from ids the registry does not know pass
 * unbudgeted — P3 gates declared suppliers, and the hook channel is audited where it
 * reports. Never throws: `applyBudget` degrades by dropping whole entries (budget.ts), and
 * every cut is named in `overbudget`. Kept groups are reassembled in nondecreasing layer
 * rank so the stream can enter the assembler without tripping `checkLayerOrder`
 * (§3 invariant 5).
 */
export const auditSupplied = (
  entries: ReadonlyArray<ContextEntry>,
  registry: Suppliers.SupplierRegistry,
): SuppliedAudit => {
  const order: string[] = []
  const groups = new Map<string, ContextEntry[]>()
  for (const entry of entries) {
    const group = groups.get(entry.id)
    if (group === undefined) {
      groups.set(entry.id, [entry])
      order.push(entry.id)
    } else group.push(entry)
  }
  const grouped = order.map((id) => {
    const group = groups.get(id) ?? []
    const registration = registry.find((candidate) => candidate.id === id)
    if (registration === undefined) return { layer: group[0]?.layer ?? "L8", entries: group as ReadonlyArray<ContextEntry> }
    const applied = Budget.applyBudget(group, registration.budget)
    return { layer: group[0]?.layer ?? "L8", entries: applied.kept, cut: applied.truncated ? { id, audit: applied.audit } : undefined }
  })
  const ordered = grouped.toSorted((a, b) => rank(a.layer) - rank(b.layer))
  const kept = ordered.flatMap((group) => group.entries)
  const layers = LAYERS.flatMap((layer): ReadonlyArray<LayerUsage> => {
    const inLayer = kept.filter((entry) => entry.layer === layer)
    if (inLayer.length === 0) return []
    return [
      {
        layer,
        bytes: inLayer.reduce((sum, entry) => sum + Budget.measureBytes(entry.text), 0),
        sources: [...new Set(inLayer.map((entry) => entry.id))],
      },
    ]
  })
  const overbudget = grouped.flatMap((group) => (group.cut === undefined ? [] : [group.cut]))
  return { kept, layers, overbudget, truncated: overbudget.length > 0 }
}

/**
 * L6 memory-channel declaration (DESIGN §1 记忆层). The subsystem packs the retrieval block
 * in characters (`maxInjectedChars`); the core-side budget speaks UTF-8 bytes (budget.ts),
 * so the cap converts through its worst-case envelope — three bytes per character. A block
 * the subsystem packed correctly always passes; the gate only ever cuts a supplier that
 * overshoots its own declared cap. Tightening the factor would silently drop legitimate
 * CJK blocks, which is the regression this conversion exists to avoid.
 */
export const memoryChannel = (maxInjectedChars: number): Suppliers.SupplierRegistration => {
  const registration: Suppliers.SupplierRegistration = {
    id: "memory",
    layer: "L6",
    budget: maxInjectedChars * 3,
  }
  Suppliers.validateRegistration(registration)
  return registration
}

/**
 * One L8 tail supplier: the registry declaration plus the text the runner injects. The
 * injection position and message shape stay core's; the registry owns the bytes, so §7's
 * "MAX_STEPS → L8 供给者注册表" holds without a second literal at the call site.
 */
export interface TailSupplier {
  readonly registration: Suppliers.SupplierRegistration
  readonly text: string
}

/**
 * The MAX_STEPS text as an L8 supplier. Its budget is the constant's exact UTF-8 size:
 * editing max-steps.ts must re-declare this number on purpose, because a tail supplier
 * that grew silently is exactly what §5 budgets exist to catch.
 */
export const MAX_STEPS: TailSupplier = {
  registration: { id: "l8/max-steps", layer: "L8", budget: Budget.measureBytes(MAX_STEPS_PROMPT) },
  text: MAX_STEPS_PROMPT,
}

/** The L8 registry, built through `Suppliers.register` so `validateRegistration` runs at load. */
export const tailRegistry = [MAX_STEPS].reduce(
  (registry, supplier) => Suppliers.register(registry, supplier.registration),
  Suppliers.emptyRegistry,
)
