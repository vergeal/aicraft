import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * AI 自己发出的消息 id：风格学习必须把它们排除，否则会越学越像自己。
 * 存在 <plugin data>/hyt/ai-sent.json，只保留最近 2000 条。
 */

export interface SentRecord {
  readonly id: string
  readonly at: string
}

export interface SentFile {
  readonly version: 1
  readonly ids: readonly SentRecord[]
}

const MAX_IDS = 2_000

export function sentPath(dataDir: string) {
  return join(dataDir, "hyt", "ai-sent.json")
}

export async function loadSent(dataDir: string): Promise<SentRecord[]> {
  const file = Bun.file(sentPath(dataDir))
  if (!(await file.exists())) return []
  const parsed = await file.json().catch(() => undefined)
  if (!isRecord(parsed) || !Array.isArray(parsed.ids)) return []
  return parsed.ids.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string") return []
    return [{ id: item.id, at: typeof item.at === "string" ? item.at : "" }]
  })
}

export async function loadSentIds(dataDir: string) {
  return new Set((await loadSent(dataDir)).map((record) => record.id))
}

/** 记一条 AI 发出的消息；同 id 重复记录会被去重。 */
export async function markSent(dataDir: string, id: string, now: string) {
  const value = id.trim()
  if (value.length === 0) return
  const records = (await loadSent(dataDir)).filter((record) => record.id !== value)
  const next: SentFile = { version: 1, ids: [...records, { id: value, at: now }].slice(-MAX_IDS) }
  const path = sentPath(dataDir)
  await mkdir(join(dataDir, "hyt"), { recursive: true })
  await writeFile(`${path}.tmp`, JSON.stringify(next, null, 2) + "\n", "utf8")
  await rename(`${path}.tmp`, path)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
