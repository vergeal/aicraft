import path from "path"
import fs from "fs/promises"
import { describe, expect } from "bun:test"
import { parse } from "jsonc-parser"
import { Effect, Layer } from "effect"
import { Config } from "@opencode/core/config"
import { Document } from "@opencode/schema/config"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Global } from "@opencode/util/global"
import { Location } from "@opencode/core/location"
import { AbsolutePath } from "@opencode/core/schema"
import { emptyCredentialNode, emptyWellknownNode } from "../fixture/config-nodes"
import { Credential } from "@opencode/core/credential"
import { WellKnown } from "@opencode/core/wellknown"
import { location } from "../fixture/location"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

const layer = (project: string, global: string) =>
  AppNodeBuilder.build(LayerNode.group([Config.node]), [
    Config.node.replace(Config.configured({ system: false })),
    Location.node.replace(
      Layer.succeed(
        Location.Service,
        Location.Service.of(location({ directory: AbsolutePath.make(project) })),
      ),
    ),
    Global.node.replace(Global.layerWith({ config: global, home: path.join(global, "home") })),
    Credential.node.replace(emptyCredentialNode),
    WellKnown.node.replace(emptyWellknownNode),
  ])

const provider = (name: string, baseURL: string, models: readonly string[]) => ({
  name,
  package: "@opencode/ai/providers/openai-compatible",
  settings: { baseURL },
  models: Object.fromEntries(models.map((id) => [id, { name: id }])),
})

// The document keeps its comments, so it is read as JSONC rather than JSON.
const readDocument = (text: string) => parse(text, [], { allowTrailingComma: true }) as Record<string, unknown>

describe("Config.update providers", () => {
  it.live("merges from the raw JSONC so a substituted secret is never written back", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) => {
        const global = path.join(tmp.path, "global")
        const project = path.join(tmp.path, "project")
        const file = path.join(global, "opencode.jsonc")
        return Effect.promise(async () => {
          await fs.mkdir(global, { recursive: true })
          await fs.mkdir(project, { recursive: true })
          await fs.writeFile(path.join(global, "secret.txt"), "sk-from-file")
          await fs.writeFile(
            file,
            `{
  "providers": {
    "gateway": {
      "name": "Gateway",
      "settings": { "baseURL": "https://old.example/v1", "apiKey": "{file:./secret.txt}" },
      "models": { "keep": { "name": "keep" } }
    }
  }
}
`,
          )
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service
              yield* config.update!({
                providers: {
                  gateway: {
                    settings: { baseURL: "https://new.example/v1" },
                    models: { keep: {}, added: { name: "added" } },
                  },
                },
              })

              const text = yield* Effect.promise(() => fs.readFile(file, "utf8"))
              // The literal reference survives: merging the decoded Info would have inlined "sk-from-file".
              expect(text).toContain("{file:./secret.txt}")
              expect(text).not.toContain("sk-from-file")
              expect(text).not.toContain('"canonical": null')
              const gateway = (readDocument(text).providers as Record<string, unknown>).gateway as Record<string, unknown>
              expect(gateway.settings).toEqual({
                baseURL: "https://new.example/v1",
                apiKey: "{file:./secret.txt}",
              })
              // `{}` keeps the document's own entry; a new ID is written as given.
              expect(gateway.models).toEqual({ keep: { name: "keep" }, added: { name: "added" } })
            }).pipe(Effect.provide(layer(project, global))),
          ),
        )
      }),
    ),
  )

  it.live("writes one provider key and keeps the rest of the document", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) => {
        const global = path.join(tmp.path, "global")
        const project = path.join(tmp.path, "project")
        const file = path.join(global, "opencode.jsonc")
        const original = `{
  // keep my comment
  "shell": "zsh",
  "providers": {
    "hongxincy": { "name": "Hongxin", "settings": { "baseURL": "https://hongxin.example/v1", "timeout": 30 } }
  }
}
`
        return Effect.promise(async () => {
          await fs.mkdir(global, { recursive: true })
          await fs.mkdir(project, { recursive: true })
          await fs.writeFile(file, original)
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service

              yield* config.update!({
                providers: { "my-gateway": provider("My Gateway", "https://gateway.example/v1", ["a", "b"]) },
              })

              const written = yield* Effect.promise(() => fs.readFile(file, "utf8"))
              expect(written).toContain("// keep my comment")
              expect(written).toContain('"shell": "zsh"')
              expect(written).toContain('"hongxincy"')
              const document = readDocument(written)
              expect((document.providers as Record<string, unknown>)["my-gateway"]).toMatchObject({
                name: "My Gateway",
                settings: { baseURL: "https://gateway.example/v1" },
              })
            }).pipe(Effect.provide(layer(project, global))),
          ),
        )
      }),
    ),
  )

  it.live("merges a provider shallowly and replaces its model table", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) => {
        const global = path.join(tmp.path, "global")
        const project = path.join(tmp.path, "project")
        const file = path.join(global, "opencode.jsonc")
        return Effect.promise(async () => {
          await fs.mkdir(global, { recursive: true })
          await fs.mkdir(project, { recursive: true })
          await fs.writeFile(
            file,
            JSON.stringify({
              providers: {
                gateway: {
                  name: "Gateway",
                  settings: { baseURL: "https://old.example/v1", timeout: 30 },
                  models: { old: { name: "old" } },
                },
              },
            }),
          )
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service
              // The endpoint changes and the model table is replaced; `timeout` is a provider-level setting the patch
              // never mentions, so it must survive.
              yield* config.update!({
                providers: { gateway: { settings: { baseURL: "https://new.example/v1" }, models: { fresh: {} } } },
              })

              const written = readDocument(yield* Effect.promise(() => fs.readFile(file, "utf8")))
              expect((written.providers as Record<string, unknown>).gateway).toEqual({
                name: "Gateway",
                settings: { baseURL: "https://new.example/v1", timeout: 30 },
                models: { fresh: {} },
              })
            }).pipe(Effect.provide(layer(project, global))),
          ),
        )
      }),
    ),
  )

  it.live("removes a provider with null and creates the target file when it is missing", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) => {
        const global = path.join(tmp.path, "global")
        const project = path.join(tmp.path, "project")
        return Effect.promise(async () => {
          await fs.mkdir(global, { recursive: true })
          await fs.mkdir(project, { recursive: true })
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service

              yield* config.update!({ providers: { gateway: provider("Gateway", "https://x.example/v1", ["m"]) } })
              const created = path.join(global, "opencode.jsonc")
              expect(readDocument(yield* Effect.promise(() => fs.readFile(created, "utf8"))).providers).toHaveProperty(
                "gateway",
              )

              yield* config.update!({ providers: { gateway: null } })
              expect(
                readDocument(yield* Effect.promise(() => fs.readFile(created, "utf8"))).providers,
              ).not.toHaveProperty("gateway")
            }).pipe(Effect.provide(layer(project, global))),
          ),
        )
      }),
    ),
  )

  it.live("marks only the document update would write as writable", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) => {
        const global = path.join(tmp.path, "global")
        const project = path.join(tmp.path, "project")
        return Effect.promise(async () => {
          await fs.mkdir(global, { recursive: true })
          await fs.mkdir(project, { recursive: true })
          await fs.writeFile(path.join(global, "opencode.json"), JSON.stringify({ shell: "zsh" }))
          await fs.writeFile(path.join(project, "opencode.json"), JSON.stringify({ shell: "bash" }))
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service
              // The global document wins the write target; the project document is read-only for the editor.
              const writable = (yield* config.entries()).filter(
                (entry): entry is Document => entry.type === "document" && entry.writable === true,
              )
              expect(writable.map((entry) => entry.path)).toEqual([AbsolutePath.make(path.join(global, "opencode.json"))])
            }).pipe(Effect.provide(layer(project, global))),
          ),
        )
      }),
    ),
  )
})
