import type { JsonValue } from "@aicraft/client/promise"
import type { InboxPublishMessage, Json } from "@aicraft/aix/gui"
import { uuid } from "@aicraft/util/uuid"

const STATUSES = ["pending", "done", "failed"] as const

/** A validated publish message, in the shape the server's inbox route takes. */
export type InboxMessage = {
  readonly externalID: string
  readonly title: string
  readonly summary: string
  readonly status?: (typeof STATUSES)[number]
  readonly expiresAt?: number
  readonly payload?: JsonValue
}

/**
 * Validates one `ctx.inbox.publish` message and gives it the `externalID` the server stores it under. A plugin bundle
 * may be JavaScript, so the boundary checks what TypeScript only types.
 */
export function inboxMessage(message: InboxPublishMessage): InboxMessage {
  if (message.title.trim() === "") throw new TypeError("Inbox message title must not be blank")

  if (message.summary.trim() === "") throw new TypeError("Inbox message summary must not be blank")

  if (message.status !== undefined && !STATUSES.includes(message.status))
    throw new TypeError(`Unknown inbox message status: ${String(message.status)}`)

  if (message.expiresAt !== undefined && !Number.isFinite(message.expiresAt))
    throw new TypeError("Inbox message expiresAt must be a finite number of milliseconds")

  return {
    externalID: uuid(),
    title: message.title,
    summary: message.summary,
    ...(message.status === undefined ? {} : { status: message.status }),
    ...(message.expiresAt === undefined ? {} : { expiresAt: message.expiresAt }),
    ...(message.payload === undefined ? {} : { payload: jsonValue(message.payload) }),
  }
}

/** The SDK's JSON is readonly and the wire's is not, so a payload is copied once at the boundary. */
function jsonValue(value: Json): JsonValue {
  if (Array.isArray(value)) return value.map(jsonValue)
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]))

  return value
}
