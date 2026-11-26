import { describe, expect, test } from "bun:test"
import { DEFAULT_SETTINGS, MemoryEvaluate, MemoryInject, resolveSettings } from "../src/index.js"
import type { MemoryRecord, Settings } from "../src/index.js"
import { CORPUS, NO_MATCH_QUERIES, SCOPES, SEARCH_GOLD, TURN_GOLD, bulkFiller, corpus, legacyInject, legacySearch } from "./fixtures.js"

/**
 * Acceptance metrics. Every gate is a measured number on a 421-entry corpus (`bulkFiller`),
 * not a smoke assertion: the reason this subsystem replaces the kv kernel is that the old read
 * path could not state a recall figure at all. Metrics come from `MemoryEvaluate.evaluate`,
 * the same harness a host or the Batch 1 spike runs, so the package and the test agree on what
 * "recall" means. Gates sit below the measured value with margin; lowering one is a decision
 * that needs the before/after numbers written next to it, not a relaxed comparison.
 */
const GOLD: MemoryEvaluate.GoldenCase[] = [
  ...TURN_GOLD.map((item) => ({ query: item.query, expect: item.expect, via: item.via })),
  ...SEARCH_GOLD.map((item) => ({ query: item.query, expect: item.expect, autoInjectForbidden: true })),
]
const OPTIONS: MemoryEvaluate.EvaluationOptions = { cases: GOLD, negatives: NO_MATCH_QUERIES, searchK: 5, repeats: 2 }
/** Fake-calibrated threshold: the deterministic fake scores 0.12-0.27 on relevant pairs. */
const FAKE_VECTOR: Settings = { ...DEFAULT_SETTINGS, vectorThreshold: 0.12 }

const lexical = await corpus({ seed: CORPUS })
const vector = await corpus({ seed: CORPUS, embedder: true, settings: FAKE_VECTOR })
const measured = await MemoryEvaluate.evaluate(lexical.memory, SCOPES, OPTIONS)
const throughVectors = await MemoryEvaluate.evaluate(vector.memory, SCOPES, OPTIONS)

function report(metric: string, value: number | string) {
  console.log(`[memory-metrics] ${metric}=${value} @corpus=${measured.corpusSize}`)
}

function table(metrics: MemoryEvaluate.Metrics) {
  report("injectRecall", round(metrics.injectRecall))
  report("injectPrecision", round(metrics.injectPrecision))
  report(`searchRecallAt${metrics.searchK}`, round(metrics.searchRecallAtK))
  report("falseInjection", metrics.falseInjection)
  report("partitionViolations", metrics.partitionViolations)
  report("meanInjectedChars", metrics.meanInjectedChars)
  report("maxInjectedChars", metrics.maxInjectedChars)
  report("byteStability", round(metrics.byteStability))
  report("channelStatus", JSON.stringify(metrics.channelStatus))
  report("attribution", JSON.stringify(metrics.attribution))
  for (const miss of metrics.injectCases.filter((item) => !item.hit)) report("miss", `${miss.query} -> ${miss.expect} (${miss.attribution})`)
}

describe("corpus", () => {
  test("the corpus is at long-term scale with both scopes populated as seeded", () => {
    expect(measured.corpusSize).toBeGreaterThanOrEqual(400)
    expect(measured.corpusSize).toBe(CORPUS.length)
    expect(bulkFiller().length).toBe(400)
  })
})

describe("retrieval quality — gates: injectRecall >= 0.85, injectPrecision >= 0.75, searchRecallAt5 = 1.0", () => {
  test("the lexical fallback channel serves the gold set at scale", async () => {
    table(measured)
    expect(measured.injectRecall).toBeGreaterThanOrEqual(0.85)
    expect(measured.injectPrecision).toBeGreaterThanOrEqual(0.75)
    expect(measured.searchRecallAtK).toBe(1)
    expect(measured.channelStatus.lexical).toBe("ran")
  })

  test("retrieval-only types stay reachable through search and out of the block", () => {
    const forbidden = measured.injectCases.filter((item) => SEARCH_GOLD.some((gold) => gold.query === item.query))
    expect(forbidden).toHaveLength(0)
    for (const gold of SEARCH_GOLD) {
      const case_ = measured.searchCases.find((item) => item.query === gold.query)
      expect(case_?.hit).toBe(true)
    }
  })

  test("the vector channel carries most of the gold set at its own calibrated threshold", () => {
    report("vector.injectRecall", round(throughVectors.injectRecall))
    report("vector.injectPrecision", round(throughVectors.injectPrecision))
    report("vector.falseInjection", throughVectors.falseInjection)
    expect(throughVectors.injectRecall).toBeGreaterThanOrEqual(0.66)
    expect(throughVectors.channelStatus.vector).toBe("ran")
    expect(throughVectors.searchRecallAtK).toBeGreaterThanOrEqual(0.9)
  })

  test("every case is attributed, never silently dropped", () => {
    const counted = Object.values(measured.attribution).reduce((sum, value) => sum + (value ?? 0), 0)
    expect(counted).toBe(measured.injectCases.length + measured.searchCases.length)
    expect(measured.injectCases.length + measured.searchCases.length).toBe(GOLD.length + TURN_GOLD.length)
    expect(measured.attribution.never_sought ?? 0).toBe(0)
  })
})

describe("injection discipline — gates: falseInjection = 0, partitionViolations = 0", () => {
  test("unrelated queries inject nothing at scale", () => {
    expect(measured.falseInjection).toBe(0)
  })

  test("no retrieval-only type ever reaches the block", () => {
    expect(measured.partitionViolations).toBe(0)
  })

  test("an unconfigured threshold still keeps the noise out at the production bar", async () => {
    const strict = await corpus({ seed: CORPUS, embedder: true })
    const metrics = await MemoryEvaluate.evaluate(strict.memory, SCOPES, OPTIONS)
    report("strict.vectorFalseInjection", metrics.falseInjection)
    report("strict.vectorInjectRecall", round(metrics.injectRecall))
    expect(metrics.falseInjection).toBe(0)
  })
})

describe("threshold sweep — gates: monotone curves, zero false injection at the production bar", () => {
  test("loosening the vector threshold can only add candidates, never remove them", async () => {
    const points: { vectorThreshold: number; recall: number; falseInjection: number }[] = []
    for (const vectorThreshold of [0.05, 0.08, 0.12, 0.18, 0.35]) {
      const built = await corpus({ seed: CORPUS, embedder: true, settings: { ...FAKE_VECTOR, vectorThreshold } })
      const metrics = await MemoryEvaluate.evaluate(built.memory, SCOPES, OPTIONS)
      points.push({ vectorThreshold, recall: metrics.injectRecall, falseInjection: metrics.falseInjection })
    }
    for (const point of points) report(`sweep@${point.vectorThreshold}`, `recall=${round(point.recall)} false=${point.falseInjection}`)
    expect(points.every((point, index) => index === 0 || point.recall <= points[index - 1].recall)).toBe(true)
    expect(points.every((point, index) => index === 0 || point.falseInjection <= points[index - 1].falseInjection)).toBe(true)
    expect(points.at(-1)?.falseInjection).toBe(0)
    expect(points[0].recall).toBeGreaterThanOrEqual(0.66)
    // The fake's noise floor (~0.20 measured) is why no point here claims high recall AND zero
    // false injection. That operating point is a claim about bge-small and the spike must prove
    // it; asserting it from the fake would be asserting a property of the test double.
  })
})

describe("token cost — gates: mean injected chars <= 300 and <= 25% of the legacy window", () => {
  test("the per-turn block is a fraction of what the old every-step window cost", () => {
    const legacyChars = legacyInject(lexical.records).reduce((sum, id) => sum + (find(lexical.records, id)?.text.length ?? 0), 0)
    report("legacyWindowChars", legacyChars)
    report("costRatio", round(measured.meanInjectedChars / legacyChars))
    report("legacyWindowSize", legacyInject(lexical.records).length)
    expect(measured.meanInjectedChars).toBeLessThanOrEqual(300)
    expect(measured.meanInjectedChars).toBeLessThanOrEqual(legacyChars * 0.25)
    expect(measured.maxInjectedChars).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxInjectedChars)
    expect(measured.maxInjectedChars).toBeGreaterThanOrEqual(MemoryInject.SECTION_HEADER_CHARS)
  })
})

describe("stability — gate: byteStability = 1.0", () => {
  test("repeating a query produces identical bytes, so re-sending never breaks the cache", () => {
    expect(measured.byteStability).toBe(1)
  })

  test("a hundred untouched turns leave recall where it was", async () => {
    const before = await lexical.memory.onTurn({ query: "分支命名规范", scopes: SCOPES })
    for (let index = 0; index < 100; index++) await lexical.memory.onTurn({ query: "commit message 格式类型", scopes: SCOPES })
    const after = await lexical.memory.onTurn({ query: "分支命名规范", scopes: SCOPES })
    expect(after.injectBlock).toBe(before.injectBlock)
  })
})

describe("legacy baseline — gates: new inject recall >= 2x the old window, new search recall >= 0.9", () => {
  test("the old key-ordered window missed most gold entries at this scale", () => {
    const window = new Set(legacyInject(lexical.records))
    const legacyRecall = TURN_GOLD.filter((gold) => window.has(gold.expect)).length / TURN_GOLD.length
    report("legacyInjectRecall", round(legacyRecall))
    report("legacyWindowRecallGain", round(measured.injectRecall / Math.max(legacyRecall, 0.001)))
    expect(measured.injectRecall).toBeGreaterThanOrEqual(legacyRecall * 2)
    expect(window.size).toBeGreaterThan(50)
  })

  test("the old substring search found almost nothing a Chinese query asked for", () => {
    const legacyHits = GOLD.filter((gold) => legacySearch(lexical.records, gold.query, 5).includes(gold.expect)).length
    report("legacySearchRecallAt5", round(legacyHits / GOLD.length))
    expect(measured.searchRecallAtK).toBeGreaterThanOrEqual(0.9)
    expect(measured.searchRecallAtK).toBeGreaterThan(legacyHits / GOLD.length)
  })
})

describe("settings surface — the gate must survive hostile configuration", () => {
  test("out-of-range config falls back instead of disabling retrieval", async () => {
    const hostile = resolveSettings({
      inject: "sometimes",
      maxInjectedChars: -5,
      vectorTopK: 0,
      lexicalThreshold: 11,
      vectorThreshold: Number.NaN,
      lexicalScanLimit: 0.5,
    } as unknown as Partial<Settings>)
    expect(hostile.inject).toBe(DEFAULT_SETTINGS.inject)
    expect(hostile.maxInjectedChars).toBe(DEFAULT_SETTINGS.maxInjectedChars)
    expect(hostile.vectorTopK).toBe(DEFAULT_SETTINGS.vectorTopK)
    expect(hostile.lexicalThreshold).toBe(DEFAULT_SETTINGS.lexicalThreshold)
    expect(hostile.vectorThreshold).toBe(DEFAULT_SETTINGS.vectorThreshold)
    expect(hostile.lexicalScanLimit).toBe(DEFAULT_SETTINGS.lexicalScanLimit)
    const built = await corpus({ seed: CORPUS, settings: hostile })
    const metrics = await MemoryEvaluate.evaluate(built.memory, SCOPES, OPTIONS)
    expect(metrics.injectRecall).toBeGreaterThanOrEqual(0.85)
    expect(metrics.searchRecallAtK).toBe(1)
  })

  test("a budget under the section header injects nothing rather than a bare header", async () => {
    const built = await corpus({ seed: CORPUS, settings: { ...DEFAULT_SETTINGS, maxInjectedChars: 40 } })
    const metrics = await MemoryEvaluate.evaluate(built.memory, SCOPES, OPTIONS)
    expect(metrics.injectRecall).toBe(0)
    expect(metrics.meanInjectedChars).toBe(0)
    expect(metrics.falseInjection).toBe(0)
  })

  test("trigger-only mode keeps abbreviations and drops the fuzzy channels", async () => {
    const built = await corpus({ seed: CORPUS, settings: { ...DEFAULT_SETTINGS, inject: "trigger" } })
    const metrics = await MemoryEvaluate.evaluate(built.memory, SCOPES, OPTIONS)
    expect(metrics.injectRecall).toBe(2 / TURN_GOLD.length)
    expect(metrics.channelStatus.lexical).toBe("skipped")
    expect(metrics.falseInjection).toBe(0)
  })
})

function find(records: readonly MemoryRecord[], id: string): MemoryRecord | undefined {
  return records.find((record) => record.id === id)
}

function round(value: number): number {
  return Number(value.toFixed(3))
}
