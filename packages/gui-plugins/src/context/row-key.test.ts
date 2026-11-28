import { describe, expect, test } from "bun:test"
import { RowKey } from "./row-key"

describe("assembly row key", () => {
  test("distinguishes one source listed twice in the same layer", () => {
    // The reported bug: L4 showed core/skill-guidance twice, once as the pending notice and once as the
    // block the request actually sent. One key for both meant they expanded together.
    const notice = RowKey.make({ layer: "L4", origin: "notice", index: 0, source: "core/skill-guidance" })
    const sent = RowKey.make({ layer: "L4", origin: "sent", index: 0, source: "core/skill-guidance" })

    expect(notice).not.toBe(sent)
  })

  test("distinguishes two rows that share source and list", () => {
    const first = RowKey.make({ layer: "L4", origin: "sent", index: 0, source: "core/codemode" })
    const second = RowKey.make({ layer: "L4", origin: "sent", index: 1, source: "core/codemode" })

    expect(first).not.toBe(second)
  })

  test("keeps the same identity across layers apart", () => {
    const l1 = RowKey.make({ layer: "L1", origin: "baseline", index: 0, source: "core/codemode" })
    const l2 = RowKey.make({ layer: "L2", origin: "baseline", index: 0, source: "core/codemode" })

    expect(l1).not.toBe(l2)
  })

  test("is stable for the same row described twice", () => {
    const input = { layer: "L5", origin: "sent" as const, index: 3, source: "core/environment" }

    expect(RowKey.make(input)).toBe(RowKey.make(input))
  })
})
