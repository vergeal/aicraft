import path from "path"
import fs from "fs/promises"
import { describe, expect } from "bun:test"
import { parse } from "jsonc-parser"
import { Effect, Layer } from "effect"
import { Config } from "@aicraft/core/config"
import { ConfigMemory } from "@aicraft/schema/config/memory"
import { AppNodeBuilder } from "@aicraft/core/effect/app-node-builder"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { Global } from "@aicraft/util/global"
import { Location } from "@aicraft/core/location"
import { AbsolutePath } from "@aicraft/core/schema"
import { emptyCredentialNode, emptyWellknownNode } from "../fixture/config-nodes"
import { Credential } from "@aicraft/core/credential"
import { WellKnown } from "@aicraft/core/wellknown"
import { location } from "../fixture/location"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

const layer = (project: string, global: string) =>
  AppNodeBuilder.build(LayerNode.group([Config.node]), [
    Config.node.replace(Config.configured({ system: false })),
    Location.node.replace(
      Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(project) }))),
    ),
    Global.node.replace(Global.layerWith({ config: global, home: path.join(global, "home") })),
    Credential.node.replace(emptyCredentialNode),
    WellKnown.node.replace(emptyWellknownNode),
  ])

// The document keeps its comments, so it is read as JSONC rather than JSON.
const readDocument = (text: string) => parse(text, [], { allowTrailingComma: true }) as Record<string, unknown>

const run = (initial: string | undefined, patch: unknown, check: (text: string) => void) =>
  Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
    Effect.flatMap((tmp) => {
      const global = path.join(tmp.path, "global")
      const project = path.join(tmp.path, "project")
      const file = path.join(global, "aicraft.jsonc")
      return Effect.promise(async () => {
        await fs.mkdir(global, { recursive: true })
        await fs.mkdir(project, { recursive: true })
        if (initial !== undefined) await fs.writeFile(file, initial)
      }).pipe(
        Effect.andThen(
          Effect.provide(
            Effect.gen(function* () {
              const config = yield* Config.Service
              yield* config.update!(patch as never)
              const text = yield* Effect.promise(() => fs.readFile(file, "utf8").catch(() => ""))
              yield* Effect.sync(() => check(text))
            }),
            layer(project, global),
          ),
        ),
      )
    }),
  )

describe("Config.update memory", () => {
  it.live("field merge keeps untouched keys, comments and foreign fields", () =>
    run(
      `{
  // keep this comment
  "memory": {
    "auto_inject": "trigger",
    "max_entries": 50
  }
}
`,
      { memory: new ConfigMemory.Info({ extract: false }) },
      (text) => {
        expect(text).toContain("// keep this comment")
        const memory = readDocument(text).memory as Record<string, unknown>
        expect(memory).toEqual({ auto_inject: "trigger", max_entries: 50, extract: false })
      },
    ),
  )

  it.live("writing a field the UI owns replaces the document value", () =>
    run('{"memory": {"auto_inject": "trigger"}}\n', { memory: new ConfigMemory.Info({ auto_inject: "vector", max_injected_chars: 900 }) }, (text) => {
      const memory = readDocument(text).memory as Record<string, unknown>
      expect(memory).toEqual({ auto_inject: "vector", max_injected_chars: 900 })
    }),
  )

  it.live("null removes the whole section", () =>
    run('{"theme": "dark", "memory": {"extract": false}}\n', { memory: null }, (text) => {
      const doc = readDocument(text)
      expect(doc.memory).toBeUndefined()
      expect(doc.theme).toBe("dark")
    }),
  )

  it.live("a memory patch adds the section to a document that has none", () =>
    run('{"theme": "dark"}\n', { memory: new ConfigMemory.Info({ auto_inject: "off" }) }, (text) => {
      const doc = readDocument(text)
      expect(doc.memory).toEqual({ auto_inject: "off" })
      expect(doc.theme).toBe("dark")
    }),
  )

  it.live("an unrelated patch leaves a memory section byte-untouched", () =>
    run('{"memory": {"auto_inject": "trigger" /* annotated */}}\n', { shell: null }, (text) => {
      expect(text).toContain("/* annotated */")
      expect(text).toContain('"auto_inject": "trigger"')
    }),
  )
})
