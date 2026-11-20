// Marks are plain bookkeeping: the ring buffer already carries the event, this list keeps the labelled ones for
// the whole process with an honest total count.

import { describe, expect, test } from "bun:test"
import { createMarks } from "./marks"

const mark = (t: number, label?: string, data: Record<string, unknown> = {}) => ({
  t,
  wall: 1_700_000_000_000 + t,
  label,
  data,
})

describe("marks", () => {
  test("keeps the label and the extra payload apart", () => {
    const marks = createMarks()

    marks.add(mark(1_000, "click", { route: "/session" }))

    expect(marks.section()).toEqual({
      count: 1,
      items: [{ t: 1_000, wall: 1_700_000_001_000, label: "click", data: { route: "/session" } }],
    })
  })

  test("counts every mark while keeping the newest fifty", () => {
    const marks = createMarks()

    for (let t = 0; t < 55; t++) marks.add(mark(t, `m${t}`))

    const section = marks.section()
    expect(section.count).toBe(55)
    expect(section.items).toHaveLength(50)
    expect(section.items[0].t).toBe(5)
    expect(section.items.at(-1)?.t).toBe(54)
  })

  test("hands out copies, so a reader cannot rewrite the list", () => {
    const marks = createMarks()
    marks.add(mark(1_000, "click", { route: "/session" }))

    const section = marks.section()
    section.items[0].data.route = "/elsewhere"
    section.items.pop()

    expect(marks.section().items[0].data.route).toBe("/session")
    expect(marks.section().items).toHaveLength(1)
  })

  test("clear empties the items and the total", () => {
    const marks = createMarks()
    marks.add(mark(1_000, "click"))

    marks.clear()

    expect(marks.section()).toEqual({ count: 0, items: [] })
  })
})
