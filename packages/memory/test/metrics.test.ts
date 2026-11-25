import { describe, expect, test } from "bun:test"
import { DEFAULT_SETTINGS, MemoryReference, MemorySubsystem, scopeKey } from "../src/index.js"
import type { MemoryRecord, MemoryType, Settings } from "../src/index.js"
import {
  CORPUS,
  NO_MATCH_QUERIES,
  PROJECT,
  SCOPES,
  SEARCH_GOLD,
  TURN_GOLD,
  fixedClock,
  legacyInject,
  legacySearch,
} from "./fixtures.js"

/**
 * Acceptance metrics. Every gate here is a measured number on a 421-entry corpus, not a
 * smoke test: the whole reason this subsystem replaces the kv kernel is that the old read
 * path could not state or meet a recall figure. Metrics are printed so a regression names
 * the number instead of failing a matcher on one query.
 */
const INJECTABLE: readonly MemoryType[] = ["convention", "preference"]
const ALL_GOLD = [...TURN_GOLD, ...SEARCH_GOLD]
/** Fake-calibrated: the deterministic fake scores 0.12-0.27 on relevant pairs (see AGENTS.md),
 *  so mode B runs its own threshold. Absolute thresholds for bge-small come from the spike. */
const FAKE_VECTOR: Settings = { ...DEFAULT_SETTINGS, vectorThreshold: 0.12 }

interface Corpus {
  readonly memory: ReturnType<typeof MemorySubsystem.createSubsystem>
  readonly all: readonly MemoryRecord[]
}

async function build(options: { embedder?: boolean; settings?: Settings }): Promise<Corpus> {
  const memory = MemorySubsystem.createSubsystem({
    store: MemoryReference.createStore(),
    embedder: options.embedder === true ? MemoryReference.createFakeEmbedder() : undefined,
    settings: options.settings ?? DEFAULT_SETTINGS,
    clock: fixedClock(),
  })
  for (const entry of CORPUS) {
    await memory.save({
      scope: entry.scope,
      projectID: entry.scope === "project" ? PROJECT : undefined,
      type: entry.type,
      text: entry.text,
      tags: entry.tags,
      trigger: entry.trigger,
      id: entry.id,
    })
  }
  const all = [
    ...(await memory.list("global", 10_000)).records,
    ...(await memory.list(scopeKey("project", PROJECT), 10_000)).records,
  ]
  return { memory, all }
}

const plain = await build({})
const vector = await build({ embedder: true, settings: FAKE_VECTOR })
const corpusSize = plain.all.length

async function injectedIds(memory: Corpus["memory"], query: string) {
  const turn = await memory.onTurn({ query, scopes: SCOPES })
  return { ids: turn.entries.map((record) => record.id), chars: turn.injectBlock.length, turn }
}

describe("corpus", () => {
  test("the corpus is at long-term scale and the two scopes are populated as seeded", async () => {
    expect(corpusSize).toBeGreaterThanOrEqual(400)
    expect((await plain.memory.list("global", 20)).total).toBe(83)
    expect((await plain.memory.list(scopeKey("project", PROJECT), 20)).total).toBe(338)
  })

  test("list reports real totals beyond its own page and flags truncation", async () => {
    const page = await plain.memory.list(scopeKey("project", PROJECT), 20)
    expect(page.records.length).toBe(20)
    expect(page.total).toBeGreaterThan(20)
    expect(page.truncated).toBe(true)
  })
})

describe("retrieval recall — gate: lexical mode >= 0.85, vector mode >= 0.66, search@5 = 1.0", () => {
  test("auto-inject recall on the turn gold set", async () => {
    const rows = []
    for (const gold of TURN_GOLD) rows.push(await injectedIds(plain.memory, gold.query))
    const recall = rows.filter((row, index) => row.ids.includes(TURN_GOLD[index].expect)).length / TURN_GOLD.length
    report("injectRecall.lexical", recall)
    expect(recall).toBeGreaterThanOrEqual(0.85)
  })

  test("auto-inject recall on the turn gold set with the vector channel on", async () => {
    const rows = []
    for (const gold of TURN_GOLD) rows.push(await injectedIds(vector.memory, gold.query))
    const recall = rows.filter((row, index) => row.ids.includes(TURN_GOLD[index].expect)).length / TURN_GOLD.length
    report("injectRecall.vectorFakeCalibrated", recall)
    expect(recall).toBeGreaterThanOrEqual(0.66)
  })

  test("search recall@5 across every gold pair, including retrieval-only types", async () => {
    let hits = 0
    for (const gold of ALL_GOLD) {
      const result = await plain.memory.search({ query: gold.query, scopes: SCOPES, limit: 5 })
      if (result.records.some((record) => record.id === gold.expect)) hits += 1
    }
    const recall = hits / ALL_GOLD.length
    report("searchRecallAt5", recall)
    expect(recall).toBe(1)
  })

  test("search recall@1", async () => {
    let hits = 0
    for (const gold of ALL_GOLD) {
      const result = await plain.memory.search({ query: gold.query, scopes: SCOPES, limit: 1 })
      if (result.records.some((record) => record.id === gold.expect)) hits += 1
    }
    const recall = hits / ALL_GOLD.length
    report("searchRecallAt1", recall)
    expect(recall).toBeGreaterThanOrEqual(0.8)
  })
})

describe("precision — gate: false injection on unrelated queries = 0, injection precision >= 0.75", () => {
  test("unrelated queries inject nothing at scale", async () => {
    let injected = 0
    for (const query of NO_MATCH_QUERIES) injected += (await injectedIds(plain.memory, query)).ids.length
    report("falseInjectionCount.lexical", injected)
    expect(injected).toBe(0)
  })

  test("threshold sweep: recall and false injection move monotonically against each other", async () => {
    const points = []
    for (const vectorThreshold of [0.05, 0.08, 0.12, 0.18, 0.35]) {
      const built = await build({ embedder: true, settings: { ...FAKE_VECTOR, vectorThreshold } })
      let hits = 0
      for (const gold of TURN_GOLD)
        hits += (await injectedIds(built.memory, gold.query)).ids.includes(gold.expect) ? 1 : 0
      let injected = 0
      for (const query of NO_MATCH_QUERIES) injected += (await injectedIds(built.memory, query)).ids.length
      points.push({ vectorThreshold, recall: hits / TURN_GOLD.length, falseInjection: injected })
    }
    for (const point of points)
      report(`sweep@${point.vectorThreshold}`, `recall=${point.recall.toFixed(3)} false=${point.falseInjection}`)
    const recall = points.map((point) => point.recall)
    const falseInjection = points.map((point) => point.falseInjection)
    expect(recall.every((value, index) => index === 0 || value <= recall[index - 1])).toBe(true)
    expect(falseInjection.every((value, index) => index === 0 || value <= falseInjection[index - 1])).toBe(true)
    // The threshold mechanism, not the fake's calibration: at the production bar nothing the
    // query fails to support gets in, and loosening the bar can only add candidates.
    expect(points.at(-1)?.falseInjection).toBe(0)
    expect(recall[0]).toBeGreaterThanOrEqual(0.66)
    // The fake's noise floor (~0.20 measured) is why this suite cannot claim an operating
    // point of "high recall AND zero false injection". That claim belongs to the golden-set
    // spike against bge-small; asserting it here would be asserting a property of the fake.
    report("fakeNoiseFloorRecallAtZeroFalse", String(points.at(-1)?.recall.toFixed(3)))
  })

  test("injection precision: of everything injected on gold queries, how much was wanted", async () => {
    let wanted = 0
    let total = 0
    for (const gold of TURN_GOLD) {
      const row = await injectedIds(plain.memory, gold.query)
      total += row.ids.length
      wanted += row.ids.filter((id) => id === gold.expect).length
    }
    const precision = total === 0 ? 0 : wanted / total
    report("injectPrecision.lexical", precision)
    expect(precision).toBeGreaterThanOrEqual(0.75)
  })

  test("the type partition is never violated — retrieval-only types stay out of the block", async () => {
    const byId = new Map(plain.all.map((record) => [record.id, record]))
    let violations = 0
    for (const gold of ALL_GOLD) {
      const row = await injectedIds(plain.memory, gold.query)
      violations += row.ids.filter((id) => !INJECTABLE.includes(byId.get(id)?.type ?? "convention")).length
    }
    report("partitionViolations", violations)
    expect(violations).toBe(0)
  })
})

describe("token cost — gate: mean injected chars <= 300 and <= 25% of the legacy window", () => {
  test("injected characters per turn stay far below the old every-step window", async () => {
    const rows = []
    for (const gold of ALL_GOLD) rows.push(await injectedIds(plain.memory, gold.query))
    const mean = rows.reduce((sum, row) => sum + row.chars, 0) / rows.length
    const max = Math.max(...rows.map((row) => row.chars))
    const legacyChars = legacyInject(plain.all).reduce(
      (sum, id) => sum + (plain.all.find((record) => record.id === id)?.text.length ?? 0),
      0,
    )
    report("meanInjectedChars", Math.round(mean))
    report("legacyWindowChars", legacyChars)
    report("costRatio", Number((mean / legacyChars).toFixed(3)))
    expect(mean).toBeLessThanOrEqual(300)
    expect(mean).toBeLessThanOrEqual(legacyChars * 0.25)
    expect(max).toBeLessThanOrEqual(DEFAULT_SETTINGS.maxInjectedChars)
  })
})

describe("stability — gate: 100% byte-identical repeats", () => {
  test("the same query yields the same block bytes, so re-sending it never breaks the cache", async () => {
    let stable = 0
    for (const gold of TURN_GOLD) {
      const first = (await injectedIds(plain.memory, gold.query)).turn.injectBlock
      const second = (await injectedIds(plain.memory, gold.query)).turn.injectBlock
      if (first === second) stable += 1
    }
    report("byteStabilityRate", stable / TURN_GOLD.length)
    expect(stable).toBe(TURN_GOLD.length)
  })

  test("an untouched store gives the same recall after a hundred turns", async () => {
    const before = await injectedIds(plain.memory, "分支命名规范")
    for (let index = 0; index < 100; index++) await injectedIds(plain.memory, "commit message 格式类型")
    const after = await injectedIds(plain.memory, "分支命名规范")
    expect(after.ids).toEqual(before.ids)
  })
})

describe("legacy baseline — gate: new recall is at least 2x the old key-ordered window", () => {
  test("the old window missed most gold entries at this scale", async () => {
    const window = new Set(legacyInject(plain.all))
    const legacyRecall = TURN_GOLD.filter((gold) => window.has(gold.expect)).length / TURN_GOLD.length
    let newHits = 0
    for (const gold of TURN_GOLD) newHits += (await injectedIds(plain.memory, gold.query)).ids.includes(gold.expect) ? 1 : 0
    const newRecall = newHits / TURN_GOLD.length
    report("legacyWindowSize", window.size)
    report("legacyInjectRecall", legacyRecall)
    report("gainRatio", newRecall === 0 ? Infinity : Number((legacyRecall / newRecall).toFixed(3)))
    expect(newRecall).toBeGreaterThanOrEqual(legacyRecall * 2)
  })

  test("the old substring search found almost nothing a Chinese query asked for", async () => {
    let legacyHits = 0
    for (const gold of ALL_GOLD) {
      if (legacySearch(plain.all, gold.query, 5).includes(gold.expect)) legacyHits += 1
    }
    let newHits = 0
    for (const gold of ALL_GOLD) {
      const result = await plain.memory.search({ query: gold.query, scopes: SCOPES, limit: 5 })
      if (result.records.some((record) => record.id === gold.expect)) newHits += 1
    }
    report("legacySearchRecallAt5", legacyHits / ALL_GOLD.length)
    report("newSearchRecallAt5", newHits / ALL_GOLD.length)
    expect(newHits).toBeGreaterThan(legacyHits)
    expect(newHits / ALL_GOLD.length).toBeGreaterThanOrEqual(0.9)
  })
})

function report(metric: string, value: number | string) {
  console.log(`[memory-metrics] ${metric}=${value} @corpus=${corpusSize}`)
}
