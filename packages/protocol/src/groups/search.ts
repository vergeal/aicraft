import { Project } from "@aicraft/schema/project"
import { DateTimeUtcFromMillis, optional } from "@aicraft/schema/schema"
import { Session } from "@aicraft/schema/session"
import { SessionMessage } from "@aicraft/schema/session-message"
import { Schema } from "effect"
import { HttpApiEndpoint, OpenApi } from "effect/http-api"

const EXPERIMENTAL = "Experimental: may change without compatibility guarantees."
const annotations = (identifier: string, summary: string, description: string) =>
  OpenApi.annotations({
    identifier: `experimental.search.${identifier}`,
    summary,
    description: `${description} ${EXPERIMENTAL}`,
    // The routes share the `server.experimental` group with the other prototypes; tag them on their own.
    transform: (operation) => ({ ...operation, tags: ["experimental"] }),
  })

/** One message whose visible text matched, with the snippet the client shows and the Session that owns it. */
export const MessageHit = Schema.Struct({
  sessionID: Session.ID,
  messageID: SessionMessage.ID,
  type: Schema.String,
  snippet: Schema.String,
  time: DateTimeUtcFromMillis,
  sessionTitle: optional(Schema.String),
  projectID: Project.ID,
  directory: Schema.String,
  archived: Schema.Boolean,
}).annotate({ identifier: "Search.MessageHit" })
export type MessageHit = typeof MessageHit.Type

/** Lives in the `server.experimental` group (see `groups/experimental.ts`). */
export const SearchEndpoints = [
  HttpApiEndpoint.get("search.messages", "/api/experimental/search/messages", {
    query: {
      query: Schema.String,
      limit: optional(Schema.NumberFromString),
    },
    success: Schema.Struct({ data: Schema.Array(MessageHit) }),
  }).annotateMerge(
    annotations(
      "messages",
      "Search messages",
      "Search the visible text of every Session's messages, archived Sessions included, newest match first. Prompt text, assistant prose and reasoning, system notes, shell commands and compaction summaries all match.",
    ),
  ),
] as const
