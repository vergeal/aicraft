export * as MemoryService from "./service.js"

import { DEFAULT_SETTINGS, createSubsystem, resolveSettings, type Settings, type Store, type Subsystem, type TurnDecision } from "@aicraft/memory"
import { ConfigMemory } from "@aicraft/schema/config/memory"
import { Context, Effect, Layer, Scope } from "effect"
import { makeLocationNode } from "@aicraft/util/effect/app-node"
import { Config } from "../config.js"
import { Database } from "../database/database.js"
import { KV } from "../kv.js"
import { MemoryEmbedding } from "./embedding.js"
import { migrateKv } from "./migrate.js"
import { createSqlStore, insertTurnLog } from "./store.js"

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
  /** One `memory_log` row per real retrieval; never fails the caller. */
  readonly logTurn: (decision: TurnDecision, sessionID: string | undefined) => Effect.Effect<void>
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

    return {
      subsystem,
      store,
      settings,
      vectorChannel: embedding !== undefined,
      logTurn: (decision, sessionID) =>
        Effect.tryPromise(() => insertTurnLog(db, decision, sessionID)).pipe(
          Effect.catch((cause) => Effect.logWarning("memory turn log failed", { cause })),
        ),
    }
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Database.node, KV.node, Config.node] })

/**
 * Maps the user-facing config onto subsystem settings. The config's `vector` mode is the
 * subsystem's `trigger+vector`: a semantic hit never rides a request without the exact-trigger
 * channel that precedes it. `ConfigNormalize` has already turned a legacy boolean into one of
 * the three modes by the time it reaches here.
 */
function fromConfig(info: ConfigMemory.Info | undefined): Settings {
  return resolveSettings({
    ...DEFAULT_SETTINGS,
    inject:
      info?.auto_inject === "off" ? "off" : info?.auto_inject === "trigger" ? "trigger" : "trigger+vector",
    maxInjectedChars: info?.max_injected_chars,
    maxEntries: info?.max_entries,
  })
}
