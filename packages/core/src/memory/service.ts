export * as MemoryService from "./service.js"

import { DEFAULT_SETTINGS, createSubsystem, resolveSettings, type Settings, type Store, type Subsystem } from "@aicraft/memory"
import { Context, Effect, Layer, Scope } from "effect"
import { makeLocationNode } from "@aicraft/util/effect/app-node"
import { Config } from "../config.js"
import { Database } from "../database/database.js"
import { KV } from "../kv.js"
import { MemoryEmbedding } from "./embedding.js"
import { migrateKv } from "./migrate.js"
import { createSqlStore } from "./store.js"

/**
 * The Effect service that wires the `@aicraft/memory` decision core to the host: the SQL store
 * over the backend's main database, the optional llama-server embedder, and the one-time import
 * of the legacy kv entries. Everything it decides — channels, thresholds, rendering — lives in
 * the subsystem; this layer only provides its ports and its lifecycle.
 */
export interface Interface {
  readonly subsystem: Subsystem
  readonly store: Store
  readonly settings: Settings
  /** Whether the vector channel booted; false means trigger + lexical only. */
  readonly vectorChannel: boolean
}

export class Service extends Context.Service<Service, Interface>()("@aicraft/core/MemoryService") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const kv = yield* KV.Service
    const config = yield* Config.Service
    const store = createSqlStore(db)

    const embedding = yield* Effect.tryPromise(() => MemoryEmbedding.createEmbedder()).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (embedding !== undefined) {
      const scope = yield* Effect.scope
      yield* Scope.addFinalizer(scope, Effect.sync(() => embedding.stop()))
    }

    const settings = fromConfig(Config.latest(config.snapshot(), "memory"))
    const subsystem = createSubsystem({
      store,
      embedder: embedding?.embedder,
      settings,
      clock: () => new Date().toISOString(),
    })

    // The kv import runs once per boot. Ids carry over, so a half-applied import finishes on the
    // next one; failures only warn because the old kernel's rows remain readable by the migrator
    // even while the tools already write to SQL.
    yield* migrateKv(kv, store).pipe(
      Effect.tap((result) => Effect.logInfo("memory kv import", { imported: result.imported, skipped: result.skipped })),
      Effect.catchCause((cause) => Effect.logWarning("memory kv import failed", { cause })),
    )

    return { subsystem, store, settings, vectorChannel: embedding !== undefined }
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Database.node, KV.node, Config.node] })

/**
 * Maps the user-facing config onto subsystem settings. `auto_inject` is still the boolean from
 * the old kernel until the tri-state lands with the contract batch: off means trigger-only
 * injection, never the removed per-step full window.
 */
function fromConfig(info: { auto_inject?: boolean; max_injected_chars?: number; max_entries?: number } | undefined): Settings {
  return resolveSettings({
    ...DEFAULT_SETTINGS,
    inject: info?.auto_inject === false ? "off" : "trigger+vector",
    maxInjectedChars: info?.max_injected_chars,
    maxEntries: info?.max_entries,
  })
}
