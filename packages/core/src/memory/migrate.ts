export * as MemoryMigrate from "./migrate.js"

import { Memory as LegacyMemory } from "@aicraft/schema/memory"
import { MemoryLifecycle, MemoryTokens, type MemoryRecord, type Scope, type Store } from "@aicraft/memory"
import { Option, Schema } from "effect"
import { Effect } from "effect"
import { KV } from "../kv.js"
import { MAX_SCAN } from "../memory.js"

/**
 * Imports the old kv-backed memory entries into the subsystem's tables, once, without deleting
 * the source rows. The running kv kernel stays authoritative until the turn pipeline switches
 * over; a half-applied import must therefore be re-runnable, which it is because the `mem_*` ids
 * carry over unchanged: `get(id)` already present means the row was imported before.
 *
 * Legacy entries have no type, and the old kernel injected everything. They all come in as
 * `convention` so nothing loses reachability at switch time; the settings page (and the
 * extraction job's classification) is where they get re-typed. Plugin prefixes migrate to the
 * plugin scope and stay non-injected, matching the old isolation.
 */
export const migrateKv = (kv: KV.Interface, store: Store) =>
  Effect.gen(function* () {
    const keys = yield* scanKeys(kv)
    let imported = 0
    let skipped = 0
    for (const key of keys) {
      const location = locate(key)
      if (location === undefined) continue
      const entry = decodeEntry(yield* kv.get(key))
      if (entry === undefined) continue
      if (yield* Effect.promise(() => store.get(entry.id))) {
        skipped += 1
        continue
      }
      yield* Effect.promise(() => store.insert(migratedRecord(entry, location)))
      imported += 1
    }
    return { scanned: keys.length, imported, skipped }
  })

const decodeUnknown = Schema.decodeUnknownOption(LegacyMemory.Entry)
const decodeEntry = (value: unknown) => {
  const decoded = decodeUnknown(value)
  return Option.isSome(decoded) ? decoded.value : undefined
}

/** Pages the whole `memory/entry/` namespace. Key order is random (uuid suffix), which is fine:
 *  a migration is order-independent because ids carry over and dedup is by id. */
function scanKeys(kv: KV.Interface) {
  return Effect.gen(function* () {
    const keys: string[] = []
    let after: string | undefined
    while (keys.length < MAX_SCAN) {
      const page = yield* kv.scan({ prefix: "memory/entry/", limit: 100, ...(after === undefined ? {} : { after }) })
      for (const item of page.entries) keys.push(item.key)
      if (page.next === undefined || page.next === after) break
      after = page.next
    }
    return keys
  })
}

/** `memory/entry/global/<id>` | `memory/entry/project/<urlenc>/<id>` | `memory/entry/plugin/<urlenc>/<id>`.
 *  Entry ids are `mem_<uuid>` and contain no slashes, so segment count identifies the shape. */
function locate(key: string): { scope: Scope; id?: string } | undefined {
  const [namespace, ...rest] = key.slice("memory/entry/".length).split("/")
  if (namespace === "global" && rest.length === 1) return { scope: "global" }
  if ((namespace === "project" || namespace === "plugin") && rest.length === 2)
    return { scope: namespace, id: decodeURIComponent(rest[0]) }
  return undefined
}

function migratedRecord(
  entry: LegacyMemory.Entry,
  location: { scope: Scope; id?: string },
): MemoryRecord {
  return {
    id: entry.id,
    scope: location.scope,
    ...(location.scope === "project" ? { projectID: location.id ?? "" } : {}),
    ...(location.scope === "plugin" ? { pluginID: location.id ?? "" } : {}),
    type: "convention",
    status: "active",
    version: 1,
    text: entry.text,
    tags: MemoryLifecycle.normalizeTags(entry.tags),
    tokens: MemoryTokens.tokenize(entry.text),
    textHash: MemoryLifecycle.hashText(entry.text),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }
}

