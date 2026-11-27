import type { ContextEntry, StateClaim } from "./entry.js"
import { LayerViolation } from "./errors.js"

/**
 * Tail-channel gate for the `session.context` hook (DESIGN.md §5, third row: the hook
 * "可改写装配产物尾部；改写 L1–L3 → Violation").
 *
 * Governs `frozen_slot` from the injection side: the hook receives the assembled
 * product and may only append to, or rewrite, everything after the frozen segment.
 * `frozenBefore` is the assembly's frozen prefix segment as the kernel produced it
 * (snapshot L1–L3 plus ledger-owned text); `after` is the hook's output. The first
 * `frozenBefore.length` entries of `after` must be byte-identical to it.
 *
 * Comparison is field-by-field over the entries rather than a digest of the whole
 * prefix: field equality *is* the byte fingerprint §3 invariant 1 asks for, and it
 * lets the violation name the index and the entry that drifted instead of reporting an
 * opaque "prefix_drift" that core would have to bisect.
 */
export const checkTailOnly = (
  frozenBefore: ReadonlyArray<ContextEntry>,
  after: ReadonlyArray<ContextEntry>,
): void => {
  if (after.length < frozenBefore.length)
    throw new LayerViolation(
      "frozen_slot",
      `tail hook truncated the frozen segment: ${frozenBefore.length} entries assembled, ${after.length} returned (first lost index ${after.length}, id ${frozenBefore[after.length].id})`,
    )
  const index = frozenBefore.findIndex((entry, i) => !sameEntry(entry, after[i]))
  if (index < 0) return
  throw new LayerViolation(
    "frozen_slot",
    `tail hook rewrote the frozen segment at index ${index} (id ${frozenBefore[index].id}, layer ${frozenBefore[index].layer})`,
  )
}

const sameEntry = (before: ContextEntry, after: ContextEntry): boolean =>
  before.id === after.id &&
  before.layer === after.layer &&
  before.source === after.source &&
  before.text === after.text

/** L4 claim merge policy. */
export interface ClaimsPolicy {
  /**
   * Default `true`: plugin-declared `StateClaim`s are refused wholesale, keeping L4 to
   * the system ledger (DESIGN.md §9 "L4 膨胀回潮……只收系统账本不收插件申报", the guard
   * against a second prefix resurrecting through plugin claims). Open it only once the
   * per-layer budget of §5 is enforced upstream, so a refused flood cannot be replaced
   * by an accepted flood.
   */
  readonly rejectPluginClaims?: boolean
}

export interface ClaimsAudit {
  /** Keys refused because the policy keeps L4 ledger-only. */
  readonly rejectedPluginKeys: ReadonlyArray<string>
  /** Keys refused because the ledger already states that key (§3 invariant 3, replacement semantics). */
  readonly overriddenPluginKeys: ReadonlyArray<string>
}

export interface MergedClaims {
  readonly claims: ReadonlyArray<StateClaim>
  readonly audit: ClaimsAudit
}

/**
 * Merge the ledger-rendered L4 claims with a turn's plugin claims (`AssembleInput.l4Extra`,
 * DESIGN.md §4) under §3 invariant 3/4 and §9.
 *
 * Governs the L4 capacity boundary: the ledger is the reproducible source of state
 * (it folds from durable events), a plugin claim is an unverified assertion, so the
 * ledger always wins a key and — by default — no plugin claim enters L4 at all. Both
 * refusals are listed in the audit rather than dropped silently, so an over-talking
 * plugin is attributable.
 *
 * Each side is de-duplicated last-wins by key before merging (replacement semantics,
 * same rule and same positional stability journal.ts's `fold` uses). Output order is
 * ledger order, then accepted plugin order.
 */
export const mergeClaims = (
  ledger: ReadonlyArray<StateClaim>,
  extra: ReadonlyArray<StateClaim>,
  policy: ClaimsPolicy = {},
): MergedClaims => {
  const settled = dedupeLatest(ledger)
  const declared = dedupeLatest(extra)
  if (policy.rejectPluginClaims ?? true)
    return {
      claims: settled,
      audit: { rejectedPluginKeys: declared.map((claim) => claim.key), overriddenPluginKeys: [] },
    }
  const taken = new Set(settled.map((claim) => claim.key))
  const blocked = declared.filter((claim) => taken.has(claim.key))
  const accepted = declared.filter((claim) => !taken.has(claim.key))
  return {
    claims: [...settled, ...accepted],
    audit: { rejectedPluginKeys: [], overriddenPluginKeys: blocked.map((claim) => claim.key) },
  }
}

function dedupeLatest(claims: ReadonlyArray<StateClaim>): ReadonlyArray<StateClaim> {
  const byKey = new Map<string, StateClaim>()
  for (const claim of claims) byKey.set(claim.key, claim)
  return [...byKey.values()]
}
