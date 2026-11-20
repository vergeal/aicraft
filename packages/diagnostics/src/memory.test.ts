// DOM-free coverage for the memory evidence: node scanning, detached counting, listener tallying, heap sampling
// and the leak threshold. No `globalThis` patching: every function under test takes its input as an argument.

import { describe, expect, test } from "bun:test"
import {
  countDetached,
  createDetachedLog,
  createListenerTally,
  detectLeak,
  heapSample,
  listenerLabel,
  scanNodes,
  type MemoryPoint,
} from "./memory"

const scanRoot = (connected: boolean[]) =>
  ({
    querySelectorAll: () => connected.map((isConnected) => ({ isConnected })),
  }) as unknown as ParentNode

const ref = (isConnected: boolean) => {
  const node = { isConnected }

  return { node, ref: new WeakRef(node) }
}

describe("node scan", () => {
  test("counts the whole document and truncates the walk at the limit", () => {
    const scan = scanNodes(scanRoot([true, true, true, false, true]), 3)

    expect(scan).toEqual({
      nodes: 5,
      sampled: 3,
      limit: 3,
      truncated: true,
      connected: 3,
      detachedInScan: 0,
    })
  })

  test("does not mark an untruncated sample and reports nodes that left the document mid-scan", () => {
    const scan = scanNodes(scanRoot([true, false]), 10)

    expect(scan.nodes).toBe(2)
    expect(scan.truncated).toBe(false)
    expect(scan.detachedInScan).toBe(1)
  })
})

describe("detached log", () => {
  test("only counts tracked nodes that are alive and outside the document", () => {
    const attached = ref(true)
    const detached = ref(false)
    const collected = { deref: () => undefined } as unknown as WeakRef<{ isConnected: boolean }>

    expect(countDetached([attached.ref, detached.ref])).toBe(1)
    // A deref that yields nothing is a collected node, never a leak.
    expect(countDetached([detached.ref, collected])).toBe(1)
  })

  test("degrades to an empty log without MutationObserver instead of throwing", () => {
    const log = createDetachedLog()

    expect(typeof MutationObserver).toBe("undefined")
    expect(log.start({} as Node)).toBe(false)
    expect(log.stats()).toEqual({ tracked: 0, alive: 0, collected: 0, truncated: false })
  })
})

describe("listener tally", () => {
  test("counts additions and removals as an increment, not a snapshot", () => {
    const tally = createListenerTally()

    tally.add("div", "click")
    tally.add("div", "click")
    tally.add("window", "resize")
    expect(tally.stats().bound).toBe(3)

    tally.remove("div", "click")
    expect(tally.stats()).toEqual({
      bound: 2,
      groups: [
        { target: "div", count: 1, types: [{ type: "click", count: 1 }] },
        { target: "window", count: 1, types: [{ type: "resize", count: 1 }] },
      ],
    })

    // Removing a listener that was never added must not pull the counter below the truth.
    tally.remove("div", "keydown")
    tally.remove("button", "click")
    expect(tally.stats().bound).toBe(2)
  })

  test("groups by target, sorts by count and keeps the top targets only", () => {
    const tally = createListenerTally(2)

    tally.add("div", "click")
    tally.add("button", "click")
    tally.add("button", "focus")
    tally.add("button", "focus")
    tally.add("span", "scroll")

    expect(tally.stats().groups.map((group) => [group.target, group.count])).toEqual([
      ["button", 3],
      ["div", 1],
    ])
    expect(tally.stats().groups[0].types).toEqual([
      { type: "focus", count: 2 },
      { type: "click", count: 1 },
    ])
  })

  test("names a target from its tag, or from its constructor when it has no node name", () => {
    expect(listenerLabel({ nodeName: "DIV" } as unknown as EventTarget)).toBe("div")
    expect(listenerLabel({ nodeName: "#document" } as unknown as EventTarget)).toBe("#document")
    expect(listenerLabel({} as unknown as EventTarget)).toBe("object")
  })
})

describe("heap sample", () => {
  test("converts bytes to megabytes and refuses a missing or unusable probe", () => {
    expect(heapSample({ usedJSHeapSize: 81 * 1024 * 1024, jsHeapSizeLimit: 4096 * 1024 * 1024 })).toEqual({
      used: 81,
      limit: 4096,
    })
    expect(heapSample(undefined)).toBeNull()
    expect(heapSample({ usedJSHeapSize: Number.NaN, jsHeapSizeLimit: 1 })).toBeNull()
    expect(heapSample({ usedJSHeapSize: 1, jsHeapSizeLimit: 0 })).toBeNull()
  })
})

describe("leak detection", () => {
  const point = (t: number, nodes: number, detached: number): MemoryPoint => ({ t, nodes, detached })

  test("suspects a leak when nodes rise every span and detached nodes rise with them", () => {
    const verdict = detectLeak([
      point(0, 1_000, 10),
      point(10_000, 1_100, 20),
      point(20_000, 1_300, 40),
      point(30_000, 1_500, 70),
    ])

    expect(verdict).toEqual({
      spans: 3,
      seconds: 30,
      nodes: 1_500,
      detached: 70,
      nodesPerMinute: 1_000,
      detachedPerMinute: 120,
    })
  })

  test("returns null for a flat or falling node count", () => {
    expect(
      detectLeak([point(0, 1_000, 10), point(10_000, 1_100, 20), point(20_000, 1_100, 40), point(30_000, 1_500, 70)]),
    ).toBeNull()
    expect(
      detectLeak([point(0, 1_000, 10), point(10_000, 1_100, 20), point(20_000, 1_050, 40), point(30_000, 1_500, 70)]),
    ).toBeNull()
  })

  test("needs enough spans and a detached rise to call it", () => {
    expect(detectLeak([point(0, 1_000, 10), point(10_000, 1_100, 20), point(20_000, 1_300, 40)])).toBeNull()
    expect(
      detectLeak([point(0, 1_000, 10), point(10_000, 1_100, 10), point(20_000, 1_300, 10), point(30_000, 1_500, 10)]),
    ).toBeNull()
  })

  test("ignores churn below the growth thresholds", () => {
    const threshold = { nodes: 40, detached: 8 }

    expect(
      detectLeak(
        [point(0, 1_000, 10), point(10_000, 1_010, 11), point(20_000, 1_020, 12), point(30_000, 1_030, 13)],
        3,
        threshold,
      ),
    ).toBeNull()
    expect(
      detectLeak(
        [point(0, 1_000, 10), point(10_000, 1_100, 11), point(20_000, 1_200, 12), point(30_000, 1_300, 13)],
        3,
        threshold,
      ),
    ).toBeNull()
  })
})
