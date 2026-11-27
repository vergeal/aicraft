import { base64Encode } from "@aicraft/util/encode"
import { ServerConnection } from "@/runtime/server/registry"
import { decode64 } from "@/runtime/persistence/base64"

export function sessionHref(server: ServerConnection.Key, sessionID: string) {
  return `/server/${base64Encode(server)}/session/${sessionID}`
}

export function routeServerKey(segment: string | undefined) {
  const key = decode64(segment)

  // A transition away from a session route empties the router's params before this subtree is disposed,
  // so the absence of a key is a normal state here, not a bad URL.
  if (!key || base64Encode(key) !== segment) return undefined

  return ServerConnection.Key.make(key)
}

export function requireServerKey(segment: string | undefined) {
  const key = routeServerKey(segment)

  if (!key) throw new Error("Invalid server route")

  return key
}

type SessionParent = { id: string; parentID?: string }

export async function rootSession<T extends SessionParent>(session: T, get: (sessionID: string) => Promise<T>) {
  const seen = new Set([session.id])
  let current = session

  while (current.parentID) {
    if (seen.has(current.parentID)) throw new Error(`Session parent cycle: ${current.parentID}`)
    seen.add(current.parentID)
    current = await get(current.parentID)
  }

  return current
}
