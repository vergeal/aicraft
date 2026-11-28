import { describe, expect, test } from "bun:test"
import { layout } from "./treemap"

const W = 300
const H = 120
const area = (tiles: ReturnType<typeof layout>) => tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0)

describe("treemap layout", () => {
  test("tiles cover the box and their areas follow the values", () => {
    const tiles = layout(
      [
        { key: "a", value: 60 },
        { key: "b", value: 30 },
        { key: "c", value: 10 },
      ],
      W,
      H,
    )

    // No gaps and no overlap: a treemap that leaves a hole reads as free space that is not there.
    expect(tiles).toHaveLength(3)
    expect(area(tiles)).toBeCloseTo(W * H, 4)
    const byKey = Object.fromEntries(tiles.map((tile) => [tile.key, (tile.width * tile.height) / (W * H)]))
    expect(byKey.a).toBeCloseTo(0.6, 4)
    expect(byKey.b).toBeCloseTo(0.3, 4)
    expect(byKey.c).toBeCloseTo(0.1, 4)
  })

  test("gives a zero-valued entry no tile", () => {
    // A layer holding nothing has no area to draw. A minimum-size block would misstate its share, so the
    // caller lists it separately instead.
    const tiles = layout(
      [
        { key: "full", value: 100 },
        { key: "empty", value: 0 },
      ],
      W,
      H,
    )

    expect(tiles.map((tile) => tile.key)).toEqual(["full"])
    expect(area(tiles)).toBeCloseTo(W * H, 4)
  })

  test("keeps the largest tile largest", () => {
    // The point of the map is that the biggest consumer is the biggest thing on screen.
    const tiles = layout(
      [
        { key: "L3", value: 395_700 },
        { key: "L7", value: 128_800 },
        { key: "L1", value: 26_700 },
        { key: "L2", value: 22_600 },
      ],
      W,
      H,
    )
    const sizes = tiles.map((tile) => ({ key: tile.key, area: tile.width * tile.height }))
    const largest = sizes.reduce((best, tile) => (tile.area > best.area ? tile : best))

    expect(largest).toBe(sizes[0]!)
    expect(largest.key).toBe("L3")
  })

  test("stays inside the box", () => {
    const tiles = layout(
      [7, 11, 13, 17, 19].map((value, index) => ({ key: `k${index}`, value })),
      W,
      H,
    )
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(-0.001)
      expect(tile.y).toBeGreaterThanOrEqual(-0.001)
      expect(tile.x + tile.width).toBeLessThanOrEqual(W + 0.001)
      expect(tile.y + tile.height).toBeLessThanOrEqual(H + 0.001)
    }
  })

  test("lifts a sliver to the floor without breaking the total area", () => {
    // A 0.1% layer is a 0.8px sliver at this size: unreadable and impossible to point at. The floor pays
    // for it out of the largest tile, so the box stays exactly covered.
    const floor = 44 * 22
    const tiles = layout(
      [
        { key: "wide", value: 999_000 },
        { key: "sliver", value: 1_000 },
      ],
      W,
      H,
      floor,
    )
    const byKey = Object.fromEntries(tiles.map((tile) => [tile.key, tile.width * tile.height]))

    expect(byKey.sliver).toBeCloseTo(floor, 4)
    expect(area(tiles)).toBeCloseTo(W * H, 4)
    // The big tile is still the big tile.
    expect(byKey.wide!).toBeGreaterThan(byKey.sliver!)
  })

  test("declines a floor the box cannot afford", () => {
    // Twelve tiles that each demand a quarter of the box cannot all be honoured; proportions win.
    const tiles = layout(
      Array.from({ length: 12 }, (_, index) => ({ key: `k${index}`, value: 100 })),
      W,
      H,
      W * H * 0.25,
    )

    expect(area(tiles)).toBeCloseTo(W * H, 4)
    expect(tiles).toHaveLength(12)
  })

  test("returns nothing for an empty or degenerate box", () => {
    expect(layout([], W, H)).toEqual([])
    expect(layout([{ key: "a", value: 1 }], 0, H)).toEqual([])
    expect(layout([{ key: "a", value: 0 }], W, H)).toEqual([])
  })
})
