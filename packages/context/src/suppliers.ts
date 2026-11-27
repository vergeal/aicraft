import type { ContextEntry } from "./entry.js"
import { LayerViolation } from "./errors.js"
import { FROZEN_LAYERS, rank, type Layer } from "./layer.js"

/**
 * Layers a turn supplier is allowed to declare: L4 state claims, L5 dynamic facts,
 * L6 memory injection, L8 tail injection (DESIGN.md §5, "Turn 供给者" row).
 * L7 is deliberately absent — turn input is core's own channel (§4), not a slot a
 * supplier registers into.
 */
export const TURN_LAYERS = ["L4", "L5", "L6", "L8"] as const satisfies ReadonlyArray<Layer>

export type TurnLayer = (typeof TURN_LAYERS)[number]

/**
 * Prefix layers: byte-frozen inside a version, writable only through `absorb`
 * (DESIGN.md §3 invariant 1/2). Part of the declaration type on purpose — an
 * untyped manifest can still name L1–L3, and `validateRegistration` is what stops it.
 */
export type PrefixLayer = (typeof FROZEN_LAYERS)[number]

/** Every layer the supplier contract knows about: the eight layers minus L7. */
export type SupplierLayer = TurnLayer | PrefixLayer

/** Registration of one turn supplier. Static (L1/L2) manifest registration never reaches this type — its content goes through the ledger and lands on version advance (§5). */
export interface SupplierRegistration {
  readonly id: string
  readonly layer: SupplierLayer
  /**
   * Byte ceiling for everything this supplier contributes to `layer` in one turn.
   * Unit is UTF-8 bytes (`measureBytes` in budget.ts), the same metric
   * `LayerUsage.bytes` reports in the audit (DESIGN.md §7) — not character count:
   * CJK text is 3 bytes per character, so a mixed-unit budget would silently triple
   * a supplier's allowance. A manifest that speaks tokens converts before registering.
   */
  readonly budget: number
}

export const isTurnLayer = (layer: Layer): layer is TurnLayer =>
  (TURN_LAYERS as ReadonlyArray<Layer>).includes(layer)

/**
 * Gate for the turn-supplier registration channel (DESIGN.md §5 entry table).
 * Governs two violations:
 * - `frozen_slot`: a supplier declaring L1–L3. The prefix is owned by `absorb`; P3's
 *   acceptance criterion is that such a declaration dies at runtime even when it
 *   arrives through an untyped manifest (§8).
 * - `budget_exceeded`: a budget that is not a positive finite number. Zero/negative
 *   means "contribute nothing" (deregister instead) and `Infinity` is the exact
 *   unbounded-spam case §5 introduced budgets to close.
 * Throws instead of returning a result: `LayerViolation` is a defect (errors.ts), not
 * a business outcome the caller should branch on; inside an Effect region a plain
 * throw becomes a defect cause the same way `Effect.die` would.
 */
export const validateRegistration = (registration: SupplierRegistration): void => {
  if (!isTurnLayer(registration.layer))
    throw new LayerViolation(
      "frozen_slot",
      `supplier ${registration.id} declares ${registration.layer}, a frozen prefix layer only absorb may write`,
    )
  if (!Number.isFinite(registration.budget) || registration.budget <= 0)
    throw new LayerViolation(
      "budget_exceeded",
      `supplier ${registration.id} declares a non-finite or non-positive budget (${registration.budget})`,
    )
}

/**
 * The declared supplier set for one assembly point. An immutable value — every
 * operation returns a new array, fold style (see journal.ts).
 */
export type SupplierRegistry = ReadonlyArray<SupplierRegistration>

export const emptyRegistry: SupplierRegistry = []

/**
 * Register a supplier, or re-dress an existing id with a new declaration.
 *
 * A repeated id replaces the entry **in place**, keeping its original position:
 * declaration order is assembly order within a layer (§3 invariant 5), and a
 * supplier's slot in that order is part of its identity. Moving the new declaration to
 * the tail would let a config reload or a late registration silently re-shuffle the
 * tail text of every following turn — the non-determinism the frozen prefix exists to
 * prevent. In-place replacement makes `register` idempotent and order-independent for
 * an unchanged declaration.
 */
export const register = (
  registry: SupplierRegistry,
  registration: SupplierRegistration,
): SupplierRegistry => {
  validateRegistration(registration)
  const index = registry.findIndex((existing) => existing.id === registration.id)
  if (index < 0) return [...registry, registration]
  return [...registry.slice(0, index), registration, ...registry.slice(index + 1)]
}

/** Remove a supplier. Unknown id is a no-op returning the same value (idempotent teardown). */
export const unregister = (registry: SupplierRegistry, id: string): SupplierRegistry => {
  const index = registry.findIndex((existing) => existing.id === id)
  if (index < 0) return registry
  return [...registry.slice(0, index), ...registry.slice(index + 1)]
}

/** Suppliers declared for one turn layer, in declaration order. */
export const resolve = (registry: SupplierRegistry, layer: TurnLayer): SupplierRegistry =>
  registry.filter((registration) => registration.layer === layer)

/**
 * Injection-side gate for DESIGN.md §3 invariant 5 ("层序即变更频率序，注册/注入时
 * 校验，逆序拒绝"): entries must flow into the assembler in nondecreasing layer rank
 * (L4 → L5 → L6 → L8), skipping layers that are absent.
 *
 * Governs `layer_order`: a batch that puts a colder layer behind a hotter one makes
 * the rendered prompt depend on whatever order the caller happened to collect in,
 * instead of the layer model — the same drift the eight-layer table exists to rule
 * out. Validation is on the entry stream, not the registry, because the registry is a
 * declaration set whose arrival order (manifest iteration, plugin startup) carries no
 * meaning. Throws on the first inversion.
 */
export const checkLayerOrder = (entries: ReadonlyArray<ContextEntry>): void => {
  const index = entries.findIndex(
    (entry, i) => i > 0 && rank(entry.layer) < rank(entries[i - 1].layer),
  )
  if (index < 0) return
  throw new LayerViolation(
    "layer_order",
    `${entries[index].layer} entry ${entries[index].id} follows ${entries[index - 1].layer} entry ${entries[index - 1].id}`,
  )
}
