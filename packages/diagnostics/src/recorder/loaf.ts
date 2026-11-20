// Long Animation Frame attribution. The standard entry already carries the frame's script list, the start of
// style/layout and the start of rendering, so the phases below are read from those timestamps instead of being
// inferred from frame counting. Everything here is DOM-free: the observer glue is the only DOM dependency.

import { round, truncate } from "./format"
import { observe } from "./observer"

export const LOAF_TYPE = "long-animation-frame"
export const SCRIPT_LIMIT = 5
export const INVOKER_LIMIT = 6
const SOURCE_URL_LIMIT = 160
const SOURCE_NAME_LIMIT = 80

type ScriptEntry = {
  duration?: number
  invoker?: string
  sourceURL?: string
  sourceFunctionName?: string
  sourceCharPosition?: number
}

/** A `long-animation-frame` entry. Chromium ships these fields but the DOM lib does not declare them. */
export type LoafEntry = PerformanceEntry & {
  blockingDuration?: number
  renderStart?: number
  styleAndLayoutStart?: number
  scripts?: readonly ScriptEntry[]
}

export type LoafScript = {
  duration: number
  invoker: string
  sourceURL: string
  sourceFunctionName: string
  sourceCharPosition: number
}

/** Long-frame time grouped by script invoker. Only the invokers that actually ran are listed. */
export type LoafAttribution = { invoker: string; ms: number }

export type LoafFrame = {
  startTime: number
  duration: number
  blockingDuration: number
  /** Milliseconds after `startTime`; 0 when the frame never reached that phase. */
  renderStart: number
  styleAndLayoutStart: number
  /** The first `SCRIPT_LIMIT` scripts in the frame. */
  scripts: LoafScript[]
  /** How many scripts the frame reported, so a truncated list is recognizable. */
  scriptCount: number
  /** Total script time of every script in the frame, including the ones trimmed from `scripts`. */
  scriptDuration: number
  attribution: LoafAttribution[]
}

export type LoafPhases = { script: number; layout: number; paint: number }

/** Percentages of the accumulated long-frame time; null until at least one long frame was seen. */
export type MainThreadSplit = {
  script: number | null
  layout: number | null
  paint: number | null
  frames: number
}

const seconds = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0)

const readScript = (entry: ScriptEntry): LoafScript => ({
  duration: round(seconds(entry.duration ?? 0)),
  invoker: truncate(entry.invoker, SOURCE_NAME_LIMIT) || "unknown",
  sourceURL: truncate(entry.sourceURL, SOURCE_URL_LIMIT),
  sourceFunctionName: truncate(entry.sourceFunctionName, SOURCE_NAME_LIMIT),
  sourceCharPosition: Math.max(0, Math.round(seconds(entry.sourceCharPosition ?? 0))),
})

/** Groups script time by invoker so a frame can be blamed on an event handler instead of a duration only. */
export function attribute(scripts: readonly LoafScript[], limit = INVOKER_LIMIT): LoafAttribution[] {
  const totals = new Map<string, number>()
  for (const script of scripts) totals.set(script.invoker, (totals.get(script.invoker) ?? 0) + script.duration)

  return Array.from(totals, ([invoker, ms]) => ({ invoker, ms: round(ms) }))
    .sort((a, b) => b.ms - a.ms || a.invoker.localeCompare(b.invoker))
    .slice(0, limit)
}

export function readLoafEntry(entry: LoafEntry): LoafFrame {
  const scripts = (entry.scripts ?? []).map(readScript)

  return {
    startTime: round(seconds(entry.startTime)),
    duration: round(seconds(entry.duration)),
    blockingDuration: round(seconds(entry.blockingDuration ?? 0)),
    renderStart: round(seconds(entry.renderStart ?? 0)),
    styleAndLayoutStart: round(seconds(entry.styleAndLayoutStart ?? 0)),
    scripts: scripts.slice(0, SCRIPT_LIMIT),
    scriptCount: scripts.length,
    scriptDuration: round(scripts.reduce((total, script) => total + script.duration, 0)),
    attribution: attribute(scripts),
  }
}

/**
 * Splits one frame into script, style/layout and the rest. `paint` covers rendering as well: the entry only
 * marks where style/layout begins, so paint and compositing cannot be separated from it.
 */
export function loafPhases(frame: LoafFrame): LoafPhases {
  const end = frame.startTime + frame.duration
  const script = Math.min(frame.duration, Math.max(0, frame.scriptDuration))
  // style/layout starts after the scripts, so it can never claim more than what the scripts left over.
  const layout = Math.min(
    frame.styleAndLayoutStart > 0 ? Math.max(0, end - frame.styleAndLayoutStart) : 0,
    frame.duration - script,
  )

  return {
    script: round(script),
    layout: round(layout),
    paint: round(Math.max(0, frame.duration - script - layout)),
  }
}

/** Accumulates long frames between two `perf` samples and reads them as a split of the time they held. */
export function createSplitWindow() {
  let totals = { script: 0, layout: 0, paint: 0 }
  let frames = 0

  return {
    add(frame: LoafFrame) {
      const phases = loafPhases(frame)
      totals = {
        script: totals.script + phases.script,
        layout: totals.layout + phases.layout,
        paint: totals.paint + phases.paint,
      }
      frames += 1
    },
    read(): MainThreadSplit {
      const total = totals.script + totals.layout + totals.paint
      if (frames === 0 || total <= 0) return { script: null, layout: null, paint: null, frames }

      return {
        script: round((totals.script / total) * 100),
        layout: round((totals.layout / total) * 100),
        paint: round((totals.paint / total) * 100),
        frames,
      }
    },
    reset() {
      totals = { script: 0, layout: 0, paint: 0 }
      frames = 0
    },
  }
}

export function loafSupported(): boolean {
  if (typeof PerformanceObserver === "undefined") return false

  return PerformanceObserver.supportedEntryTypes?.includes(LOAF_TYPE) ?? false
}

/**
 * Subscribes to long animation frames. Returns false when the entry type is unavailable, so the caller can
 * record the gap instead of reporting a zero split. `buffered` also picks up frames from before the capture
 * started, which is what makes the startup window attributable.
 */
export function startLoaf(handle: (frame: LoafFrame) => void): boolean {
  if (!loafSupported()) return false
  observe<LoafEntry>(LOAF_TYPE, { type: LOAF_TYPE, buffered: true }, (entries) => {
    for (const entry of entries) handle(readLoafEntry(entry))
  })

  return true
}
