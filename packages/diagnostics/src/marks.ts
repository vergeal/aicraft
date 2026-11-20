// Marks are the "this is the moment" anchors an agent or the user drops into the stream. The hot layer keeps
// them for 60 seconds like any other event; this module keeps the labelled ones for the whole process so a dump
// still says what was marked, and how often, long after the ring buffer moved on.

const MAX_ITEMS = 50

export type MarkItem = {
  t: number
  wall: number
  label?: string
  /** The extra payload the caller passed after the label. */
  data: Record<string, unknown>
}

export type MarkSection = {
  /** Marks recorded since the capture started, including the items already evicted from `items`. */
  count: number
  items: MarkItem[]
}

export type Marks = {
  add(item: MarkItem): void
  section(): MarkSection
  clear(): void
}

export function createMarks(): Marks {
  const items: MarkItem[] = []
  let count = 0

  return {
    add(item) {
      count++
      items.push(item)
      if (items.length > MAX_ITEMS) items.shift()
    },
    section: () => ({ count, items: items.map((item) => ({ ...item, data: { ...item.data } })) }),
    clear() {
      items.length = 0
      count = 0
    },
  }
}
