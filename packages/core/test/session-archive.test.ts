import { describe, expect } from "bun:test"
import { Bus } from "@aicraft/core/bus"
import { Database } from "@aicraft/core/database/database"
import { AppNodeBuilder } from "@aicraft/core/effect/app-node-builder"
import { EventTable } from "@aicraft/core/event/sql"
import { Location } from "@aicraft/core/location"
import { Project } from "@aicraft/core/project"
import { AbsolutePath } from "@aicraft/core/schema"
import { Session } from "@aicraft/core/session"
import { SessionEvent } from "@aicraft/core/session/event"
import { SessionExecution } from "@aicraft/core/session/execution"
import { SessionProjector } from "@aicraft/core/session/projector"
import { SessionStore } from "@aicraft/core/session/store"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { SessionModelTransport } from "@aicraft/core/session/model-transport"
import { testEffect } from "./lib/effect"
import { globalProjectNode } from "./lib/project"

const running = new Set<Session.ID>()
const interrupted: Array<{ sessionID: Session.ID; resume?: boolean }> = []
const idled: Session.ID[] = []
// Archive must stop the run without asking for it back: `resume` is what the Stop button sets, and a sealed session
// has to stay sealed.
const execution = Layer.succeed(
  SessionExecution.Service,
  SessionExecution.Service.of({
    active: Effect.sync(() => new Set(running)),
    isActive: (sessionID) => Effect.sync(() => running.has(sessionID)),
    resume: (sessionID) =>
      Effect.sync(() => {
        running.add(sessionID)
      }),
    interrupt: (sessionID, options) =>
      Effect.sync(() => {
        interrupted.push({ sessionID, resume: options?.resume })
        return running.delete(sessionID)
      }),
    wake: (sessionID) =>
      Effect.sync(() => {
        running.add(sessionID)
      }),
    awaitIdle: (sessionID) => Effect.sync(() => idled.push(sessionID)),
  }),
)
const closed: Session.ID[] = []
const transport = Layer.succeed(
  SessionModelTransport.Service,
  SessionModelTransport.Service.of({
    bind: () => ({ execute: () => Effect.die("Unexpected WebSocket execution") }),
    close: (sessionID) => Effect.sync(() => closed.push(sessionID)),
    closeAll: Effect.void,
  }),
)

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, Bus.node, SessionProjector.node, SessionStore.node, Session.node]),
    [
      Bus.node.replace(Bus.configured({ persist: true })),
      Project.node.replace(globalProjectNode),
      SessionExecution.node.replace(execution),
      SessionModelTransport.node.replace(transport),
    ],
  ),
)
const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })

describe("Session.archive", () => {
  it.effect("archives and unarchives through one durable event each", () =>
    Effect.gen(function* () {
      const session = yield* Session.Service
      const { db } = yield* Database.Service
      const created = yield* session.create({ location })
      expect(created.time.archived).toBeUndefined()

      yield* session.archive(created.id)
      yield* session.archive(created.id)
      expect((yield* session.get(created.id)).time.archived).toBeDefined()

      yield* session.unarchive(created.id)
      yield* session.unarchive(created.id)
      expect((yield* session.get(created.id)).time.archived).toBeUndefined()

      const types = (yield* db
        .select({ type: EventTable.type })
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, created.id))
        .all()).map((event) => event.type)
      expect(types.filter((type) => type === Bus.versionedType(SessionEvent.Archived.type, 1))).toHaveLength(1)
      expect(types.filter((type) => type === Bus.versionedType(SessionEvent.Unarchived.type, 1))).toHaveLength(1)
    }),
  )

  it.effect("filters listed sessions by archive state", () =>
    Effect.gen(function* () {
      const session = yield* Session.Service
      const active = yield* session.create({ location })
      const archived = yield* session.create({ location })
      yield* session.archive(archived.id)

      const ids = (input?: Session.ListInput) =>
        session.list(input).pipe(Effect.map((page) => page.data.map((item) => item.id).toSorted()))
      expect(yield* ids()).toEqual([active.id, archived.id].toSorted())
      expect(yield* ids({ archived: false })).toEqual([active.id])
      expect(yield* ids({ archived: true })).toEqual([archived.id])
    }),
  )

  it.effect("interrupts the running call and seals the session against new input", () =>
    Effect.gen(function* () {
      const session = yield* Session.Service
      const created = yield* session.create({ location })
      interrupted.length = 0
      idled.length = 0
      closed.length = 0

      yield* session.archive(created.id)

      expect(interrupted).toEqual([{ sessionID: created.id, resume: undefined }])
      expect(idled).toEqual([created.id])
      expect(closed).toEqual([created.id])
      expect(yield* Effect.flip(session.prompt({ sessionID: created.id, text: "sealed", resume: false }))).toEqual(
        new Session.ArchivedError({ sessionID: created.id }),
      )
    }),
  )

  it.effect("rejects an unknown session", () =>
    Effect.gen(function* () {
      const session = yield* Session.Service
      const sessionID = Session.ID.make("ses_missing_archive")
      expect(yield* Effect.flip(session.archive(sessionID))).toEqual(new Session.NotFoundError({ sessionID }))
      expect(yield* Effect.flip(session.unarchive(sessionID))).toEqual(new Session.NotFoundError({ sessionID }))
    }),
  )
})
