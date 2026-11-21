export * as MemoryStore from "./store.js"

import type { StorageDomain } from "@opencode/plugin/promise/storage"
import { Option, Schema } from "effect"

/** The slice of the plugin storage these helpers use; a plain object satisfies it in tests. */
export type Storage = Pick<StorageDomain, "get" | "set" | "remove" | "scan">

export type Scope = "project" | "global"
export type Lookup = Scope | "all"

export interface Entry extends Schema.Schema.Type<typeof Entry> {}
export const Entry = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  tags: Schema.Array(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
})

const decodeEntry = Schema.decodeUnknownOption(Entry)

/** Every key lives under one namespace, so a scan prefix is the only thing separating the two scopes. */
const ROOT = "entry/"
export const globalPrefix = `${ROOT}global/`

export function projectPrefix(projectID: string) {
  return `${ROOT}project/${encodeURIComponent(projectID)}/`
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

/** Reads one scope, paging until `max` entries or the end. Undecodable values are skipped so one bad write cannot hide the rest. */
export async function readScope(storage: Storage, prefix: string, max: number) {
  const entries: Entry[] = []
  let after: string | undefined
  while (entries.length < max) {
    const page = await storage.scan({
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
}

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

export async function findEntry(storage: Storage, projectID: string, id: string) {
  for (const scope of ["project", "global"] as const) {
    const key = keyFor(scope, projectID, id)
    const value = await storage.get(key)
    if (value === undefined) continue
    const decoded = decodeEntry(value)
    if (Option.isSome(decoded)) return { scope, key, entry: decoded.value }
  }
  return undefined
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

  const header = HEADER
  const available = Math.max(0, input.budget - PROTOCOL.length - header.length - 120)
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
  return [PROTOCOL, header, ...sections].join("\n\n")
}
