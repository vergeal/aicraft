export * as MemoryQuery from "./query.js"
import { MemoryTokens } from "./tokens.js"
import type { Embedder, MemoryRecord, Store } from "./types.js"

export type Channel = "trigger" | "vector" | "lexical"

export interface Hit {
  readonly record: MemoryRecord
  readonly score: number
  readonly channel: Channel
}

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / Math.sqrt(normA * normB)
}

/** Stable ranking: score desc, then id asc — byte-identical output for identical inputs. */
export function rank(hits: readonly Hit[], limit?: number): Hit[] {
  const sorted = [...hits].sort((a, b) => (b.score - a.score) || (a.record.id < b.record.id ? -1 : 1))
  return limit === undefined ? sorted : sorted.slice(0, limit)
}

/** Split a ranked list at the threshold: the cut candidates are kept as near-misses so the
 *  turn ledger can report `below_threshold` — that distribution is the calibration data the
 *  real thresholds get tuned from. */
export function applyThreshold(ranked: readonly Hit[], threshold: number, topK: number): { hits: Hit[]; near: Hit[] } {
  const hits = ranked.filter((hit) => hit.score >= threshold).slice(0, topK)
  const taken = new Set(hits.map((hit) => hit.record.id))
  return { hits, near: ranked.filter((hit) => !taken.has(hit.record.id)).slice(0, topK) }
}

/** Trigger-exact: query surface forms looked up against the trigger table by the store. */
export async function triggerHits(store: Store, query: string, scopes: readonly string[]): Promise<Hit[]> {
  const forms = [...new Set([MemoryTokens.normalize(query.trim()), ...MemoryTokens.tokenize(query)])]
  const records = await store.findTriggers(forms, scopes)
  return rank(records.map((record) => ({ record, score: 1, channel: "trigger" as const })))
}

/**
 * Brute-force cosine over the scope's embedded records, fully ranked (no threshold here).
 * At the ten-thousand-entry scale the scan is single-digit milliseconds in process, so no
 * vector index or SQLite extension is needed — an index only matters at the million scale.
 * A failing embedder yields an empty list, never an error: the vector channel is optional.
 */
export async function vectorRank(
  store: Store,
  embedder: Embedder,
  scanLimit: number,
  query: string,
  scopes: readonly string[],
): Promise<Hit[]> {
  const embedding = await embedder.embed(query).catch(() => undefined)
  if (embedding === undefined) return []
  const vectors = await Promise.all(scopes.map((scope) => store.vectorCandidates(scope, scanLimit)))
  return rank(
    vectors
      .flat()
      .map((record) => ({ record, score: cosine(embedding, record.embedding ?? []), channel: "vector" as const })),
  )
}

/**
 * Bigram-overlap ranking over token-index candidates from each scope. The candidate source
 * is the token index (`lexicalCandidates`), never a recency window: entries worth finding are
 * usually the oldest ones, and a window silently re-creates the kv kernel's newest-100 cap.
 */
export async function lexicalRank(
  store: Store,
  scanLimit: number,
  query: string,
  scopes: readonly string[],
): Promise<Hit[]> {
  const tokens = MemoryTokens.tokenize(query)
  if (tokens.length === 0) return []
  const candidates = await Promise.all(scopes.map((scope) => store.lexicalCandidates(tokens, scope, scanLimit)))
  const queryTokens = new Set(tokens)
  return rank(
    candidates
      .flat()
      .map((record) => ({
        record,
        score: MemoryTokens.tokenOverlap(queryTokens, record.tokens),
        channel: "lexical" as const,
      }))
      .filter((hit) => hit.score > 0),
  )
}

/** Channel-priority dedup (trigger > vector > lexical) capped at `limit` total. */
export function fuse(channels: readonly Hit[][], limit: number): Hit[] {
  const seen = new Set<string>()
  const fused: Hit[] = []
  for (const channel of channels) {
    for (const hit of channel) {
      if (seen.has(hit.record.id)) continue
      seen.add(hit.record.id)
      fused.push(hit)
      if (fused.length >= limit) return fused
    }
  }
  return fused
}
