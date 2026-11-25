export * as MemoryLifecycle from "./lifecycle.js"
import { MemoryTokens } from "./tokens.js"
import type { MemoryRecord, MemoryType } from "./types.js"

const INJECTABLE: readonly MemoryType[] = ["convention", "preference"]

/** Only these two types may reach the request without the model asking. */
export function isInjectable(type: MemoryType): boolean {
  return INJECTABLE.includes(type)
}

/** FNV-1a over normalized text — exact-duplicate detection without rescanning the scope. */
export function hashText(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

export function normalizeTags(input: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (input ?? [])
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
        .map((tag) => tag.slice(0, 30)),
    ),
  ].slice(0, 8)
}

/**
 * Symmetric token-bag containment: shared tokens over the shorter bag. Asymmetric overlap
 * would let a one-line paraphrase look like a duplicate of a detailed entry, which is the
 * opposite of what dedup should protect — the corpus must keep the more specific record.
 */
export function containment(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const smaller = a.length <= b.length ? new Set(a) : new Set(b)
  const larger = a.length <= b.length ? b : a
  let shared = 0
  for (const token of new Set(larger)) if (smaller.has(token)) shared += 1
  return shared / smaller.size
}

export interface DuplicateReport {
  readonly record: MemoryRecord
  readonly score: number
}

/**
 * Near-duplicate detection runs before an insert commits. The caller never merges text on its
 * own: a near-duplicate save returns the existing entry and the caller (model or user) decides
 * whether to `update` it, because silently overwriting a record the model already cited would
 * change what an earlier context means.
 */
export function findDuplicate(
  candidates: readonly MemoryRecord[],
  tokens: readonly string[],
  threshold: number,
): DuplicateReport | undefined {
  let best: DuplicateReport | undefined
  for (const record of candidates) {
    const score = containment(tokens, record.tokens)
    if (score < threshold) continue
    if (best === undefined || score > best.score || (score === best.score && record.id < best.record.id)) {
      best = { record, score }
    }
  }
  return best
}

/**
 * Rows whose vector was produced by a different model or prefix recipe. Scoring those against
 * a fresh query vector is not noise, it is a category error: the vectors live in different
 * spaces. The adapter feeds this list to its rebuild queue.
 */
export function staleEmbeddings(records: readonly MemoryRecord[], version: string): string[] {
  return records
    .filter((record) => record.status === "active")
    .filter((record) => record.embedVersion !== version || record.embedding === undefined || record.embedding.length === 0)
    .map((record) => record.id)
    .sort()
}

/** The row transform both the reference store and the SQL adapter must agree on: a superseded
 *  version keeps its id and text, loses its active claim, and never points at itself. */
export function supersededRow(record: MemoryRecord, replacedBy?: string): MemoryRecord {
  return { ...record, status: "superseded", supersededBy: replacedBy ?? (record.supersededBy ?? record.id) }
}

/** The shape a version write takes: same id, same createdAt, bumped version, freshly stamped. */
export function nextRow(
  previous: MemoryRecord,
  patch: {
    text: string
    tags: readonly string[]
    type: MemoryType
    embedding?: readonly number[]
    embedVersion?: string
  },
  now: string,
): MemoryRecord {
  return {
    ...previous,
    version: previous.version + 1,
    status: "active",
    type: patch.type,
    text: patch.text,
    tags: patch.tags,
    textHash: hashText(MemoryTokens.normalize(patch.text)),
    tokens: MemoryTokens.tokenize(patch.text),
    embedding: patch.embedding,
    embedVersion: patch.embedVersion,
    supersededBy: undefined,
    updatedAt: now,
  }
}
