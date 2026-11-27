import { blob, sqliteTable, text, integer, index, primaryKey, real, uniqueIndex } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
import { directoryColumn, pathColumn } from "../database/path.js"
import { ProjectTable } from "../project/sql.js"
import type { SessionMessage } from "./message.js"
import type { SessionInbox } from "./inbox.js"
import type { Agent } from "@aicraft/schema/agent"
import type { FileDiff } from "@aicraft/schema/file-diff"
import type { Permission } from "@aicraft/schema/permission"
import type { Project } from "@aicraft/schema/project"
import type { SessionSchema } from "./schema.js"
import type { SessionStored } from "./stored.js"
import type { Workspace } from "@aicraft/schema/workspace"
import { Timestamps } from "../database/schema.sql.js"
import type { Instruction } from "@aicraft/schema/instruction"
import type { Session } from "@aicraft/schema/session"
import type { CompactionPayload, MovePayload, SyntheticPayload } from "@aicraft/schema/session-inbox"
import type { RevertV1 } from "@aicraft/schema/session-revert"
import type { Schema } from "effect"

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type SessionMessageData = DistributiveOmit<
  Exclude<(typeof SessionMessage.Info)["Encoded"], { readonly type: "user" }> | (typeof SessionStored.User)["Encoded"],
  "type" | "id"
>
export type SessionPartData = SessionMessage.AssistantContentEncoded

export const SessionTable = sqliteTable(
  "session_v2",
  {
    id: text().$type<SessionSchema.ID>().primaryKey(),
    project_id: text()
      .$type<Project.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    workspace_id: text().$type<Workspace.ID>(),
    parent_id: text().$type<SessionSchema.ID>(),
    /** Set when the `subagent` tool spawned this session as a child agent. */
    subagent: integer({ mode: "boolean" }),
    fork_session_id: text().$type<SessionSchema.ID>(),
    fork_boundary: text({ mode: "json" }).$type<Session.ForkBoundary>(),
    slug: text().notNull(),
    directory: directoryColumn().notNull(),
    path: pathColumn(),
    title: text(),
    version: text().notNull(),
    share_url: text(),
    summary_additions: integer(),
    summary_deletions: integer(),
    summary_files: integer(),
    summary_diffs: text({ mode: "json" }).$type<FileDiff.LegacyInfo[]>(),
    metadata: text({ mode: "json" }).$type<Session.Metadata>(),
    cost: real().notNull().default(0),
    tokens_input: integer().notNull().default(0),
    tokens_output: integer().notNull().default(0),
    tokens_reasoning: integer().notNull().default(0),
    tokens_cache_read: integer().notNull().default(0),
    tokens_cache_write: integer().notNull().default(0),
    /** Transcript statistics recorded as the Session runs; see SessionStatsRefresh. Null until first write. */
    stat_turns: integer(),
    stat_steps: integer(),
    stat_model_time: integer(),
    stat_tool_time: integer(),
    stat_output_tokens: integer(),
    stat_context_tokens: integer(),
    revert: text({ mode: "json" }).$type<Session.Revert | RevertV1>(),
    permission: text({ mode: "json" }).$type<Permission.Ruleset>(),
    prompt: text(),
    agent: text().$type<Agent.ID>(),
    model: text({ mode: "json" }).$type<{
      id: string
      providerID: string
      variant?: string
    }>(),
    ...Timestamps,
    time_busy: integer(),
    time_idle: integer(),
    time_viewed: integer(),
    idle_outcome: text().$type<NonNullable<Session.Info["outcome"]>>(),
    time_compacting: integer(),
    time_archived: integer(),
    time_pinned: integer(),
    /** The execution claim timestamp (historical column name; see SessionStore.claim). */
    time_suspended: integer(),
    resume_attempts: integer().notNull().default(0),
  },
  (table) => [
    index("session_v2_project_idx").on(table.project_id),
    index("session_v2_workspace_idx").on(table.workspace_id),
    index("session_v2_parent_idx").on(table.parent_id),
    index("session_v2_time_suspended_idx")
      .on(table.time_suspended)
      .where(sql`${table.time_suspended} is not null`),
  ],
)

export const SessionMessageTable = sqliteTable(
  "session_message",
  {
    id: text().$type<SessionMessage.ID>().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    type: text().$type<SessionMessage.Type>().notNull(),
    seq: integer().notNull(),
    ...Timestamps,
    data: text({ mode: "json" }).notNull().$type<SessionMessageData>(),
  },
  (table) => [
    uniqueIndex("session_message_session_seq_idx").on(table.session_id, table.seq),
    index("session_message_session_type_seq_idx").on(table.session_id, table.type, table.seq),
    index("session_message_session_time_created_id_idx").on(table.session_id, table.time_created, table.id),
    index("session_message_time_created_idx").on(table.time_created),
  ],
)

export const SessionPartTable = sqliteTable(
  "session_part",
  {
    message_id: text()
      .$type<SessionMessage.ID>()
      .notNull()
      .references(() => SessionMessageTable.id, { onDelete: "cascade" }),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    ordinal: integer().notNull(),
    type: text().$type<SessionMessage.AssistantContent["type"]>().notNull(),
    call_id: text(),
    ...Timestamps,
    data: text({ mode: "json" }).notNull().$type<SessionPartData>(),
  },
  (table) => [
    primaryKey({ columns: [table.message_id, table.ordinal] }),
    index("session_part_session_message_idx").on(table.session_id, table.message_id, table.ordinal),
  ],
)

/**
 * Patch bodies of a completed turn, keyed by the user message that opens the turn.
 * `SessionDiff.turn` reads this first so opening a turn never spawns git diff, and
 * backfills it on first computation.
 */
export const SessionTurnDiffTable = sqliteTable(
  "session_turn_diff",
  {
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    from_message_id: text()
      .$type<SessionMessage.ID>()
      .notNull(),
    ...Timestamps,
    data: text({ mode: "json" }).notNull().$type<readonly FileDiff.Info[]>(),
  },
  (table) => [primaryKey({ columns: [table.session_id, table.from_message_id] })],
)

export const SessionInboxTable = sqliteTable(
  "session_inbox",
  {
    id: text().$type<SessionMessage.ID>().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    type: text().$type<SessionInbox.Info["type"]>().notNull(),
    payload: text({ mode: "json" })
      .$type<SessionStored.UserPayload | SyntheticPayload | CompactionPayload | MovePayload>()
      .notNull(),
    delivery: text().$type<SessionInbox.Delivery>().notNull(),
    enqueued_seq: integer().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("session_inbox_session_delivery_seq_idx").on(table.session_id, table.delivery, table.enqueued_seq),
    uniqueIndex("session_inbox_session_enqueued_seq_idx").on(table.session_id, table.enqueued_seq),
  ],
)

export const InstructionEntryTable = sqliteTable(
  "instruction_entry",
  {
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    key: text().notNull(),
    value: text({ mode: "json" }).$type<Schema.Json>(),
    removed: integer({ mode: "boolean" }).notNull().default(false),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.session_id, table.key] })],
)

export const InstructionBlobTable = sqliteTable("instruction_blob", {
  hash: text().$type<Instruction.Hash>().primaryKey(),
  value: text({ mode: "json" }).$type<Schema.Json>(),
})

export const InstructionStateTable = sqliteTable("instruction_state", {
  session_id: text()
    .$type<SessionSchema.ID>()
    .primaryKey()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  epoch_start: integer().notNull(),
  through_seq: integer().notNull(),
  initial_values: text({ mode: "json" }).notNull().$type<Instruction.Values>(),
  current_values: text({ mode: "json" }).notNull().$type<Instruction.Values>(),
})

export const ContextSnapshotTable = sqliteTable("context_snapshot", {
  session_id: text()
    .$type<SessionSchema.ID>()
    .primaryKey()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  epoch: integer().notNull(),
  prefix_version: integer().notNull(),
  parent_version: integer(),
  bump_reason: text().notNull(),
  /** InstructionState epoch_start at build time: the snapshot invalidation key. */
  baseline_epoch: integer().notNull(),
  /** Agent switching is an explicit user action, so it is a second invalidation key. */
  agent_id: text().notNull(),
  /**
   * Catalog model (`provider/id`), the third invalidation key: the family prompt template resolves at
   * assembly time into the frozen L1 parts (P4), so a model switch must rebake. The model is itself a
   * provider-cache boundary, so the rebuild costs no cross-model cache the snapshot could have kept.
   */
  model_id: text().notNull().default(""),
  /** Set by a manual advance: the deferred rebuild fires on the next resolve (DESIGN.md §4). */
  pending_advance: integer({ mode: "boolean" })
    .notNull()
    .default(false),
  parts: text({ mode: "json" }).notNull().$type<{
    readonly parts: ReadonlyArray<{ readonly kind: "agent" | "identity" | "project" | "session"; readonly text: string }>
  }>(),
  /**
   * L2: the tool declarations frozen with the prefix. A snapshot hit replays these bytes, so a
   * registry change (plugin install/unload) cannot move the tools array inside an epoch; the
   * live registry still executes by name, and an unloaded tool answers unavailable.
   */
  tools: text({ mode: "json" })
    .notNull()
    .default("[]")
    .$type<ReadonlyArray<unknown>>(),
})

/**
 * Append-only archive of every snapshot version ever built. The live row in
 * context_snapshot only holds the newest generation, so the genealogy chain
 * "Epoch1{v1,v2} → Epoch2{v3}" and its break reasons stay traceable here (DESIGN.md §2).
 */
export const ContextLineageTable = sqliteTable(
  "context_lineage",
  {
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    epoch: integer().notNull(),
    prefix_version: integer().notNull(),
    parent_version: integer(),
    bump_reason: text().notNull(),
    ...Timestamps,
  },
  (table) => [uniqueIndex("context_lineage_session_prefix_version_idx").on(table.session_id, table.prefix_version)],
)

export const BlobTable = sqliteTable("blob", {
  hash: text().primaryKey(),
  mime: text().notNull(),
  bytes: integer().notNull(),
  width: integer(),
  height: integer(),
  data: blob({ mode: "buffer" }).notNull(),
  time_created: integer()
    .notNull()
    .$default(() => Date.now()),
})

export const BlobRefTable = sqliteTable(
  "blob_ref",
  {
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    message_id: text().$type<SessionMessage.ID>().notNull(),
    hash: text()
      .notNull()
      .references(() => BlobTable.hash, { onDelete: "cascade" }),
    seq: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.session_id, table.message_id, table.hash] }),
    index("blob_ref_hash_idx").on(table.hash),
    index("blob_ref_session_seq_idx").on(table.session_id, table.seq),
  ],
)
