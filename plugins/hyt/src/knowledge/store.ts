import { optional } from "@opencode/schema/schema"
import { Option, Schema } from "effect"
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { KnowledgeEntry, NewEntry } from "./schema.js"
import { KINDS, SOURCES, checkAdmission, createEntry, findDuplicate, mergeEntry } from "./schema.js"
import type { SearchHit } from "./search.js"
import { search } from "./search.js"

/**
 * 知识库存储：
 *   <plugin data>/hyt/knowledge/index.json      全部条目（权威）
 *   <plugin data>/hyt/knowledge/entries/<id>.json  单条明细（便于人工查看与迁移）
 * 写入时两份都更新，读取只信 index.json；单条文件损坏不影响检索。
 */

export interface KnowledgeIndex {
  readonly version: 1
  readonly updatedAt: string
  readonly entries: readonly KnowledgeEntry[]
}

export const Entry = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(KINDS),
  title: Schema.String,
  question: optional(Schema.String),
  answer: Schema.String,
  tags: Schema.Array(Schema.String),
  source: Schema.Literals(SOURCES),
  confidence: Schema.Number,
  createdAt: Schema.String,
  usedCount: Schema.Int,
  lastUsedAt: Schema.String,
})

const decodeEntry = Schema.decodeUnknownOption(Entry)

export function knowledgeRoot(dataDir: string) {
  return join(dataDir, "hyt", "knowledge")
}

export function indexPath(root: string) {
  return join(root, "index.json")
}

export function entryPath(root: string, id: string) {
  return join(root, "entries", `${id}.json`)
}

export async function loadIndex(root: string): Promise<KnowledgeIndex> {
  const file = Bun.file(indexPath(root))
  if (!(await file.exists())) return { version: 1, updatedAt: new Date(0).toISOString(), entries: [] }
  const parsed = await file.json().catch(() => undefined)
  const raw = isRecord(parsed) && Array.isArray(parsed.entries) ? parsed.entries : []
  const entries = raw.flatMap((item) => {
    const decoded = decodeEntry(item)
    return Option.isSome(decoded) ? [decoded.value] : []
  })
  return {
    version: 1,
    updatedAt: isRecord(parsed) && typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    entries,
  }
}

export async function saveIndex(root: string, entries: readonly KnowledgeEntry[], now: string) {
  await mkdir(join(root, "entries"), { recursive: true })
  await writeAtomic(indexPath(root), JSON.stringify({ version: 1, updatedAt: now, entries }, null, 2) + "\n")
}

export async function writeEntry(root: string, entry: KnowledgeEntry) {
  await mkdir(join(root, "entries"), { recursive: true })
  await writeAtomic(entryPath(root, entry.id), JSON.stringify(entry, null, 2) + "\n")
}

export type AddOutcome =
  | { readonly status: "added"; readonly entry: KnowledgeEntry }
  | { readonly status: "merged"; readonly entry: KnowledgeEntry }
  | { readonly status: "rejected"; readonly reason: string }

/**
 * 入库：先过门槛，再按问题/标题去重。同一问题合并更新 answer、标签与使用次数，不新增条目。
 * 门槛与合并规则见 ./README.md。
 */
export async function addKnowledge(root: string, input: NewEntry, now: string): Promise<AddOutcome> {
  const admission = checkAdmission(input)
  if (!admission.ok) return { status: "rejected", reason: admission.message }

  const index = await loadIndex(root)
  const duplicate = findDuplicate(index.entries, { question: input.question, title: input.title })
  const entry = duplicate === undefined ? createEntry(input, now) : mergeEntry(duplicate, input, now)
  const entries = duplicate === undefined
    ? [...index.entries, entry]
    : index.entries.map((item) => (item.id === entry.id ? entry : item))
  await saveIndex(root, entries, now)
  await writeEntry(root, entry)
  return { status: duplicate === undefined ? "added" : "merged", entry }
}

export async function listKnowledge(
  root: string,
  options: { kind?: KnowledgeEntry["kind"]; query?: string; limit?: number } = {},
) {
  const index = await loadIndex(root)
  const filtered = options.kind === undefined ? index.entries : index.entries.filter((entry) => entry.kind === options.kind)
  const sorted = [...filtered].sort((left, right) => {
    if (left.usedCount !== right.usedCount) return right.usedCount - left.usedCount
    return left.createdAt < right.createdAt ? 1 : left.createdAt > right.createdAt ? -1 : 0
  })
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500)
  if (options.query === undefined || options.query.trim().length === 0) return sorted.slice(0, limit)
  return search(sorted, options.query, { topK: limit }).map((hit) => hit.entry)
}

export async function searchKnowledge(
  root: string,
  query: string,
  options: { topK?: number } = {},
): Promise<SearchHit[]> {
  const index = await loadIndex(root)
  return search(index.entries, query, options)
}

/** 记录被检索命中并实际引用过的条目，用于排序与淘汰。 */
export async function recordUsage(root: string, ids: readonly string[], now: string) {
  if (ids.length === 0) return
  const index = await loadIndex(root)
  const touched = new Set(ids)
  const entries = index.entries.map((entry) =>
    touched.has(entry.id) ? { ...entry, usedCount: entry.usedCount + 1, lastUsedAt: now } : entry,
  )
  await saveIndex(root, entries, now)
  await Promise.all(entries.filter((entry) => touched.has(entry.id)).map((entry) => writeEntry(root, entry)))
}

export async function removeKnowledge(root: string, id: string) {
  const index = await loadIndex(root)
  const remaining = index.entries.filter((entry) => entry.id !== id)
  if (remaining.length === index.entries.length) return false
  await saveIndex(root, remaining, new Date().toISOString())
  await rm(entryPath(root, id), { force: true })
  return true
}

export async function exportKnowledge(root: string) {
  const index = await loadIndex(root)
  return JSON.stringify({ version: 1, updatedAt: index.updatedAt, entries: index.entries }, null, 2) + "\n"
}

export interface ImportResult {
  readonly added: number
  readonly merged: number
  readonly rejected: number
  readonly details: readonly string[]
}

/**
 * 导入本地目录里的 md / txt：一个文件一条 doc 条目，标题取第一个 Markdown 标题或文件名。
 * 门槛与手动入库相同（纯链接、空文件会被拒），重复文件按标题合并。
 */
export async function importKnowledge(
  root: string,
  directories: readonly string[],
  now: string,
): Promise<ImportResult> {
  const files = (await Promise.all(directories.map((directory) => scan(directory)))).flat()
  const details: string[] = []
  let added = 0
  let merged = 0
  let rejected = 0
  for (const path of files) {
    const raw = await readFile(path, "utf8").catch(() => undefined)
    if (raw === undefined) {
      rejected += 1
      details.push(`${path}：读不到文件`)
      continue
    }
    const doc = parseDocument(path, raw)
    const outcome = await addKnowledge(
      root,
      {
        kind: "doc",
        title: doc.title,
        answer: doc.body,
        tags: doc.tags,
        source: "doc",
        confidence: 1,
      },
      now,
    )
    if (outcome.status === "added") added += 1
    else if (outcome.status === "merged") merged += 1
    else {
      rejected += 1
      details.push(`${path}：${outcome.reason}`)
    }
  }
  return { added, merged, rejected, details }
}

/** Markdown 的第一个一级/二级标题作标题，正文保留全文；txt 用文件名作标题。 */
export function parseDocument(path: string, raw: string) {
  const name = path.replace(/\\/g, "/").split("/").pop() ?? path
  const base = name.replace(/\.(md|markdown|txt)$/i, "")
  const heading = raw.match(/^\s{0,3}#{1,2}\s+(.+)$/m)?.[1]?.trim()
  const tags = [...raw.matchAll(/(?:^|\s)#([^\s#]{1,16})/g)].map((match) => match[1] ?? "").filter(Boolean)
  return {
    title: heading !== undefined && heading.length > 0 ? heading : base,
    body: raw.trim().slice(0, 20_000),
    tags: [...new Set(tags)].slice(0, 8),
  }
}

async function scan(directory: string, depth = 0): Promise<string[]> {
  if (depth > 4 || !existsSync(directory)) return []
  const children = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    children.map(async (child) => {
      const path = join(directory, child.name)
      if (child.isDirectory()) return scan(path, depth + 1)
      if (!/\.(md|markdown|txt)$/i.test(child.name)) return []
      const info = await stat(path).catch(() => undefined)
      return info?.isFile() ? [path] : []
    }),
  )
  return nested.flat()
}

async function writeAtomic(path: string, content: string) {
  const temporary = `${path}.tmp`
  await writeFile(temporary, content, "utf8")
  await rename(temporary, path)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
