export * as MemoryTypes from "./types.js"

export type Scope = "global" | "project" | "plugin"

/** The injection-policy partition key, not a taxonomy: `convention` and `preference` are the
 *  only types the turn pipeline may auto-inject; the rest are reachable via search only. */
export type MemoryType = "convention" | "preference" | "decision" | "project_knowledge" | "historical"

/** `superseded` covers both shapes of "this is no longer the current answer": an older version
 *  row of the same id, and an entry replaced by a different id (see `supersededBy`). There is
 *  deliberately no `expired` status: no retention rule has been decided, and a status nobody
 *  can set is dead code that the SQL schema would have to carry forever. */
export type MemoryStatus = "active" | "superseded"

export interface MemoryRecord {
  readonly id: string
  readonly scope: Scope
  readonly projectID?: string
  readonly pluginID?: string
  readonly type: MemoryType
  readonly status: MemoryStatus
  /** Version rows share an id; the newest active row is the entry. Older rows stay for audit
   *  and for references handed to the model in earlier context, which must never dangle. */
  readonly version: number
  readonly text: string
  readonly tags: readonly string[]
  readonly textHash: string
  readonly tokens: readonly string[]
  readonly embedding?: readonly number[]
  /** The `Embedder.version` that produced `embedding`. A mismatch means the vector is stale and
   *  must not be scored against a fresh query vector. */
  readonly embedVersion?: string
  /** The id that replaced this entry, when the replacement is a different entry. */
  readonly supersededBy?: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** One row of `memory_trigger`: an exact surface form that pulls the entry into the turn.
 *  Matching is exact by contract — a trigger is a promise, so prefix/fuzzy forms belong to the
 *  vector and lexical channels, not here. */
export interface Trigger {
  readonly memoryID: string
  readonly text: string
}

/** Provenance of an entry, one row of `memory_source`. `session` sources are what the session
 *  index channel lists; `plugin` sources keep plugin memory attributable to its owner. */
export interface MemorySource {
  readonly memoryID: string
  readonly kind: "session" | "plugin" | "user"
  readonly ref: string
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
  /** Page size for `list`; retrieval never reads through this. */
  readonly maxEntries: number
  readonly vectorTopK: number
  readonly vectorThreshold: number
  /** Brute-force cosine scan cap per scope; ten thousand is single-digit ms in process. */
  readonly vectorScanLimit: number
  /** The session index channel (one-time synthetic list of what this session saved). Off by
   *  default: the vector channel made it redundant, but the cost is per session, not per turn. */
  readonly sessionIndex: "off" | "on"
  /** Symmetric token-bag containment at which a save is treated as a near-duplicate instead
   *  of a new entry. Below exact-hash dedup, above it the corpus grows without gaining facts. */
  readonly nearDuplicateThreshold: number
  /** Embedding cosine at which a save is a semantic duplicate despite unrelated wording.
   *  Containment is lexical: six paraphrases of one habit, saved by different models in
   *  different sessions, each passed the 0.85 gate — the vector gate is what catches those.
   *  Not yet calibrated against the real bge-small-zh (the fake embedder is not semantic and
   *  dev runs carry no embedder); 0.92 is the conservative end. Change only with spike
   *  measurements, same rule as `vectorThreshold`. */
  readonly semanticDuplicateThreshold: number
  /** Default page size for the settings page and `browse`. */
  readonly browseLimit: number
}

export const DEFAULT_SETTINGS: Settings = {
  inject: "trigger+vector",
  maxInjectedChars: 1500,
  lexicalTopK: 3,
  lexicalThreshold: 0.3,
  lexicalScanLimit: 500,
  maxEntries: 200,
  vectorTopK: 3,
  // Calibrated 2026-11-26 by `spike/real-vector.ts` on the 421-entry golden corpus with the
  // real bge-small-zh-v1.5: gold query/entry pairs score 0.449-0.769, best unrelated pairs
  // 0.379-0.553, and no unrelated query injects anything at this cut (recall 1.0, false
  // injection 0, mean 264 chars). Raising it to 0.45 already loses a gold pair.
  vectorThreshold: 0.4,
  vectorScanLimit: 10_000,
  sessionIndex: "off",
  nearDuplicateThreshold: 0.85,
  semanticDuplicateThreshold: 0.92,
  browseLimit: 50,
}

export interface BrowseFilter {
  readonly scope: string
  readonly type?: MemoryType
  readonly status?: MemoryStatus
  readonly tag?: string
  readonly limit: number
  readonly offset: number
}

export interface Store {
  readonly insert: (record: MemoryRecord) => Promise<void>
  /** One transaction: write the new version row as active, mark the previous active rows of
   *  the same id superseded. A partial write would leave two active rows for one id. */
  readonly revise: (record: MemoryRecord) => Promise<void>
  /** Mark every active row of `id` superseded, pointing at the replacing entry. */
  readonly supersede: (id: string, byID: string) => Promise<boolean>
  readonly remove: (id: string) => Promise<void>
  /** The active row for an id, never a superseded version. */
  readonly get: (id: string) => Promise<MemoryRecord | undefined>
  /** All version rows for an id, oldest first. */
  readonly history: (id: string) => Promise<readonly MemoryRecord[]>
  readonly findByTextHash: (textHash: string, scope: string) => Promise<MemoryRecord | undefined>
  /** Exact surface-form lookup across the turn's scopes (trigger table, indexed IN lookup). */
  readonly findTriggers: (forms: readonly string[], scopes: readonly string[]) => Promise<readonly MemoryRecord[]>
  readonly addTrigger: (trigger: Trigger) => Promise<void>
  readonly removeTriggers: (memoryID: string) => Promise<void>
  readonly addSource: (source: MemorySource) => Promise<void>
  readonly findCached: (kind: MemorySource["kind"], ref: string, scope: string, limit: number) => Promise<readonly MemoryRecord[]>
  readonly listRecent: (scope: string, max: number) => Promise<ScopeListing>
  /**
   * Records sharing at least one query token, best-overlap first, capped by `limit` as a
   * safety valve. This is the candidate source for the lexical channel: it must come from the
   * token index, never from a recency window. Measured 2026-11 on a 421-entry corpus: a
   * recency-window candidate source scored 0.22 recall because the entries worth finding are
   * the oldest ones — the same failure the kv kernel's newest-100 cap had, only quieter.
   */
  readonly lexicalCandidates: (tokens: readonly string[], scope: string, limit: number) => Promise<readonly MemoryRecord[]>
  /** Active rows carrying a current-version embedding, most recently updated first. */
  readonly vectorCandidates: (scope: string, max: number, embedVersion: string) => Promise<readonly MemoryRecord[]>
  readonly browse: (filter: BrowseFilter) => Promise<ScopeListing>
}

export interface ScopeListing {
  readonly records: readonly MemoryRecord[]
  readonly total: number
  readonly truncated: boolean
}

export interface Embedder {
  readonly dimensions: number
  /** Identifies the model + prefix recipe. Changing it invalidates every stored vector, which
   *  is why it is stamped on the row rather than trusted from the adapter. */
  readonly version: string
  readonly embed: (text: string) => Promise<readonly number[]>
  /** The write path embeds in batches; a missing batch stays unscored rather than failing the save. */
  readonly embedAll: (texts: readonly string[]) => Promise<readonly (readonly number[])[]>
}

export type Channel = "trigger" | "vector" | "lexical"

/** One scored candidate. `score` is channel-local and only comparable inside a channel: a
 *  trigger hit is 1 by definition, a cosine is model-specific, an overlap is a fraction. */
export interface Hit {
  readonly record: MemoryRecord
  readonly score: number
  readonly channel: Channel
}

export type ChannelStatus = "ran" | "skipped" | "failed"

/** Why a retrieved candidate stayed out of this turn's block. `memory_log` attributes misses
 *  from these; only reasons the subsystem actually produces belong here. */
export type MissReason = "below_threshold" | "auto_inject_type" | "budget"

export interface TurnDecision {
  readonly mode: Settings["inject"]
  readonly scope: string
  readonly query: string
  readonly channels: { readonly trigger: ChannelStatus; readonly vector: ChannelStatus; readonly lexical: ChannelStatus }
  readonly triggerHits: readonly string[]
  readonly vectorHits: readonly string[]
  readonly lexicalHits: readonly string[]
  readonly injected: readonly string[]
  readonly skipped: ReadonlyArray<{ id: string; reason: MissReason }>
  /** Block characters this turn — the cost figure `memory_log` aggregates. */
  readonly injectedChars: number
}

export interface TurnResult {
  /** The request-tail section body; empty string means inject nothing this turn. */
  readonly injectBlock: string
  readonly entries: readonly MemoryRecord[]
  readonly decision: TurnDecision
}
