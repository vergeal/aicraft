import { describe, expect, test } from "bun:test"
import { absorb, fold, type JournalEntry, type Lineage } from "@aicraft/context"

const fact = (key: string, value: string | undefined, at: number, render: string = `${key}@${at}`): JournalEntry => ({
  key,
  value,
  observedAt: at,
  render,
})

const lineage: Lineage = { epoch: 1, prefixVersion: 2, parentVersion: 1, bumpReason: "advance" }

describe("journal", () => {
  test("contradictory facts settle to net state: uninstall then reinstall to the same value vanishes", () => {
    const baseline = new Map([["search", "h1"]])
    const folded = fold([fact("search", undefined, 1), fact("search", "h1", 2)], baseline)
    expect(folded).toEqual([])
  })

  test("reinstall with different content stays as a changed final state", () => {
    const baseline = new Map([["search", "h1"]])
    const folded = fold([fact("search", undefined, 1), fact("search", "h2", 2, "search back")], baseline)
    expect(folded).toEqual([fact("search", "h2", 2, "search back")])
  })

  test("dead entry removal keeps the final absent fact for the settled list", () => {
    const baseline = new Map([["old-tool", "h1"]])
    const folded = fold([fact("old-tool", undefined, 3)], baseline)
    expect(folded.map((entry) => entry.key)).toEqual(["old-tool"])
  })

  test("registry additions fold in: keys absent from the baseline survive", () => {
    const baseline = new Map<string, string | undefined>()
    const folded = fold([fact("new-key", "h9", 4)], baseline)
    expect(folded).toEqual([fact("new-key", "h9", 4)])
  })

  test("repeated edits keep only the latest render", () => {
    const baseline = new Map([["notes", "a"]])
    const folded = fold([fact("notes", "b", 1, "first notice"), fact("notes", "c", 2, "final notice")], baseline)
    expect(folded).toEqual([fact("notes", "c", 2, "final notice")])
  })

  test("unordered observations fold by observedAt, not array order", () => {
    const baseline = new Map([["k", "a"]])
    const folded = fold([fact("k", "b", 5, "late"), fact("k", "a", 6, "back to baseline")].reverse(), baseline)
    expect(folded).toEqual([])
    const forward = fold([fact("k", "a", 5), fact("k", "b", 6)], baseline)
    expect(forward).toEqual([fact("k", "b", 6)])
  })

  test("absorb bumps the dual clock and lists settled keys", () => {
    const baseline = new Map([["search", "h1"], ["stale", "s0"]])
    const facts = [fact("search", undefined, 1), fact("search", "h1", 2), fact("stale", undefined, 3)]
    const result = absorb(lineage, baseline, facts, "compaction")
    expect(result.lineage).toEqual({ epoch: 2, prefixVersion: 3, parentVersion: 2, bumpReason: "compaction" })
    expect(result.settled).toEqual(["stale"])
  })
})
