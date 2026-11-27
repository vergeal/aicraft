import { describe, expect, test } from "bun:test"
import { bumpLineage, initialLineage, type ContextEntry, type Lineage } from "@aicraft/context"

const foldEntry = (id: string): ContextEntry => ({ id, layer: "L3", text: `fold ${id}`, source: "compaction" })

describe("lineage", () => {
  test("initial starts at epoch 1, version 1", () => {
    expect(initialLineage()).toEqual({
      epoch: 1,
      prefixVersion: 1,
      parentVersion: undefined,
      bumpReason: "initial",
    })
  })

  test("advance bumps only the prefix version", () => {
    expect(bumpLineage(initialLineage(), "advance")).toEqual({
      epoch: 1,
      prefixVersion: 2,
      parentVersion: 1,
      bumpReason: "advance",
    })
  })

  test("compaction bumps both clocks", () => {
    const lineage: Lineage = { epoch: 1, prefixVersion: 2, parentVersion: 1, bumpReason: "advance" }
    expect(bumpLineage(lineage, "compaction")).toEqual({
      epoch: 2,
      prefixVersion: 3,
      parentVersion: 2,
      bumpReason: "compaction",
    })
  })

  test("genealogy stays walkable: Epoch1{v1,v2} -> Epoch2{v3}", () => {
    const chain = [initialLineage()]
    chain.push(bumpLineage(chain[0]!, "advance"))
    chain.push(bumpLineage(chain[1]!, "compaction"))
    expect(chain.map((item) => item.parentVersion)).toEqual([undefined, 1, 2])
    expect(chain.map((item) => item.epoch)).toEqual([1, 1, 2])
    expect(chain.map((item) => item.prefixVersion)).toEqual([1, 2, 3])
    expect(foldEntry("summary").layer).toBe("L3")
  })
})
