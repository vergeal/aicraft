export * as Memory from "./memory.js"

import { Memory as MemorySchema } from "@aicraft/schema/memory"
import { Effect, Option, Schema } from "effect"
import { KV } from "./kv.js"

/** The canonical wire contract, re-exported so the plugin host and the settings RPC share one schema identity. */
export const Entry = MemorySchema.Entry
export type Entry = MemorySchema.Entry
export const Scope = MemorySchema.Scope
export type Scope = MemorySchema.Scope

const decodeEntry = Schema.decodeUnknownOption(Entry)

const ROOT = "memory/entry/"
/**
 * Plugin memories still live in kv: each plugin writes under its own id, none are injected, and
 * the boot-time `migrateKv` mirrors them into the subsystem's plugin scope for the settings page.
 * Project and global memories are SQL-owned since the subsystem cutover.
 */
export const pluginRoot = `${ROOT}plugin/`

export function pluginPrefix(pluginID: string) {
  return `${pluginRoot}${encodeURIComponent(pluginID)}/`
}

/** A save or a search has to see the whole scope to deduplicate and match correctly; this is the hard ceiling. */
export const MAX_SCAN = 2_000

/**
 * Reads one scope and returns the newest `max` entries. Undecodable values are skipped so one bad write cannot hide
 * the rest. Note the ordering trap: keys are `mem_<uuid>`, so kv's ascending key order is random order — taking the
 * first `max` rows was a random sample, not the recent head (measured 2026-11: golden-set recall 0.33 at 400+
 * entries). The whole scope must be paged before recency is meaningful.
 */
export const readScope = (kv: KV.Interface, prefix: string, max: number) =>
  Effect.gen(function* () {
    const entries: Entry[] = []
    let after: string | undefined
    while (entries.length < MAX_SCAN) {
      const page = yield* kv.scan({
        prefix,
        limit: Math.min(100, MAX_SCAN - entries.length),
        ...(after === undefined ? {} : { after }),
      })
      for (const item of page.entries) {
        const decoded = decodeEntry(item.value)
        if (Option.isSome(decoded)) entries.push(decoded.value)
      }
      if (page.next === undefined || page.next === after) break
      after = page.next
    }
    return sortRecent(entries).slice(0, max)
  })

export function sortRecent(entries: readonly Entry[]) {
  return [...entries].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
}

export function matches(entry: Entry, query: string) {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return true
  return entry.text.toLowerCase().includes(needle) || entry.tags.some((tag) => tag.toLowerCase().includes(needle))
}

/** Tags are labels, not content: drop blanks and duplicates and keep the list short enough to read. */
export function normalizeTags(input: readonly string[] | undefined) {
  if (!input) return []
  const tags = input.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && tag.length <= 30)
  return [...new Set(tags)].slice(0, 8)
}

/** A plugin's own memories live in one prefix per plugin, so two plugins can never read each other's. */
export const savePlugin = (
  kv: KV.Interface,
  pluginID: string,
  input: { readonly text: string; readonly tags: readonly string[] | undefined; readonly now: string },
) =>
  Effect.gen(function* () {
    const text = input.text.trim()
    const tags = normalizeTags(input.tags)
    const prefix = pluginPrefix(pluginID)
    const existing = yield* readScope(kv, prefix, MAX_SCAN)
    const duplicate = existing.find((entry) => entry.text.trim() === text)
    const entry: Entry = duplicate
      ? { ...duplicate, tags: normalizeTags([...duplicate.tags, ...tags]), updatedAt: input.now }
      : { id: `mem_${crypto.randomUUID()}`, text, tags, createdAt: input.now, updatedAt: input.now }
    yield* kv.set(prefix + entry.id, entry)
    return { entry, duplicate: duplicate !== undefined }
  })

export const updatePlugin = (
  kv: KV.Interface,
  pluginID: string,
  input: { readonly id: string; readonly text: string; readonly tags: readonly string[]; readonly now: string },
) =>
  Effect.gen(function* () {
    const key = pluginPrefix(pluginID) + input.id
    const value = yield* kv.get(key)
    const current = value === undefined ? Option.none() : decodeEntry(value)
    if (Option.isNone(current)) return undefined
    const entry: Entry = {
      ...current.value,
      text: input.text.trim(),
      tags: normalizeTags(input.tags),
      updatedAt: input.now,
    }
    yield* kv.set(key, entry)
    return entry
  })

export const removePlugin = (kv: KV.Interface, pluginID: string, id: string) => kv.remove(pluginPrefix(pluginID) + id)

/** One plugin-scope entry, located by id. */
export function findPluginEntry(kv: KV.Interface, pluginID: string, id: string) {
  return Effect.gen(function* () {
    const key = pluginPrefix(pluginID) + id
    const value = yield* kv.get(key)
    if (value === undefined) return undefined
    const decoded = decodeEntry(value)
    if (Option.isNone(decoded)) return undefined
    return { key, entry: decoded.value }
  })
}

/**
 * Every plugin's memories, grouped by plugin id and newest first. The settings page lists them as one section; the
 * plugins themselves only ever see their own prefix.
 */
export const readPlugins = (kv: KV.Interface, max: number) =>
  Effect.gen(function* () {
    const groups = new Map<string, Entry[]>()
    let after: string | undefined
    let total = 0
    while (total < max) {
      const page = yield* kv.scan({
        prefix: pluginRoot,
        limit: Math.min(100, max - total),
        ...(after === undefined ? {} : { after }),
      })
      for (const item of page.entries) {
        const rest = item.key.slice(pluginRoot.length)
        const slash = rest.indexOf("/")
        if (slash <= 0) continue
        const decoded = decodeEntry(item.value)
        if (Option.isNone(decoded)) continue
        const plugin = safeDecode(rest.slice(0, slash))
        groups.set(plugin, [...(groups.get(plugin) ?? []), decoded.value])
        total += 1
      }
      if (page.next === undefined || page.next === after) break
      after = page.next
    }
    return [...groups.entries()]
      .map(([plugin, entries]) => ({ plugin, entries: sortRecent(entries) }))
      .sort((a, b) => (a.plugin < b.plugin ? -1 : a.plugin > b.plugin ? 1 : 0))
  })

/** A hand-written key can carry malformed percent escapes; the raw segment still names a plugin. */
function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
