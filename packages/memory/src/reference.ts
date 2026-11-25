export * as MemoryReference from "./reference.js"
import { MemoryLifecycle } from "./lifecycle.js"
import { MemoryTokens } from "./tokens.js"
import type {
  Embedder,
  MemoryRecord,
  MemorySource,
  ScopeListing,
  Store,
  Trigger,
} from "./types.js"

/**
 * Reference `Store` over plain arrays: the subsystem's acceptance harness and any host that
 * wants a dry run without a database. It implements the same read rules the core SQL adapter
 * must — one active row per id, superseded rows retained, recency-descending with an id
 * tiebreak, candidates from the token index — so a test that passes here describes the SQL
 * behavior too, not just the in-memory one.
 */
export function createStore(seed?: {
  readonly records?: readonly MemoryRecord[]
  readonly triggers?: readonly Trigger[]
  readonly sources?: readonly MemorySource[]
}): Store {
  const rows = new Map<string, MemoryRecord[]>()
  const triggers = new Map<string, Trigger[]>()
  const sources = new Map<string, MemorySource[]>()
  for (const record of seed?.records ?? []) push(record)
  for (const trigger of seed?.triggers ?? []) pushTrigger(trigger)
  for (const source of seed?.sources ?? []) pushSource(source)

  const active = (id: string) => {
    const list = rows.get(id) ?? []
    return list.filter((record) => record.status === "active").at(-1)
  }
  const activeIn = (scope: string) =>
    [...rows.values()]
      .flat()
      .filter((record) => record.status === "active" && scopeOf(record) === scope)
      .sort(byRecency)

  function push(record: MemoryRecord) {
    const list = rows.get(record.id) ?? []
    list.push(record)
    rows.set(record.id, list)
  }

  function pushTrigger(trigger: Trigger) {
    const list = triggers.get(trigger.memoryID) ?? []
    list.push(trigger)
    triggers.set(trigger.memoryID, list)
  }

  function pushSource(source: MemorySource) {
    const list = sources.get(source.ref) ?? []
    list.push(source)
    sources.set(source.ref, list)
  }

  return {
    async insert(record) {
      push(record)
    },
    async revise(record) {
      const list = rows.get(record.id) ?? []
      rows.set(record.id, list.map((previous) => (previous.status === "active" ? MemoryLifecycle.supersededRow(previous) : previous)).concat(record))
    },
    async supersede(id, byID) {
      const list = rows.get(id) ?? []
      const affected = list.filter((record) => record.status === "active").length
      if (affected === 0) return false
      rows.set(id, list.map((record) => (record.status === "active" ? MemoryLifecycle.supersededRow(record, byID) : record)))
      return true
    },
    async remove(id) {
      rows.delete(id)
      triggers.delete(id)
      sources.delete(id)
    },
    async get(id) {
      return active(id)
    },
    async history(id) {
      return [...(rows.get(id) ?? [])].sort((a, b) => a.version - b.version)
    },
    async findByTextHash(textHash, scope) {
      return activeIn(scope).find((record) => record.textHash === textHash)
    },
    async findTriggers(forms, scopes) {
      const formSet = new Set(forms)
      const scopeSet = new Set(scopes)
      const hits: MemoryRecord[] = []
      for (const [memoryID, list] of triggers) {
        const record = active(memoryID)
        if (record === undefined || !scopeSet.has(scopeOf(record))) continue
        if (list.some((trigger) => formSet.has(trigger.text))) hits.push(record)
      }
      return hits.sort(byRecency)
    },
    async addTrigger(trigger) {
      pushTrigger(trigger)
    },
    async removeTriggers(memoryID) {
      triggers.delete(memoryID)
    },
    async addSource(source) {
      pushSource(source)
    },
    async findCached(kind, ref, scope, limit) {
      const refs = sources.get(ref) ?? []
      const memoryIDs = new Set(refs.filter((source) => source.kind === kind).map((source) => source.memoryID))
      return activeIn(scope)
        .filter((record) => memoryIDs.has(record.id))
        .slice(0, limit)
    },
    async listRecent(scope, max): Promise<ScopeListing> {
      const sorted = activeIn(scope)
      return { records: sorted.slice(0, max), total: sorted.length, truncated: sorted.length > max }
    },
    async lexicalCandidates(tokens, scope, limit) {
      return byShared(tokens, activeIn(scope), limit)
    },
    async vectorCandidates(scope, max, embedVersion) {
      return activeIn(scope)
        .filter((record) => record.embedVersion === embedVersion && record.embedding !== undefined && record.embedding.length > 0)
        .slice(0, max)
    },
    async browse(filter): Promise<ScopeListing> {
      const candidates = [...rows.values()]
        .flat()
        .filter((record) => scopeOf(record) === filter.scope)
        .filter((record) => (filter.status === undefined ? record.status === "active" : record.status === filter.status))
        .filter((record) => filter.type === undefined || record.type === filter.type)
        .filter((record) => filter.tag === undefined || record.tags.includes(filter.tag))
        .sort(byRecency)
      const page = candidates.slice(filter.offset, filter.offset + filter.limit)
      return { records: page, total: candidates.length, truncated: filter.offset + page.length < candidates.length }
    },
  }
}

/** Deterministic stand-in for the real embedder: every token gets a fixed pseudo-random
 *  direction (LCG from the token's hash) and a text is the normalized sum of its token
 *  vectors. Cosine then grows with shared-token overlap, which is enough to exercise the
 *  vector channel — threshold, top-k, fusion, staleness and degradation — on the same code
 *  paths the real bge-small adapter uses. It is NOT semantic, and its score range is not the
 *  real model's: see the threshold note in AGENTS.md. */
export function createFakeEmbedder(options?: { dimensions?: number; version?: string }): Embedder {
  const dimensions = options?.dimensions ?? 256
  const version = options?.version ?? "fake-bigram-1"
  const cache = new Map<string, number[]>()
  const vector = (text: string) => {
    const out = new Array<number>(dimensions).fill(0)
    for (const token of MemoryTokens.tokenize(text)) {
      const direction = directionOf(token, dimensions, cache)
      for (let index = 0; index < dimensions; index++) out[index] += direction[index]
    }
    const norm = Math.sqrt(out.reduce((sum, value) => sum + value * value, 0))
    return norm === 0 ? out : out.map((value) => value / norm)
  }
  return {
    dimensions,
    version,
    embed: async (text) => vector(text),
    embedAll: async (texts) => texts.map(vector),
  }
}

function byShared(tokens: readonly string[], records: readonly MemoryRecord[], limit: number): MemoryRecord[] {
  const wanted = new Set(tokens)
  return records
    .map((record) => ({ record, shared: record.tokens.filter((token) => wanted.has(token)).length }))
    .filter((candidate) => candidate.shared > 0)
    .sort((a, b) => (b.shared - a.shared) || byRecency(a.record, b.record))
    .slice(0, limit)
    .map((candidate) => candidate.record)
}

function directionOf(token: string, dimensions: number, cache: Map<string, number[]>): number[] {
  const cached = cache.get(token)
  if (cached !== undefined) return cached
  const direction = new Array<number>(dimensions)
  let seed = 0x811c9dc5
  for (let index = 0; index < token.length; index++) {
    seed ^= token.charCodeAt(index)
    seed = Math.imul(seed, 0x01000193) >>> 0
  }
  for (let index = 0; index < dimensions; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    direction[index] = seed / 0x80000000 - 1
  }
  cache.set(token, direction)
  return direction
}

function scopeOf(record: MemoryRecord): string {
  if (record.scope === "global") return "global"
  if (record.scope === "project") return `project:${record.projectID}`
  return `plugin:${record.pluginID}`
}

function byRecency(a: MemoryRecord, b: MemoryRecord): number {
  return b.updatedAt.localeCompare(a.updatedAt) || (a.id < b.id ? -1 : 1)
}
