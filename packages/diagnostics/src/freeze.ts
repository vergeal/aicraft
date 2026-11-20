// Automatic freezing of the current window. The hot ring buffer only keeps the last 60 seconds, so an event
// that happens while nothing else records would be gone before anyone could dump it. The freezer decides from
// the metrics stream and the event stream when the window is worth keeping, and keeps up to three windows.
//
// Freezing never touches the hot layer: it copies the events as they are and never writes a freeze record into
// them. The dump reads the frozen windows from the `freezes` section instead.

import type { DiagnosticsEvent, DiagnosticsMetrics } from "./types"

const FREEZE_LIMIT = 3
const WINDOW_MS = 60_000

const LOW_FPS = 30
const LOW_FPS_CYCLES = 2
const CLS_DELTA = 0.1
const ERROR_WINDOW_MS = 60_000
const ERROR_COUNT = 5
const LONG_TASK_MS = 200

const ERROR_TYPES = new Set(["error", "unhandledrejection", "network.error"])

export type FreezeReason = "fps" | "cls" | "errors" | "longtask" | "mark"

/** One kept window: the events around the moment plus the metrics that were published at or before it. */
export type Freeze = {
  reason: FreezeReason
  /** Milliseconds since the capture started, one decimal, the same base as `DiagnosticsEvent.t`. */
  at: number
  events: DiagnosticsEvent[]
  metrics: DiagnosticsMetrics
}

export type FreezeSection = {
  count: number
  dropped: number
  items: Freeze[]
}

/** The hot layer as it stands now. The collector supplies `at`, so this module never reads a clock. */
export type FreezeSnapshot = {
  at: number
  events: DiagnosticsEvent[]
  metrics: DiagnosticsMetrics
}

export type Freezer = {
  /** Feeds one recorded event into the error-rate and long-task thresholds. */
  note(entry: DiagnosticsEvent): void
  /** Feeds one published metrics sample into the fps and cls thresholds. */
  sample(metrics: DiagnosticsMetrics): void
  /** Keeps the current window under `reason`, whether a threshold fired or the caller marked the moment. */
  freeze(reason: FreezeReason): void
  section(): FreezeSection
  clear(): void
}

export function createFreezer(input: {
  captureFreeze: () => FreezeSnapshot
  /** Kept windows. Defaults to 3; the oldest is dropped beyond it. */
  limit?: number
  /** Events older than this relative to the freeze instant are left out. Defaults to 60 seconds. */
  windowMs?: number
}): Freezer {
  const limit = input.limit ?? FREEZE_LIMIT
  const windowMs = input.windowMs ?? WINDOW_MS
  const items: Freeze[] = []

  let dropped = 0
  let lowFps = 0
  let lastCls = 0
  // The most recent error-type instants, oldest first, trimmed to the rate window.
  let recentErrors: number[] = []

  const keep = (reason: FreezeReason) => {
    const snapshot = input.captureFreeze()
    const cutoff = snapshot.at - windowMs
    items.push({
      reason,
      at: snapshot.at,
      events: snapshot.events.filter((event) => event.t >= cutoff),
      metrics: { ...snapshot.metrics },
    })
    while (items.length > limit) {
      items.shift()
      dropped++
    }
  }

  return {
    note(entry) {
      if (ERROR_TYPES.has(entry.type)) {
        recentErrors = recentErrors.filter((at) => at >= entry.t - ERROR_WINDOW_MS)
        recentErrors.push(entry.t)
        if (recentErrors.length >= ERROR_COUNT) {
          recentErrors = []
          keep("errors")
        }
      }
      if (entry.type === "longtask" && longTaskMs(entry) >= LONG_TASK_MS) keep("longtask")
    },
    sample(metrics) {
      lowFps = metrics.fps > 0 && metrics.fps < LOW_FPS ? lowFps + 1 : 0
      if (lowFps >= LOW_FPS_CYCLES) {
        lowFps = 0
        keep("fps")
      }

      // Rounded to a thousandth: 0.15 - 0.05 is 0.09999999999999999 in binary floating point.
      if (Math.round((metrics.cls - lastCls) * 1_000) / 1_000 >= CLS_DELTA) keep("cls")
      lastCls = metrics.cls
    },
    freeze(reason) {
      keep(reason)
    },
    section() {
      return { count: items.length + dropped, dropped, items: items.map((item) => ({ ...item })) }
    },
    clear() {
      items.length = 0
      dropped = 0
      lowFps = 0
      lastCls = 0
      recentErrors = []
    },
  }
}

function longTaskMs(entry: DiagnosticsEvent): number {
  if (typeof entry.data !== "object" || entry.data === null) return 0
  const ms = (entry.data as { ms?: unknown }).ms

  return typeof ms === "number" ? ms : 0
}
