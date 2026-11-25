export * as MemoryEvaluate from "./evaluate.js"
import { MemoryLifecycle } from "./lifecycle.js"
import type { ChannelStatus, MemoryRecord, TurnDecision } from "./types.js"
import type { Subsystem } from "./subsystem.js"

export interface GoldenCase {
  readonly query: string
  /** The id a correct turn must inject (or, with `autoInjectForbidden`, a correct search must
   *  find). Ids are explicit so a failing number names the entry. */
  readonly expect: string
  readonly via?: "trigger" | "vector" | "lexical"
  /** The entry must stay out of the injection block by type policy while remaining reachable
   *  through search. */
  readonly autoInjectForbidden?: boolean
}

export interface EvaluationOptions {
  readonly cases: readonly GoldenCase[]
  /** Queries that share no token with anything in the corpus: every entry injected for one is
   *  a false injection, the cost the no-default-injection design exists to avoid. */
  readonly negatives: readonly string[]
  readonly searchK?: number
  /** Identical queries issued this many times; more than one enables the stability metric. */
  readonly repeats?: number
}

export type Attribution = "hit" | "below_threshold" | "auto_inject_type" | "budget" | "never_sought"

export interface CaseResult {
  readonly query: string
  readonly expect: string
  readonly hit: boolean
  readonly attribution: Attribution
  readonly injected: readonly string[]
  readonly chars: number
}

export interface Metrics {
  readonly corpusSize: number
  readonly searchK: number
  /** Fraction of auto-injectable cases whose entry reached the block. */
  readonly injectRecall: number
  /** Of everything injected across the gold queries, the share that was asked for. */
  readonly injectPrecision: number
  readonly searchRecallAtK: number
  /** Entries injected for a query that wanted nothing: hard zero in practice. */
  readonly falseInjection: number
  /** Retrieval-only types that reached the block: hard zero by policy. */
  readonly partitionViolations: number
  readonly meanInjectedChars: number
  readonly maxInjectedChars: number
  /** Repeated identical queries that produced identical bytes. Anything below 1.0 means the
   *  renderer is unstable and every step re-copies a broken cache prefix. */
  readonly byteStability: number
  readonly attribution: Readonly<Partial<Record<Attribution, number>>>
  readonly channelStatus: Record<keyof TurnDecision["channels"], ChannelStatus>
  readonly injectCases: readonly CaseResult[]
  readonly searchCases: readonly CaseResult[]
}

/**
 * The in-process acceptance harness: corpus in, numbers out — no server, no database, no
 * model. It lives in the package rather than the test file so a host, or the Batch 1 spike
 * against a real embedder, can run the same measurement and report comparable numbers.
 * Recall is defined against the gold ids it is given: rewriting the gold set is not an
 * improvement, it is a different question.
 */
export async function evaluate(subsystem: Subsystem, scopes: readonly string[], options: EvaluationOptions): Promise<Metrics> {
  const searchK = options.searchK ?? 5
  const repeats = options.repeats ?? 2
  const injectable = options.cases.filter((item) => item.autoInjectForbidden !== true)
  const injectCases: CaseResult[] = []
  const status: Record<keyof TurnDecision["channels"], ChannelStatus> = { trigger: "skipped", vector: "skipped", lexical: "skipped" }
  let injected = 0
  let wanted = 0
  let violations = 0
  let stable = 0
  let injectBytes = 0

  for (const item of injectable) {
    const turns = []
    for (let repeat = 0; repeat < Math.max(repeats, 1); repeat++)
      turns.push(await subsystem.onTurn({ query: item.query, scopes }))
    const turn = turns[0]
    const ids = turn.entries.map((record) => record.id)
    const hit = ids.includes(item.expect)
    for (const id of ids) if (await isRetrievalOnly(subsystem, id)) violations += 1
    injectCases.push({
      query: item.query,
      expect: item.expect,
      hit,
      attribution: attribute(turn.decision, item, hit),
      injected: ids,
      chars: turn.decision.injectedChars,
    })
    injected += ids.length
    injectBytes += turn.decision.injectedChars
    wanted += hit ? 1 : 0
    promote(status, turn.decision.channels)
    if (repeats > 1 && turns.every((other) => other.injectBlock === turn.injectBlock)) stable += 1
  }

  const searchCases: CaseResult[] = []
  for (const item of options.cases) {
    const result = await subsystem.search({ query: item.query, scopes, limit: searchK })
    const ids = result.records.map((record) => record.id)
    const hit = ids.includes(item.expect)
    searchCases.push({ query: item.query, expect: item.expect, hit, attribution: hit ? "hit" : "never_sought", injected: ids, chars: 0 })
    // Not promoted into `channelStatus`: that field reports the turn pipeline, and `search`
    // deliberately runs every channel regardless of the injection mode.
  }

  let falseInjection = 0
  for (const query of options.negatives) {
    const turn = await subsystem.onTurn({ query, scopes })
    falseInjection += turn.entries.length
    for (const id of turn.entries.map((record) => record.id)) if (await isRetrievalOnly(subsystem, id)) violations += 1
    promote(status, turn.decision.channels)
  }

  const listing = await Promise.all(scopes.map((scope) => subsystem.list(scope, 10_000)))
  const sized = injectCases.filter((item) => item.chars > 0)
  return {
    corpusSize: listing.reduce((sum, page) => sum + page.total, 0),
    searchK,
    injectRecall: ratio(injectable.length, injectCases.filter((item) => item.hit).length),
    injectPrecision: ratio(injected, wanted),
    searchRecallAtK: ratio(options.cases.length, searchCases.filter((item) => item.hit).length),
    falseInjection,
    partitionViolations: violations,
    meanInjectedChars: sized.length === 0 ? 0 : Math.round(injectBytes / sized.length),
    maxInjectedChars: injectCases.reduce((max, item) => Math.max(max, item.chars), 0),
    byteStability: ratio(injectable.length, stable),
    attribution: tally([...injectCases, ...searchCases]),
    channelStatus: status,
    injectCases,
    searchCases,
  }
}

function attribute(decision: TurnDecision, item: GoldenCase, hit: boolean): Attribution {
  if (hit) return "hit"
  const skipped = decision.skipped.find((entry) => entry.id === item.expect)
  return skipped === undefined ? "never_sought" : skipped.reason
}

/** The active row for an id, through the version history, so a superseded version never
 *  decides the partition for a live entry. */
async function isRetrievalOnly(subsystem: Subsystem, id: string): Promise<boolean> {
  const record = await activeRow(subsystem, id)
  return record !== undefined && !MemoryLifecycle.isInjectable(record.type)
}

async function activeRow(subsystem: Subsystem, id: string): Promise<MemoryRecord | undefined> {
  const history = await subsystem.history(id)
  return history.findLast((record) => record.status === "active")
}

function promote(into: Record<string, ChannelStatus>, from: Record<string, ChannelStatus>) {
  for (const channel of ["trigger", "vector", "lexical"] as const) {
    if (from[channel] === "ran") into[channel] = "ran"
    else if (from[channel] === "failed" && into[channel] !== "ran") into[channel] = "failed"
  }
}

function tally(cases: readonly CaseResult[]): Partial<Record<Attribution, number>> {
  const counts: Partial<Record<Attribution, number>> = {}
  for (const item of cases) counts[item.attribution] = (counts[item.attribution] ?? 0) + 1
  return counts
}

function ratio(denominator: number, numerator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}
