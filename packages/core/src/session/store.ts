export * as SessionStore from "./store.js"

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { Project } from "@aicraft/schema/project"
import { Workspace } from "@aicraft/schema/workspace"
import { AbsolutePath, PositiveInt, RelativePath } from "@aicraft/schema/schema"
import { Database } from "../database/database.js"
import { makeGlobalNode } from "@aicraft/util/effect/app-node"
import { SessionHistory } from "./history.js"
import { MessageDecodeError } from "./error.js"
import { SessionMessage } from "./message.js"
import { Session } from "@aicraft/schema/session"
import { SessionMessageTable, SessionPartTable, SessionTable } from "./sql.js"
import { fromRow } from "./info.js"

const ListInputBase = {
  workspaceID: Workspace.ID.pipe(Schema.optional),
  search: Schema.String.pipe(Schema.optional),
  limit: PositiveInt.pipe(Schema.optional),
  order: Schema.Literals(["asc", "desc"]).pipe(Schema.optional),
  parentID: Schema.NullOr(Session.ID).pipe(Schema.optional),
  archived: Schema.Boolean.pipe(Schema.optional),
  anchor: Session.ListAnchor.pipe(Schema.optional),
}

const ListDirectoryInput = Schema.Struct({
  ...ListInputBase,
  directory: AbsolutePath,
})

const ListProjectInput = Schema.Struct({
  ...ListInputBase,
  project: Project.ID,
  subpath: RelativePath.pipe(Schema.optional),
})

const ListAllInput = Schema.Struct(ListInputBase)

export const ListInput = Schema.Union([ListDirectoryInput, ListProjectInput, ListAllInput])
export type ListInput = typeof ListInput.Type

export type MessagesInput = {
  sessionID: Session.ID
  limit?: number
  order?: "asc" | "desc"
  type?: SessionMessage.Type
  cursor?: {
    id: SessionMessage.ID
    direction: "previous" | "next"
  }
}

/** One message whose text matches a search, with enough context to open it and preview the match. */
export type MessageSearchHit = {
  readonly sessionID: Session.ID
  readonly messageID: SessionMessage.ID
  readonly type: SessionMessage.Type
  readonly snippet: string
  readonly time: number
  readonly sessionTitle?: string
  readonly projectID: Project.ID
  readonly directory: string
  readonly archived: boolean
}

export type MessageSearchInput = {
  readonly query: string
  readonly limit?: number
}


export interface Interface {
  readonly get: (sessionID: Session.ID) => Effect.Effect<Session.Info | undefined>
  readonly list: (input?: ListInput) => Effect.Effect<Session.Info[]>
  readonly messages: (input: MessagesInput) => Effect.Effect<SessionMessage.Info[], MessageDecodeError>
  readonly context: (sessionID: Session.ID) => Effect.Effect<SessionMessage.Info[], MessageDecodeError>
  readonly message: (
    messageID: SessionMessage.ID,
  ) => Effect.Effect<{ readonly sessionID: Session.ID; readonly message: SessionMessage.Info } | undefined>
  /** {@link Interface.messages} for clients that fetch media themselves: files stored in `blob` stay `media:` refs. */
  readonly messagesWithRefs: (input: MessagesInput) => Effect.Effect<SessionMessage.MediaInfo[], MessageDecodeError>
  /** {@link Interface.message} for clients that fetch media themselves. */
  readonly messageWithRefs: (
    messageID: SessionMessage.ID,
  ) => Effect.Effect<{ readonly sessionID: Session.ID; readonly message: SessionMessage.MediaInfo } | undefined>
  /**
   * Messages whose visible text matches `query`, newest first. The same text the transcript shows: prompt text,
   * assistant prose and reasoning, synthetic and system notes, shell commands, and compaction summaries.
   */
  readonly searchMessages: (input: MessageSearchInput) => Effect.Effect<ReadonlyArray<MessageSearchHit>>
  /**
   * Top-level Sessions holding an execution claim. Recoverable background
   * children are resumed separately through their durable Job records.
   */
  readonly listSuspended: () => Effect.Effect<ReadonlyArray<Session.ID>>
  /**
   * Records the execution claim: the durable write-ahead intent that a turn is
   * (or was) in flight. Set when execution starts; a claim that survives to the
   * next boot marks a turn that never completed — its process crashed or shut
   * down mid-turn.
   */
  readonly claim: (sessionID: Session.ID) => Effect.Effect<void>
  /** Releases the claim and resets resume accounting. Terminal events call this on commit. */
  readonly release: (sessionID: Session.ID) => Effect.Effect<void>
  /**
   * Clears orphaned child claims except children owned by recoverable
   * background subagent jobs.
   */
  readonly releaseChildClaims: (recoverable: ReadonlyArray<Session.ID>) => Effect.Effect<void>
  /**
   * Durably counts one more resume of an orphaned claim, returning the new
   * total — or undefined when the Session no longer exists.
   */
  readonly countResume: (sessionID: Session.ID) => Effect.Effect<number | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@aicraft/SessionStore") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    /** One page of a session's message rows, oldest first within the page when paging backwards. */
    const messageRows = Effect.fnUntraced(function* (input: MessagesInput) {
      const direction = input.cursor?.direction ?? "next"
      const requestedOrder = input.order ?? "desc"
      const order = direction === "previous" ? (requestedOrder === "asc" ? "desc" : "asc") : requestedOrder
      const anchor = input.cursor
        ? yield* db
            .select({ seq: SessionMessageTable.seq })
            .from(SessionMessageTable)
            .where(
              and(eq(SessionMessageTable.session_id, input.sessionID), eq(SessionMessageTable.id, input.cursor.id)),
            )
            .get()
            .pipe(Effect.orDie)
        : undefined
      if (input.cursor && !anchor) return []
      const boundary = anchor
        ? order === "asc"
          ? gt(SessionMessageTable.seq, anchor.seq)
          : lt(SessionMessageTable.seq, anchor.seq)
        : undefined
      const query = db
        .select()
        .from(SessionMessageTable)
        .where(
          and(
            eq(SessionMessageTable.session_id, input.sessionID),
            boundary,
            input.type === undefined ? undefined : eq(SessionMessageTable.type, input.type),
          ),
        )
        .orderBy(order === "asc" ? asc(SessionMessageTable.seq) : desc(SessionMessageTable.seq))
      const rows = yield* (input.limit === undefined ? query.all() : query.limit(input.limit).all()).pipe(Effect.orDie)
      return direction === "previous" ? rows.toReversed() : rows
    })

    const messageRow = (messageID: SessionMessage.ID) =>
      db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, messageID)).get().pipe(Effect.orDie)

    return Service.of({
      get: Effect.fnUntraced(function* (sessionID) {
        const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
        return row ? fromRow(row) : undefined
      }),
      list: Effect.fn("SessionStore.list")(function* (input = {}) {
        const direction = input.anchor?.direction ?? "next"
        const requestedOrder = input.order ?? "desc"
        const order = direction === "previous" ? (requestedOrder === "asc" ? "desc" : "asc") : requestedOrder
        const sortColumn = SessionTable.time_updated
        const conditions: SQL[] = []
        if ("directory" in input) conditions.push(eq(SessionTable.directory, input.directory))
        if (input.workspaceID) conditions.push(eq(SessionTable.workspace_id, input.workspaceID))
        if ("project" in input) conditions.push(eq(SessionTable.project_id, input.project))
        if ("project" in input && input.subpath !== undefined) conditions.push(eq(SessionTable.path, input.subpath))
        if (input.search) conditions.push(sql`${SessionTable.title} GLOB ${titlePattern(input.search)}`)
        if (input.parentID !== undefined)
          conditions.push(
            input.parentID === null ? isNull(SessionTable.parent_id) : eq(SessionTable.parent_id, input.parentID),
          )
        if (input.archived !== undefined)
          conditions.push(input.archived ? isNotNull(SessionTable.time_archived) : isNull(SessionTable.time_archived))
        if (input.anchor) {
          conditions.push(
            order === "asc"
              ? or(
                  gt(sortColumn, input.anchor.time),
                  and(eq(sortColumn, input.anchor.time), gt(SessionTable.id, input.anchor.id)),
                )!
              : or(
                  lt(sortColumn, input.anchor.time),
                  and(eq(sortColumn, input.anchor.time), lt(SessionTable.id, input.anchor.id)),
                )!,
          )
        }
        const query = db
          .select()
          .from(SessionTable)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(
            order === "asc" ? asc(sortColumn) : desc(sortColumn),
            order === "asc" ? asc(SessionTable.id) : desc(SessionTable.id),
          )
        const rows = yield* (input.limit === undefined ? query.all() : query.limit(input.limit).all()).pipe(
          Effect.orDie,
        )
        return (direction === "previous" ? rows.toReversed() : rows).map((row) => fromRow(row))
      }),
      messages: Effect.fn("SessionStore.messages")(function* (input) {
        return yield* SessionHistory.decodeMessageRows(db, yield* messageRows(input))
      }),
      messagesWithRefs: Effect.fn("SessionStore.messagesWithRefs")(function* (input) {
        return yield* SessionHistory.decodeMessageRowsWithRefs(db, yield* messageRows(input))
      }),
      context: Effect.fn("SessionStore.context")((sessionID) => SessionHistory.load(db, sessionID, "latest")),
      message: Effect.fn("SessionStore.message")(function* (messageID) {
        const row = yield* messageRow(messageID)
        if (!row) return undefined
        const [message] = yield* SessionHistory.decodeMessageRows(db, [row]).pipe(Effect.orDie)
        return message && { sessionID: row.session_id, message }
      }),
      messageWithRefs: Effect.fn("SessionStore.messageWithRefs")(function* (messageID) {
        const row = yield* messageRow(messageID)
        if (!row) return undefined
        const [message] = yield* SessionHistory.decodeMessageRowsWithRefs(db, [row]).pipe(Effect.orDie)
        return message && { sessionID: row.session_id, message }
      }),
      searchMessages: Effect.fn("SessionStore.searchMessages")(function* (input) {
        const query = input.query.trim()
        if (!query) return []

        // The coarse pass runs in SQLite over the stored JSON; only the matches it returns are parsed, so a large
        // history costs one scan instead of decoding every message.
        const pattern = `%${escapeLike(query)}%`
        const rows = yield* db
          .select({
            id: SessionMessageTable.id,
            session_id: SessionMessageTable.session_id,
            type: SessionMessageTable.type,
            data: SessionMessageTable.data,
            time_created: SessionMessageTable.time_created,
            title: SessionTable.title,
            directory: SessionTable.directory,
            project_id: SessionTable.project_id,
            time_archived: SessionTable.time_archived,
          })
          .from(SessionMessageTable)
          .innerJoin(SessionTable, eq(SessionTable.id, SessionMessageTable.session_id))
          .where(
            sql`(${SessionMessageTable.data} LIKE ${pattern} ESCAPE '\\' OR EXISTS (SELECT 1 FROM session_part WHERE session_part.message_id = session_message.id AND session_part.data LIKE ${pattern} ESCAPE '\\'))`,
          )
          .orderBy(desc(SessionMessageTable.time_created), desc(SessionMessageTable.id))
          .limit(MESSAGE_SEARCH_CANDIDATES)
          .all()
          .pipe(Effect.orDie)
        if (rows.length === 0) return []

        const parts = yield* db
          .select({ message_id: SessionPartTable.message_id, data: SessionPartTable.data })
          .from(SessionPartTable)
          .where(
            inArray(
              SessionPartTable.message_id,
              rows.map((row) => row.id),
            ),
          )
          .orderBy(asc(SessionPartTable.message_id), asc(SessionPartTable.ordinal))
          .all()
          .pipe(Effect.orDie)

        const partsText = new Map<SessionMessage.ID, string[]>()
        for (const part of parts) {
          const text = partText(part.data)
          if (text === undefined) continue
          const list = partsText.get(part.message_id)
          if (list) list.push(text)
          else partsText.set(part.message_id, [text])
        }

        const needle = query.toLocaleLowerCase()
        const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)

        return rows
          .flatMap((row): MessageSearchHit[] => {
            const text = messageText(row.type, row.data, partsText.get(row.id) ?? [])
            if (!text || !text.toLocaleLowerCase().includes(needle)) return []

            return [
              {
                sessionID: row.session_id,
                messageID: row.id,
                type: row.type,
                snippet: snippet(text, query),
                time: row.time_created,
                sessionTitle: row.title ?? undefined,
                projectID: row.project_id,
                directory: row.directory,
                archived: row.time_archived !== null,
              },
            ]
          })
          .slice(0, limit)
      }),
      listSuspended: Effect.fn("SessionStore.listSuspended")(function* () {
        return yield* db
          .select({ sessionID: SessionTable.id })
          .from(SessionTable)
          .where(and(isNotNull(SessionTable.time_suspended), isNull(SessionTable.parent_id)))
          .all()
          .pipe(
            Effect.orDie,
            Effect.map((rows) => rows.map((row) => row.sessionID)),
          )
      }),
      claim: Effect.fn("SessionStore.claim")(function* (sessionID) {
        // The null guard makes re-claiming a still-claimed Session a zero-row
        // no-op (a resumed turn re-claims through the same started hook).
        // Claim bookkeeping never counts as user activity: time_updated is
        // pinned so session ordering only moves on real changes.
        yield* db
          .update(SessionTable)
          .set({ time_suspended: Date.now(), time_updated: sql`${SessionTable.time_updated}` })
          .where(and(eq(SessionTable.id, sessionID), isNull(SessionTable.time_suspended)))
          .run()
          .pipe(Effect.orDie)
      }),
      release: Effect.fn("SessionStore.release")(function* (sessionID) {
        yield* db
          .update(SessionTable)
          .set({ time_suspended: null, resume_attempts: 0, time_updated: sql`${SessionTable.time_updated}` })
          .where(eq(SessionTable.id, sessionID))
          .run()
          .pipe(Effect.orDie)
      }),
      releaseChildClaims: Effect.fn("SessionStore.releaseChildClaims")((recoverable) =>
        db
          .update(SessionTable)
          .set({ time_suspended: null, resume_attempts: 0, time_updated: sql`${SessionTable.time_updated}` })
          .where(
            and(
              isNotNull(SessionTable.time_suspended),
              isNotNull(SessionTable.parent_id),
              recoverable.length > 0 ? notInArray(SessionTable.id, Array.from(recoverable)) : undefined,
            ),
          )
          .run()
          .pipe(Effect.orDie, Effect.asVoid),
      ),
      countResume: Effect.fn("SessionStore.countResume")(function* (sessionID) {
        const row = yield* db
          .update(SessionTable)
          .set({
            resume_attempts: sql`${SessionTable.resume_attempts} + 1`,
            time_updated: sql`${SessionTable.time_updated}`,
          })
          .where(eq(SessionTable.id, sessionID))
          .returning({ attempts: SessionTable.resume_attempts })
          .get()
          .pipe(Effect.orDie)
        return row?.attempts
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })

/** How many matching rows the coarse pass hands to the text extraction, newest first. */
const MESSAGE_SEARCH_CANDIDATES = 400

/** A LIKE pattern matches literally: the user typed `%`, `_` and `\`, not a wildcard or an escape. */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** One window of text around the first match, so a long message reads as a result rather than a wall. */
function snippet(text: string, query: string) {
  const at = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  if (at === -1) return text.slice(0, 160)
  const start = Math.max(0, at - 60)
  const end = Math.min(text.length, at + query.length + 100)
  const window = text.slice(start, end).replace(/\s+/g, " ").trim()
  return `${start > 0 ? "…" : ""}${window}${end < text.length ? "…" : ""}`
}

/** The visible prose of one message; tool inputs, files and metadata are not part of what a person reads. */
function messageText(type: SessionMessage.Type, data: unknown, parts: ReadonlyArray<string>) {
  const record = data as { text?: unknown; command?: unknown; summary?: unknown }
  switch (type) {
    case "assistant":
      return parts.join("\n\n") || undefined
    case "user":
    case "synthetic":
    case "system":
    case "skill":
      return typeof record.text === "string" ? record.text : undefined
    case "shell":
      return typeof record.command === "string" ? record.command : undefined
    case "compaction":
      return typeof record.summary === "string" ? record.summary : undefined
    default:
      return undefined
  }
}

function partText(data: unknown) {
  const record = data as { type?: unknown; text?: unknown }
  if ((record.type === "text" || record.type === "reasoning") && typeof record.text === "string") return record.text
  return undefined
}

// SQLite's LIKE folds case for ASCII only, and none of our drivers (bun, node, Durable Objects) ships ICU or lets us
// register a lowercase function everywhere. GLOB is case-sensitive but supports character classes, so each cased
// letter becomes a class of its single-character case forms ("т" -> "[тТ]"). The LIKE wildcards % and _ keep their
// meaning, and GLOB metacharacters are wrapped in a class so they stay literal as they were under LIKE.
function titlePattern(search: string) {
  const chars = Array.from(search, (char) => {
    if (char === "%") return "*"
    if (char === "_") return "?"
    const cases = new Set(
      [char, char.toLowerCase(), char.toUpperCase()].filter((form) => Array.from(form).length === 1),
    )
    if (cases.size > 1) return `[${[...cases].join("")}]`
    return "*?[".includes(char) ? `[${char}]` : char
  })
  return `*${chars.join("")}*`
}
