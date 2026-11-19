import { describe, expect, test } from "bun:test"
import { entryLayout, positionAt, visibleRange } from "./virtual"

const layout = (heights: readonly number[]) => entryLayout(heights.map((_, index) => String(index)), (_, index) => heights[index]!)

describe("entryLayout", () => {
  test("sums row heights, gaps included in the boxes", () => {
    const result = layout([100, 20, 60])

    expect(result.tops).toEqual([0, 100, 120])
    expect(result.total).toBe(180)
  })

  test("keeps an empty page at zero", () => {
    expect(entryLayout([], () => 0)).toEqual({ tops: [], heights: [], total: 0 })
  })
})

describe("visibleRange", () => {
  test("mounts only the rows under the viewport plus overscan", () => {
    const page = layout(Array.from({ length: 100 }, () => 50))

    // Viewport 0-400 with 50px of overscan reaches 450, so rows 0..9 mount.
    expect(visibleRange(page, 0, 400, 50)).toEqual({ start: 0, end: 9 })

    // Scroll 1000px: the window is 950..1450, so rows 19..29.
    expect(visibleRange(page, 1000, 400, 50)).toEqual({ start: 19, end: 29 })
  })

  test("clamps at the end of the page", () => {
    const page = layout(Array.from({ length: 10 }, () => 50))

    expect(visibleRange(page, 400, 400, 50)).toEqual({ start: 7, end: 9 })
  })

  test("always mounts one row when the window sits past the rows", () => {
    const page = layout([100, 100])

    expect(visibleRange(page, 10_000, 400, 0)).toEqual({ start: 1, end: 1 })
  })

  test("returns an empty range for no rows", () => {
    expect(visibleRange(layout([]), 0, 400, 50)).toEqual({ start: 0, end: -1 })
  })
})

describe("positionAt", () => {
  test("finds the row that contains the offset", () => {
    const page = layout([100, 20, 60])

    expect(positionAt(page, 0)).toBe(0)
    expect(positionAt(page, 99)).toBe(0)
    expect(positionAt(page, 100)).toBe(1)
    expect(positionAt(page, 119)).toBe(1)
    expect(positionAt(page, 120)).toBe(2)
  })

  test("clamps past the end and returns undefined with no rows", () => {
    expect(positionAt(layout([100]), 10_000)).toBe(0)
    expect(positionAt(layout([]), 0)).toBeUndefined()
  })
})
