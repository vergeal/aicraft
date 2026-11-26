export * as MemoryExtraction from "./extraction.js"
import { MemoryLifecycle } from "./lifecycle.js"
import { MemoryTokens } from "./tokens.js"
import type { MemoryType } from "./types.js"

/**
 * The extraction job: a background model pass turns finished conversations into memory
 * candidates, and this module is everything mechanical about that path — the prompt tail, the
 * reply parser, the validation rules and the apply policy. The model only proposes; storage
 * decisions (dedup, merge, supersede) run through the subsystem's lifecycle like every other
 * save, so extraction cannot smuggle in a row that a tool save would have rejected.
 */

export type RejectReason = "shape" | "type" | "text" | "scope" | "supersedes" | "limit"

export interface ExtractionCandidate {
  /** Position in the reply's `memories` array, carried so apply-time rejections still name the
   *  item the model actually wrote (the audit log must align with the reply). */
  readonly index: number
  readonly type: MemoryType
  readonly text: string
  readonly tags: readonly string[]
  readonly triggers: readonly string[]
  readonly scope: "global" | "project"
  readonly supersedes?: string
}

export interface Rejected {
  readonly index: number
  readonly reason: RejectReason
}

export interface ParsedExtraction {
  readonly candidates: readonly ExtractionCandidate[]
  readonly rejected: readonly Rejected[]
  readonly malformed: boolean
}

export interface ExtractionOutcome {
  readonly saved: readonly string[]
  readonly merged: number
  readonly superseded: ReadonlyArray<{ id: string; byID: string }>
  readonly rejected: readonly Rejected[]
  readonly malformed: boolean
}

/** Kept in sync with the prompt below; the parser is the enforcement, the prompt is the request. */
const TYPES: readonly MemoryType[] = ["convention", "preference", "decision", "project_knowledge", "historical"]
const MAX_TEXT_CHARS = 1_000
const MAX_TRIGGER_CHARS = 100
const MAX_TRIGGERS = 4

/**
 * The instruction tail sent as one extra user message on an idle session. It is byte-identical
 * on every call, so the session's cached conversation prefix — which `session.generate` reuses —
 * is the only variable cost, and the marginal cost of an extraction is this tail plus the
 * JSON answer.
 */
export const EXTRACT_PROMPT = `Review the conversation above and extract only memories that will still matter in a future session.

Worth keeping: standing conventions and abbreviations ("pp means push the code"), durable user preferences, decisions that were actually made, project facts not derivable from the code, and historical outcomes with reference value.
Never keep: one-off instructions, task progress, secrets or credentials, anything derivable from the code or git history, and general knowledge the model already has.

Reply with a single JSON object and nothing else:
{"memories":[{"type":"convention|preference|decision|project_knowledge|historical","scope":"global|project","text":"one self-contained restatable sentence","tags":["short","tags"],"triggers":["exact surface form that must always pull this memory"],"supersedes":"mem_id_replaced"}]}

- scope "global" for personal habits that hold across projects, "project" otherwise.
- "triggers" only for exact vocabulary (abbreviations, private terms); omit it for everything else.
- "supersedes" only the id of an earlier memory that this new fact replaces, as shown in this conversation.
- Nothing worth keeping: {"memories":[]}.`

export interface ExtractionState {
  readonly turns: number
  readonly lastAtMs: number
}

/**
 * The per-session gate, decided before any model call: too few new user turns or a run inside
 * the cooldown means zero extraction cost. The attempt timestamp is consumed even when the run
 * then fails, which is what stops a broken provider from re-trying the model on every idle.
 */
export function extractionDue(
  state: ExtractionState,
  settings: { extract: "off" | "on"; extractMinUserTurns: number; extractCooldownMs: number },
  nowMs: number,
): boolean {
  if (settings.extract === "off") return false
  return state.turns >= settings.extractMinUserTurns && nowMs - state.lastAtMs >= settings.extractCooldownMs
}

/**
 * Pulls the JSON object out of a model reply that may wrap it in prose or fences. Deliberately
 * dumb: first `{` to last `}`, then one parse. A reply that survives that is either the contract
 * object or malformed — half-parsing prose with stray braces is the model's problem, and the
 * outcome lands in `memory_extract_log` as malformed for exactly that case.
 */
export function parseExtraction(reply: string, limit: number): ParsedExtraction {
  const span = jsonSpan(reply)
  if (span === undefined) return { candidates: [], rejected: [], malformed: true }
  const parsed = parseJson(span)
  if (parsed === undefined || !isRecord(parsed) || !Array.isArray(parsed.memories))
    return { candidates: [], rejected: [], malformed: true }

  const candidates: ExtractionCandidate[] = []
  const rejected: Rejected[] = []
  parsed.memories.forEach((item, index) => {
    const candidate = validateItem(item)
    if (typeof candidate === "string") {
      rejected.push({ index, reason: candidate })
      return
    }
    if (candidates.length >= limit) {
      rejected.push({ index, reason: "limit" })
      return
    }
    candidates.push({ ...candidate, index })
  })
  return { candidates, rejected, malformed: false }
}

export interface ApplyContext {
  readonly sessionID: string
  readonly projectID?: string
}

/** Narrow port surface so this stays testable without the subsystem facade; `Subsystem.extract` binds it. */
export interface ApplyPorts {
  readonly save: (input: {
    scope: "global" | "project"
    projectID?: string
    type: MemoryType
    text: string
    tags?: readonly string[]
    sessionID?: string
  }) => Promise<{ record: { id: string }; duplicate: boolean }>
  readonly addTrigger: (id: string, text: string) => Promise<boolean>
  readonly supersede: (id: string, byID: string) => Promise<boolean>
  readonly hasEntry: (id: string) => Promise<boolean>
}

/**
 * Writes validated candidates through the lifecycle. Triggers are attached on every accepted
 * candidate, duplicate or not: an existing entry seen with a NEW surface form (an abbreviation
 * the conversation just introduced) gains that trigger, which a plain dedup-skip would lose.
 * `supersedes` is applied only when the old id still resolves to a row.
 */
export async function applyExtractions(
  parsed: ParsedExtraction,
  ports: ApplyPorts,
  ctx: ApplyContext,
): Promise<ExtractionOutcome> {
  const saved: string[] = []
  const superseded: { id: string; byID: string }[] = []
  const rejected = [...parsed.rejected]
  let merged = 0

  for (const candidate of parsed.candidates) {
    if (candidate.scope === "project" && ctx.projectID === undefined) {
      rejected.push({ index: candidate.index, reason: "scope" })
      continue
    }
    const result = await ports.save({
      scope: candidate.scope,
      ...(candidate.scope === "project" ? { projectID: ctx.projectID } : {}),
      type: candidate.type,
      text: candidate.text,
      tags: candidate.tags,
      sessionID: ctx.sessionID,
    })
    if (result.duplicate) merged += 1
    else saved.push(result.record.id)
    for (const trigger of candidate.triggers) await ports.addTrigger(result.record.id, trigger)
    if (candidate.supersedes !== undefined && candidate.supersedes !== result.record.id) {
      if ((await ports.hasEntry(candidate.supersedes)) && (await ports.supersede(candidate.supersedes, result.record.id)))
        superseded.push({ id: candidate.supersedes, byID: result.record.id })
    }
  }
  return { saved, merged, superseded, rejected, malformed: parsed.malformed }
}

function jsonSpan(reply: string): string | undefined {
  const start = reply.indexOf("{")
  const end = reply.lastIndexOf("}")
  if (start < 0 || end <= start) return undefined
  return reply.slice(start, end + 1)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function validateItem(item: unknown): Omit<ExtractionCandidate, "index"> | RejectReason {
  if (!isRecord(item)) return "shape"
  if (!TYPES.includes(item.type as MemoryType)) return "type"
  if (typeof item.text !== "string") return "text"
  const text = item.text.trim()
  if (text.length === 0 || text.length > MAX_TEXT_CHARS) return "text"
  if (item.scope !== "global" && item.scope !== "project") return "scope"

  const tags = optionalArray(item.tags)
  if (typeof tags === "string") return tags
  const triggers = optionalArray(item.triggers)
  if (typeof triggers === "string") return triggers

  const supersedes = item.supersedes
  if (supersedes !== undefined && (typeof supersedes !== "string" || !supersedes.startsWith("mem_")))
    return "supersedes"

  return {
    type: item.type as MemoryType,
    text,
    tags: MemoryLifecycle.normalizeTags(tags as string[]),
    triggers: normalizeTriggers(triggers as string[]),
    scope: item.scope,
    ...(supersedes === undefined ? {} : { supersedes }),
  }
}

function optionalArray(value: unknown): readonly string[] | RejectReason {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) return "shape"
  return value as string[]
}

/** Same normalization the trigger write path uses, so parsed forms match `findTriggers` exactly. */
function normalizeTriggers(values: readonly string[]): string[] {
  const out: string[] = []
  for (const value of values) {
    const normalized = MemoryTokens.normalize(value.trim())
    if (normalized.length === 0 || normalized.length > MAX_TRIGGER_CHARS) continue
    if (!out.includes(normalized)) out.push(normalized)
    if (out.length === MAX_TRIGGERS) break
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
