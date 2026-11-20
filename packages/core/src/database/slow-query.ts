export * as SlowQuery from "./slow-query.js"

import { Context, Effect, Option, Tracer } from "effect"

/** Statements slower than this are worth a diagnostic; anything faster only adds noise. */
export const THRESHOLD_MS = 50

/** Only statements that finished inside this window stay readable. */
export const WINDOW_MS = 60_000

export const MAX_ENTRIES = 50

const MAX_SQL_LENGTH = 400

/**
 * One statement that crossed {@link THRESHOLD_MS}.
 *
 * Bound parameters are deliberately absent: they carry prompts, paths, and credentials, and a
 * diagnostics dump is meant to leave the machine without them.
 */
export interface Entry {
  readonly sql: string
  readonly durationMs: number
  /** Unix milliseconds the statement started. */
  readonly at: number
  readonly traceID?: string
  readonly spanID?: string
  /**
   * Span that was active when the statement ran. Drizzle builds statements lazily, so the stack at
   * execution time holds only runtime frames; the span is the call site a diagnostic can trust.
   */
  readonly span?: string
}

const buffer: Entry[] = []

/** Collapses whitespace and caps length so one wide `IN (...)` clause cannot dominate a dump. */
export function formatSql(sql: string): string {
  const collapsed = sql.replace(/\s+/g, " ").trim()
  return collapsed.length > MAX_SQL_LENGTH ? `${collapsed.slice(0, MAX_SQL_LENGTH)}…` : collapsed
}

/** Keeps the most recent `max` entries that are still inside the window, and counts the rest. */
export function trim(
  entries: readonly Entry[],
  now: number,
  windowMs = WINDOW_MS,
  max = MAX_ENTRIES,
): { entries: Entry[]; dropped: number } {
  const cutoff = now - windowMs
  const kept = entries.filter((entry) => entry.at + entry.durationMs >= cutoff).slice(-max)
  return { entries: kept, dropped: entries.length - kept.length }
}

export function record(entry: Entry): void {
  buffer.push(entry)
  const trimmed = trim(buffer, Date.now())
  buffer.length = 0
  buffer.push(...trimmed.entries)
}

export function snapshot(now = Date.now()): Entry[] {
  const trimmed = trim(buffer, now)
  buffer.length = 0
  buffer.push(...trimmed.entries)
  return buffer.slice()
}

/**
 * Times a statement and records it when it crosses {@link THRESHOLD_MS}. Wrapping is cheap and
 * lazy: nothing is read from the clock until the statement itself runs.
 */
export const measure = <A, E, R>(sql: string, statement: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.suspend(() => {
    const started = Date.now()
    return Effect.onExit(statement, () =>
      Effect.withFiber((fiber) => {
        const durationMs = Date.now() - started
        if (durationMs > THRESHOLD_MS)
          record({
            sql: formatSql(sql),
            durationMs,
            at: started,
            ...origin(Context.getOption(fiber.context, Tracer.ParentSpan)),
          })
        return Effect.void
      }),
    )
  })

function origin(span: Option.Option<Tracer.AnySpan>): Partial<Pick<Entry, "traceID" | "spanID" | "span">> {
  if (Option.isNone(span)) return {}
  const active = span.value
  return {
    traceID: active.traceId,
    spanID: active.spanId,
    ...(active._tag === "Span" ? { span: active.name } : {}),
  }
}
