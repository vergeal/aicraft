import { describe, expect, test } from "bun:test"
import { Budget, Gates, LayerViolation, Suppliers, type ContextEntry } from "@aicraft/context"
import { Instructions } from "@aicraft/core/instructions/index"
import { SessionTurnSuppliers } from "@aicraft/core/session/turn-suppliers"
import { Effect, Schema } from "effect"

const measureBytes = Budget.measureBytes
type SupplierLayer = Suppliers.SupplierLayer

// P3 core-side wiring: the turn-supplier registry, per-supplier budget + audit, the L6 memory
// channel and the tail gate. The package (suppliers/budget/gates) owns the pure contract; these
// cases prove core assembles the declared sources and degrades over-budget the way DESIGN §5 wants
// — and that a frozen-layer declaration cannot sneak an unbudgeted slot past the gate.

const source = (key: string, layer?: SupplierLayer) =>
  Instructions.make({
    key: Instructions.Key.make(key),
    ...(layer === undefined ? {} : { layer }),
    codec: Schema.toCodecJson(Schema.String),
    read: Effect.succeed("value"),
    render: { initial: (value: string) => value, changed: () => undefined },
  })

const entry = (id: string, layer: ContextEntry["layer"], text: string): ContextEntry => ({
  id,
  layer,
  source: "hook",
  text,
})

describe("buildRegistry (DESIGN §5, the two faces)", () => {
  test("registers only turn-layer sources, at the default budget", () => {
    const registry = SessionTurnSuppliers.buildRegistry([
      ...source("core/frozen", "L1"),
      ...source("core/undeclared"),
      ...source("plugin/skill", "L4"),
      ...source("plugin/date", "L5"),
      ...source("plugin/memory", "L6"),
      ...source("plugin/tail", "L8"),
    ])
    expect(registry).toEqual([
      { id: "plugin/skill", layer: "L4", budget: SessionTurnSuppliers.DEFAULT_SUPPLIER_BUDGET },
      { id: "plugin/date", layer: "L5", budget: SessionTurnSuppliers.DEFAULT_SUPPLIER_BUDGET },
      { id: "plugin/memory", layer: "L6", budget: SessionTurnSuppliers.DEFAULT_SUPPLIER_BUDGET },
      { id: "plugin/tail", layer: "L8", budget: SessionTurnSuppliers.DEFAULT_SUPPLIER_BUDGET },
    ])
  })

  test("a frozen-layer source never reaches Suppliers.register, so it cannot take a turn slot", () => {
    // §5 static-registration face: L1–L3 content rides the ledger and moves on version advance, never
    // the budgeted turn channel. buildRegistry must filter it out rather than hand it to the gate.
    expect(SessionTurnSuppliers.buildRegistry(source("core/harness", "L2"))).toEqual([])
    expect(SessionTurnSuppliers.buildRegistry(source("core/history", "L3"))).toEqual([])
  })

  test("acceptance ①: a forced frozen-slot registration dies with LayerViolation", () => {
    expect(() => Suppliers.register(Suppliers.emptyRegistry, { id: "sneak", layer: "L1", budget: 1024 })).toThrow(
      LayerViolation,
    )
    expect(() => Suppliers.register(Suppliers.emptyRegistry, { id: "sneak", layer: "L3", budget: 1024 })).toThrow(
      LayerViolation,
    )
  })

  test("acceptance (budget sanity): a non-finite or non-positive budget is refused", () => {
    expect(() => Suppliers.register(Suppliers.emptyRegistry, { id: "spam", layer: "L5", budget: Infinity })).toThrow(
      LayerViolation,
    )
    expect(() => Suppliers.register(Suppliers.emptyRegistry, { id: "empty", layer: "L5", budget: 0 })).toThrow(
      LayerViolation,
    )
  })
})

describe("auditSupplied (DESIGN §5 装配器按预算截断 + 审计超标告警)", () => {
  const registry = [
    { id: "a", layer: "L5" as const, budget: 10 },
    { id: "b", layer: "L6" as const, budget: 8 },
  ]

  test("acceptance ②: an over-budget supplier is truncated whole, audited, and never throws", () => {
    const audit = SessionTurnSuppliers.auditSupplied(
      [entry("a", "L5", "0123456789AB"), entry("b", "L6", "fits")],
      registry,
    )
    expect(audit.truncated).toBe(true)
    // The "a" supplier's entry is 12 bytes against a 10-byte budget → the whole entry is dropped,
    // not cut mid-text (§3 invariant 1 byte-diffing culture), and named in overbudget.
    expect(audit.overbudget).toHaveLength(1)
    expect(audit.overbudget[0]?.id).toBe("a")
    expect(audit.overbudget[0]?.audit.droppedKeys).toEqual(["a"])
    expect(audit.kept.map((kept) => kept.id)).toEqual(["b"])
    expect(audit.layers).toEqual([{ layer: "L6", bytes: 4, sources: ["b"] }])
  })

  test("under-budget suppliers pass untouched with an empty overbudget record", () => {
    const audit = SessionTurnSuppliers.auditSupplied([entry("a", "L5", "short"), entry("b", "L6", "also ok")], registry)
    expect(audit.truncated).toBe(false)
    expect(audit.overbudget).toEqual([])
    expect(audit.kept.map((kept) => kept.id)).toEqual(["a", "b"])
  })

  test("kept entries are reassembled in nondecreasing layer rank so checkLayerOrder holds (§3 invariant 5)", () => {
    const audit = SessionTurnSuppliers.auditSupplied(
      [entry("hot", "L8", "tail"), entry("cold", "L5", "dynamic"), entry("mid", "L6", "memory")],
      [],
    )
    expect(() => Suppliers.checkLayerOrder(audit.kept)).not.toThrow()
    expect(audit.kept.map((kept) => kept.layer)).toEqual(["L5", "L6", "L8"])
  })

  test("entries from unregistered ids pass unbudgeted", () => {
    const audit = SessionTurnSuppliers.auditSupplied([entry("unknown", "L5", "a".repeat(5000))], registry)
    expect(audit.truncated).toBe(false)
    expect(audit.kept).toHaveLength(1)
  })
})

describe("memory channel (PLAN P3③ L6 semantics)", () => {
  test("declares L6 with the char cap converted through its 3× UTF-8 byte envelope", () => {
    const channel = SessionTurnSuppliers.memoryChannel(100)
    expect(channel).toEqual({ id: "memory", layer: "L6", budget: 300 })
    // validateRegistration runs inside memoryChannel: an L6 turn layer with a positive finite budget passes.
  })

  test("a CJK block the subsystem packed within maxInjectedChars always fits", () => {
    const channel = SessionTurnSuppliers.memoryChannel(100)
    const block = "记".repeat(100) // 100 chars, 300 UTF-8 bytes = exactly the budget
    expect(measureBytes(block)).toBe(300)
    const budgeted = Budget.applyBudget([entry("memory", "L6", block)], channel.budget)
    expect(budgeted.truncated).toBe(false)
    expect(budgeted.kept).toHaveLength(1)
  })

  test("acceptance ③: a block that overshoots its own cap is dropped whole, never falling behind the L3 prefix", () => {
    const channel = SessionTurnSuppliers.memoryChannel(100)
    const oversized = entry("memory", "L6", "记".repeat(101)) // 303 bytes > 300 budget
    const audit = SessionTurnSuppliers.auditSupplied([oversized], [channel])
    // Hit-but-overbudget → withheld; miss (empty) → nothing to carry; both leave no L6 entry in the stream,
    // and L6 is a turn layer that can never be folded into the frozen L1–L3 baseline.
    expect(audit.kept).toEqual([])
    expect(audit.overbudget.map((cut) => cut.id)).toEqual(["memory"])
    expect(audit.layers).toEqual([])
  })
})

describe("tail gate (PLAN P3④ hook 限尾部)", () => {
  const frozen = [entry("system", "L1", "agent prompt"), entry("baseline", "L4", "ledger baseline")]

  test("appending after the frozen segment is legal and passes", () => {
    expect(() => Gates.checkTailOnly(frozen, [...frozen, entry("hook", "L5", "dynamic tail")])).not.toThrow()
  })

  test("acceptance ④: rewriting a frozen part is a Violation that refuses the request", () => {
    expect(() => Gates.checkTailOnly(frozen, [entry("system", "L1", "TAMPERED"), frozen[1]!])).toThrow(LayerViolation)
    expect(() => Gates.checkTailOnly(frozen, [frozen[0]!])).toThrow(LayerViolation) // truncated the segment
  })

  test("a metadata-only edit that leaves model-visible text intact is not a cache break", () => {
    // gatedEntry copies id/layer/source from the assembler entry inside the segment, so only text bytes
    // can differ; an untouched text therefore passes even though the SystemPart object changed.
    const after = frozen.map((base) => ({ ...base, text: base.text }))
    expect(() => Gates.checkTailOnly(frozen, after)).not.toThrow()
  })
})

describe("MAX_STEPS L8 supplier (§7 MAX_STEPS → 供给者注册表)", () => {
  test("registers the constant text as its exact byte budget", () => {
    expect(SessionTurnSuppliers.MAX_STEPS.registration.layer).toBe("L8")
    expect(SessionTurnSuppliers.MAX_STEPS.registration.budget).toBe(measureBytes(SessionTurnSuppliers.MAX_STEPS.text))
  })

  test("the tail registry is built through register so validateRegistration runs at load", () => {
    expect(SessionTurnSuppliers.tailRegistry).toEqual([SessionTurnSuppliers.MAX_STEPS.registration])
  })
})
