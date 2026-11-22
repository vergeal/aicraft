import { expect, test } from "bun:test"
import { inboxMessage } from "./inbox-message"

test("gives every publish its own external id and keeps the message as written", () => {
  const first = inboxMessage({ title: "Backup done", summary: "project", status: "done", payload: { size: 2 } })
  const second = inboxMessage({ title: "Backup done", summary: "project" })

  expect(first.externalID).not.toBe("")
  expect(second.externalID).not.toBe(first.externalID)
  expect(first.title).toBe("Backup done")
  expect(first.status).toBe("done")
  expect(first.payload).toEqual({ size: 2 })
  expect("status" in second).toBe(false)
  expect("payload" in second).toBe(false)
  expect("expiresAt" in second).toBe(false)
})

test("rejects a message the inbox cannot store", () => {
  expect(() => inboxMessage({ title: " ", summary: "body" })).toThrow(TypeError)
  expect(() => inboxMessage({ title: "title", summary: "" })).toThrow(TypeError)
  // SAFETY: the boundary checks what TypeScript only types, so a JavaScript bundle may pass an unknown status.
  expect(() => inboxMessage({ title: "title", summary: "body", status: "running" as never })).toThrow(TypeError)
  expect(() => inboxMessage({ title: "title", summary: "body", expiresAt: Number.NaN })).toThrow(TypeError)
})
