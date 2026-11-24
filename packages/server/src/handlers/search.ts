import { SessionStore } from "@aicraft/core/session/store"
import type { MessageHit } from "@aicraft/protocol/groups/search"
import { DateTime, Effect } from "effect"

/** `search.*` in the `server.experimental` group. Reads this server's own history; see `SessionStore.searchMessages`. */
export const makeSearch = Effect.gen(function* () {
  const store = yield* SessionStore.Service

  return {
    messages: (query: string, limit?: number) =>
      store.searchMessages({ query, limit }).pipe(
        Effect.map((hits) => ({
          data: hits.map(
            (hit): MessageHit => ({
              sessionID: hit.sessionID,
              messageID: hit.messageID,
              type: hit.type,
              snippet: hit.snippet,
              time: DateTime.makeUnsafe(hit.time),
              sessionTitle: hit.sessionTitle,
              projectID: hit.projectID,
              directory: hit.directory,
              archived: hit.archived,
            }),
          ),
        })),
      ),
  }
})
