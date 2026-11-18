import { describe, expect, test } from "bun:test"
import { SessionMessage } from "@opencode/schema/session-message"
import { page } from "@opencode/core/tool/plugin/transcript"

const row = (id: string) => ({ id: SessionMessage.ID.make(id) })

describe("transcript paging", () => {
  test("reports a cursor only when the over-fetched page has a successor", () => {
    const rows = [row("msg_a"), row("msg_b"), row("msg_c")]

    expect(page(rows, 2, "next")).toEqual({
      shown: [rows[0], rows[1]],
      next: { id: SessionMessage.ID.make("msg_b"), direction: "next" },
    })
  })

  test("treats a page that ends exactly at the limit as the last one", () => {
    const rows = [row("msg_a"), row("msg_b")]

    expect(page(rows, 2, "previous")).toEqual({ shown: rows, next: null })
  })

  test("keeps the direction the caller used so the follow-up reads the same way", () => {
    expect(page([row("msg_a"), row("msg_b")], 1, "previous").next).toEqual({
      id: SessionMessage.ID.make("msg_a"),
      direction: "previous",
    })
  })
})
