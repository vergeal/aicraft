export * as MemoryReference from "./reference.js"
import { MemoryTokens } from "./tokens.js"
import type { Embedder, MemoryRecord, ScopeListing, Store, Trigger } from "./types.js"

/**
 * Reference `Store` over plain arrays: the subsystem's acceptance harness and any host that
 * wants a dry run without a database. Same observable ordering rules the core SQL adapter
 * must implement — recency-descending with an id tiebreak, status-filtered reads.
 */
export function createStore(seed?: { records?: readonly MemoryRecord[]; triggers?: readonly Trigger[] }): Store {
  const records = new Map<string, MemoryRecord>((seed?.records ?? []).map((record) => [record.id, record]))
  const triggers = new Map<string, Trigger[]>(
    [...(seed?.triggers ?? [])].reduce((map, trigger) => {
      const list = map.get(trigger.memoryID) ?? []
      list.push(trigger)
      map.set(trigger.memoryID, list)
      return map
    }, new Map<string, Trigger[]>()),
  )

  const ofScope = (scope: string) =>
    [...records.values()].filter((record) => record.scope === scope || scopeOf(record) === scope)

  const activeOf = (scope: string) => ofScope(scope).filter((record) => record.status === "active")

  return {
    async insert(record) {
      records.set(record.id, record)
    },
    async update(record) {
      records.set(record.id, record)
    },
    async remove(id) {
      records.delete(id)
      triggers.delete(id)
    },
    async get(id) {
      return records.get(id)
    },
    async findByTextHash(textHash, scope) {
      return activeOf(scope).find((record) => record.textHash === textHash)
    },
    async findTriggers(forms, scopes) {
      const formSet = new Set(forms)
      const scopeSet = new Set(scopes)
      const hits: MemoryRecord[] = []
      for (const [memoryID, list] of triggers) {
        const record = records.get(memoryID)
        if (record === undefined || record.status !== "active" || !scopeSet.has(scopeOf(record))) continue
        if (list.some((trigger) => formSet.has(trigger.text))) hits.push(record)
      }
      return hits
    },
    async addTrigger(trigger) {
      const list = triggers.get(trigger.memoryID) ?? []
      list.push(trigger)
      triggers.set(trigger.memoryID, list)
    },
    async removeTriggers(memoryID) {
      triggers.delete(memoryID)
    },
    async listRecent(scope, max): Promise<ScopeListing> {
      const sorted = activeOf(scope).sort(byRecency)
      return { records: sorted.slice(0, max), total: sorted.length, truncated: sorted.length > max }
    },
    async lexicalCandidates(tokens, scope, limit) {
      const wanted = new Set(tokens)
      return activeOf(scope)
        .map((record) => ({ record, shared: record.tokens.filter((token) => wanted.has(token)).length }))
        .filter((candidate) => candidate.shared > 0)
        .sort((a, b) => (b.shared - a.shared) || byRecency(a.record, b.record))
        .slice(0, limit)
        .map((candidate) => candidate.record)
    },
    async vectorCandidates(scope, max) {
      return activeOf(scope)
        .filter((record) => record.embedding !== undefined && record.embedding.length > 0)
        .slice(0, max)
    },
  }
}

/** Deterministic stand-in for the real embedder: every token gets a fixed pseudo-random
 *  direction (LCG from the token's hash) and a text is the normalized sum of its token
 *  vectors. Cosine then grows monotonically with shared-token overlap and stays near zero
 *  for unrelated text, which is enough to exercise the vector channel — threshold, top-k,
 *  fusion and degradation — on the same code paths the real bge-small adapter uses.
 *  It is NOT semantic: ranking-quality claims must come from the golden-set spike against
 *  the real model, never from this. */
export function createFakeEmbedder(dimensions = 256): Embedder {
  const cache = new Map<string, number[]>()
  const embed = async (text: string) => {
    const out = new Array<number>(dimensions).fill(0)
    for (const token of MemoryTokens.tokenize(text)) {
      const direction = directionOf(token, dimensions, cache)
      for (let i = 0; i < dimensions; i++) out[i] += direction[i]
    }
    const norm = Math.sqrt(out.reduce((sum, value) => sum + value * value, 0))
    return norm === 0 ? out : out.map((value) => value / norm)
  }
  return { dimensions, embed }
}

function directionOf(token: string, dimensions: number, cache: Map<string, number[]>): number[] {
  const cached = cache.get(token)
  if (cached !== undefined) return cached
  const direction = new Array<number>(dimensions)
  let seed = 0x811c9dc5
  for (let i = 0; i < token.length; i++) {
    seed ^= token.charCodeAt(i)
    seed = Math.imul(seed, 0x01000193) >>> 0
  }
  for (let i = 0; i < dimensions; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    direction[i] = seed / 0x80000000 - 1
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
