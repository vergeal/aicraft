/** Where the reader stopped in a session, kept per browser so reopening it resumes in place. */
const POSITION_PREFIX = "aicraft.timeline.position:"

export type SavedPosition = { key: string; offset: number; bottom: boolean }

export function readPosition(sessionKey: string | undefined): SavedPosition | undefined {
  if (!sessionKey || typeof localStorage === "undefined") return undefined

  try {
    const raw = localStorage.getItem(POSITION_PREFIX + sessionKey)

    if (!raw) return undefined
    const value: unknown = JSON.parse(raw)

    if (typeof value !== "object" || value === null) return undefined
    const { key, offset, bottom } = value as Record<string, unknown>

    if (typeof key !== "string" || typeof offset !== "number" || !Number.isFinite(offset)) return undefined
    // Older records lack `bottom`, so they cannot tell "left at the end" from "left mid-way".
    if (typeof bottom !== "boolean") return undefined

    return { key, offset, bottom }
  } catch {
    return undefined
  }
}

export function writePosition(sessionKey: string | undefined, position: SavedPosition) {
  if (!sessionKey || typeof localStorage === "undefined") return

  try {
    localStorage.setItem(POSITION_PREFIX + sessionKey, JSON.stringify(position))
  } catch {
    // Blocked or full storage must not break scrolling.
  }
}
