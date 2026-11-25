import { DEFAULT_SETTINGS, MemoryEvaluate, MemoryReference, MemorySubsystem } from "../src/index.js"
import type { Embedder, Settings } from "../src/index.js"
import { CORPUS, fixedClock, NO_MATCH_QUERIES, PROJECT, SCOPES, SEARCH_GOLD, TURN_GOLD } from "../test/fixtures.js"
import type { SeedInput } from "../test/fixtures.js"

/**
 * Golden-set spike against the real bge-small-zh-v1.5 vectors (llama.cpp `llama-server
 * --embedding`, OpenAI-compatible /v1/embeddings). This is where the operating point comes
 * from: which vectorThreshold separates relevant from noise on a 421-entry corpus, and whether
 * trigger+vector injection alone reaches the recall gate or the block must fuse the lexical
 * channel (the open question in AGENTS.md). Run with the server up:
 *
 *   bun run spike/real-vector.ts http://127.0.0.1:18080
 */
const baseUrl = process.argv[2] ?? "http://127.0.0.1:18080"
const RECIPE = "bge-small-zh-v1.5-cls-l2-zh-query-prefix-1"
const QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："
const DIMENSIONS = 512

const embedder: Embedder = {
  dimensions: DIMENSIONS,
  version: RECIPE,
  embed: async (text) => (await request([QUERY_PREFIX + text]))[0] ?? [],
  embedAll: async (texts) => request(texts),
}

async function request(inputs: readonly string[]): Promise<number[][]> {
  const out: number[][] = []
  for (let start = 0; start < inputs.length; start += 16) {
    const response = await fetch(`${baseUrl}/v1/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: inputs.slice(start, start + 16), model: "bge-small-zh-v1.5" }),
    })
    if (!response.ok) throw new Error(`llama-server ${response.status}: ${(await response.text()).slice(0, 200)}`)
    const body = (await response.json()) as { data: { embedding: number[] }[] }
    out.push(...body.data.map((item) => item.embedding))
  }
  return out
}

const GOLD: MemoryEvaluate.GoldenCase[] = [
  ...TURN_GOLD.map((item) => ({ query: item.query, expect: item.expect, via: item.via })),
  ...SEARCH_GOLD.map((item) => ({ query: item.query, expect: item.expect, autoInjectForbidden: true })),
]
const OPTIONS: MemoryEvaluate.EvaluationOptions = { cases: GOLD, negatives: NO_MATCH_QUERIES, searchK: 5, repeats: 2 }

const started = Date.now()
const store = MemoryReference.createStore()
const memory = MemorySubsystem.createSubsystem({ store, embedder, settings: withThreshold(0.35), clock: fixedClock() })
for (const entry of CORPUS as readonly SeedInput[]) {
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
console.log(`corpus built: ${CORPUS.length} entries in ${Math.round((Date.now() - started) / 1000)}s`)

reportScores(await rawScores())

for (const threshold of [0.3, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]) {
  const metrics = await MemoryEvaluate.evaluate(
    MemorySubsystem.createSubsystem({ store, embedder, settings: withThreshold(threshold), clock: fixedClock() }),
    SCOPES,
    OPTIONS,
  )
  const misses = metrics.injectCases.filter((item) => !item.hit).map((item) => `${item.query}→${item.expect}(${item.attribution})`)
  console.log(
    `T=${threshold.toFixed(2)} recall=${f2(metrics.injectRecall)} precision=${f2(metrics.injectPrecision)} false=${metrics.falseInjection} ` +
      `violations=${metrics.partitionViolations} chars=${metrics.meanInjectedChars} search@5=${f2(metrics.searchRecallAtK)} stability=${f2(metrics.byteStability)}` +
      (misses.length > 0 ? ` miss: ${misses.join(", ")}` : ""),
  )
}

function withThreshold(vectorThreshold: number): Settings {
  return { ...DEFAULT_SETTINGS, vectorThreshold }
}

/** Cosine of every gold query against its expected entry plus the best-scoring unrelated
 *  active row: the separation gap is what the threshold has to live inside. */
async function rawScores() {
  const rows = (await Promise.all(SCOPES.map((scope) => store.vectorCandidates(scope, 10_000, RECIPE)))).flat()
  const byId = new Map(rows.map((row) => [row.id, row]))
  const results: { query: string; gold: number; bestForeign: number; foreignId: string }[] = []
  for (const item of GOLD) {
    const query = await embedder.embed(item.query)
    const target = byId.get(item.expect)
    if (target?.embedding === undefined) continue
    let bestForeign = 0
    let foreignId = ""
    for (const row of rows) {
      if (row.id === item.expect || row.embedding === undefined) continue
      const score = cosine(query, row.embedding)
      if (score > bestForeign) {
        bestForeign = score
        foreignId = row.id
      }
    }
    results.push({ query: item.query, gold: cosine(query, target.embedding), bestForeign, foreignId })
  }
  const negatives: number[] = []
  for (const query of NO_MATCH_QUERIES) {
    const vector = await embedder.embed(query)
    let best = 0
    for (const row of rows) if (row.embedding !== undefined) best = Math.max(best, cosine(vector, row.embedding))
    negatives.push(best)
  }
  return { results, negatives }
}

function reportScores(scores: Awaited<ReturnType<typeof rawScores>>) {
  const golds = scores.results.map((item) => item.gold).sort((a, b) => a - b)
  const foreigns = scores.results.map((item) => item.bestForeign).sort((a, b) => a - b)
  console.log(`gold pair cos: min=${f2(golds[0])} median=${f2(golds[Math.floor(golds.length / 2)])} max=${f2(golds[golds.length - 1])}`)
  console.log(`best foreign cos: min=${f2(foreigns[0])} median=${f2(foreigns[Math.floor(foreigns.length / 2)])} max=${f2(foreigns[foreigns.length - 1])}`)
  console.log(`negative best-match cos: ${scores.negatives.map(f2).join(", ")}`)
  for (const item of scores.results)
    if (item.gold <= item.bestForeign) console.log(`  overlap: ${item.query}→${item.expect} gold=${f2(item.gold)} foreign=${item.foreignId}@${f2(item.bestForeign)}`)
}

function cosine(a: readonly number[], b: readonly number[]) {
  let dot = 0
  for (let index = 0; index < a.length; index++) dot += a[index]! * b[index]!
  return dot
}

function f2(value: number) {
  return value.toFixed(3)
}
