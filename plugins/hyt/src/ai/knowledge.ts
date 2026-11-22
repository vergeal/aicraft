import type { KnowledgeEntry } from "../knowledge/schema.js"
import { checkAdmission, createEntry, similarity } from "../knowledge/schema.js"
import type { SearchHit } from "../knowledge/search.js"
import { search } from "../knowledge/search.js"

/**
 * 回答前先查知识库：BM25 负责召回，Dice 相似度负责「是不是同一个问题」的判定。
 * 两个分数不能混：BM25 是相对排序分，不是 0–1；阈值必须用相似度算，否则换个语料就失灵。
 */

export const DEFAULT_SIMILARITY = 0.55
export const DEFAULT_TOP_K = 5

export interface AnswerMatch {
  readonly entry: KnowledgeEntry
  readonly similarity: number
  /** BM25 分，只用于展示排序，不参与阈值。 */
  readonly score: number
  /** 达到阈值：可以按已有答案改写成本人语气。 */
  readonly confident: boolean
}

/**
 * 检索并按相似度给出命中判定。返回按「相似度优先、BM25 次序」排序的前几条，
 * confident=false 的条目仍然返回，方便提示词里说明「最接近但不建议直接用」。
 */
export function matchAnswer(
  entries: readonly KnowledgeEntry[],
  question: string,
  options: { threshold?: number; topK?: number } = {},
): AnswerMatch[] {
  const threshold = options.threshold ?? DEFAULT_SIMILARITY
  const topK = options.topK ?? DEFAULT_TOP_K
  const query = question.trim()
  if (query.length === 0) return []
  const hits = search(entries, query, { topK: Math.max(topK, 1) * 2 })
  return hits
    .map((hit) => toMatch(hit, query))
    .filter((match) => match.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity || right.score - left.score)
    .slice(0, Math.max(topK, 1))
    .map((match) => ({ ...match, confident: match.similarity >= threshold }))
}

function toMatch(hit: SearchHit, query: string): Omit<AnswerMatch, "confident"> {
  const reference = hit.entry.question ?? hit.entry.title
  return { entry: hit.entry, score: hit.score, similarity: round(similarity(reference, query)) }
}

/** 命中的第一条（最相似且达到阈值）。没有命中返回 undefined，调用方走排障引导。 */
export function bestAnswer(
  entries: readonly KnowledgeEntry[],
  question: string,
  options: { threshold?: number; topK?: number } = {},
) {
  return matchAnswer(entries, question, options).find((match) => match.confident)
}

/**
 * 入库门槛的封装：先按 schema 的门槛判一次，再给出这条知识的来源判定结果。
 * 门槛本身在 ../knowledge/schema.ts，这里只做「写之前先看会不会被拒」的预检，避免模型反复试错。
 */
export function previewAdmission(input: { question?: string; answer: string; confidence?: number }) {
  return checkAdmission(input)
}

/** 从一段对话里挑出「值得写回知识库」的候选：有结论、不是寒暄、不是链接。 */
export function knowledgeCandidate(input: { question: string; answer: string; confidence?: number }) {
  const admission = checkAdmission(input)
  if (!admission.ok) return { ok: false as const, message: admission.message }
  return {
    ok: true as const,
    entry: createEntry(
      {
        kind: "qa",
        question: input.question,
        title: input.question.slice(0, 40),
        answer: input.answer,
        source: "history",
        confidence: input.confidence ?? 0.9,
      },
      new Date().toISOString(),
    ),
  }
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
