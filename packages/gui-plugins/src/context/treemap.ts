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
): Array<Tile<Key>> {
  const values = items.filter((item) => item.value > 0)
  const total = values.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0 || width <= 0 || height <= 0) return []

  // Work in area units so each tile's area is exactly its share of the box.
  const scaled = values
    .map((item) => ({ key: item.key, value: item.value, area: (item.value / total) * width * height }))
    .sort((a, b) => b.area - a.area)

  const tiles: Array<Tile<Key>> = []
  let box = { x: 0, y: 0, width, height }
  let index = 0

  while (index < scaled.length) {
    // Grow a row while doing so improves the aspect ratio, then lay the row and shrink the box.
    const shorter = Math.min(box.width, box.height)
    const row: Array<(typeof scaled)[number]> = [scaled[index]!]
    let next = index + 1
    while (next < scaled.length) {
      const candidate = [...row, scaled[next]!].map((item) => item.area)
      if (worst(candidate, shorter) > worst(row.map((item) => item.area), shorter)) break
      row.push(scaled[next]!)
      next++
    }

    const rowArea = row.reduce((sum, item) => sum + item.area, 0)
    const horizontal = box.width >= box.height
    // The row takes one full side and extends `thickness` into the box.
    const thickness = rowArea / (horizontal ? box.height : box.width) || 0

    let offset = 0
    for (const item of row) {
      const extent = thickness === 0 ? 0 : item.area / thickness
      if (horizontal) {
        tiles.push({
          key: item.key,
          x: box.x,
          y: box.y + offset,
          width: thickness,
          height: extent,
          value: item.value,
        })
      } else {
        tiles.push({
          key: item.key,
          x: box.x + offset,
          y: box.y,
          width: extent,
          height: thickness,
          value: item.value,
        })
      }
      offset += extent
    }

    box = horizontal
      ? { x: box.x + thickness, y: box.y, width: box.width - thickness, height: box.height }
      : { x: box.x, y: box.y + thickness, width: box.width, height: box.height - thickness }
    index = next
  }

  return tiles
}
