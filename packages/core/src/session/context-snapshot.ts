export * as SessionContextSnapshot from "./context-snapshot.js"

import { eq } from "drizzle-orm"
import { bumpLineage, initialLineage } from "@aicraft/context"
import { ToolDefinition } from "@aicraft/ai/effect"
import { DateTime, Effect, Option, Schema } from "effect"
import type { Lineage } from "@aicraft/context"
import type { Database } from "../database/database.js"
import { SessionSchema } from "./schema.js"
import { ContextLineageTable, ContextSnapshotTable, InstructionBlobTable, InstructionStateTable, SessionTable } from "./sql.js"
import { SessionHistory } from "./history.js"
import { replays } from "./runner/to-llm-message.js"
import { Instructions } from "../instructions/index.js"
import { ModelIdentity } from "../instructions/model-identity.js"
import { ProjectInstructions } from "./project-instructions.js"
import type { SessionMessage } from "./message.js"

type DatabaseService = Database.Interface["db"]
type SnapshotRow = typeof ContextSnapshotTable.$inferSelect
/** The write surface the snapshot helpers need; a transaction handle satisfies it too. */
type Writer = Pick<DatabaseService, "insert" | "update">

/**
 * One source a Step reported for the request it sent, read back from the assistant message's
 * `metadata.context`. A source recorded before the audit carried a layer has none, and lands in L1
 * because the assembler only ever reported the frozen prefix then.
 */
const SentSource = Schema.Struct({
  key: Schema.String,
  layer: Schema.optionalKey(Schema.String),
  chars: Schema.Number,
  text: Schema.String,
  /** Per-record breakdown of the source, such as each memory a retrieval picked. */
  items: Schema.optionalKey(
    Schema.Array(Schema.Struct({ name: Schema.String, chars: Schema.Number, text: Schema.String })),
  ),
})
/**
 * The Step records its sources as `metadata.context`, which is the flat source array — not the
 * `{ context: { sources } }` envelope the system part carries internally. Decoding the envelope
 * against a stored message always failed, so every live layer read as empty.
 */
const SentContext = Schema.Struct({
  context: Schema.Array(SentSource),
})

/** One of the four volatile system-prefix segments captured at build time. */
export interface VolatilePart {
  readonly kind: "agent" | "identity" | "project" | "session"
  readonly text: string
}

export interface Resolved {
  readonly parts: ReadonlyArray<VolatilePart>
  /** L2 tool declarations frozen with the prefix (see `ContextSnapshotTable.tools`). */
  readonly tools: ReadonlyArray<ToolDefinition>
  readonly lineage: Lineage
  readonly rebuilt: boolean
}

export interface AdvanceResult {
  readonly lineage: Lineage
  readonly settled: ReadonlyArray<string>
  readonly rebuiltAt: "pending" | "not-needed"
}

interface ResolveInput {
  readonly sessionID: SessionSchema.ID
  readonly baselineEpoch: number
  readonly agentID: string
  /** Catalog model composite (`provider/id`): switching model rebakes the family-resolved agent part. */
  readonly modelID: string
  /** Live L2 declarations; adopted only when this resolve rebuilds the snapshot. */
  readonly tools: ReadonlyArray<ToolDefinition>
  readonly live: ReadonlyArray<VolatilePart>
  /**
   * The epoch instruction baseline, as `InstructionState.initial` rendered it. Frozen with the rest of
   * the prefix: a compaction rebakes it, which is the only time it changes.
   */
  readonly baseline?: ReadonlyArray<Instructions.Rendered>
}

const VolatilePartSchema = Schema.Struct({
  kind: Schema.Literals(["agent", "identity", "project", "session"]),
  text: Schema.String,
})
const StoredPartsSchema = Schema.Struct({
  parts: Schema.Array(VolatilePartSchema),
})
const StoredBaselineSchema = Schema.Struct({
  layer: Schema.String,
  kind: Schema.String,
  source: Schema.String,
  bytes: Schema.Number,
  text: Schema.String,
})
const BumpReasonSchema = Schema.Literals(["initial", "advance", "compaction"])

/**
 * Freezes the volatile system-prefix segments per session. While the invalidation keys
 * (instruction epoch baseline and agent) hold and no manual advance is pending, the stored
 * bytes are returned verbatim and `input.live` is ignored, keeping the prompt cache prefix
 * stable across steps. A pending advance is treated as a miss: the rebake deferred by
 * {@link advance} happens here, where the live parts are already in hand.
 */
export const resolve = Effect.fn("SessionContextSnapshot.resolve")(function* (
  db: DatabaseService,
  input: ResolveInput,
) {
  const row = yield* db
    .select()
    .from(ContextSnapshotTable)
    .where(eq(ContextSnapshotTable.session_id, input.sessionID))
    .get()
    .pipe(Effect.orDie)
  if (!row) {
    const lineage = initialLineage()
    yield* store(db, input, lineage)
    return { parts: input.live, tools: input.tools, lineage, rebuilt: true }
  }
  const stored = yield* requireLineage(row)
  if (
    row.baseline_epoch === input.baselineEpoch &&
    row.agent_id === input.agentID &&
    row.model_id === input.modelID &&
    !row.pending_advance &&
    // Rows migrated before tools were stored hold []; rebuilding once adopts the live set.
    (row.tools.length > 0 || input.tools.length === 0)
  )
    return {
      parts: yield* requireParts(row.parts),
      tools: yield* requireTools(row.tools),
      lineage: stored,
      rebuilt: false,
    }
  // A pending advance keeps the epoch key, so it joins the agent and model switches in the "advance" bucket.
  const lineage = bumpLineage(stored, row.baseline_epoch !== input.baselineEpoch ? "compaction" : "advance")
  yield* store(db, input, lineage)
  return { parts: input.live, tools: input.tools, lineage, rebuilt: true }
})

/**
 * Reads the stored snapshot, its genealogy and the live layer occupancy for the context panel.
 * Nothing here writes: a session without a snapshot reports `snapshot: null` instead of building one,
 * because opening a panel must never move the prompt prefix.
 *
 * Every layer reports the text it actually contributes to the request, so the panel can show the
 * assembly rather than a summary of it.
 */
export const inspect = Effect.fn("SessionContextSnapshot.inspect")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
) {
  const row = yield* db
    .select()
    .from(ContextSnapshotTable)
    .where(eq(ContextSnapshotTable.session_id, sessionID))
    .get()
    .pipe(Effect.orDie)
  const lineage = yield* db
    .select()
    .from(ContextLineageTable)
    .where(eq(ContextLineageTable.session_id, sessionID))
    .orderBy(ContextLineageTable.prefix_version)
    .all()
    .pipe(Effect.orDie)
  const state = yield* db
    .select()
    .from(InstructionStateTable)
    .where(eq(InstructionStateTable.session_id, sessionID))
    .get()
    .pipe(Effect.orDie)
  // L3: the durable transcript from the newest compaction on — the same rows the next request rewrites.
  const history = yield* SessionHistory.load(db, sessionID, "latest")
  // The debug replay flag changes what the model reads, so the L3 list has to follow it; a session row that
  // disappeared mid-inspect falls back to the default (no replay).
  const session = yield* db
    .select({ metadata: SessionTable.metadata })
    .from(SessionTable)
    .where(eq(SessionTable.id, sessionID))
    .get()
    .pipe(Effect.orDie)
  const replayed = SessionSchema.replayReasoning(session?.metadata ?? undefined)
  // L3 is grouped by the user message that opened the turn, and only rows that actually produce
  // request content are listed: these are the bytes the model reads, not the wider durable log.
  const turns = history
    .filter((message) => replays(message))
    .reduce<Array<{ id: string; label: string; started: number; messages: Array<{ type: string; id: string; text: string }> }>>(
      (groups, message) => {
        const entry = { type: message.type, id: message.id, text: messageText(message, replayed) }
        if (message.type === "user") {
          groups.push({
            id: message.id,
            label: message.text || `[${message.type}]`,
            started: DateTime.toEpochMillis(message.time.created),
            messages: [entry],
          })
          return groups
        }
        const current = groups.at(-1)
        // Rows before the first user message (a checkpoint, a system notice) form their own group.
        if (!current) {
          groups.push({ id: message.id, label: entry.text, started: DateTime.toEpochMillis(message.time.created), messages: [entry] })
          return groups
        }
        current.messages.push(entry)
        return groups
      },
      [],
    )
  // The last request that actually went out. Every system part and hook injection reported its
  // sources into the Step, so this is the real occupancy rather than a re-derivation of it.
  const sent = history.reduce<ReadonlyArray<typeof SentSource.Type>>((found, message) => {
    const decoded = Option.getOrUndefined(Schema.decodeUnknownOption(SentContext)(message.metadata))
    return decoded === undefined ? found : decoded.context
  }, [])
  return {
    snapshot: row
      ? {
          epoch: row.epoch,
          prefixVersion: row.prefix_version,
          parentVersion: row.parent_version ?? null,
          bumpReason: row.bump_reason,
          baselineEpoch: row.baseline_epoch,
          agentID: row.agent_id,
          modelID: row.model_id,
          pendingAdvance: row.pending_advance,
          layers: parts(row.parts),
          // The epoch baseline is L1 (and the codemode catalog L2) but never enters `parts`: those
          // four volatile segments are only the sections with no other frozen home. It is frozen
          // here at bake time instead of re-rendered on read, which would replay every instruction
          // source — MCP flush included — just to open a view.
          baseline: storedBaseline(row.baseline),
          tools: tools(row.tools),
        }
      : null,
    lineage: lineage.map((entry) => ({
      epoch: entry.epoch,
      prefixVersion: entry.prefix_version,
      parentVersion: entry.parent_version ?? null,
      bumpReason: entry.bump_reason,
      created: entry.time_created,
    })),
    history: [...turns].reverse(),
    // L4: the keys whose current value differs from the epoch baseline. The rendered notices need the
    // instruction sources, which the panel does not have; the diff is what the ledger would settle.
    // L4: the pending state declarations, keyed, with the value each source currently holds. The key
    // alone tells a reader that something changed without saying what, which is the one question the
    // panel exists to answer, so the current value is resolved from the instruction blob table.
    notice: state
      ? yield* Effect.forEach(
          [
            ...new Set([...Object.keys(state.initial_values), ...Object.keys(state.current_values)]),
          ].filter((key) => state.initial_values[key] !== state.current_values[key]),
          (key) => {
            const hash = state.current_values[key]
            if (hash === undefined)
              return Effect.succeed({ key, layer: "L4", text: "removed", bytes: 7 })
            return Effect.gen(function* () {
              const blob = yield* db
                .select({ value: InstructionBlobTable.value })
                .from(InstructionBlobTable)
                .where(eq(InstructionBlobTable.hash, hash))
                .get()
                .pipe(Effect.orDie)
              // A blob that no longer decodes is still a pending change; name the key without inventing text.
              const text = blob === undefined ? "unavailable" : String(blob.value)
              return { key, layer: "L4", text, bytes: encoder.encode(text).length }
            })
          },
        )
      : [],
    // L4–L8 occupancy of the last request that actually went out. Every source the assembler and the
    // context hook reported carries the layer that asked for its bytes, so the audit reads the real
    // request instead of re-deriving it: L4 notices, L5 dynamic facts and L6 memory were previously
    // indistinguishable from the frozen prefix. The frozen L1 segments already have a home in the
    // snapshot, so their keys are excluded here and only an L1 the snapshot never captured survives.
    dynamic: dynamic(
      sent,
      new Set([
        ...parts(row?.parts).map((part) => part.source),
        ...storedBaseline(row?.baseline).map((entry) => entry.source),
      ]),
    ),
  }
})

const encoder = new TextEncoder()

/** Mirrors `to-llm-message`: only an unfinished turn keeps its reasoning in the request. */
const NORMAL_FINISHES = new Set(["stop", "length", "tool-calls", "content-filter"])
const unfinishedTurn = (message: SessionMessage.Assistant) =>
  message.error !== undefined ||
  (message.finish === undefined ? message.time.completed === undefined : !NORMAL_FINISHES.has(message.finish))

/** Readable text of one durable message, for the panel's L3 list — the same bytes the model reads. */
const messageText = (message: SessionMessage.Info, replayReasoning: boolean): string => {
  if (message.type === "user" || message.type === "synthetic" || message.type === "skill" || message.type === "system")
    return message.text
  // A shell result reaches the model wrapped in this prompt, not as the bare command.
  if (message.type === "shell")
    return `The user ran the following shell command:\n\nCommand:\n${message.command}\n\nOutput:\n${message.output?.output ?? ""}`
  if (message.type === "assistant")
    return message.content
      .map((part) => {
        if (part.type === "tool") return toolText(part)
        // The debug replay keeps a completed turn's thinking too, which is the whole point of turning it on.
        if (part.type === "reasoning") return replayReasoning || unfinishedTurn(message) ? part.text : ""
        return part.text
      })
      .filter((text) => text !== "")
      .join("\n\n")
  // Compaction replays as the checkpoint block rather than a one-word label.
  if (message.type === "compaction") return message.status === "completed" ? message.summary : ""
  return ""
}

/**
 * One tool part as the model sees it: the call with its real input, then the real result or error.
 * Nothing is summarized — a label like "[tool shell completed]" would show the reader something the
 * model never receives.
 */
const toolText = (part: SessionMessage.AssistantTool): string => {
  const call = `Tool call: ${part.name}\n${JSON.stringify(part.state.status === "streaming" ? part.state.input : part.state.input, null, 2)}`
  if (part.executed !== true) return call
  if (part.state.status === "completed") {
    const content = part.state.content
      .map((item) => (item.type === "text" ? item.text : `[${item.type} ${item.uri ?? item.mime ?? ""}]`))
      .join("\n")
    return `${call}\n\nTool result:\n${content}`
  }
  if (part.state.status === "error") return `${call}\n\nTool error:\n${part.state.error.message}`
  return call
}

/**
 * The baseline frozen at bake time, in the shape the panel lists: only the L1/L2 entries, since a
 * source that declares another layer is reported by the live audit instead.
 */
const baselineRows = (rendered: ReadonlyArray<Instructions.Rendered> = []) =>
  rendered.flatMap((source) => {
    const layer = source.layer ?? "L1"
    if (layer !== "L1" && layer !== "L2") return []
    return [
      {
        layer,
        kind: "baseline",
        source: source.key,
        bytes: encoder.encode(source.text).length,
        text: source.text,
      },
    ]
  })

const decodeStoredBaseline = Schema.decodeUnknownOption(Schema.Array(StoredBaselineSchema))

const storedBaseline = (value: unknown) => Option.getOrUndefined(decodeStoredBaseline(value)) ?? []

/**
 * The request-audit source key of one frozen L1 segment. The panel and the Step's own audit have to
 * agree on the name for the same bytes, so this mapping lives beside the snapshot that stores the parts
 * rather than being re-derived per reader: the identity block is `core/model-identity`, never a
 * synthesized `core/identity`, and the project block reports its instruction key.
 */
export const partSourceKey = (kind: VolatilePart["kind"]) =>
  kind === "agent" ? "system" : kind === "project" ? ProjectInstructions.key : kind === "identity" ? ModelIdentity.key : "session"

/** L1 segments as the panel lists them. */
const parts = (value: unknown) =>
  Option.getOrUndefined(decodeStoredParts(value))?.parts.map((part) => ({
    layer: "L1",
    kind: part.kind,
    source: partSourceKey(part.kind),
    bytes: encoder.encode(part.text).length,
    text: part.text,
  })) ?? []

/** L2 declarations as the panel lists them: the advertised name and its serialized schema size. */
const tools = (value: unknown) =>
  Option.getOrUndefined(decodeStoredTools(value))?.map((tool) => ({
    name: tool.name,
    bytes: encoder.encode(JSON.stringify(tool.inputSchema)).length,
    source: "tool-registry",
  })) ?? []

/**
 * L4–L8 occupancy, folded per layer from the sources the last request reported. Grouping by
 * source key keeps a layer's rows stable across steps; a source with no layer predates the
 * audit and belongs to the frozen prefix, which is why it lands in L1.
 */
const dynamic = (sent: ReadonlyArray<typeof SentSource.Type>, frozen: ReadonlySet<string>) => {
  const groups = new Map<
    string,
    { layer: string; source: string; bytes: number; text: string; items: Map<string, { name: string; bytes: number; text: string }> }
  >()
  for (const entry of sent) {
    // Only a source that names its layer reaches the panel from here. A source without one predates the
    // audit and only ever reported the frozen prefix. An L1 key the snapshot already captured is skipped
    // too, because the panel lists that segment from the snapshot and counting it here would double its
    // bytes; an L1 the snapshot never captured (fixed harness text injected at request time, such as the
    // memory save rules) has no other home, so this is where a reader finds it.
    const layer = entry.layer
    if (layer === undefined || layer === "L2" || layer === "L3") continue
    if (layer === "L1" && frozen.has(entry.key)) continue
    const key = `${layer}\u0000${entry.key}`
    const found = groups.get(key)
    if (found === undefined) {
      const items = new Map<string, { name: string; bytes: number; text: string }>()
      for (const item of entry.items ?? [])
        items.set(item.name, { name: item.name, bytes: encoder.encode(item.text).length, text: item.text })
      groups.set(key, {
        layer,
        source: entry.key,
        bytes: encoder.encode(entry.text).length,
        text: entry.text,
        items,
      })
      continue
    }
    found.bytes += encoder.encode(entry.text).length
    found.text = found.text === entry.text ? found.text : `${found.text}\n\n${entry.text}`
    for (const item of entry.items ?? [])
      found.items.set(item.name, { name: item.name, bytes: encoder.encode(item.text).length, text: item.text })
  }
  return [...groups.values()].map((group) => ({
    layer: group.layer,
    source: group.source,
    bytes: group.bytes,
    text: group.text,
    // The per-record view, in the order the source reported it; an empty map stays absent so a
    // source without records keeps the wire shape it had.
    ...(group.items.size > 0 ? { items: [...group.items.values()] } : {}),
  }))
}

/**
 * Manual advance: the user explicitly commits the pending instruction changes. Settles the
 * ledger (`initial_values = current_values`) without touching `epoch_start` — the dual-clock
 * split from compaction — then flags the stored snapshot so the rebake happens on the next
 * resolve, where the live parts are already in hand. The returned lineage is a preview: the
 * stored row is left unbumped, so the deferred rebuild writes exactly these coordinates.
 */
export const advance = Effect.fn("SessionContextSnapshot.advance")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
) {
  return yield* db
    .transaction((tx) =>
      Effect.gen(function* () {
        const state = yield* tx
          .select()
          .from(InstructionStateTable)
          .where(eq(InstructionStateTable.session_id, sessionID))
          .get()
          .pipe(Effect.orDie)
        const settled = yield* settleLedger(tx, sessionID, state)
        const row = yield* tx
          .select()
          .from(ContextSnapshotTable)
          .where(eq(ContextSnapshotTable.session_id, sessionID))
          .get()
          .pipe(Effect.orDie)
        // Without a snapshot there is nothing to flag: the next resolve builds a fresh
        // initial lineage lazily anyway, so the advance needs no rebuild of its own.
        if (!row) return { lineage: initialLineage(), settled, rebuiltAt: "not-needed" } satisfies AdvanceResult
        yield* tx
          .update(ContextSnapshotTable)
          .set({ pending_advance: true })
          .where(eq(ContextSnapshotTable.session_id, sessionID))
          .run()
          .pipe(Effect.orDie)
        return {
          lineage: bumpLineage(yield* requireLineage(row), "advance"),
          settled,
          rebuiltAt: "pending",
        } satisfies AdvanceResult
      }),
    )
    .pipe(Effect.orDie)
})

/**
 * Net per-key diff between the epoch baseline and the current values — the keys the
 * advance takes effect on — then rewrites the baseline to current. `epoch_start` stays.
 */
const settleLedger = Effect.fnUntraced(function* (
  db: Writer,
  sessionID: SessionSchema.ID,
  state: typeof InstructionStateTable.$inferSelect | undefined,
) {
  if (!state) return []
  const settled = [
    ...new Set([...Object.keys(state.initial_values), ...Object.keys(state.current_values)]),
  ].filter((key) => state.initial_values[key] !== state.current_values[key])
  yield* db
    .update(InstructionStateTable)
    .set({ initial_values: state.current_values })
    .where(eq(InstructionStateTable.session_id, sessionID))
    .run()
    .pipe(Effect.orDie)
  return settled
})

const store = Effect.fnUntraced(function* (db: Writer, input: ResolveInput, lineage: Lineage) {
  const parts = yield* requireLive(input.live)
  const values = {
    epoch: lineage.epoch,
    prefix_version: lineage.prefixVersion,
    parent_version: lineage.parentVersion ?? null,
    bump_reason: lineage.bumpReason,
    baseline_epoch: input.baselineEpoch,
    agent_id: input.agentID,
    model_id: input.modelID,
    // Writing the rebake is what consumes a pending advance flag.
    pending_advance: false,
    parts: { parts },
    tools: input.tools,
    baseline: baselineRows(input.baseline ?? []),
  }
  yield* db
    .insert(ContextSnapshotTable)
    .values({ session_id: input.sessionID, ...values })
    .onConflictDoUpdate({ target: ContextSnapshotTable.session_id, set: values })
    .run()
    .pipe(Effect.orDie)
  // Genealogy archive (DESIGN.md §2): keep every version, not just the live row.
  // onConflictDoNothing makes a replayed write idempotent instead of forking the chain.
  yield* db
    .insert(ContextLineageTable)
    .values({
      session_id: input.sessionID,
      epoch: lineage.epoch,
      prefix_version: lineage.prefixVersion,
      parent_version: lineage.parentVersion ?? null,
      bump_reason: lineage.bumpReason,
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
})

const decodeStoredParts = Schema.decodeUnknownOption(StoredPartsSchema)
const decodeStoredTools = Schema.decodeUnknownOption(Schema.Array(ToolDefinition))
const decodeBumpReason = Schema.decodeUnknownOption(BumpReasonSchema)
const decodeLiveParts = Schema.decodeUnknownOption(Schema.Array(VolatilePartSchema))

const requireLineage = (row: SnapshotRow) =>
  Effect.gen(function* () {
    return {
      epoch: row.epoch,
      prefixVersion: row.prefix_version,
      parentVersion: row.parent_version ?? undefined,
      bumpReason: yield* orDie("bump_reason", decodeBumpReason(row.bump_reason), row.bump_reason),
    } satisfies Lineage
  })

const requireParts = (value: unknown) =>
  Effect.gen(function* () {
    return (yield* orDie("parts", decodeStoredParts(value), value)).parts
  })

const requireTools = (value: unknown) =>
  Effect.gen(function* () {
    return yield* orDie("tools", decodeStoredTools(value), value)
  })

const requireLive = (live: ReadonlyArray<VolatilePart>) =>
  Effect.gen(function* () {
    return yield* orDie("live parts", decodeLiveParts(live), live)
  })

function orDie<A>(label: string, decoded: Option.Option<A>, value: unknown) {
  return Effect.gen(function* () {
    if (Option.isSome(decoded)) return decoded.value
    return yield* Effect.die(new Error(`Corrupt context snapshot ${label}: ${JSON.stringify(value)}`))
  })
}
