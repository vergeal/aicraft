import path from "path"
import fs from "fs/promises"
import { describe, expect } from "bun:test"
import { parse } from "jsonc-parser"
import { Effect, Layer } from "effect"
import { Config } from "@aicraft/core/config"
import { Document } from "@aicraft/schema/config"
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
  package: "@aicraft/ai/providers/openai-compatible",
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
        const file = path.join(global, "aicraft.jsonc")
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
        const file = path.join(global, "aicraft.jsonc")
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
        const file = path.join(global, "aicraft.jsonc")
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
              const created = path.join(global, "aicraft.jsonc")
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

  it.live("marks every global document as writable and the project document as read-only", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) => {
        const global = path.join(tmp.path, "global")
        const project = path.join(tmp.path, "project")
        return Effect.promise(async () => {
          await fs.mkdir(global, { recursive: true })
          await fs.mkdir(project, { recursive: true })
          await fs.writeFile(path.join(global, "aicraft.json"), JSON.stringify({ shell: "zsh" }))
          await fs.writeFile(path.join(global, "aicraft.jsonc"), JSON.stringify({ shell: "fish" }))
          await fs.writeFile(path.join(project, "aicraft.json"), JSON.stringify({ shell: "bash" }))
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service
              // A provider may live in either global document, so both stay editable; the project one is read-only.
              const writable = (yield* config.entries()).filter(
                (entry): entry is Document => entry.type === "document" && entry.writable === true,
              )
              expect(writable.map((entry) => entry.path)).toEqual([
                AbsolutePath.make(path.join(global, "aicraft.json")),
                AbsolutePath.make(path.join(global, "aicraft.jsonc")),
              ])
            }).pipe(Effect.provide(layer(project, global))),
          ),
        )
      }),
    ),
  )

  it.live("writes a provider back to the file that declares it", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) => {
        const global = path.join(tmp.path, "global")
        const project = path.join(tmp.path, "project")
        const json = path.join(global, "aicraft.json")
        const jsonc = path.join(global, "aicraft.jsonc")
        const jsoncText = `{
  // untouched
  "disabled_providers": ["hxnewapi"],
  "providers": { "beta": { "name": "Beta" } }
}
`
        return Effect.promise(async () => {
          await fs.mkdir(global, { recursive: true })
          await fs.mkdir(project, { recursive: true })
          await fs.writeFile(
            json,
            JSON.stringify({
              providers: { alpha: { name: "Alpha", settings: { baseURL: "https://old.example/v1" } } },
            }),
          )
          await fs.writeFile(jsonc, jsoncText)
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service
              yield* config.update!({ providers: { alpha: { settings: { baseURL: "https://new.example/v1" } } } })

              const written = readDocument(yield* Effect.promise(() => fs.readFile(json, "utf8")))
              expect((written.providers as Record<string, Record<string, unknown>>).alpha.settings).toEqual({
                baseURL: "https://new.example/v1",
              })
              // The document that does not declare `alpha` is left byte-for-byte alone, so it cannot gain a copy.
              expect(yield* Effect.promise(() => fs.readFile(jsonc, "utf8"))).toBe(jsoncText)
            }).pipe(Effect.provide(layer(project, global))),
          ),
        )
      }),
    ),
  )

  it.live("keeps a v1 provider under its own key and dialect", () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) => {
        const global = path.join(tmp.path, "global")
        const project = path.join(tmp.path, "project")
        const file = path.join(global, "aicraft.json")
        return Effect.promise(async () => {
          await fs.mkdir(global, { recursive: true })
          await fs.mkdir(project, { recursive: true })
          await fs.writeFile(
            file,
            JSON.stringify({
              provider: {
                newapi: {
                  npm: "@ai-sdk/openai-compatible",
                  name: "NewAPI",
                  options: { baseURL: "https://old.example/v1", apiKey: "secret" },
                  models: { deepseek: { name: "deepseek" } },
                },
              },
            }),
          )
        }).pipe(
          Effect.andThen(
            Effect.gen(function* () {
              const config = yield* Config.Service
              yield* config.update!({
                providers: {
                  newapi: {
                    name: "NewAPI",
                    package: "@aicraft/ai/providers/openai-compatible",
                    settings: { baseURL: "https://new.example/v1" },
                    models: { deepseek: {} },
                  },
                },
              })

              const document = readDocument(yield* Effect.promise(() => fs.readFile(file, "utf8")))
              // A v1 document keeps its singular key: adding `providers` would define the provider twice.
              expect(Object.hasOwn(document, "providers")).toBe(false)
              const newapi = (document.provider as Record<string, Record<string, unknown>>).newapi
              // v1 reads the endpoint out of `options`, so a `settings` key there would be dropped and the edit lost.
              expect(newapi.options).toEqual({ baseURL: "https://new.example/v1", apiKey: "secret" })
              expect(newapi.npm).toBe("@ai-sdk/openai-compatible")
              expect(newapi.models).toEqual({ deepseek: { name: "deepseek" } })
            }).pipe(Effect.provide(layer(project, global))),
          ),
        )
      }),
    ),
  )
})
