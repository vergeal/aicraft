export * as MemoryTypes from "./types.js"

export type Scope = "global" | "project" | "plugin"

/** The injection-policy partition key, not a taxonomy: `convention` and `preference` are the
 *  only types the turn pipeline may auto-inject; the rest are reachable via search only. */
export type MemoryType = "convention" | "preference" | "decision" | "project_knowledge" | "historical"

export type MemoryStatus = "active" | "superseded" | "expired"

export interface MemoryRecord {
  readonly id: string
  readonly scope: Scope
  readonly projectID?: string
  readonly pluginID?: string
  readonly type: MemoryType
  readonly status: MemoryStatus
  readonly version: number
  readonly text: string
  readonly tags: readonly string[]
  readonly textHash: string
  readonly tokens: readonly string[]
  readonly embedding?: readonly number[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** One row of `memory_trigger`: an exact surface form that must pull the entry into the turn. */
export interface Trigger {
  readonly memoryID: string
  readonly text: string
  readonly match: "exact" | "prefix"
}

/**
 * Scope routing key. The subsystem composes it, the store treats it as opaque: `global`,
 * `project:<id>`, `plugin:<id>`. No cross-scope visibility is implied — the turn pipeline
 * queries the project key and the global key separately.
 */
export function scopeKey(scope: Scope, id?: string): string {
  if (scope === "global") return "global"
  if (scope === "project") return `project:${id}`
  return `plugin:${id}`
}

export interface Settings {
  readonly inject: "off" | "trigger" | "trigger+vector"
  readonly maxInjectedChars: number
  readonly lexicalTopK: number
  readonly lexicalThreshold: number
  /** Safety valve for the token-index lookup, not a candidate window: high enough that a
   *  common token cannot push a genuinely relevant entry out of the scan. */
  readonly lexicalScanLimit: number
  /** Page size for `list` and the recency fallback; retrieval never reads through this. */
  readonly maxEntries: number
  readonly vectorTopK: number
  readonly vectorThreshold: number
  /** Brute-force cosine scan cap per scope; ten thousand is single-digit ms in process. */
  readonly vectorScanLimit: number
}

export const DEFAULT_SETTINGS: Settings = {
  inject: "trigger+vector",
  maxInjectedChars: 1500,
  maxEntries: 200,
  vectorTopK: 3,
  vectorThreshold: 0.35,
  lexicalTopK: 3,
  lexicalThreshold: 0.3,
  lexicalScanLimit: 500,
  vectorScanLimit: 10_000,
}

export interface Store {
  readonly insert: (record: MemoryRecord) => Promise<void>
  readonly update: (record: MemoryRecord) => Promise<void>
  readonly remove: (id: string) => Promise<void>
  readonly get: (id: string) => Promise<MemoryRecord | undefined>
  readonly findByTextHash: (textHash: string, scope: string) => Promise<MemoryRecord | undefined>
  /** Exact surface-form lookup across the turn's scopes (trigger table, indexed IN lookup). */
  readonly findTriggers: (forms: readonly string[], scopes: readonly string[]) => Promise<readonly MemoryRecord[]>
  readonly addTrigger: (trigger: Trigger) => Promise<void>
  readonly removeTriggers: (memoryID: string) => Promise<void>
  readonly listRecent: (scope: string, max: number) => Promise<ScopeListing>
  /**
   * Records sharing at least one query token, best-overlap first, capped by `limit` as a
   * safety valve. This is the candidate source for the lexical channel: it must come from the
   * token index, never from a recency window. Measured 2026-11 on a 421-entry corpus: a
   * recency-window candidate source scored 0.22 recall because the entries worth finding are
   * the oldest ones — the same failure the kv kernel's newest-100 cap had, only quieter.
   */
  readonly lexicalCandidates: (tokens: readonly string[], scope: string, limit: number) => Promise<readonly MemoryRecord[]>
  readonly vectorCandidates: (scope: string, max: number) => Promise<readonly MemoryRecord[]>
}

export interface ScopeListing {
  readonly records: readonly MemoryRecord[]
  readonly total: number
  readonly truncated: boolean
}

export interface Embedder {
  readonly dimensions: number
  readonly embed: (text: string) => Promise<readonly number[]>
}

/** Why a retrieved candidate stayed out of this turn's block. `memory_log` attributes misses
 *  from these; only reasons the subsystem actually produces belong here. */
export type MissReason = "below_threshold" | "auto_inject_type" | "budget"

export interface TurnDecision {
  readonly mode: Settings["inject"]
  readonly scope: string
  readonly query: string
  readonly triggerHits: readonly string[]
  readonly vectorHits: readonly string[]
  readonly lexicalHits: readonly string[]
  readonly injected: readonly string[]
  readonly skipped: ReadonlyArray<{ id: string; reason: MissReason }>
}

export interface TurnResult {
  /** The request-tail section body; empty string means inject nothing this turn. */
  readonly injectBlock: string
  readonly entries: readonly MemoryRecord[]
  readonly decision: TurnDecision
}
