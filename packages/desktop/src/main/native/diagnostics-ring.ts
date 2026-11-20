// Pure bookkeeping for the main-process capture: a ring bounded by both age and size, and the filter
// that turns the run's own log files into the last minute of main-process activity. Nothing here
// touches Electron or the filesystem, so the behavior is unit-tested directly.
//
// Samples carry their own `at` (Unix milliseconds). The ring reads `Date.now()` when it trims, so a
// snapshot only ever reports samples still inside the window.

export type RingStats = {
  /** Candidates the owner saw, including the ones its filter rejected. */
  observed: number
  /** Samples handed to the buffer. */
  recorded: number
  /** Samples the buffer evicted to stay inside the window or the size limit. */
  dropped: number
}

export type RingSample = {
  /** Unix milliseconds when the sample was taken. */
  at: number
}

export type Ring<Sample extends RingSample> = {
  /** Records a candidate: it counts as observed and recorded. */
  push: (sample: Sample) => void
  /** Counts candidates the owner's filter rejected before they reached the buffer. */
  observe: (count?: number) => void
  /** Samples still inside the window, oldest first. */
  values: () => Sample[]
  stats: () => RingStats
  clear: () => void
}

export function createRing<Sample extends RingSample>(options: { windowMs: number; max: number }): Ring<Sample> {
  const samples: Sample[] = []
  const counts: RingStats = { observed: 0, recorded: 0, dropped: 0 }

  const trim = () => {
    const cutoff = Date.now() - options.windowMs

    while (samples.length > 0) {
      const oldest = samples[0]

      if (oldest === undefined) return

      if (samples.length <= options.max && oldest.at >= cutoff) return

      samples.shift()
      counts.dropped += 1
    }
  }

  return {
    push(sample) {
      counts.observed += 1
      counts.recorded += 1
      samples.push(sample)
      trim()
    },
    observe(count = 1) {
      counts.observed += count
    },
    values() {
      trim()

      return [...samples]
    },
    stats() {
      trim()

      return { ...counts }
    },
    clear() {
      samples.length = 0
      counts.observed = 0
      counts.recorded = 0
      counts.dropped = 0
    },
  }
}

// electron-log's default file format starts every entry with `[2026-11-20 10:00:00.123]` in local time.
const LOG_PREFIX = /^\[(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\.(\d{3})\]/

export type LogEntry = {
  /** Log file base name without `.log`, e.g. `main`. */
  source: string
  /** Unix milliseconds parsed from the entry's prefix. */
  at: number
  line: string
}

/** The instant a log line was written, or null for continuation lines and other formats. */
export function logTime(line: string): number | null {
  const match = LOG_PREFIX.exec(line)

  if (!match) return null

  const [, year, month, day, hour, minute, second, millisecond] = match

  if (year === undefined || month === undefined || day === undefined) return null

  if (hour === undefined || minute === undefined || second === undefined || millisecond === undefined) return null

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond),
  ).getTime()
}

/**
 * The last `max` entries written inside the window, oldest first. `truncated` reports that older
 * entries inside the window were cut to fit, so the caller can say it did not return everything.
 */
export function recentLogLines(entries: ReadonlyArray<LogEntry>, options: { windowMs: number; max: number }) {
  const cutoff = Date.now() - options.windowMs
  const inside = entries.filter((entry) => entry.at >= cutoff).sort((a, b) => a.at - b.at)
  const lines = inside.slice(-options.max)

  return { lines, truncated: inside.length > lines.length }
}
