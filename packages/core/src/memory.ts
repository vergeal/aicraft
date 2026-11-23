export * as Memory from "./memory.js"

import { ConfigMemory } from "@opencode/schema/config/memory"
import { Memory as MemorySchema } from "@opencode/schema/memory"
import { Effect, Option, Schema } from "effect"
import { KV } from "./kv.js"

/** The canonical wire contract, re-exported so tools, RPC, and the settings page share one schema identity. */
export const Entry = MemorySchema.Entry
export type Entry = MemorySchema.Entry
export const Scope = MemorySchema.Scope
export type Scope = MemorySchema.Scope
export type Lookup = Scope | "all"

const decodeEntry = Schema.decodeUnknownOption(Entry)

/** Every key lives under one namespace, so a scan prefix is the only thing separating the two scopes. */
const ROOT = "memory/entry/"
export const globalPrefix = `${ROOT}global/`
/** Plugin memories never join the user's scopes: each plugin writes under its own id, and none are injected. */
export const pluginRoot = `${ROOT}plugin/`

export function projectPrefix(projectID: string) {
  return `${ROOT}project/${encodeURIComponent(projectID)}/`
}

export function pluginPrefix(pluginID: string) {
  return `${pluginRoot}${encodeURIComponent(pluginID)}/`
}

export function prefixFor(scope: Scope, projectID: string) {
  return scope === "global" ? globalPrefix : projectPrefix(projectID)
}

export function keyFor(scope: Scope, projectID: string, id: string) {
  return prefixFor(scope, projectID) + id
}

export function newID() {
  return `mem_${crypto.randomUUID()}`
}

/** A save or a search has to see the whole scope to deduplicate and match correctly; this is the hard ceiling. */
export const MAX_SCAN = 2_000

/**
 * Reads one scope, paging until `max` entries or the end. Undecodable values are skipped so one bad write cannot hide
 * the rest.
 */
export const readScope = (kv: KV.Interface, prefix: string, max: number) =>
  Effect.gen(function* () {
    const entries: Entry[] = []
    let after: string | undefined
    while (entries.length < max) {
      const page = yield* kv.scan({
        prefix,
        limit: Math.min(100, max - entries.length),
        ...(after === undefined ? {} : { after }),
      })
      for (const item of page.entries) {
        const decoded = decodeEntry(item.value)
        if (Option.isSome(decoded)) entries.push(decoded.value)
      }
      if (page.next === undefined || page.next === after) break
      after = page.next
    }
    return entries
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

/** Looks in the project scope first, then global; an ID is unique, so the first match is the entry. */
export const findEntry = (kv: KV.Interface, projectID: string, id: string) =>
  Effect.gen(function* () {
    for (const scope of ["project", "global"] as const) {
      const key = keyFor(scope, projectID, id)
      const value = yield* kv.get(key)
      if (value === undefined) continue
      const decoded = decodeEntry(value)
      if (Option.isSome(decoded)) return { scope, key, entry: decoded.value }
    }
    return undefined
  })

export const list = (kv: KV.Interface, projectID: string, lookup: Lookup, limit: number) =>
  Effect.gen(function* () {
    const scopes: readonly Scope[] = lookup === "all" ? ["project", "global"] : [lookup]
    const groups = yield* Effect.forEach(
      scopes,
      (scope) =>
        readScope(kv, prefixFor(scope, projectID), limit).pipe(Effect.map((entries) => ({ scope, entries }))),
      { concurrency: "unbounded" },
    )
    return groups
      .flatMap((group) => group.entries.map((entry) => ({ entry, scope: group.scope })))
      .sort((a, b) => (a.entry.updatedAt < b.entry.updatedAt ? 1 : a.entry.updatedAt > b.entry.updatedAt ? -1 : 0))
      .slice(0, limit)
  })

/**
 * Writes a memory, merging tags into an entry with the same text instead of storing a second copy. A duplicate keeps
 * the original ID so references already handed to the model stay valid.
 */
export const save = (kv: KV.Interface, input: {
  readonly scope: Scope
  readonly projectID: string
  readonly text: string
  readonly tags: readonly string[] | undefined
  readonly now: string
}) => saveAt(kv, prefixFor(input.scope, input.projectID), input)

/** A plugin's own memories live in one prefix per plugin, so two plugins can never read each other's. */
export const savePlugin = (
  kv: KV.Interface,
  pluginID: string,
  input: { readonly text: string; readonly tags: readonly string[] | undefined; readonly now: string },
) => saveAt(kv, pluginPrefix(pluginID), input)

const saveAt = (
  kv: KV.Interface,
  prefix: string,
  input: { readonly text: string; readonly tags: readonly string[] | undefined; readonly now: string },
) =>
  Effect.gen(function* () {
    const text = input.text.trim()
    const tags = normalizeTags(input.tags)
    const existing = yield* readScope(kv, prefix, MAX_SCAN)
    const duplicate = existing.find((entry) => entry.text.trim() === text)
    const entry: Entry = duplicate
      ? { ...duplicate, tags: normalizeTags([...duplicate.tags, ...tags]), updatedAt: input.now }
      : { id: newID(), text, tags, createdAt: input.now, updatedAt: input.now }
    yield* kv.set(prefix + entry.id, entry)
    return { entry, duplicate: duplicate !== undefined }
  })

export const update = (kv: KV.Interface, input: {
  readonly scope: Scope
  readonly projectID: string
  readonly id: string
  readonly text: string
  readonly tags: readonly string[]
  readonly now: string
}) => updateAt(kv, keyFor(input.scope, input.projectID, input.id), input)

export const updatePlugin = (
  kv: KV.Interface,
  pluginID: string,
  input: { readonly id: string; readonly text: string; readonly tags: readonly string[]; readonly now: string },
) => updateAt(kv, pluginPrefix(pluginID) + input.id, input)

const updateAt = (
  kv: KV.Interface,
  key: string,
  input: { readonly text: string; readonly tags: readonly string[]; readonly now: string },
) =>
  Effect.gen(function* () {
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

export const remove = (kv: KV.Interface, input: { readonly scope: Scope; readonly projectID: string; readonly id: string }) =>
  kv.remove(keyFor(input.scope, input.projectID, input.id))

export const removePlugin = (kv: KV.Interface, pluginID: string, id: string) =>
  kv.remove(pluginPrefix(pluginID) + id)

/** One scope's entry, located by id without assuming which scope holds it. */
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

const MAX_ENTRY_CHARS = 400

function line(entry: Entry) {
  const text = entry.text.length > MAX_ENTRY_CHARS ? `${entry.text.slice(0, MAX_ENTRY_CHARS - 1)}…` : entry.text
  return entry.tags.length > 0 ? `- ${text}（标签：${entry.tags.join("、")}）` : `- ${text}`
}

function pack(entries: readonly Entry[], budget: number) {
  const lines: string[] = []
  let used = 0
  for (const [index, entry] of entries.entries()) {
    const text = line(entry)
    const cost = text.length + 1
    if (used + cost > budget) return { lines, used, omitted: entries.length - index }
    lines.push(text)
    used += cost
  }
  return { lines, used, omitted: 0 }
}

export interface RenderInput {
  readonly project: readonly Entry[]
  readonly global: readonly Entry[]
  readonly budget: number
}

/**
 * The writing rules travel with every request instead of only inside the skill, because the skill is loaded on demand:
 * a model that never decides to save would never read the skill that tells it when to save. The judgement itself stays
 * with the model — these are semantic checks, not phrases to match.
 */
const PROTOCOL = [
  "## 记忆协议",
  "每次回复前判断本轮用户消息，任一项成立就先调用 memory.save 再回答：",
  "1. 纠正了你的做法，且这个纠正以后还会适用；",
  "2. 说出了自己的习惯、偏好或工作方式；",
  "3. 要求你长期遵守某个约定；",
  "4. 告诉你一个下次还会用到的重要事实。",
  "判断靠语义而不是措辞：用户不一定说「记住」，一句看似普通的纠正也可能需要保存。跨项目的个人习惯用 scope=global，其余默认当前项目。",
  "已有记忆过时或被纠正时用 memory.update 改写，不要保留矛盾条目；用户要求忘掉时用 memory.forget。密钥、口令和一次性信息不要保存。",
].join("\n")

const HEADER = "## 长期记忆\n以下内容由之前的会话保存，可能已经过时。与用户当前的要求冲突时，以当前要求为准。"

/**
 * Builds the system section injected before every request, including the empty case so a fresh Project still learns the
 * protocol. The budget is shared in proportion to each scope's own size, so a short global list does not reserve space
 * the project list needs, and vice versa.
 */
export function render(input: RenderInput) {
  const project = sortRecent(input.project)
  const global = sortRecent(input.global)
  if (project.length === 0 && global.length === 0) return PROTOCOL

  const available = Math.max(0, input.budget - PROTOCOL.length - HEADER.length - 120)
  const projectLength = project.reduce((sum, entry) => sum + line(entry).length + 1, 0)
  const globalLength = global.reduce((sum, entry) => sum + line(entry).length + 1, 0)
  const total = projectLength + globalLength
  const projectBudget = total <= available ? available : Math.floor((available * projectLength) / total)
  const packedProject = pack(project, projectBudget)
  const packedGlobal = pack(global, available - packedProject.used)

  const sections: string[] = []
  if (packedProject.lines.length > 0) sections.push(["### 项目记忆", ...packedProject.lines].join("\n"))
  if (packedGlobal.lines.length > 0) sections.push(["### 全局记忆", ...packedGlobal.lines].join("\n"))
  const omitted = packedProject.omitted + packedGlobal.omitted
  if (omitted > 0) sections.push(`另有 ${omitted} 条记忆未注入，需要时用 memory.search 检索。`)
  if (sections.length === 0) return PROTOCOL
  return [PROTOCOL, HEADER, ...sections].join("\n\n")
}

export interface Settings {
  readonly autoInject: boolean
  readonly maxInjectedChars: number
  readonly maxEntries: number
}

export const DEFAULTS: Settings = { autoInject: true, maxInjectedChars: 4_000, maxEntries: 200 }

export function readSettings(config: ConfigMemory.Info | undefined): Settings {
  return {
    autoInject: config?.auto_inject ?? DEFAULTS.autoInject,
    maxInjectedChars: bounded(config?.max_injected_chars, DEFAULTS.maxInjectedChars, 200, 40_000),
    maxEntries: bounded(config?.max_entries, DEFAULTS.maxEntries, 1, MAX_SCAN),
  }
}

function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

/**
 * The previous memory plugin kept its entries under its own plugin-storage namespace. Copy them into the built-in
 * namespace once, without touching the source, so installing the built-in feature does not forget anything. A later
 * built-in entry with the same key wins, and a marker keeps the walk from repeating on every activation.
 */
const LEGACY_ROOT = "plugin:006300680061006e00670068006f006e0067002e006d0065006d006f00720079:entry/"
const LEGACY_MARKER = "memory/migrated.changhong.memory"

export const migrate = (kv: KV.Interface) =>
  Effect.gen(function* () {
    if ((yield* kv.get(LEGACY_MARKER)) !== undefined) return
    let after: string | undefined
    do {
      const page = yield* kv.scan({
        prefix: LEGACY_ROOT,
        limit: 200,
        ...(after === undefined ? {} : { after }),
      })
      yield* Effect.forEach(
        page.entries,
        (item) => {
          const key = ROOT + item.key.slice(LEGACY_ROOT.length)
          return kv.get(key).pipe(
            Effect.flatMap((existing) => (existing === undefined ? kv.set(key, item.value) : Effect.void)),
          )
        },
        { discard: true },
      )
      after = page.next
    } while (after !== undefined)
    yield* kv.set(LEGACY_MARKER, true)
  })
