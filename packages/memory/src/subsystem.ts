export * as MemorySubsystem from "./subsystem.js"
import { MemoryInject } from "./inject.js"
import { MemoryLifecycle } from "./lifecycle.js"
import { MemoryExtraction } from "./extraction.js"
import { MemoryQuery } from "./query.js"
import { resolveSettings } from "./settings.js"
import { MemoryTokens } from "./tokens.js"
import type {
  BrowseFilter,
  ChannelStatus,
  Embedder,
  Hit,
  MemoryRecord,
  MemoryType,
  Scope,
  ScopeListing,
  Settings,
  Store,
  TurnDecision,
  TurnResult,
} from "./types.js"
import { scopeKey } from "./types.js"

export interface SaveInput {
  readonly scope: Scope
  readonly projectID?: string
  readonly pluginID?: string
  readonly type: MemoryType
  readonly text: string
  readonly tags?: readonly string[]
  /** Surface form (e.g. an abbreviation) that must pull this entry into the turn verbatim. */
  readonly trigger?: string
  /** Provenance for the session index channel; `user` and `plugin` saves leave it unset. */
  readonly sessionID?: string
  readonly id?: string
}

export interface SaveResult {
  readonly record: MemoryRecord
  readonly duplicate: boolean
  /** `near` means an existing entry covers the same ground: the caller updates instead of
   *  inserting, and never gets a silent overwrite of text an earlier context already cited. */
  readonly duplicateMode?: "exact" | "near"
  readonly duplicateScore?: number
}

export interface SubsystemOptions {
  readonly store: Store
  readonly embedder?: Embedder
  readonly settings?: Partial<Settings>
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
  readonly channels: TurnDecision["channels"]
}

export interface UpdatePatch {
  readonly text?: string
  readonly tags?: readonly string[]
  readonly type?: MemoryType
}

export interface Subsystem {
  readonly settings: Settings
  /** Compute the turn's retrieval once; the caller reuses the block across every step. */
  readonly onTurn: (input: { query: string; scopes: readonly string[] }) => Promise<TurnResult>
  readonly save: (input: SaveInput) => Promise<SaveResult>
  readonly update: (id: string, patch: UpdatePatch) => Promise<MemoryRecord | undefined>
  readonly supersede: (id: string, byID: string) => Promise<boolean>
  readonly remove: (id: string) => Promise<boolean>
  readonly search: (input: SearchOptions) => Promise<SearchResult>
  readonly list: (scope: string, limit?: number) => Promise<ScopeListing>
  readonly browse: (filter: Omit<BrowseFilter, "limit" | "offset"> & { limit?: number; offset?: number }) => Promise<ScopeListing>
  readonly history: (id: string) => Promise<readonly MemoryRecord[]>
  readonly addTrigger: (id: string, text: string) => Promise<boolean>
  /** The session index channel: one-time list of what this session saved. Renders empty when
   *  the setting is off or the session stored nothing. */
  readonly sessionIndex: (input: { scope: string; sessionID: string }) => Promise<MemoryInject.RenderedBlock>
  /** ids whose stored vector came from another model or prefix recipe — the rebuild queue. */
  readonly staleVectorIds: (scopes: readonly string[]) => Promise<readonly string[]>
  /** Turn an extraction model's reply into stored entries: parse, validate, then the same
   *  lifecycle every save runs (dedup, triggers, supersede). The returned counts are what the
   *  `memory_extract_log` row keeps, so "why was nothing extracted" stays answerable. */
  readonly extract: (input: { reply: string; sessionID: string; projectID?: string }) => Promise<MemoryExtraction.ExtractionOutcome>
}

const NEAR_DUP_CANDIDATES = 20

/**
 * The facade binds policy (which channels may auto-inject, budgets, thresholds, lifecycle
 * rules) to the ports. Everything here is pure orchestration: no fs, no sql, no subprocess.
 */
export function createSubsystem(options: SubsystemOptions): Subsystem {
  const settings = resolveSettings(options.settings)
  const store = options.store
  const clock = options.clock ?? (() => new Date().toISOString())

  const onTurn = async (input: { query: string; scopes: readonly string[] }): Promise<TurnResult> => {
    if (settings.inject === "off" || input.query.trim() === "") {
      return { injectBlock: "", entries: [], decision: emptyLedger(input, settings.inject) }
    }
    const trigger = await MemoryQuery.triggerRank(store, input.query, input.scopes)
    const fuzzy = await fuzzyChannel(input.query, input.scopes)
    const split =
      fuzzy.status === "ran"
        ? MemoryQuery.applyThreshold(fuzzy.ranked, fuzzy.threshold, fuzzy.topK)
        : { hits: [] as Hit[], near: [] as Hit[] }
    const eligible = split.hits.filter((hit) => MemoryLifecycle.isInjectable(hit.record.type))
    // Every trigger hit is wanted; the fuzzy channel only adds its own top-k on top.
    const fused = MemoryQuery.fuse([trigger.ranked, eligible], trigger.ranked.length + fuzzy.topK)
    const rendered = MemoryInject.renderBlock(
      fused.map((hit) => hit.record),
      settings.maxInjectedChars,
    )
    const ids = (hits: readonly Hit[]) => hits.map((hit) => hit.record.id)
    return {
      injectBlock: rendered.block,
      entries: rendered.injected,
      decision: {
        mode: settings.inject,
        scope: input.scopes.join("+"),
        query: input.query,
        channels: { trigger: trigger.status, vector: fuzzy.vector, lexical: fuzzy.lexical },
        triggerHits: ids(trigger.ranked),
        vectorHits: fuzzy.channel === "vector" ? ids(eligible) : [],
        lexicalHits: fuzzy.channel === "lexical" ? ids(eligible) : [],
        injected: rendered.injected.map((record) => record.id),
        skipped: [
          ...split.near.map((hit) => ({ id: hit.record.id, reason: "below_threshold" as const })),
          ...split.hits
            .filter((hit) => !MemoryLifecycle.isInjectable(hit.record.type))
            .map((hit) => ({ id: hit.record.id, reason: "auto_inject_type" as const })),
          ...rendered.omitted.map((record) => ({ id: record.id, reason: "budget" as const })),
        ],
        injectedChars: rendered.block.length,
      },
    }
  }

  const save = async (input: SaveInput): Promise<SaveResult> => {
    const scope = scopeKey(input.scope, input.scope === "global" ? undefined : (input.projectID ?? input.pluginID))
    const draft = await buildRecord(input, input.id ?? newID(), 1, clock())
    const exact = await store.findByTextHash(draft.textHash, scope)
    if (exact !== undefined) return { record: exact, duplicate: true, duplicateMode: "exact", duplicateScore: 1 }
    // A failed dedup read proceeds as a plain insert: a rare duplicate row is fixable by
    // supersede later, a lost save is not.
    const candidates = await store.lexicalCandidates(draft.tokens, scope, NEAR_DUP_CANDIDATES).catch(() => [])
    const near = MemoryLifecycle.findDuplicate(candidates, draft.tokens, settings.nearDuplicateThreshold)
    // Duplicate saves keep the original id: a reference already handed to the model in
    // earlier context must never dangle.
    if (near !== undefined) return { record: near.record, duplicate: true, duplicateMode: "near", duplicateScore: near.score }
    await store.insert(draft)
    if (input.trigger !== undefined) await addTrigger(draft.id, input.trigger)
    if (input.sessionID !== undefined) await store.addSource({ memoryID: draft.id, kind: "session", ref: input.sessionID })
    return { record: draft, duplicate: false }
  }

  const update = async (id: string, patch: UpdatePatch) => {
    const previous = await store.get(id)
    if (previous === undefined) return undefined
    const text = patch.text === undefined ? previous.text : patch.text.trim()
    const tags = patch.tags === undefined ? previous.tags : MemoryLifecycle.normalizeTags(patch.tags)
    // Re-embedding follows a text change only; keeping the old vector when the text is
    // untouched avoids a subprocess round-trip for a tags-only edit.
    const vectors =
      patch.text === undefined || options.embedder === undefined
        ? { embedding: previous.embedding, embedVersion: previous.embedVersion }
        : await embed(options.embedder, text).then((embedding) => ({
            embedding,
            embedVersion: embedding === undefined ? undefined : options.embedder?.version,
          }))
    const next = MemoryLifecycle.nextRow(previous, { text, tags, type: patch.type ?? previous.type, ...vectors }, clock())
    await store.revise(next)
    return next
  }

  const browse = async (filter: Omit<BrowseFilter, "limit" | "offset"> & { limit?: number; offset?: number }) =>
    store.browse({
      scope: filter.scope,
      type: filter.type,
      status: filter.status,
      tag: filter.tag,
      limit: filter.limit ?? settings.browseLimit,
      offset: filter.offset ?? 0,
    })

  const search = async (input: SearchOptions): Promise<SearchResult> => {
    const trigger = await MemoryQuery.triggerRank(store, input.query, input.scopes)
    const vector =
      options.embedder === undefined
        ? { ranked: [], status: "skipped" as ChannelStatus }
        : await MemoryQuery.vectorRank(store, options.embedder, settings.vectorScanLimit, input.query, input.scopes)
    const lexical = await MemoryQuery.lexicalRank(store, settings.lexicalScanLimit, input.query, input.scopes)
    const channels = { trigger: trigger.status, vector: vector.status, lexical: lexical.status }
    const vectorHits = MemoryQuery.applyThreshold(vector.ranked, settings.vectorThreshold, settings.vectorTopK * 3).hits
    const lexicalHits = MemoryQuery.applyThreshold(lexical.ranked, settings.lexicalThreshold, settings.lexicalTopK * 3).hits
    // Interleaved, not concatenated: with a small `limit` (the tool default is 5) a vector
    // channel that merely passed its own threshold would otherwise starve the lexical one out
    // of every slot. Search is the deep-dive path — it shows each channel's best.
    const listings = await Promise.all(input.scopes.map((scope) => store.listRecent(scope, settings.maxEntries)))
    return {
      records: MemoryQuery.fuse([trigger.ranked, weave(vectorHits, lexicalHits)], input.limit ?? 20).map((hit) => hit.record),
      total: listings.reduce((sum, listing) => sum + listing.total, 0),
      truncated: listings.some((listing) => listing.truncated),
      channels,
    }
  }

  const sessionIndex = async (input: { scope: string; sessionID: string }) => {
    if (settings.sessionIndex === "off") return { block: "", injected: [], omitted: [] }
    const records = await store.findCached("session", input.sessionID, input.scope, settings.maxEntries)
    return MemoryInject.renderSessionIndex(records, settings.maxInjectedChars)
  }

  const staleVectorIds = async (scopes: readonly string[]) => {
    if (options.embedder === undefined) return []
    const records = (await Promise.all(scopes.map((scope) => store.listRecent(scope, settings.vectorScanLimit)))).flatMap(
      (listing) => listing.records,
    )
    return MemoryLifecycle.staleEmbeddings(records, options.embedder.version)
  }

  const extract = async (input: { reply: string; sessionID: string; projectID?: string }) =>
    MemoryExtraction.applyExtractions(
      MemoryExtraction.parseExtraction(input.reply, settings.extractMaxCandidates),
      { save, addTrigger, supersede, hasEntry: async (id) => (await store.get(id)) !== undefined },
      { sessionID: input.sessionID, ...(input.projectID === undefined ? {} : { projectID: input.projectID }) },
    )

  return {
    settings,
    onTurn,
    save,
    update,
    supersede,
    remove,
    search,
    list: (scope, limit) => store.listRecent(scope, limit ?? settings.maxEntries),
    browse,
    history: (id) => store.history(id),
    addTrigger,
    sessionIndex,
    staleVectorIds,
    extract,
  }

  async function supersede(id: string, byID: string) {
    if (id === byID) return false
    const target = await store.get(id)
    const replacement = await store.get(byID)
    if (target === undefined || replacement === undefined) return false
    await store.removeTriggers(id)
    return store.supersede(id, byID)
  }

  async function remove(id: string) {
    if ((await store.get(id)) === undefined) return false
    await store.remove(id)
    await store.removeTriggers(id)
    return true
  }

  async function addTrigger(id: string, text: string) {
    const record = await store.get(id)
    if (record === undefined) return false
    await store.addTrigger({ memoryID: id, text: MemoryTokens.normalize(text) })
    return true
  }

  async function buildRecord(input: SaveInput, id: string, version: number, createdAt: string): Promise<MemoryRecord> {
    const text = input.text.trim()
    const embedding = options.embedder === undefined ? undefined : await embed(options.embedder, text)
    return {
      id,
      scope: input.scope,
      projectID: input.projectID,
      pluginID: input.pluginID,
      type: input.type,
      status: "active",
      version,
      text,
      tags: MemoryLifecycle.normalizeTags(input.tags),
      textHash: MemoryLifecycle.hashText(MemoryTokens.normalize(text)),
      tokens: MemoryTokens.tokenize(text),
      embedding,
      embedVersion: embedding === undefined ? undefined : options.embedder?.version,
      createdAt,
      updatedAt: clock(),
    }
  }

  /**
   * The fuzzy half of the turn. Vectors when an embedder is configured; the lexical index when
   * there is none AND as the fallback when embedding broke — a missing binary must not cost the
   * turn its retrieval. `trigger` mode turns the fuzzy half off entirely: nothing but an exact
   * surface form reaches the request then.
   */
  async function fuzzyChannel(query: string, scopes: readonly string[]): Promise<Fuzzy> {
    if (settings.inject === "trigger")
      return { ranked: [], status: "skipped", channel: "lexical", threshold: 0, topK: 0, vector: "skipped", lexical: "skipped" }
    if (options.embedder === undefined) return lexicalFuzzy(query, scopes, "skipped")
    const vector = await MemoryQuery.vectorRank(store, options.embedder, settings.vectorScanLimit, query, scopes)
    if (vector.status === "ran")
      return {
        ranked: vector.ranked,
        status: "ran",
        channel: "vector",
        threshold: settings.vectorThreshold,
        topK: settings.vectorTopK,
        vector: "ran",
        lexical: "skipped",
      }
    return lexicalFuzzy(query, scopes, vector.status)
  }

  async function lexicalFuzzy(query: string, scopes: readonly string[], vector: ChannelStatus): Promise<Fuzzy> {
    const lexical = await MemoryQuery.lexicalRank(store, settings.lexicalScanLimit, query, scopes)
    return {
      ranked: lexical.ranked,
      status: lexical.status,
      channel: "lexical",
      threshold: settings.lexicalThreshold,
      topK: settings.lexicalTopK,
      vector,
      lexical: lexical.status,
    }
  }
}

interface Fuzzy {
  readonly ranked: readonly Hit[]
  readonly status: ChannelStatus
  readonly channel: "vector" | "lexical"
  readonly threshold: number
  readonly topK: number
  readonly vector: ChannelStatus
  readonly lexical: ChannelStatus
}

/** Alternates two ranked lists, preserving each list's internal order. */
function weave(a: readonly Hit[], b: readonly Hit[]): Hit[] {
  const out: Hit[] = []
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (a[index] !== undefined) out.push(a[index])
    if (b[index] !== undefined) out.push(b[index])
  }
  return out
}

function emptyLedger(input: { query: string; scopes: readonly string[] }, mode: Settings["inject"]): TurnDecision {
  return {
    mode,
    scope: input.scopes.join("+"),
    query: input.query,
    channels: { trigger: "skipped", vector: "skipped", lexical: "skipped" },
    triggerHits: [],
    vectorHits: [],
    lexicalHits: [],
    injected: [],
    skipped: [],
    injectedChars: 0,
  }
}

function newID(): string {
  return `mem_${crypto.randomUUID()}`
}

/** Embedding is best effort at the write boundary: a missing binary must not fail a save, and
 *  the row simply carries no vector until the rebuild queue picks it up. */
async function embed(embedder: Embedder, text: string): Promise<readonly number[] | undefined> {
  const [vector] = await embedder.embedAll([text]).catch(() => [])
  return vector
}
