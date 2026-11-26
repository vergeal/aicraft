export * as MemoryExtract from "./extract.js"

import { EXTRACT_PROMPT, extractionDue, type Settings, type Subsystem } from "@aicraft/memory"
import { Effect } from "effect"

/**
 * The core side of the extraction job: turn accounting, the run gate, the model call and the
 * audit row. All retrieval-and-write policy lives in `@aicraft/memory` (`Subsystem.extract`,
 * `extractionDue`); this module only owns the IO that the subsystem must not see.
 */

export interface ExtractLogRecord {
  readonly sessionID: string
  /** The same composed scope key the turn ledger writes, e.g. `project:p+global`. */
  readonly scope: string
  readonly outcome: "applied" | "malformed" | "failed"
  readonly replyChars: number
  readonly saved: readonly string[]
  readonly merged: number
  readonly superseded: ReadonlyArray<{ id: string; byID: string }>
  readonly rejected: ReadonlyArray<{ index: number; reason: string }>
  readonly durationMs: number
}

export interface ExtractionJobDeps {
  /** The background one-shot model call — `session.generate` in production, scripted in tests. */
  readonly generate: (sessionID: string, prompt: string) => Effect.Effect<string, unknown>
  readonly subsystem: Subsystem
  readonly settings: Settings
  readonly log: (row: ExtractLogRecord) => Effect.Effect<void>
  readonly now?: () => number
}

interface SessionState {
  lastKey: string | undefined
  turns: number
  lastAtMs: number
}

export function createExtractionJob(deps: ExtractionJobDeps) {
  const nowMs = deps.now ?? Date.now
  const states = new Map<string, SessionState>()

  const stateFor = (sessionID: string) => {
    let state = states.get(sessionID)
    if (state === undefined) {
      if (states.size > 200) states.clear()
      state = { lastKey: undefined, turns: 0, lastAtMs: 0 }
      states.set(sessionID, state)
    }
    return state
  }

  /** Counts logical turns, not steps: the caller passes one key per new user message. */
  const noteTurn = (sessionID: string, turnKey: string) =>
    Effect.sync(() => {
      const state = stateFor(sessionID)
      if (state.lastKey === turnKey) return
      state.lastKey = turnKey
      state.turns += 1
    })

  const onIdle = (input: { sessionID: string; projectID: string | null }) =>
    Effect.gen(function* () {
      if (deps.settings.extract === "off") return
      const state = stateFor(input.sessionID)
      const startedAt = nowMs()
      if (!extractionDue(state, deps.settings, startedAt)) return
      // The cooldown is consumed up front: a run that then fails must not re-try the model on
      // every idle event while a provider is down.
      state.lastAtMs = startedAt
      state.turns = 0
      const scope = input.projectID === null ? "global" : `project:${input.projectID}+global`
      const row = yield* deps
        .generate(input.sessionID, EXTRACT_PROMPT)
        .pipe(
          Effect.flatMap((reply) =>
            Effect.promise(() =>
              deps.subsystem.extract({
                reply,
                sessionID: input.sessionID,
                ...(input.projectID === null ? {} : { projectID: input.projectID }),
              }),
            ).pipe(
              Effect.map((outcome) => ({
                sessionID: input.sessionID,
                scope,
                outcome: outcome.malformed ? ("malformed" as const) : ("applied" as const),
                replyChars: reply.length,
                saved: [...outcome.saved],
                merged: outcome.merged,
                superseded: outcome.superseded.map((entry) => ({ id: entry.id, byID: entry.byID })),
                rejected: outcome.rejected.map((entry) => ({ index: entry.index, reason: entry.reason })),
                durationMs: nowMs() - startedAt,
              })),
            ),
          ),
          Effect.catch(() =>
            Effect.succeed<ExtractLogRecord>({
              sessionID: input.sessionID,
              scope,
              outcome: "failed",
              replyChars: 0,
              saved: [],
              merged: 0,
              superseded: [],
              rejected: [],
              durationMs: nowMs() - startedAt,
            }),
          ),
        )
      yield* deps.log(row)
    })

  return { noteTurn, onIdle }
}
