import type { Snapshot, TimelineEntry } from "./types"

/** Which family an unmeasured row belongs to, so a similar row's measured height can stand in for it. */
export type EntryHeightKind =
  | "fold-open"
  | "fold-closed"
  | "input"
  | "assistant"
  | "reasoning"
  | "tool"
  | "notice"
  | "error"
  | "retry"
  | "other"

export function entryHeightKind(entry: TimelineEntry, snapshot: Snapshot): EntryHeightKind {
  if (entry.kind === "fold") return snapshot.turns.get(entry.turn)?.status === "open" ? "fold-open" : "fold-closed"

  switch (snapshot.nodes.get(entry.key)?.payload.kind) {
    case "input":
      return "input"
    case "assistant":
      return "assistant"
    case "reasoning":
      return "reasoning"
    case "tool":
      return "tool"
    case "notice":
      return "notice"
    case "error":
      return "error"
    case "retry":
      return "retry"
    default:
      return "other"
  }
}

const FALLBACK_HEIGHT: Readonly<Record<EntryHeightKind, number>> = {
  "fold-open": 360,
  "fold-closed": 200,
  input: 64,
  assistant: 180,
  reasoning: 44,
  tool: 64,
  notice: 32,
  error: 48,
  retry: 40,
  other: 56,
}

/**
 * A first-frame height for a row that has not mounted yet. Once the row mounts its measured
 * border box replaces this, so the estimate only has to keep the scrollbar close for one frame.
 * A measured median from the same family is used when one exists, which keeps the total close
 * while a windowed page measures its first rows.
 */
export function estimateEntryHeight(
  entry: TimelineEntry,
  snapshot: Snapshot,
  learned?: ReadonlyMap<EntryHeightKind, number>,
): number {
  const kind = entryHeightKind(entry, snapshot)

  return learned?.get(kind) ?? FALLBACK_HEIGHT[kind]
}

/** The median measured height per row family, ignoring families with too few samples to trust. */
export function learnedEntryHeights(
  entries: readonly TimelineEntry[],
  snapshot: Snapshot,
  measured: (key: string) => number | undefined,
): Map<EntryHeightKind, number> {
  const buckets = new Map<EntryHeightKind, number[]>()

  for (const entry of entries) {
    const size = measured(entry.kind === "fold" ? `fold:${entry.turn}` : `node:${entry.key}`)

    if (size === undefined) continue
    const kind = entryHeightKind(entry, snapshot)
    const values = buckets.get(kind)

    if (values) values.push(size)
    else buckets.set(kind, [size])
  }

  const result = new Map<EntryHeightKind, number>()

  for (const [kind, values] of buckets) {
    if (values.length < 2) continue
    values.sort((a, b) => a - b)
    result.set(kind, values[values.length >> 1]!)
  }

  return result
}


export type EntryLayout = {
  /** Content top of each row. A row's own leading gap lives inside its box. */
  readonly tops: readonly number[]
  readonly heights: readonly number[]
  readonly total: number
}

/** Prefix sums over the rows, so a window can place a spacer above and below the mounted slice. */
export function entryLayout(
  keys: readonly string[],
  height: (key: string, index: number) => number,
): EntryLayout {
  const tops = new Array<number>(keys.length)
  const heights = new Array<number>(keys.length)
  let cursor = 0

  for (let index = 0; index < keys.length; index++) {
    const key = keys[index]!
    const rowHeight = height(key, index)

    tops[index] = cursor
    heights[index] = rowHeight
    cursor += rowHeight
  }

  return { tops, heights, total: cursor }
}

/** The inclusive row range that overlaps the viewport, widened by the overscan on both sides. */
export function visibleRange(layout: EntryLayout, scrollTop: number, viewport: number, overscan: number) {
  const count = layout.tops.length

  if (count === 0) return { start: 0, end: -1 }

  const from = scrollTop - overscan
  const to = scrollTop + viewport + overscan

  // First row whose bottom passes the top edge of the window.
  let low = 0
  let high = count - 1
  let start = count

  while (low <= high) {
    const mid = (low + high) >> 1

    if (layout.tops[mid]! + layout.heights[mid]! > from) {
      start = mid
      high = mid - 1
    } else low = mid + 1
  }

  const first = Math.min(start, count - 1)
  let end = first

  while (end + 1 < count && layout.tops[end + 1]! <= to) end += 1

  return { start: first, end }
}

/** The row containing a scroll offset, or the last row when the offset is past the end. */
export function positionAt(layout: EntryLayout, scrollTop: number) {
  const count = layout.tops.length

  if (count === 0) return undefined

  let low = 0
  let high = count - 1
  let found = 0

  while (low <= high) {
    const mid = (low + high) >> 1

    if (layout.tops[mid]! <= scrollTop) {
      found = mid
      low = mid + 1
    } else high = mid - 1
  }

  return found
}
