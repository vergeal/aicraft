import type { KnowledgeEntry } from "./schema.js"

/**
 * 检索打分：中文按 2-gram 建倒排索引，用 BM25 排序；英文/数字按整词。
 * 纯函数实现，条目量在几千级时一次全量打分即可，不需要持久化索引。
 */

export interface SearchHit {
  readonly entry: KnowledgeEntry
  readonly score: number
}

const K1 = 1.2
const B = 0.75

export function search(
  entries: readonly KnowledgeEntry[],
  query: string,
  options: { topK?: number } = {},
): SearchHit[] {
  const queryTokens = [...new Set(tokenize(query))]
  if (queryTokens.length === 0 || entries.length === 0) return []

  const documents = entries.map((entry) => {
    const tokens = tokenize([entry.title, entry.question ?? "", entry.answer, entry.tags.join(" ")].join(" "))
    const frequencies = new Map<string, number>()
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
    return { entry, frequencies, length: tokens.length }
  })

  const averageLength = documents.reduce((sum, doc) => sum + doc.length, 0) / documents.length || 1
  const frequencyInCorpus = new Map(queryTokens.map((token) => [token, documentFrequency(documents, token)]))
  const hits = documents
    .map((doc) => {
      const score = queryTokens.reduce((total, token) => {
        const frequency = doc.frequencies.get(token) ?? 0
        if (frequency === 0) return total
        const df = frequencyInCorpus.get(token) ?? 0
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5))
        const normalizer = K1 * (1 - B + (B * doc.length) / averageLength)
        return total + idf * ((frequency * (K1 + 1)) / (frequency + normalizer))
      }, 0)
      return { entry: doc.entry, score }
    })
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score)

  return hits.slice(0, Math.max(1, options.topK ?? 5))
}

/** 中文 2-gram + 英文整词；标点与空白不参与。 */
export function tokenize(value: string): string[] {
  const lower = value.toLowerCase()
  const tokens: string[] = []
  for (const word of lower.match(/[a-z0-9_]+/g) ?? []) tokens.push(word)
  for (const run of lower.match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length === 1) {
      tokens.push(run)
      continue
    }
    for (let index = 0; index < run.length - 1; index++) tokens.push(run.slice(index, index + 2))
  }
  return tokens
}

function documentFrequency(
  documents: readonly { readonly frequencies: ReadonlyMap<string, number> }[],
  token: string,
) {
  return documents.reduce((count, doc) => (doc.frequencies.has(token) ? count + 1 : count), 0)
}
