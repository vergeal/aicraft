import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Bus } from "@aicraft/core/bus"
import { Database } from "@aicraft/core/database/database"
import { AppNodeBuilder } from "@aicraft/core/effect/app-node-builder"
import { InstructionDiscovery } from "@aicraft/core/instruction-discovery"
import { Instructions } from "@aicraft/core/instructions/index"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { Project } from "@aicraft/core/project"
import { ProjectTable } from "@aicraft/core/project/sql"
import { AbsolutePath } from "@aicraft/core/schema"
import { InstructionState } from "@aicraft/core/session/instruction-state"
import { SessionProjector } from "@aicraft/core/session/projector"
import { SessionSchema } from "@aicraft/core/session/schema"
import { SessionTable } from "@aicraft/core/session/sql"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, Bus.node, SessionProjector.node, InstructionDiscovery.node]), [
    Bus.node.replace(Bus.configured({ persist: true })),
  ]),
)

const source = (name: string, read: Effect.Effect<string | Instructions.Removed>) =>
  Instructions.make({
    key: Instructions.Key.make(name),
    codec: Schema.toCodecJson(Schema.String),
    read,
    render: {
      initial: (value) => `${name} initial ${value}`,
      changed: (previous, current) => `${name} changed ${previous} -> ${current}`,
      removed: (previous) => `${name} removed ${previous}`,
    },
  })

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
        slug: "context-l4-test",
        directory: "/project",
        title: "Context L4 test",
        version: "test",
      })
      .run()
      .pipe(Effect.orDie)
    return { db, events: yield* Bus.Service }
  })

describe("InstructionState.notices (L4)", () => {
  it.effect("stays empty while the current values match the baseline", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_l4_unchanged")
      const { db, events } = yield* setup(sessionID)
      const instructions = source("test/alpha", Effect.succeed("one"))
      yield* InstructionState.prepare(db, events, instructions, sessionID)

      expect(yield* InstructionState.notices(db, sessionID, instructions)).toEqual([])
    }),
  )

  it.effect("renders an added key with the source's initial renderer", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_l4_added")
      const { db, events } = yield* setup(sessionID)
      let beta: string | Instructions.Removed = Instructions.removed
      const alpha = source("test/alpha", Effect.succeed("one"))
      const added = source(
        "test/beta",
        Effect.sync(() => beta),
      )
      yield* InstructionState.prepare(db, events, Instructions.combine([alpha, added]), sessionID)

      beta = "two"
      yield* InstructionState.prepare(db, events, Instructions.combine([alpha, added]), sessionID)

      expect(yield* InstructionState.notices(db, sessionID, Instructions.combine([alpha, added]))).toEqual([
        { key: Instructions.Key.make("test/beta"), layer: "L4" as const, text: "test/beta initial two" },
      ])
    }),
  )

  it.effect("renders a changed key with the source's changed renderer", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_l4_changed")
      const { db, events } = yield* setup(sessionID)
      let alpha = "one"
      const instructions = source(
        "test/alpha",
        Effect.sync(() => alpha),
      )
      yield* InstructionState.prepare(db, events, instructions, sessionID)

      alpha = "three"
      yield* InstructionState.prepare(db, events, instructions, sessionID)

      expect(yield* InstructionState.notices(db, sessionID, instructions)).toEqual([
        { key: Instructions.Key.make("test/alpha"), layer: "L4" as const, text: "test/alpha changed one -> three" },
      ])
    }),
  )

  it.effect("renders a removed key with the source's removed renderer", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_l4_removed")
      const { db, events } = yield* setup(sessionID)
      let alpha: string | Instructions.Removed = "one"
      const instructions = source(
        "test/alpha",
        Effect.sync(() => alpha),
      )
      yield* InstructionState.prepare(db, events, instructions, sessionID)

      alpha = Instructions.removed
      yield* InstructionState.prepare(db, events, instructions, sessionID)

      expect(yield* InstructionState.notices(db, sessionID, instructions)).toEqual([
        { key: Instructions.Key.make("test/alpha"), layer: "L4" as const, text: "test/alpha removed one" },
      ])
    }),
  )

  it.effect("vanishes when a value is edited back to the baseline", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_l4_reverted")
      const { db, events } = yield* setup(sessionID)
      let alpha = "one"
      const instructions = source(
        "test/alpha",
        Effect.sync(() => alpha),
      )
      yield* InstructionState.prepare(db, events, instructions, sessionID)
      alpha = "three"
      yield* InstructionState.prepare(db, events, instructions, sessionID)
      expect(yield* InstructionState.notices(db, sessionID, instructions)).toHaveLength(1)

      alpha = "one"
      yield* InstructionState.prepare(db, events, instructions, sessionID)

      expect(yield* InstructionState.notices(db, sessionID, instructions)).toEqual([])
    }),
  )

  it.effect("settles a v2 -> v3 -> v2 flap to one latest-state notice", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_l4_flapping")
      const { db, events } = yield* setup(sessionID)
      let alpha = "one"
      const instructions = source(
        "test/alpha",
        Effect.sync(() => alpha),
      )
      yield* InstructionState.prepare(db, events, instructions, sessionID)

      for (const next of ["two", "three", "two"] as const) {
        alpha = next
        yield* InstructionState.prepare(db, events, instructions, sessionID)
      }

      // Replacing, never appending: the intermediate v3 narrative is gone and the
      // settled notice restates the net baseline-to-current change only once.
      expect(yield* InstructionState.notices(db, sessionID, instructions)).toEqual([
        { key: Instructions.Key.make("test/alpha"), layer: "L4" as const, text: "test/alpha changed one -> two" },
      ])
    }),
  )
})
