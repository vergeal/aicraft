// The bounded capture window: events ordered by relative time, trimmed by age and size, with per-source
// accounting. It is DOM-free on purpose so the trimming rules and the source funnel can be tested without
// a renderer; the collector owns the instance and only forwards to it.

import type { DiagnosticsEvent, DiagnosticsSourceStats } from "./types"

/** An event plus the recorder that produced it. `source` is bookkeeping and never leaves the dump. */
export type CaptureEntry = DiagnosticsEvent & { source: string }

export type Capture = {
  push(entry: CaptureEntry): void
  observe(source: string, count?: number): void
  count(): number
  dropped(): number
  events(): DiagnosticsEvent[]
  sources(): DiagnosticsSourceStats[]
  clear(): void
}

export function createCapture(input: { windowMs: number; maxEvents: number; sources: readonly string[] }): Capture {
  const stats = new Map<string, DiagnosticsSourceStats>(
    input.sources.map((name) => [name, { name, observed: 0, recorded: 0, dropped: 0 }]),
  )

  let entries: CaptureEntry[] = []
  let dropped = 0

  // A recorder that forgets to register still gets an honest row instead of vanishing from the dump.
  const statsOf = (name: string) => {
    const existing = stats.get(name)
    if (existing) return existing

    const created = { name, observed: 0, recorded: 0, dropped: 0 }
    stats.set(name, created)

    return created
  }

  return {
    push(entry) {
      entries.push(entry)
      statsOf(entry.source).recorded++

      const cutoff = entry.t - input.windowMs
      while (entries.length > 0 && (entries[0].t < cutoff || entries.length > input.maxEvents)) {
        const evicted = entries.shift()
        if (!evicted) break
        statsOf(evicted.source).dropped++
        dropped++
      }
    },
    observe(source, count = 1) {
      statsOf(source).observed += count
    },
    count: () => entries.length,
    dropped: () => dropped,
    events: () => entries.map((entry) => ({ t: entry.t, wall: entry.wall, type: entry.type, data: entry.data })),
    sources: () => Array.from(stats.values()).map((stat) => ({ ...stat })),
    clear() {
      entries = []
      dropped = 0
      for (const stat of stats.values()) {
        stat.observed = 0
        stat.recorded = 0
        stat.dropped = 0
      }
    },
  }
}
