import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { DEFAULT_MAX_CHARS, DEFAULT_MAX_DRAFTS } from "./prompt.js"

/**
 * 草稿箱：<plugin data>/hyt/drafts.json。聊天页只读这份文件，插件与工具只写它，
 * 不把草稿塞进 chatmsg——草稿不是消息，混进去会让客户端的会话列表出现幽灵记录。
 */

export type DraftStatus = "pending" | "sent" | "discarded"

export interface Draft {
  readonly id: string
  readonly sessionId: string
  readonly sessionName: string
  /** 来源消息的行 id，用于在聊天页高亮「这条是给哪几条消息的回复」。 */
  readonly messageIds: readonly number[]
  readonly replies: readonly string[]
  /** 为什么这么回：引用的知识条目、历史讨论。 */
  readonly reason: string
  readonly knowledgeIds: readonly string[]
  readonly status: DraftStatus
  readonly createdAt: string
  readonly sends: readonly DraftSend[]
}

export interface DraftSend {
  readonly text: string
  readonly msgId: string
  readonly at: string
  readonly recorded: boolean
}

export interface DraftFile {
  readonly version: 1
  readonly updatedAt: string
  readonly drafts: readonly Draft[]
}

const MAX_HISTORY = 200

export function draftsPath(dataDir: string) {
  return join(dataDir, "hyt", "drafts.json")
}

export async function loadDrafts(dataDir: string): Promise<Draft[]> {
  const file = Bun.file(draftsPath(dataDir))
  if (!(await file.exists())) return []
  const parsed = await file.json().catch(() => undefined)
  if (!isRecord(parsed) || !Array.isArray(parsed.drafts)) return []
  return parsed.drafts.flatMap((item) => decodeDraft(item))
}

export async function saveDrafts(dataDir: string, drafts: readonly Draft[], now: string) {
  const path = draftsPath(dataDir)
  await mkdir(join(dataDir, "hyt"), { recursive: true })
  const value: DraftFile = { version: 1, updatedAt: now, drafts: [...drafts] }
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + "\n", "utf8")
  await rename(`${path}.tmp`, path)
}

export interface PutDraftInput {
  readonly sessionId: string
  readonly sessionName?: string
  readonly messageIds?: readonly number[]
  readonly replies: readonly string[]
  readonly reason?: string
  readonly knowledgeIds?: readonly string[]
}

/**
 * 写入一条草稿。同一会话里「为同一批消息」的旧 pending 草稿会被替换，
 * 避免分析循环反复投递后草稿箱堆满同一段对话的多个版本。
 */
export async function putDraft(dataDir: string, input: PutDraftInput, now: string) {
  const { replies, warnings } = checkReplies(input.replies)
  if (replies.length === 0) throw new Error("草稿正文为空，没有写入。")
  const messageIds = [...(input.messageIds ?? [])]
  const drafts = await loadDrafts(dataDir)
  const existing = drafts.find(
    (draft) => draft.status === "pending" && draft.sessionId === input.sessionId && sameIds(draft.messageIds, messageIds),
  )
  const draft: Draft = {
    id: existing?.id ?? `draft_${crypto.randomUUID()}`,
    sessionId: input.sessionId,
    sessionName: input.sessionName?.trim() ?? existing?.sessionName ?? "",
    messageIds,
    replies,
    reason: input.reason?.trim() ?? "",
    knowledgeIds: [...(input.knowledgeIds ?? [])],
    status: "pending",
    createdAt: now,
    sends: existing?.sends ?? [],
  }
  const next = existing === undefined ? [...drafts, draft] : drafts.map((item) => (item.id === draft.id ? draft : item))
  await saveDrafts(dataDir, prune(next), now)
  return { draft, warnings }
}

export async function markDraft(
  dataDir: string,
  id: string,
  status: DraftStatus,
  now: string,
  send?: DraftSend,
) {
  const drafts = await loadDrafts(dataDir)
  const target = drafts.find((draft) => draft.id === id)
  if (target === undefined) return undefined
  const updated: Draft = {
    ...target,
    status,
    sends: send === undefined ? target.sends : [...target.sends, send],
  }
  await saveDrafts(dataDir, drafts.map((draft) => (draft.id === id ? updated : draft)), now)
  return updated
}

export async function pendingDrafts(dataDir: string) {
  return (await loadDrafts(dataDir)).filter((draft) => draft.status === "pending")
}

/**
 * 输出约束：≤ maxDrafts 条、每条 ≤ maxChars 字、中文。
 * 超长的先按句末标点截断，仍超长才硬截；并把问题放进 warnings 让调用方回传，不要静默丢内容。
 */
export function checkReplies(
  replies: readonly string[],
  options: { maxDrafts?: number; maxChars?: number } = {},
) {
  const maxDrafts = options.maxDrafts ?? DEFAULT_MAX_DRAFTS
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  const warnings: string[] = []
  const kept: string[] = []
  for (const raw of replies) {
    const text = raw.replace(/\s+/g, " ").trim()
    if (text.length === 0) continue
    if (kept.includes(text)) continue
    if (kept.length >= maxDrafts) {
      warnings.push(`草稿最多 ${maxDrafts} 条，已忽略多出的内容。`)
      break
    }
    if (visualLength(text) <= maxChars) {
      kept.push(text)
      continue
    }
    const clipped = clip(text, maxChars)
    warnings.push(`一条草稿超过 ${maxChars} 字，已截断为「${clipped}」，请改写得更短。`)
    kept.push(clipped)
  }
  if (kept.length === 0) warnings.push("没有可用的草稿正文。")
  return { replies: kept, warnings }
}

/** 视觉长度：按字符数算，避免 emoji 与全角符号把 80 字撑成 160。 */
export function visualLength(text: string) {
  return [...text].length
}

function clip(text: string, maxChars: number) {
  const head = [...text].slice(0, maxChars).join("")
  const broken = head.search(/[。！？!?；;]\s*$/)
  if (broken > maxChars * 0.5) return head.slice(0, broken + 1)
  return head
}

function sameIds(left: readonly number[], right: readonly number[]) {
  if (left.length !== right.length) return false
  return left.every((id, index) => id === right[index])
}

/** 只保留最近 200 条，并让 pending 永远优先保留。 */
function prune(drafts: readonly Draft[]) {
  if (drafts.length <= MAX_HISTORY) return drafts
  const pending = drafts.filter((draft) => draft.status === "pending")
  const history = drafts.filter((draft) => draft.status !== "pending").slice(-(MAX_HISTORY - pending.length))
  return [...history, ...pending].sort((left, right) => (left.createdAt < right.createdAt ? -1 : 1))
}

function decodeDraft(item: unknown): Draft[] {
  if (!isRecord(item)) return []
  const id = text(item.id)
  const sessionId = text(item.sessionId)
  if (id.length === 0 || sessionId.length === 0) return []
  const replies = Array.isArray(item.replies) ? item.replies.filter((reply): reply is string => typeof reply === "string") : []
  const sends = Array.isArray(item.sends)
    ? item.sends.flatMap((send) => {
        if (!isRecord(send)) return []
        return [
          {
            text: text(send.text),
            msgId: text(send.msgId),
            at: text(send.at),
            recorded: send.recorded === true,
          },
        ]
      })
    : []
  return [
    {
      id,
      sessionId,
      sessionName: text(item.sessionName),
      messageIds: Array.isArray(item.messageIds)
        ? item.messageIds.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
        : [],
      replies,
      reason: text(item.reason),
      knowledgeIds: Array.isArray(item.knowledgeIds)
        ? item.knowledgeIds.filter((value): value is string => typeof value === "string")
        : [],
      status: item.status === "sent" || item.status === "discarded" ? item.status : "pending",
      createdAt: text(item.createdAt) || new Date(0).toISOString(),
      sends,
    },
  ]
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
