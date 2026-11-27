export * as MemoryTokens from "./tokens.js"

const CJK = /[\p{Script=Han}]/u
const ASCII_WORD = /[a-z0-9_]+/gu

export function normalize(input: string): string {
  return input.normalize("NFKC").toLowerCase()
}

/**
 * CJK runs become character bigrams (a lone run of one contributes the single character),
 * ASCII runs become word tokens. Both sides — write and query — must use this exact
 * function, otherwise the precomputed `tokens` column and query tokens never meet.
 * The tokenizer exists because the bundled SQLite has no icu/simple tokenizer and
 * unicode61 matches zero CJK queries shorter than its word split (measured 2026-11).
 */
export function tokenize(input: string): string[] {
  const text = normalize(input)
  const out = new Set<string>()
  let run = ""
  const flushRun = () => {
    if (run.length === 0) return
    if (run.length === 1) out.add(run)
    for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2))
    run = ""
  }
  for (const char of text) {
    if (CJK.test(char)) {
      run += char
      continue
    }
    flushRun()
  }
  flushRun()
  for (const match of text.matchAll(ASCII_WORD)) out.add(match[0])
  return [...out]
}

const CJK_TOKEN = /^[\p{Script=Han}]+$/u

/**
 * Evidence toward turn auto-injection, not a ranking score. CJK runs tokenize to
 * segmentation-free bigrams, so one shared bigram ("继续" inside "…气泡下方继续") is a
 * coincidence — the live corpus injected a work note on every "继续" for a week. A whole
 * word token ("pp", "consul") carries identity on its own. Weighted so a turn hit needs
 * either one word token or two bigram coincidences.
 */
export function evidenceCount(queryTokens: ReadonlySet<string>, entryTokens: readonly string[]): number {
  let evidence = 0
  for (const token of entryTokens) {
    if (!queryTokens.has(token)) continue
    evidence += CJK_TOKEN.test(token) ? 1 : 2
  }
  return evidence
}

/** Query-normalized overlap: |intersection| / |query tokens|. Answers "how much of what the
 *  user asked is present in the entry", which stays meaningful for terse queries. */
export function tokenOverlap(queryTokens: ReadonlySet<string>, entryTokens: readonly string[]): number {
  if (queryTokens.size === 0) return 0
  let hits = 0
  for (const token of entryTokens) if (queryTokens.has(token)) hits += 1
  return Math.min(hits / queryTokens.size, 1)
}
