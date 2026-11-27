import { describe, expect, test } from "bun:test"
import path from "path"
import { Effect } from "effect"
import {
  FROZEN_LAYERS,
  LAYERS,
  LayerViolation,
  isFrozen,
  makeAPI,
  rank,
  type AssembleInput,
  type ContextDeps,
} from "@aicraft/context"

const root = path.resolve(import.meta.dirname, "..")

const deps: ContextDeps = {
  store: { load: () => Effect.succeed(undefined), save: () => Effect.void },
  sources: { staticLayers: () => Effect.succeed({ l1: [], l2: [] }), journal: () => Effect.succeed([]) },
}

const input: AssembleInput = { sessionID: "ses_test", history: [], turn: { role: "user", content: [] } }

describe("layer model", () => {
  test("eight layers in change-frequency order", () => {
    expect(LAYERS).toEqual(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"])
    expect(LAYERS.map(rank)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  test("frozen set is exactly L1–L3", () => {
    expect(FROZEN_LAYERS).toEqual(["L1", "L2", "L3"])
    expect(LAYERS.filter(isFrozen)).toEqual([...FROZEN_LAYERS])
  })
})

describe("public surface", () => {
  test("exports whitelist exposes only the root entry", async () => {
    const pkg = await Bun.file(path.join(root, "package.json")).json()
    expect(Object.keys(pkg.exports)).toEqual(["."])
    const context = await import("@aicraft/context")
    expect(typeof context.makeAPI).toBe("function")
  })

  test("internal modules are not importable from outside", async () => {
    // 经变量寻址，避开 TS 编译期解析；验证的是运行时 exports 白名单。
    const hidden = "@aicraft/context/src/layer"
    await expect(import(hidden)).rejects.toThrow()
  })
})

describe("P0 stubs", () => {
  test("assemble fails as a not_implemented defect, not a silent pass", () => {
    expect(() => Effect.runSync(makeAPI(deps).assemble(input))).toThrow(/not_implemented/)
  })

  test("LayerViolation carries the code in its message", () => {
    const violation = new LayerViolation("frozen_slot", "plugin wrote L2")
    expect(violation.message).toContain("[frozen_slot]")
    expect(violation.code).toBe("frozen_slot")
  })
})
