import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { initialLineage } from "@aicraft/context"
import { Database } from "@aicraft/core/database/database"
import { AppNodeBuilder } from "@aicraft/core/effect/app-node-builder"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { Project } from "@aicraft/core/project"
import { ProjectTable } from "@aicraft/core/project/sql"
import { AbsolutePath } from "@aicraft/core/schema"
import { Instructions } from "@aicraft/core/instructions/index"
import { InstructionState } from "@aicraft/core/session/instruction-state"
import { SessionContextSnapshot } from "@aicraft/core/session/context-snapshot"
import { SessionSchema } from "@aicraft/core/session/schema"
import { ContextSnapshotTable, SessionMessageTable, SessionTable } from "@aicraft/core/session/sql"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node])))

const setup = (sessionID: SessionSchema.ID) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    yield* db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: Project.ID.global,
        slug: "context-snapshot-test",
        directory: "/project",
        title: "Context snapshot test",
        version: "test",
      })
      .run()
      .pipe(Effect.orDie)
    return { db }
  })

const live = (project: string) => [
  { kind: "agent", text: "agent system" },
  { kind: "project", text: project },
  { kind: "session", text: "session prompt" },
] as const satisfies ReadonlyArray<SessionContextSnapshot.VolatilePart>

describe("SessionContextSnapshot", () => {
  it.effect("builds the initial snapshot from the live parts", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_snapshot_initial")
      const { db } = yield* setup(sessionID)
      const parts = live("project instructions")

      const resolved = yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 0, modelID: "test/test-model",
        agentID: "build",
        tools: [],
        live: parts,
      })

      expect(resolved.rebuilt).toBe(true)
      expect(resolved.parts).toEqual(parts)
      expect(resolved.lineage).toEqual(initialLineage())
    }),
  )

  it.effect("freezes the stored prefix while the invalidation keys hold", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_snapshot_frozen")
      const { db } = yield* setup(sessionID)
      const original = live("project instructions")
      yield* SessionContextSnapshot.resolve(db, { sessionID, baselineEpoch: 0, modelID: "test/test-model", agentID: "build", tools: [], live: original })

      const resolved = yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 0, modelID: "test/test-model",
        agentID: "build",
        tools: [],
        live: live("changed project instructions"),
      })

      expect(resolved.rebuilt).toBe(false)
      // The prefix is byte-identical to the first stored build; the live input is ignored.
      expect(resolved.parts).toEqual(original)
      expect(resolved.lineage).toEqual(initialLineage())
    }),
  )

  it.effect("treats an epoch bump as compaction and rebuilds", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_snapshot_compaction")
      const { db } = yield* setup(sessionID)
      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 0, modelID: "test/test-model",
        agentID: "build",
        tools: [],
        live: live("project instructions"),
      })
      const rebuilt = live("post-compaction instructions")

      const resolved = yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 1, modelID: "test/test-model",
        agentID: "build",
        tools: [],
        live: rebuilt,
      })

      expect(resolved.rebuilt).toBe(true)
      expect(resolved.parts).toEqual(rebuilt)
      expect(resolved.lineage).toEqual({ epoch: 2, prefixVersion: 2, parentVersion: 1, bumpReason: "compaction" })
    }),
  )

  it.effect("treats an agent switch as an advance without an epoch bump", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_snapshot_agent_switch")
      const { db } = yield* setup(sessionID)
      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 0, modelID: "test/test-model",
        agentID: "build",
        tools: [],
        live: live("project instructions"),
      })
      const switched = live("same project instructions")

      const resolved = yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 0, modelID: "test/test-model",
        agentID: "plan",
        tools: [],
        live: switched,
      })

      expect(resolved.rebuilt).toBe(true)
      expect(resolved.parts).toEqual(switched)
      expect(resolved.lineage).toEqual({ epoch: 1, prefixVersion: 2, parentVersion: 1, bumpReason: "advance" })
    }),
  )

  it.effect("round-trips volatile text byte for byte through the JSON column", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_snapshot_fidelity")
      const { db } = yield* setup(sessionID)
      const awkward = `quotes "and" 'more'\n\ttabs, emoji 🚀😀 and a very long tail `.repeat(8)
      const parts = [
        { kind: "agent", text: awkward },
        { kind: "project", text: `backslash \\ path ${'"nested \\"quotes\\"'} 🔚` },
        { kind: "session", text: "行内换行\n第二行 🥲" },
      ] as const satisfies ReadonlyArray<SessionContextSnapshot.VolatilePart>

      yield* SessionContextSnapshot.resolve(db, { sessionID, baselineEpoch: 0, modelID: "test/test-model", agentID: "build", tools: [], live: parts })
      const resolved = yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 0, modelID: "test/test-model",
        agentID: "build",
        tools: [],
        live: [],
      })

      expect(resolved.rebuilt).toBe(false)
      expect(JSON.stringify(resolved.parts)).toBe(JSON.stringify(parts))
      const row = yield* db.select().from(ContextSnapshotTable).get().pipe(Effect.orDie)
      expect(JSON.stringify(row?.parts.parts)).toBe(JSON.stringify(parts))
    }),
  )

  it.effect("reads the live layers from the flat source array a Step stores", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_snapshot_sent_sources")
      const { db } = yield* setup(sessionID)
      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 0,
        modelID: "test/test-model",
        agentID: "build",
        tools: [],
        live: live("project instructions"),
      })
      // The Step writes `metadata.context` as the bare source array. Reading it as an envelope
      // silently decoded to nothing, which zeroed every live layer in the panel.
      yield* db
        .insert(SessionMessageTable)
        .values({
          id: "msg_sent",
          session_id: sessionID,
          type: "assistant",
          seq: 1,
          time_created: 1,
          time_updated: 1,
          data: {
            id: "msg_sent",
            type: "assistant",
            agent: "build",
            model: { providerID: "test", id: "test-model" },
            content: [],
            time: { created: 1, completed: 2 },
            metadata: {
              context: [
                { key: "core/memory", layer: "L6", chars: 5, text: "hello" },
                { key: "memory/protocol", layer: "L8", chars: 3, text: "abc" },
              ],
            },
          },
        } as never)
        .run()
        .pipe(Effect.orDie)

      const inspected = yield* SessionContextSnapshot.inspect(db, sessionID)
      expect(inspected.dynamic).toEqual([
        { layer: "L6", source: "core/memory", bytes: 5, text: "hello" },
        { layer: "L8", source: "memory/protocol", bytes: 3, text: "abc" },
      ])
    }),
  )

  it.effect("lists the epoch baseline as L1 and L2 rows beside the volatile parts", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_snapshot_baseline_rows")
      const { db } = yield* setup(sessionID)
      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 0,
        modelID: "test/test-model",
        agentID: "build",
        tools: [],
        live: live("project instructions"),
      })

      // The baseline is the content a compaction rebakes. It has no volatile part to live in, so the
      // panel can only see it if `inspect` reports it; listing `parts` alone showed L1 as two rows.
      const rendered = (key: string, layer: "L1" | "L2" | "L5", text: string) => ({
        key: Instructions.Key.make(key),
        layer,
        text,
      })
      const inspected = yield* SessionContextSnapshot.inspect(db, sessionID, [
        rendered("core/instructions", "L1", "project rules"),
        rendered("core/codemode", "L2", "catalog"),
        rendered("core/environment", "L5", "env"),
      ])

      expect(inspected.snapshot?.baseline.map((row) => [row.layer, row.source, row.bytes, row.text])).toEqual([
        ["L1", "core/instructions", 13, "project rules"],
        ["L2", "core/codemode", 7, "catalog"],
      ])
      // The volatile parts are still reported separately from the baseline.
      expect(inspected.snapshot?.layers.map((part) => part.kind)).toEqual(["agent", "project", "session"])
    }),
  )

  it.effect("reports the instruction epoch baseline", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_snapshot_epoch_of")
      const { db } = yield* setup(sessionID)

      expect(yield* InstructionState.epochOf(db, sessionID)).toBeUndefined()
      yield* InstructionState.initialize(db, sessionID, 5, {})

      expect(yield* InstructionState.epochOf(db, sessionID)).toBe(5)
    }),
  )
})
