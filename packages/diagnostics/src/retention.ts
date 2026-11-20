// Layered retention. The hot ring buffer covers the last minute in full; these layers keep a longer, thinner
// record that survives past it: ten minutes at a coarse sample, then an hour holding only the events that
// explain a failure. Both layers count what they drop instead of trimming silently, and both keep their own
// copies so reading them never competes with the dump's `events` budget.

import type { DiagnosticsEvent } from "./types"

export type RetentionLayer = {
  windowSeconds: number
  events: DiagnosticsEvent[]
  dropped: number
}

export type RetentionSection = {
  warm: RetentionLayer
  cold: RetentionLayer
}

export type Retention = {
  push(entry: DiagnosticsEvent): void
  section(): RetentionSection
  clear(): void
}

const WARM_WINDOW_MS = 10 * 60_000
const WARM_LIMIT = 3_000
const COLD_WINDOW_MS = 60 * 60_000
const COLD_LIMIT = 500

// Kept in full by both layers: the events that explain a failure after the fact.
const KEEP_TYPES = new Set(["error", "unhandledrejection", "network.error", "memory.suspect", "mark", "scroll.reset"])

const WARM_SAMPLE_MS: Record<string, number> = { perf: 10_000, dom: 5_000, "layout.rect": 5_000 }
const COLD_PERF_MS = 1_000
const LONG_TASK_MS = 200

type Layer = {
  windowMs: number
  limit: number
  events: DiagnosticsEvent[]
  dropped: number
  // Last kept instant per type, for the downsample rates.
  sampled: Map<string, number>
}

export function createRetention(): Retention {
  const warm = layer(WARM_WINDOW_MS, WARM_LIMIT)
  const cold = layer(COLD_WINDOW_MS, COLD_LIMIT)

  return {
    push(entry) {
      push(warm, entry, warmAccepts)
      push(cold, entry, coldAccepts)
    },
    section: () => ({ warm: read(warm), cold: read(cold) }),
    clear() {
      for (const target of [warm, cold]) {
        target.events.length = 0
        target.dropped = 0
        target.sampled.clear()
      }
    },
  }
}

function layer(windowMs: number, limit: number): Layer {
  return { windowMs, limit, events: [], dropped: 0, sampled: new Map() }
}

function push(target: Layer, entry: DiagnosticsEvent, accepts: (target: Layer, entry: DiagnosticsEvent) => boolean) {
  if (!accepts(target, entry)) {
    target.dropped++

    return
  }

  target.events.push(entry)

  const cutoff = entry.t - target.windowMs
  while (target.events.length > target.limit || (target.events[0]?.t ?? Number.POSITIVE_INFINITY) < cutoff) {
    target.events.shift()
    target.dropped++
  }
}

function warmAccepts(target: Layer, entry: DiagnosticsEvent): boolean {
  if (KEEP_TYPES.has(entry.type)) return true

  return withinRate(target, entry, WARM_SAMPLE_MS[entry.type])
}

function coldAccepts(target: Layer, entry: DiagnosticsEvent): boolean {
  if (entry.type === "longtask") return longTaskMs(entry) >= LONG_TASK_MS
  if (KEEP_TYPES.has(entry.type)) return true
  if (entry.type !== "perf") return false

  return withinRate(target, entry, COLD_PERF_MS)
}

/** One event per `rate` milliseconds; an unlisted type is only accepted when no rate is configured. */
function withinRate(target: Layer, entry: DiagnosticsEvent, rate: number | undefined): boolean {
  if (rate === undefined) return true

  const last = target.sampled.get(entry.type)
  if (last !== undefined && entry.t - last < rate) return false
  target.sampled.set(entry.type, entry.t)

  return true
}

function read(target: Layer): RetentionLayer {
  return {
    windowSeconds: target.windowMs / 1000,
    events: target.events.map((entry) => ({ ...entry })),
    dropped: target.dropped,
  }
}

function longTaskMs(entry: DiagnosticsEvent): number {
  if (typeof entry.data !== "object" || entry.data === null) return 0
  const ms = (entry.data as { ms?: unknown }).ms

  return typeof ms === "number" ? ms : 0
}
