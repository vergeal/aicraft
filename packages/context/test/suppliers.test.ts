import { describe, expect, test } from "bun:test"
import { Budget, Gates, Suppliers, type ContextEntry, type StateClaim } from "@aicraft/context"

const entry = (id: string, layer: ContextEntry["layer"], bytes: number): ContextEntry => ({
  id,
  layer,
  source: `source:${id}`,
  text: "x".repeat(bytes),
})

const claim = (key: string, text: string, source = "ledger"): StateClaim => ({ key, text, source })

const registration = (
  id: string,
  layer: Suppliers.SupplierRegistration["layer"],
  budget = 64,
): Suppliers.SupplierRegistration => ({ id, layer, budget })

describe("registration: layer and budget gates (DESIGN §3/§5)", () => {
  test("declaring a frozen prefix layer is a frozen_slot violation", () => {
    for (const layer of ["L1", "L2", "L3"] as const) {
      expect(() => Suppliers.validateRegistration(registration("plugin", layer))).toThrow(
        /\[frozen_slot\]/,
      )
      expect(() => Suppliers.register(Suppliers.emptyRegistry, registration("plugin", layer))).toThrow(
        /\[frozen_slot\]/,
      )
    }
  })

  test("the four turn layers register, and a positive finite budget passes", () => {
    expect([...Suppliers.TURN_LAYERS]).toEqual(["L4", "L5", "L6", "L8"])
    for (const layer of Suppliers.TURN_LAYERS) {
      expect(() => Suppliers.register(Suppliers.emptyRegistry, registration("plugin", layer))).not.toThrow()
    }
  })

  test("zero, negative and unbounded budgets are refused", () => {
    for (const budget of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => Suppliers.validateRegistration(registration("plugin", "L8", budget))).toThrow(
        /\[budget_exceeded\]/,
      )
    }
  })

  test("layer order is checked at injection, not at registration", () => {
    expect(() => Suppliers.checkLayerOrder([entry("a", "L4", 4), entry("b", "L6", 4), entry("c", "L8", 4)])).not.toThrow()
    expect(() => Suppliers.checkLayerOrder([entry("a", "L6", 4), entry("b", "L6", 4)])).not.toThrow()
    expect(() => Suppliers.checkLayerOrder([entry("a", "L6", 4), entry("b", "L4", 4)])).toThrow(
      /\[layer_order\].*L4 entry b follows L6 entry a/,
    )
  })
})

describe("supplier registry", () => {
  const base = () =>
    Suppliers.register(Suppliers.register(Suppliers.emptyRegistry, registration("memory", "L6", 100)), registration("skill", "L5"))

  test("a repeated id re-dresses in place and resolve sees exactly one entry", () => {
    const redressed = Suppliers.register(base(), registration("memory", "L6", 32))
    expect(redressed).toHaveLength(2)
    expect(Suppliers.resolve(redressed, "L6")).toEqual([registration("memory", "L6", 32)])
    expect(Suppliers.resolve(redressed, "L5")).toEqual([registration("skill", "L5")])
    // position kept: re-declaration must not shuffle the assembly tail (§3 invariant 5)
    expect(redressed.map((item) => item.id)).toEqual(["memory", "skill"])
  })

  test("registering the same declaration twice is idempotent, and unregister is idempotent", () => {
    const again = Suppliers.register(base(), registration("memory", "L6", 100))
    expect(again).toEqual(base())
    expect(Suppliers.unregister(again, "ghost")).toBe(again)
    expect(Suppliers.unregister(again, "memory").map((item) => item.id)).toEqual(["skill"])
  })
})

describe("budget truncation (DESIGN §5: truncate + alert, never reject)", () => {
  const three = [entry("e1", "L5", 40), entry("e2", "L5", 40), entry("e3", "L5", 40)]

  test("three 40-byte entries under a 100-byte budget keep two and account for the loss", () => {
    const outcome = Budget.applyBudget(three, 100)
    expect(outcome.kept.map((item) => item.id)).toEqual(["e1", "e2"])
    expect(outcome.dropped).toEqual(["e3"])
    expect(outcome.truncated).toBe(true)
    expect(outcome.audit).toEqual({ droppedKeys: ["e3"], used: 80, budget: 100 })
  })

  test("a budget exactly equal to the content keeps everything and is not truncated", () => {
    const outcome = Budget.applyBudget(three, 120)
    expect(outcome.kept).toEqual(three)
    expect(outcome.dropped).toEqual([])
    expect(outcome.truncated).toBe(false)
    expect(outcome.audit).toEqual({ droppedKeys: [], used: 120, budget: 120 })
  })

  test("the cut is a contiguous prefix: a misfit takes the tail with it instead of being skipped", () => {
    const mixed = [entry("small", "L5", 10), entry("huge", "L5", 100), entry("after", "L8", 10)]
    const outcome = Budget.applyBudget(mixed, 50)
    expect(outcome.kept.map((item) => item.id)).toEqual(["small"])
    expect(outcome.dropped).toEqual(["huge", "after"])
    expect(outcome.audit.used).toBe(10)
  })

  test("an oversized single entry and a zero budget drop without throwing", () => {
    expect(Budget.applyBudget([entry("big", "L8", 200)], 100).dropped).toEqual(["big"])
    const starved = Budget.applyBudget(three, 0)
    expect(starved.kept).toEqual([])
    expect(starved.dropped).toEqual(["e1", "e2", "e3"])
    expect(starved.audit).toEqual({ droppedKeys: ["e1", "e2", "e3"], used: 0, budget: 0 })
    expect(Budget.applyBudget(three, Number.NaN).truncated).toBe(true)
  })

  test("budget is counted in utf-8 bytes, not characters", () => {
    const dated: ContextEntry = { id: "date", layer: "L5", source: "clock", text: "上下文预算" }
    expect(Budget.measureBytes(dated.text)).toBe(15)
    expect(Budget.applyBudget([dated], 15).truncated).toBe(false)
    expect(Budget.applyBudget([dated], 14).dropped).toEqual(["date"])
  })
})

describe("tail-only hook gate (DESIGN §3 invariant 1, §5 hook row)", () => {
  const frozen = [entry("l1", "L1", 8), entry("l2", "L2", 8)]
  const tail = entry("note", "L8", 4)

  test("appending to the tail passes", () => {
    expect(() => Gates.checkTailOnly(frozen, [...frozen, tail])).not.toThrow()
    expect(() => Gates.checkTailOnly(frozen, frozen)).not.toThrow()
  })

  test("rewriting one byte of the frozen segment names the index", () => {
    const after = [frozen[0], { ...frozen[1], text: "yyyymmxx" }, tail]
    expect(() => Gates.checkTailOnly(frozen, after)).toThrow(
      /\[frozen_slot\].*at index 1 \(id l2, layer L2\)/,
    )
  })

  test("dropping a frozen entry is a violation even when the length still matches", () => {
    expect(() => Gates.checkTailOnly(frozen, [frozen[0], tail])).toThrow(/at index 1/)
    expect(() => Gates.checkTailOnly(frozen, [frozen[0]])).toThrow(/first lost index 1/)
  })
})

describe("L4 claim merge (DESIGN §3 invariant 3/4, §9)", () => {
  const ledger = [claim("tool", "search installed"), claim("date", "2026-11-27")]

  test("by default plugin claims are refused wholesale and land in the audit", () => {
    const merged = Gates.mergeClaims(ledger, [claim("mood", "chipper", "plugin"), claim("tool", "whatever", "plugin")])
    expect(merged.claims).toEqual(ledger)
    expect(merged.audit.rejectedPluginKeys).toEqual(["mood", "tool"])
    expect(merged.audit.overriddenPluginKeys).toEqual([])
  })

  test("with the switch open the ledger still wins a colliding key", () => {
    const merged = Gates.mergeClaims(ledger, [claim("tool", "search uninstalled", "plugin"), claim("mood", "chipper", "plugin")], {
      rejectPluginClaims: false,
    })
    expect(merged.claims.map((item) => item.text)).toEqual(["search installed", "2026-11-27", "chipper"])
    expect(merged.audit.overriddenPluginKeys).toEqual(["tool"])
    expect(merged.audit.rejectedPluginKeys).toEqual([])
  })

  test("the ledger side is replacement-semantics: the last claim for a key survives, in first-seen position", () => {
    const merged = Gates.mergeClaims(
      [claim("tool", "v1"), claim("date", "2026-11-27"), claim("tool", "v2")],
      [],
    )
    expect(merged.claims).toEqual([claim("tool", "v2"), claim("date", "2026-11-27")])
  })

  test("empty plugin claims keep the audit lists empty", () => {
    expect(Gates.mergeClaims(ledger, []).audit).toEqual({ rejectedPluginKeys: [], overriddenPluginKeys: [] })
  })
})
