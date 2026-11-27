export * as MemoryQuery from "./query.js"
import { MemoryTokens } from "./tokens.js"
import type { ChannelStatus, Embedder, Hit, Store } from "./types.js"

export interface Ranked {
  /** Every scored candidate, best first, threshold not yet applied. */
  readonly ranked: readonly Hit[]
  /** Why a channel produced nothing: `failed` means the channel broke, `skipped` means policy
   *  or configuration turned it off. `memory_log` attributes misses from this, so the
   *  distinction between "looked and missed" and "could not look" has to survive. */
  readonly status: ChannelStatus
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
export async function triggerRank(store: Store, query: string, scopes: readonly string[]): Promise<Ranked> {
  const forms = [...new Set([MemoryTokens.normalize(query.trim()), ...MemoryTokens.tokenize(query)])]
  const records = await lookup(() => store.findTriggers(forms, scopes))
  if (records === undefined) return { ranked: [], status: "failed" }
  return { ranked: rank(records.map((record) => ({ record, score: 1, channel: "trigger" as const }))), status: "ran" }
}

/**
 * Brute-force cosine over the scope's current-version embeddings, fully ranked (no threshold
 * here). At the ten-thousand-entry scale the scan is single-digit milliseconds in process, so
 * no vector index or SQLite extension is needed — an index only matters at the million scale.
 * Rows carrying another `embedVersion` are excluded by the store: they live in a different
 * vector space and scoring them is a category error, not noise.
 */
export async function vectorRank(
  store: Store,
  embedder: Embedder,
  scanLimit: number,
  query: string,
  scopes: readonly string[],
): Promise<Ranked> {
  const embedding = await embedder.embed(query).then((value) => [value] as const, () => undefined)
  if (embedding === undefined) return { ranked: [], status: "failed" }
  const ranked = await scoreAgainst(store, embedding[0], embedder.version, scanLimit, scopes)
  if (ranked === undefined) return { ranked: [], status: "failed" }
  return { ranked, status: "ran" }
}

/** Cosine ranking against a vector the caller already holds: the save path embeds its draft
 *  before dedup, and re-embedding inside dedup would double the cost of every write. A store
 *  read failure yields an empty list — the caller treats "no candidates" as "not a duplicate",
 *  never as a reason to lose the save. */
export async function vectorScored(
  store: Store,
  embedding: readonly number[],
  embedVersion: string,
  scanLimit: number,
  scopes: readonly string[],
): Promise<readonly Hit[]> {
  return (await scoreAgainst(store, embedding, embedVersion, scanLimit, scopes)) ?? []
}

async function scoreAgainst(
  store: Store,
  embedding: readonly number[],
  embedVersion: string,
  scanLimit: number,
  scopes: readonly string[],
): Promise<readonly Hit[] | undefined> {
  const candidates = await lookup(() =>
    Promise.all(scopes.map((scope) => store.vectorCandidates(scope, scanLimit, embedVersion))),
  )
  if (candidates === undefined) return undefined
  return rank(
    candidates
      .flat()
      .map((record) => ({ record, score: cosine(embedding, record.embedding ?? []), channel: "vector" as const })),
  )
}

/**
 * Bigram-overlap ranking over token-index candidates from each scope. The candidate source
 * is the token index (`lexicalCandidates`), never a recency window: entries worth finding are
 * usually the oldest ones, and a window silently re-creates the kv kernel's newest-100 cap.
 * `minEvidence` is the absolute-evidence floor (`evidenceCount`): candidates scoring below it
 * are coincidences, not hits. Search keeps the default — any match is a legitimate hit when the
 * user asked for it; the turn's auto-inject raises it — see `subsystem.ts`.
 */
export async function lexicalRank(
  store: Store,
  scanLimit: number,
  query: string,
  scopes: readonly string[],
  minEvidence = 1,
): Promise<Ranked> {
  const tokens = MemoryTokens.tokenize(query)
  if (tokens.length === 0) return { ranked: [], status: "skipped" }
  const candidates = await lookup(() => Promise.all(scopes.map((scope) => store.lexicalCandidates(tokens, scope, scanLimit))))
  if (candidates === undefined) return { ranked: [], status: "failed" }
  const queryTokens = new Set(tokens)
  return {
    ranked: rank(
      candidates
        .flat()
        .map((record) => ({ record, evidence: MemoryTokens.evidenceCount(queryTokens, record.tokens) }))
        .filter((match) => match.evidence >= minEvidence)
        .map((match) => ({
          record: match.record,
          score: MemoryTokens.tokenOverlap(queryTokens, match.record.tokens),
          channel: "lexical" as const,
        })),
    ),
    status: "ran",
  }
}

/** Channel-priority dedup (trigger first, then vector, then lexical) capped at `limit`. */
export function fuse(channels: readonly (readonly Hit[])[], limit: number): Hit[] {
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

/** A store read that rejects is an infrastructure failure, and memory never gets to fail a
 *  request: the channel reports `failed` and the others carry on. */
function lookup<T>(read: () => Promise<T>): Promise<T | undefined> {
  return read().catch(() => undefined)
}
