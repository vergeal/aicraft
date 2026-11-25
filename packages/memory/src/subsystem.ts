export * as MemorySubsystem from "./subsystem.js"
import { MemoryInject } from "./inject.js"
import { MemoryQuery } from "./query.js"
import { MemoryTokens } from "./tokens.js"
import type {
  Embedder,
  MemoryRecord,
  MemoryType,
  ScopeListing,
  Settings,
  Store,
  TurnDecision,
  TurnResult,
} from "./types.js"
import { DEFAULT_SETTINGS, scopeKey } from "./types.js"

export interface SaveInput {
  readonly scope: "global" | "project" | "plugin"
  readonly projectID?: string
  readonly pluginID?: string
  readonly type: MemoryType
  readonly text: string
  readonly tags?: readonly string[]
  /** Surface form (e.g. an abbreviation) that must pull this entry into the turn verbatim. */
  readonly trigger?: string
  readonly id?: string
}

export interface SaveResult {
  readonly record: MemoryRecord
  readonly duplicate: boolean
}

export interface SubsystemOptions {
  readonly store: Store
  readonly embedder?: Embedder
  readonly settings?: Settings
  readonly clock?: () => string
}

export interface SearchOptions {
  readonly query: string
  readonly scopes: readonly string[]
  readonly limit?: number
}

export interface SearchResult {
  readonly records: readonly MemoryRecord[]
  readonly total: number
  readonly truncated: boolean
}

export interface Subsystem {
  /** Compute the turn's retrieval once; the caller reuses the block across every step. */
  readonly onTurn: (input: { query: string; scopes: readonly string[] }) => Promise<TurnResult>
  readonly save: (input: SaveInput) => Promise<SaveResult>
  readonly update: (
    id: string,
    patch: { text?: string; tags?: readonly string[]; type?: MemoryType },
  ) => Promise<MemoryRecord | undefined>
  readonly remove: (id: string) => Promise<boolean>
  readonly search: (input: SearchOptions) => Promise<SearchResult>
  readonly list: (scope: string, limit?: number) => Promise<ScopeListing>
  readonly addTrigger: (id: string, text: string) => Promise<boolean>
}

/** Types the turn pipeline may put into the block on its own; everything else is reachable
 *  through `search` only, which is what keeps injection at zero by default. */
const INJECTABLE: readonly MemoryType[] = ["convention", "preference"]

/**
 * The facade binds policy (which channels may auto-inject, budgets, thresholds) to the
 * ports. Everything here is pure orchestration: no fs, no sql, no subprocess.
 */
export function createSubsystem(options: SubsystemOptions): Subsystem {
  const settings = options.settings ?? DEFAULT_SETTINGS
  const store = options.store
  const clock = options.clock ?? (() => new Date().toISOString())
  const injectable = new Set<MemoryType>(INJECTABLE)

  /** Trigger-exact plus one fuzzy channel: vectors when an embedder is available, lexical
   *  overlap when it is not. `trigger` mode turns the fuzzy channel off entirely. */
  const dynamic = (query: string, scopes: readonly string[]) => {
    if (settings.inject === "trigger") return Promise.resolve({ ranked: [] as MemoryQuery.Hit[], threshold: 0, topK: 0 })
    if (options.embedder !== undefined) {
      return MemoryQuery.vectorRank(store, options.embedder, settings.vectorScanLimit, query, scopes).then((ranked) => ({
        ranked,
        threshold: settings.vectorThreshold,
        topK: settings.vectorTopK,
      }))
    }
    return MemoryQuery.lexicalRank(store, settings.lexicalScanLimit, query, scopes).then((ranked) => ({
      ranked,
      threshold: settings.lexicalThreshold,
      topK: settings.lexicalTopK,
    }))
  }

  const onTurn = async (input: { query: string; scopes: readonly string[] }): Promise<TurnResult> => {
    const mode = settings.inject
    if (mode === "off" || input.query.trim() === "") {
      return { injectBlock: "", entries: [], decision: emptyDecision(input, mode) }
    }
    const triggers = await MemoryQuery.triggerHits(store, input.query, input.scopes)
    const scored = await dynamic(input.query, input.scopes)
    const split = MemoryQuery.applyThreshold(scored.ranked, scored.threshold, scored.topK)
    const eligible = split.hits.filter((hit) => injectable.has(hit.record.type))
    const skipped = [
      ...split.near.map((hit) => ({ id: hit.record.id, reason: "below_threshold" as const })),
      ...split.hits.filter((hit) => !injectable.has(hit.record.type)).map((hit) => ({ id: hit.record.id, reason: "auto_inject_type" as const })),
    ]
    // Every trigger hit is wanted; the fuzzy channel only adds its own top-k on top.
    const fused = MemoryQuery.fuse([triggers, eligible], triggers.length + scored.topK)
    const rendered = MemoryInject.renderBlock(
      fused.map((hit) => hit.record),
      settings.maxInjectedChars,
    )
    return {
      injectBlock: rendered.block,
      entries: rendered.injected,
      decision: {
        mode,
        scope: input.scopes.join("+"),
        query: input.query,
        triggerHits: triggers.map((hit) => hit.record.id),
        vectorHits: mode === "trigger+vector" ? eligible.map((hit) => hit.record.id) : [],
        lexicalHits: mode === "trigger" ? [] : eligible.map((hit) => hit.record.id),
        injected: rendered.injected.map((record) => record.id),
        skipped: [
          ...skipped,
          ...rendered.omitted.map((record) => ({ id: record.id, reason: "budget" as const })),
        ],
      },
    }
  }

  const search = async (input: SearchOptions): Promise<SearchResult> => {
    const channels = await Promise.all([
      MemoryQuery.triggerHits(store, input.query, input.scopes),
      options.embedder !== undefined
        ? MemoryQuery.vectorRank(store, options.embedder, settings.vectorScanLimit, input.query, input.scopes).then(
            (ranked) => MemoryQuery.applyThreshold(ranked, settings.vectorThreshold, settings.vectorTopK * 3).hits,
          )
        : Promise.resolve([] as MemoryQuery.Hit[]),
      MemoryQuery.lexicalRank(store, settings.lexicalScanLimit, input.query, input.scopes).then(
        (ranked) => MemoryQuery.applyThreshold(ranked, settings.lexicalThreshold, settings.lexicalTopK * 3).hits,
      ),
    ])
    const listings = await Promise.all(input.scopes.map((scope) => store.listRecent(scope, settings.maxEntries)))
    const limit = input.limit ?? 20
    return {
      records: MemoryQuery.fuse(channels, limit).map((hit) => hit.record),
      total: listings.reduce((sum, listing) => sum + listing.total, 0),
      truncated: listings.some((listing) => listing.truncated),
    }
  }

  const save = async (input: SaveInput): Promise<SaveResult> => {
    const key = scopeKey(input.scope, input.scope === "global" ? undefined : (input.projectID ?? input.pluginID))
    const draft = await buildRecord(input, input.id ?? newID(), 1, clock())
    const existing = await store.findByTextHash(draft.textHash, key)
    // Duplicate saves keep the original id: a reference already handed to the model in
    // earlier context must never dangle.
    if (existing !== undefined) return { record: existing, duplicate: true }
    await store.insert(draft)
    if (input.trigger !== undefined) await addTrigger(draft.id, input.trigger)
    return { record: draft, duplicate: false }
  }

  const update = async (id: string, patch: { text?: string; tags?: readonly string[]; type?: MemoryType }) => {
    const current = await store.get(id)
    if (current === undefined) return undefined
    const next = await buildRecord(
      {
        scope: current.scope,
        projectID: current.projectID,
        pluginID: current.pluginID,
        type: patch.type ?? current.type,
        text: patch.text ?? current.text,
        tags: patch.tags ?? current.tags,
      },
      id,
      current.version + 1,
      current.createdAt,
    )
    await store.update(next)
    return next
  }

  const remove = async (id: string) => {
    if ((await store.get(id)) === undefined) return false
    await store.remove(id)
    await store.removeTriggers(id)
    return true
  }

  const addTrigger = async (id: string, text: string) => {
    const record = await store.get(id)
    if (record === undefined) return false
    await store.addTrigger({ memoryID: id, text: MemoryTokens.normalize(text), match: "exact" })
    return true
  }

  return { onTurn, save, update, remove, search, addTrigger, list: (scope, limit) => store.listRecent(scope, limit ?? settings.maxEntries) }

  async function buildRecord(
    input: SaveInput,
    id: string,
    version: number,
    createdAt: string,
  ): Promise<MemoryRecord> {
    const embedding = options.embedder === undefined ? undefined : await options.embedder.embed(input.text.trim()).catch(() => [])
    return {
      id,
      scope: input.scope,
      projectID: input.projectID,
      pluginID: input.pluginID,
      type: input.type,
      status: "active",
      version,
      text: input.text.trim(),
      tags: normalizeTags(input.tags),
      textHash: hashText(MemoryTokens.normalize(input.text)),
      tokens: MemoryTokens.tokenize(input.text),
      embedding: embedding === undefined ? undefined : [...embedding],
      createdAt,
      updatedAt: clock(),
    }
  }
}

function emptyDecision(input: { query: string; scopes: readonly string[] }, mode: Settings["inject"]): TurnDecision {
  return {
    mode,
    scope: input.scopes.join("+"),
    query: input.query,
    triggerHits: [],
    vectorHits: [],
    lexicalHits: [],
    injected: [],
    skipped: [],
  }
}

function normalizeTags(input: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (input ?? [])
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
        .map((tag) => tag.slice(0, 30)),
    ),
  ].slice(0, 8)
}

function newID(): string {
  return `mem_${crypto.randomUUID()}`
}

/** FNV-1a over normalized text — exact-duplicate detection without rescanning the scope. */
function hashText(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}
