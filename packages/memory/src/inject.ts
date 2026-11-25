export * as MemoryInject from "./inject.js"
import type { MemoryRecord } from "./types.js"

export const MAX_ENTRY_CHARS = 400

/**
 * The compact save-rules section for the static, byte-stable system prefix (cacheable).
 * Full guidance lives in the memory skill and loads on demand. Kept near 300 characters:
 * the model must always be able to see when to save, but this text is re-sent every step.
 */
export const PROTOCOL_SHORT = [
  "## Memory protocol",
  "Save when the user corrects your approach in a way that will apply again, states a lasting habit or preference, requires a long-term convention, or gives an important fact you will need again — judge by meaning, not wording.",
  "scope=global for personal habits, else the current project. Update instead of keeping contradictions; search when unsure. Never store secrets.",
].join(" ")

export function entryLine(record: MemoryRecord): string {
  const text =
    record.text.length > MAX_ENTRY_CHARS ? `${record.text.slice(0, MAX_ENTRY_CHARS - 1)}…` : record.text
  return record.tags.length > 0 ? `- ${text} (tags: ${record.tags.join(", ")})` : `- ${text}`
}

export interface RenderedBlock {
  readonly block: string
  readonly injected: readonly MemoryRecord[]
  /** Passed to the turn decision as `budget` misses so tuning data shows what the window cut. */
  readonly omitted: readonly MemoryRecord[]
}

const HEADER =
  "## Relevant memory (retrieved for this turn)\nMay be out of date; where it conflicts with the current request, the current request wins."

/** Greedy pack within `budget`; empty input renders to the empty string (inject nothing). */
export function renderBlock(entries: readonly MemoryRecord[], budget: number): RenderedBlock {
  if (entries.length === 0) return { block: "", injected: [], omitted: [] }
  const lines: string[] = [HEADER]
  const injected: MemoryRecord[] = []
  const omitted: MemoryRecord[] = []
  let used = HEADER.length + 1
  for (const entry of entries) {
    const line = entryLine(entry)
    if (used + line.length + 1 > budget) {
      omitted.push(entry)
      continue
    }
    lines.push(line)
    injected.push(entry)
    used += line.length + 1
  }
  if (injected.length === 0) return { block: "", injected: [], omitted }
  return { block: lines.join("\n"), injected, omitted }
}
