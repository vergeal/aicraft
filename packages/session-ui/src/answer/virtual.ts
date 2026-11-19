import type { Snapshot, TimelineEntry } from "./types"

/**
 * A first-frame height for a row that has not mounted yet. Once the row mounts its measured
 * border box replaces this, so the estimate only has to keep the scrollbar close for one frame.
 */
export function estimateEntryHeight(entry: TimelineEntry, snapshot: Snapshot): number {
  if (entry.kind === "fold") {
    const turn = snapshot.turns.get(entry.turn)

    // An open turn still shows its whole process; a settled one keeps its answer under the header.
    return turn?.status === "open" ? 360 : 200
  }

  switch (snapshot.nodes.get(entry.key)?.payload.kind) {
    case "input":
      return 64
    case "assistant":
      return 180
    case "reasoning":
      return 44
    case "tool":
      return 64
    case "notice":
      return 32
    case "error":
      return 48
    case "retry":
      return 40
    default:
      return 56
  }
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
