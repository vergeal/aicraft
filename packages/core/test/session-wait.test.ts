import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@aicraft/core/database/database"
import { AppNodeBuilder } from "@aicraft/core/effect/app-node-builder"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { Bus } from "@aicraft/core/bus"
import { Location } from "@aicraft/core/location"
import { Project } from "@aicraft/core/project"
import { AbsolutePath } from "@aicraft/core/schema"
import { Session } from "@aicraft/core/session"
import { SessionProjector } from "@aicraft/core/session/projector"
import { SessionExecution } from "@aicraft/core/session/execution"
import { SessionStore } from "@aicraft/core/session/store"
import { testEffect } from "./lib/effect"
import { globalProjectNode } from "./lib/project"

const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })
const awaited: Session.ID[] = []
const execution = Layer.mock(SessionExecution.Service, {
  awaitIdle: (sessionID) => Effect.sync(() => awaited.push(sessionID)),
})
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, Bus.node, SessionProjector.node, SessionStore.node, Session.node]),
    [Project.node.replace(globalProjectNode), SessionExecution.node.replace(execution)],
  ),
)

describe("Session.wait", () => {
  it.effect("delegates to SessionExecution.awaitIdle", () =>
    Effect.gen(function* () {
      awaited.length = 0
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ location })

      yield* sessions.wait(session.id)

      expect(awaited).toEqual([session.id])
    }),
  )
})
