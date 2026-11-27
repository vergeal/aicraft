import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { initialLineage } from "@aicraft/context"
import { Instructions } from "@aicraft/core/instructions/index"
import { Database } from "@aicraft/core/database/database"
import { AppNodeBuilder } from "@aicraft/core/effect/app-node-builder"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { Project } from "@aicraft/core/project"
import { ProjectTable } from "@aicraft/core/project/sql"
import { AbsolutePath } from "@aicraft/core/schema"
import { InstructionState } from "@aicraft/core/session/instruction-state"
import { SessionContextSnapshot } from "@aicraft/core/session/context-snapshot"
import { SessionSchema } from "@aicraft/core/session/schema"
import {
  ContextLineageTable,
  ContextSnapshotTable,
  InstructionStateTable,
  SessionTable,
} from "@aicraft/core/session/sql"
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
        slug: "context-lineage-test",
        directory: "/project",
        title: "Context lineage test",
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

const archived = (db: Database.Interface["db"], sessionID: SessionSchema.ID) =>
  db
    .select()
    .from(ContextLineageTable)
    .where(eq(ContextLineageTable.session_id, sessionID))
    .orderBy(ContextLineageTable.prefix_version)
    .all()
    .pipe(Effect.orDie)

const snapshotRow = (db: Database.Interface["db"], sessionID: SessionSchema.ID) =>
  db
    .select()
    .from(ContextSnapshotTable)
    .where(eq(ContextSnapshotTable.session_id, sessionID))
    .get()
    .pipe(Effect.orDie)

describe("SessionContextSnapshot lineage archive", () => {
  it.effect("archives every rebuilt version as a traceable genealogy chain", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_lineage_chain")
      const { db } = yield* setup(sessionID)

      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 0,
        agentID: "build",
        live: live("project instructions"),
      })
      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 0,
        agentID: "plan",
        live: live("planning instructions"),
      })
      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 1,
        agentID: "plan",
        live: live("post-compaction instructions"),
      })

      const rows = yield* archived(db, sessionID)
      expect(
        rows.map((row) => ({
          epoch: row.epoch,
          prefix_version: row.prefix_version,
          parent_version: row.parent_version,
          bump_reason: row.bump_reason,
        })),
      ).toEqual([
        { epoch: 1, prefix_version: 1, parent_version: null, bump_reason: "initial" },
        { epoch: 1, prefix_version: 2, parent_version: 1, bump_reason: "advance" },
        { epoch: 2, prefix_version: 3, parent_version: 2, bump_reason: "compaction" },
      ])
    }),
  )

  it.effect("advance only flags the row and the next resolve rebakes at the previewed lineage", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_lineage_deferred")
      const { db } = yield* setup(sessionID)
      yield* InstructionState.initialize(db, sessionID, 5, {})
      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 5,
        agentID: "build",
        live: live("project instructions"),
      })
      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 5,
        agentID: "plan",
        live: live("planning instructions"),
      })

      const advanced = yield* SessionContextSnapshot.advance(db, sessionID)
      expect(advanced.lineage).toEqual({ epoch: 1, prefixVersion: 3, parentVersion: 2, bumpReason: "advance" })
      expect(advanced.settled).toEqual([])
      expect(advanced.rebuiltAt).toBe("pending")

      // The advance itself rebakes nothing: the stored row still sits at v2, only flagged.
      const flagged = yield* snapshotRow(db, sessionID)
      expect(flagged?.prefix_version).toBe(2)
      expect(flagged?.pending_advance).toBe(true)
      expect((yield* archived(db, sessionID)).map((row) => row.prefix_version)).toEqual([1, 2])

      const parts = live("refreshed instructions")
      const resolved = yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 5,
        agentID: "plan",
        live: parts,
      })
      expect(resolved.rebuilt).toBe(true)
      expect(resolved.parts).toEqual(parts)
      // The deferred rebuild lands exactly on the previewed coordinates.
      expect(resolved.lineage).toEqual(advanced.lineage)

      const rebuilt = yield* snapshotRow(db, sessionID)
      expect(rebuilt?.epoch).toBe(1)
      expect(rebuilt?.prefix_version).toBe(3)
      expect(rebuilt?.parent_version).toBe(2)
      expect(rebuilt?.bump_reason).toBe("advance")
      // The instruction epoch baseline is untouched: the ledger settled, the epoch did not.
      expect(rebuilt?.baseline_epoch).toBe(5)
      expect(rebuilt?.pending_advance).toBe(false)
      expect(rebuilt?.parts.parts).toEqual(parts)
      expect((yield* archived(db, sessionID)).map((row) => row.prefix_version)).toEqual([1, 2, 3])
    }),
  )

  it.effect("freezes again after the pending rebuild so later resolves stay cache-stable", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_lineage_refreeze")
      const { db } = yield* setup(sessionID)
      yield* InstructionState.initialize(db, sessionID, 5, {})
      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 5,
        agentID: "build",
        live: live("project instructions"),
      })

      yield* SessionContextSnapshot.advance(db, sessionID)
      const parts = live("refreshed instructions")
      const rebuilt = yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 5,
        agentID: "build",
        live: parts,
      })
      expect(rebuilt.rebuilt).toBe(true)

      // With the flag consumed, the rebaked bytes freeze: the L4 notice ledger was settled
      // by the advance, so nothing asks for another rebuild.
      const frozen = yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 5,
        agentID: "build",
        live: live("changed again"),
      })
      expect(frozen.rebuilt).toBe(false)
      expect(frozen.parts).toEqual(parts)
      expect(frozen.lineage).toEqual({ epoch: 1, prefixVersion: 2, parentVersion: 1, bumpReason: "advance" })
    }),
  )

  it.effect("settles the instruction ledger to the current values", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_lineage_settle")
      const { db } = yield* setup(sessionID)
      yield* db
        .insert(InstructionStateTable)
        .values({
          session_id: sessionID,
          epoch_start: 7,
          through_seq: 9,
          initial_values: { a: Instructions.hash("h1"), c: Instructions.hash("h0") },
          current_values: { a: Instructions.hash("h2"), b: Instructions.hash("h3"), c: Instructions.hash("h0") },
        })
        .run()
        .pipe(Effect.orDie)

      const result = yield* SessionContextSnapshot.advance(db, sessionID)
      // "c" nets to zero (baseline equals current), so it never settles.
      expect(result.settled).toEqual(["a", "b"])

      const state = yield* db
        .select()
        .from(InstructionStateTable)
        .where(eq(InstructionStateTable.session_id, sessionID))
        .get()
        .pipe(Effect.orDie)
      expect(state?.initial_values).toEqual({
        a: Instructions.hash("h2"),
        b: Instructions.hash("h3"),
        c: Instructions.hash("h0"),
      })
      expect(state?.epoch_start).toBe(7)
      expect(state?.through_seq).toBe(9)
    }),
  )

  it.effect("advancing a session without a snapshot needs no rebuild and the first resolve builds v1", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_lineage_bare")
      const { db } = yield* setup(sessionID)
      yield* db
        .insert(InstructionStateTable)
        .values({
          session_id: sessionID,
          epoch_start: 4,
          through_seq: 6,
          initial_values: { a: Instructions.hash("h1") },
          current_values: { a: Instructions.hash("h2") },
        })
        .run()
        .pipe(Effect.orDie)

      const advanced = yield* SessionContextSnapshot.advance(db, sessionID)
      // Nothing is stored yet: genesis lineage, ledger settled, no flag to set.
      expect(advanced).toEqual({ lineage: initialLineage(), settled: ["a"], rebuiltAt: "not-needed" })
      expect(yield* snapshotRow(db, sessionID)).toBeUndefined()
      expect(yield* archived(db, sessionID)).toHaveLength(0)

      const parts = live("first instructions")
      const resolved = yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 4,
        agentID: "build",
        live: parts,
      })
      expect(resolved.rebuilt).toBe(true)
      expect(resolved.lineage).toEqual(initialLineage())
      expect(resolved.parts).toEqual(parts)
      const rows = yield* archived(db, sessionID)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ epoch: 1, prefix_version: 1, parent_version: null, bump_reason: "initial" })
    }),
  )

  it.effect("two back-to-back advances stay idempotent on the flag and rebake exactly once", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_lineage_double")
      const { db } = yield* setup(sessionID)
      yield* InstructionState.initialize(db, sessionID, 2, {})
      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 2,
        agentID: "build",
        live: live("project instructions"),
      })
      yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 2,
        agentID: "plan",
        live: live("planning instructions"),
      })

      const first = yield* SessionContextSnapshot.advance(db, sessionID)
      const second = yield* SessionContextSnapshot.advance(db, sessionID)
      // Because the stored row is only flagged, never bumped, the second preview recomputes
      // from the same v2 line: both advances preview v3. The user pressing twice collapses
      // into a single break, which is exactly what the pending flag is for.
      expect(first.lineage).toEqual(second.lineage)
      expect(second.lineage).toEqual({ epoch: 1, prefixVersion: 3, parentVersion: 2, bumpReason: "advance" })
      expect(first.rebuiltAt).toBe("pending")
      expect(second.rebuiltAt).toBe("pending")

      const flagged = yield* snapshotRow(db, sessionID)
      expect(flagged?.prefix_version).toBe(2)
      expect(flagged?.pending_advance).toBe(true)

      const resolved = yield* SessionContextSnapshot.resolve(db, {
        sessionID,
        baselineEpoch: 2,
        agentID: "plan",
        live: live("refreshed instructions"),
      })
      expect(resolved.rebuilt).toBe(true)
      expect(resolved.lineage).toEqual(second.lineage)
      // One rebuild for two advances: the archive shows a single v3 break.
      expect((yield* archived(db, sessionID)).map((row) => row.prefix_version)).toEqual([1, 2, 3])
    }),
  )
})
