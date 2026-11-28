export * as Treemap from "./treemap.js"

/**
 * Squarified treemap layout (Bruls, Huizing, van Wijk). Splits a rectangle into tiles whose areas are
 * proportional to their values, keeping each tile as close to square as the fit allows.
 *
 * Why not a plain "list of bars": the question this answers is what fills the window, and only an area
 * chart shows how much of one request a layer holds while the layers are still individually readable.
 * A bar stack cannot, because eight bars share one axis and the small ones collapse to hairlines.
 *
 * Values of zero get no tile: a tile with no area is not a thing a reader can see, so callers list those
 * separately rather than letting them vanish or drawing a minimum-size block that lies about its share.
 */

export type TileInput<Key> = {
  readonly key: Key
  readonly value: number
}

export type Tile<Key> = {
  readonly key: Key
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** The input value, carried through so callers can label a tile without a second lookup. */
  readonly value: number
}

/** Worst aspect ratio in a row, which is the quantity squarifying minimises. */
const worst = (row: ReadonlyArray<number>, length: number) => {
  if (row.length === 0) return Number.POSITIVE_INFINITY
  const sum = row.reduce((total, value) => total + value, 0)
  if (sum === 0 || length === 0) return Number.POSITIVE_INFINITY
  const max = Math.max(...row)
  const min = Math.min(...row)
  return Math.max((length * length * max) / (sum * sum), (sum * sum) / (length * length * min))
}

/**
 * Lay `items` out inside a `width × height` box. Values are normalised, so the caller may pass bytes
 * directly. Zero and negative values are dropped from the result.
 */
export function layout<Key>(
  items: ReadonlyArray<TileInput<Key>>,
  width: number,
  height: number,
  /**
   * Floor for a tile's area, in square pixels. A layer at 0.1% of a 640×132 box would otherwise be a
   * 0.8px sliver: unreadable, and impossible to point at. The floor's cost is taken from the largest
   * tile, so the shape of the map stays honest — the biggest consumer is still the biggest block.
   */
  minArea = 0,
): Array<Tile<Key>> {
  const values = items.filter((item) => item.value > 0)
  const total = values.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0 || width <= 0 || height <= 0) return []

  const area = width * height
  const exact = values
    .map((item) => ({ key: item.key, value: item.value, area: (item.value / total) * area }))
    .sort((a, b) => b.area - a.area)

  // Lift the small tiles to the floor and pay for it from the largest one. Only a floor that the box
  // cannot afford is refused: past that point honest proportions and readable tiles cannot both hold.
  const lifted = exact.map((item) => (item.area < minArea ? { ...item, area: minArea } : item))
  const added = lifted.reduce((sum, item, index) => sum + (item.area - exact[index]!.area), 0)
  const largest = lifted[0]
  const scaled =
    added > 0 && largest !== undefined && largest.area - added > minArea
      ? [{ ...largest, area: largest.area - added }, ...lifted.slice(1)]
      : exact

  const tiles: Array<Tile<Key>> = []
  let frame = { x: 0, y: 0, width, height }
  let index = 0

  while (index < scaled.length) {
    // Grow a row while doing so improves the aspect ratio, then lay the row and shrink the box.
    const shorter = Math.min(frame.width, frame.height)
    const row: Array<(typeof scaled)[number]> = [scaled[index]!]
    let next = index + 1
    while (next < scaled.length) {
      const candidate = [...row, scaled[next]!].map((item) => item.area)
      if (worst(candidate, shorter) > worst(row.map((item) => item.area), shorter)) break
      row.push(scaled[next]!)
      next++
    }

    const rowArea = row.reduce((sum, item) => sum + item.area, 0)
    const horizontal = frame.width >= frame.height
    // The row takes one full side and extends `thickness` into the box.
    const thickness = rowArea / (horizontal ? frame.height : frame.width) || 0

    let offset = 0
    for (const item of row) {
      const extent = thickness === 0 ? 0 : item.area / thickness
      if (horizontal) {
        tiles.push({
          key: item.key,
          x: frame.x,
          y: frame.y + offset,
          width: thickness,
          height: extent,
          value: item.value,
        })
      } else {
        tiles.push({
          key: item.key,
          x: frame.x + offset,
          y: frame.y,
          width: extent,
          height: thickness,
          value: item.value,
        })
      }
      offset += extent
    }

    frame = horizontal
      ? { x: frame.x + thickness, y: frame.y, width: frame.width - thickness, height: frame.height }
      : { x: frame.x, y: frame.y + thickness, width: frame.width, height: frame.height - thickness }
    index = next
  }

  return tiles
}
