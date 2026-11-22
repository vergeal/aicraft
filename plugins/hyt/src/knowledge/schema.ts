/**
 * 知识库条目与入库门槛。标准正文见 ./README.md，这里只放可执行的判定：
 * 归一化、相似度、入库门槛、同问题合并。
 */

import { isEmojiOnly, isLinkOnly, normalizeText } from "../text.js"

export { isEmojiOnly, isLinkOnly, normalizeText } from "../text.js"

export const KINDS = ["qa", "faq", "runbook", "doc"] as const
export type KnowledgeKind = (typeof KINDS)[number]

export const SOURCES = ["manual", "doc", "history", "mcp"] as const
export type KnowledgeSource = (typeof SOURCES)[number]

export interface KnowledgeEntry {
  readonly id: string
  readonly kind: KnowledgeKind
  readonly title: string
  readonly question?: string
  readonly answer: string
  readonly tags: readonly string[]
  readonly source: KnowledgeSource
  readonly confidence: number
  readonly createdAt: string
  readonly usedCount: number
  readonly lastUsedAt: string
}

export interface NewEntry {
  readonly kind?: KnowledgeKind
  readonly title?: string
  readonly question?: string
  readonly answer: string
  readonly tags?: readonly string[]
  readonly source?: KnowledgeSource
  readonly confidence?: number
}

export const MIN_CONFIDENCE = 0.8
const MIN_INFORMATIVE_CHARS = 8
/** 归一化后 2-gram Dice 相似度达到这个值就视为同一个问题。 */
export const DUPLICATE_SIMILARITY = 0.8

export type Rejection = "low-confidence" | "greeting" | "emoji" | "link" | "too-short"

export type Admission = { readonly ok: true } | { readonly ok: false; readonly reason: Rejection; readonly message: string }

const GREETINGS = [
  "你好",
  "您好",
  "在吗",
  "在么",
  "在不在",
  "早上好",
  "下午好",
  "晚上好",
  "早安",
  "晚安",
  "哈喽",
  "收到",
  "好的",
  "好嘞",
  "谢谢",
  "多谢",
  "辛苦了",
  "hi",
  "hello",
  "hey",
  "thanks",
  "thank you",
  "ok",
  "okay",
]

export function checkAdmission(input: {
  readonly question?: string
  readonly answer: string
  readonly confidence?: number
}): Admission {
  const confidence = input.confidence ?? 1
  if (confidence < MIN_CONFIDENCE)
    return { ok: false, reason: "low-confidence", message: `置信度 ${confidence.toFixed(2)} 低于入库门槛 ${MIN_CONFIDENCE}。` }

  const answer = input.answer.trim()
  const normalized = normalizeText(answer)
  if (normalized.length === 0 || isEmojiOnly(answer))
    return { ok: false, reason: "emoji", message: "只有表情或标点的内容不入库。" }
  if (isGreeting(normalized)) return { ok: false, reason: "greeting", message: "寒暄不入库。" }
  if (isLinkOnly(answer)) return { ok: false, reason: "link", message: "纯链接不入库，请补上结论或步骤。" }
  if (normalizeText(`${input.question ?? ""}${answer}`).length < MIN_INFORMATIVE_CHARS)
    return { ok: false, reason: "too-short", message: `有效内容少于 ${MIN_INFORMATIVE_CHARS} 个字，没有可复用信息。` }
  return { ok: true }
}

export function isGreeting(normalized: string) {
  if (normalized.length > 12) return false
  return GREETINGS.some((greeting) => normalized === normalizeText(greeting))
}

/** 2-gram Dice 相似度，0..1；中文没有空格，2-gram 是最稳的近似。 */
export function similarity(a: string, b: string) {
  const left = bigrams(normalizeText(a))
  const right = bigrams(normalizeText(b))
  if (left.size === 0 || right.size === 0) return 0
  const shared = [...left].filter((gram) => right.has(gram)).length
  return (2 * shared) / (left.size + right.size)
}

export function isSameQuestion(a: string | undefined, b: string | undefined) {
  const left = normalizeText(a ?? "")
  const right = normalizeText(b ?? "")
  if (left.length === 0 || right.length === 0) return false
  if (left === right) return true
  return similarity(left, right) >= DUPLICATE_SIMILARITY
}

/** 找到可以合并的旧条目：先看问题，再看标题。 */
export function findDuplicate(entries: readonly KnowledgeEntry[], input: { question?: string; title?: string }) {
  return entries.find(
    (entry) => isSameQuestion(entry.question, input.question) || isSameQuestion(entry.title, input.title),
  )
}

export function createEntry(input: NewEntry, now: string, id = newId()): KnowledgeEntry {
  const answer = input.answer.trim()
  const title = input.title?.trim() ?? ""
  const question = input.question?.trim()
  return {
    id,
    kind: input.kind ?? "qa",
    title: title.length > 0 ? title : (question ?? answer).slice(0, 40),
    ...(question === undefined || question.length === 0 ? {} : { question }),
    answer,
    tags: normalizeTags(input.tags),
    source: input.source ?? "manual",
    confidence: clamp(input.confidence ?? 1),
    createdAt: now,
    usedCount: 0,
    lastUsedAt: now,
  }
}

/** 合并同问题的条目：答案取新的一条，标签取并集，置信度取高者，使用次数 +1。 */
export function mergeEntry(existing: KnowledgeEntry, input: NewEntry, now: string): KnowledgeEntry {
  return {
    ...existing,
    kind: input.kind ?? existing.kind,
    title: input.title?.trim() || existing.title,
    answer: input.answer.trim().length > 0 ? input.answer.trim() : existing.answer,
    tags: normalizeTags([...existing.tags, ...(input.tags ?? [])]),
    source: input.source ?? existing.source,
    confidence: Math.max(existing.confidence, clamp(input.confidence ?? existing.confidence)),
    usedCount: existing.usedCount + 1,
    lastUsedAt: now,
  }
}

export function normalizeTags(input: readonly string[] | undefined) {
  if (input === undefined) return []
  return [...new Set(input.map((tag) => tag.trim()).filter((tag) => tag.length > 0 && tag.length <= 24))].slice(0, 8)
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function bigrams(value: string) {
  const grams = new Set<string>()
  if (value.length === 0) return grams
  if (value.length === 1) {
    grams.add(value)
    return grams
  }
  for (let index = 0; index < value.length - 1; index++) grams.add(value.slice(index, index + 2))
  return grams
}

function newId() {
  return `kb_${crypto.randomUUID()}`
}
