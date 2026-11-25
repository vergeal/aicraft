import { describe, expect } from "bun:test"
import { DateTime, Effect, Stream } from "effect"
import { AppNodeBuilder } from "@aicraft/core/effect/app-node-builder"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { FSUtil } from "@aicraft/util/fs-util"
import { Image } from "@aicraft/core/image"
import { Permission } from "@aicraft/core/permission"
import { Session } from "@aicraft/core/session"
import { SessionSchema } from "@aicraft/core/session/schema"
import { Tool } from "@aicraft/core/tool"
import { SessionCreateTool } from "@aicraft/core/tool/plugin/session-create"
import { AbsolutePath } from "@aicraft/core/schema"
import { Money } from "@aicraft/schema/money"
import { Project } from "@aicraft/schema/project"
import { testEffect } from "./lib/effect"
import { imagePassthrough } from "./lib/image"
import { permissionLayer } from "./lib/permission"
import { executeTool, registerToolPlugin, toolIdentity } from "./lib/tool"

const at = DateTime.makeUnsafe(0)
const parentID = Session.ID.make(`ses_${"parent".padEnd(26, "0")}`)
const createdID = Session.ID.make(`ses_${"created".padEnd(26, "0")}`)

const session = (id: Session.ID, title?: string) =>
  SessionSchema.Info.make({
    id,
    projectID: Project.ID.make("prj_create"),
    cost: Money.USD.zero,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: at, updated: at },
    title,
    location: { directory: AbsolutePath.make("/project") },
  })

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Tool.node, FSUtil.node]), [
    Image.node.replace(imagePassthrough),
    Permission.node.replace(permissionLayer()),
  ]),
)

const call = (registry: Tool.Interface, input: unknown) =>
  executeTool(registry, {
    sessionID: parentID,
    ...toolIdentity,
    call: { type: "tool-call", id: "call-create", name: "create", input },
  })

const setup = () =>
  Effect.gen(function* () {
    const creates: Array<{ title?: string; parentID?: Session.ID; metadata?: unknown; prompt?: string }> = []

    yield* registerToolPlugin(SessionCreateTool.Plugin, {
      event: { subscribe: () => Stream.empty },
      session: {
        get: () => Effect.succeed(session(parentID, "Parent session")),
        create: (input) =>
          Effect.sync(() => {
            creates.push(input ?? {})
            return session(createdID, input?.title)
          }),
        prompt: () => Effect.die("create should not prompt without a first message"),
      },
    }).pipe(
      Effect.provide(
        permissionLayer({
          assert: () => Effect.void,
        }),
      ),
    )

    return { registry: yield* Tool.Service, creates }
  })

describe("SessionCreateTool", () => {
  it.effect("creates a child session that is not a subagent", () =>
    Effect.gen(function* () {
      const { registry, creates } = yield* setup()

      const result = yield* call(registry, { title: "Review the diff" })

      expect(result.status).toBe("completed")
      expect(result.output).toMatchObject({ sessionID: createdID })
      expect(creates).toHaveLength(1)
      expect(creates[0]).toMatchObject({
        title: "Review the diff",
        parentID,
        metadata: { createdBy: { sessionID: parentID } },
      })
      expect(creates[0]).not.toHaveProperty("subagent")
      expect(creates[0]?.prompt).toContain("not a subagent")
      expect(creates[0]?.prompt).toContain(parentID)
      expect(creates[0]?.prompt).toContain("Parent session")
    }),
  )
})
