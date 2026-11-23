import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { ReceiptNotice } from "../../src/chat/receipts.js"
import { targetMessageId } from "../../src/chat/receipts.js"

/**
 * 已读回执账本：msgId →「谁在什么时候读的」。
 *
 * 回执是桥接的实时推送，离线期间补不回来；这里落一份盘，让应用重启后仍能显示已经收到的记录。
 * 账本只存事实，不推断未读人数——未读要减去群成员，那是主进程按会话成员算的。
 */

/** 一条消息的回执。 */
export interface ReceiptRecord {
  /** 通知里带的会话 id，可能为空。 */
  readonly sessionId: string
  /** 账号 → 已读时间（epoch 毫秒）。 */
  readonly read: ReadonlyMap<string, number>
}

interface Stored {
  sessionId: string
  read: Map<string, number>
}

const VERSION = 1
/** 只保留最近这么多条消息的回执：再旧的界面也翻不到，无限长下去会拖慢启动。 */
const MAX_MESSAGES = 2_000
const SAVE_DELAY = 1_500

export function createReceiptLedger(path: string) {
  const messages = new Map<string, Stored>()
  let loaded = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const load = () => {
    if (loaded) return
    loaded = true
    if (!existsSync(path)) return
    const parsed = parse(readFileSync(path, "utf8"))
    if (parsed === undefined) return
    for (const entry of parsed) messages.set(entry.msgId, { sessionId: entry.sessionId, read: entry.read })
  }

  const save = () => {
    timer = undefined
    const list = [...messages.entries()].map(([msgId, item]) => ({
      msgId,
      sessionId: item.sessionId,
      read: [...item.read.entries()],
    }))
    try {
      mkdirSync(dirname(path), { recursive: true })
      const temporary = `${path}.tmp`
      writeFileSync(temporary, JSON.stringify({ version: VERSION, messages: list }), "utf8")
      renameSync(temporary, path)
    } catch {
      // 回执是附属数据，写盘失败不能影响界面；下一次有变化会再试。
    }
  }

  const trim = () => {
    while (messages.size > MAX_MESSAGES) {
      const oldest = messages.keys().next()
      if (oldest.done === true) break
      messages.delete(oldest.value)
    }
  }

  const schedule = () => {
    if (timer !== undefined) return
    timer = setTimeout(save, SAVE_DELAY)
  }

  return {
    /** 收一条回执；同一个人对同一条消息只记第一次，返回账本是否有变化。 */
    record(notice: ReceiptNotice, self: string) {
      if (notice.account.length === 0 || notice.account === self) return false
      load()
      const msgId = targetMessageId(notice)
      if (msgId.length === 0) return false
      const current = messages.get(msgId) ?? { sessionId: notice.sessionId, read: new Map<string, number>() }
      if (current.read.has(notice.account)) return false
      if (current.sessionId.length === 0) current.sessionId = notice.sessionId
      current.read.set(notice.account, notice.at)
      messages.delete(msgId)
      messages.set(msgId, current)
      trim()
      schedule()
      return true
    },

    get(msgId: string): ReceiptRecord | undefined {
      load()
      const item = messages.get(msgId)
      return item === undefined ? undefined : { sessionId: item.sessionId, read: item.read }
    },

    /** 应用退出前把还没落盘的变化写掉。 */
    flush() {
      if (timer !== undefined) clearTimeout(timer)
      if (loaded) save()
    },
  }
}

function parse(raw: string): { msgId: string; sessionId: string; read: Map<string, number> }[] | undefined {
  const value = parseJson(raw)
  if (typeof value !== "object" || value === null) return undefined
  const messages = (value as { messages?: unknown }).messages
  if (!Array.isArray(messages)) return undefined
  return messages.flatMap((item) => {
    if (typeof item !== "object" || item === null) return []
    const entry = item as { msgId?: unknown; sessionId?: unknown; read?: unknown }
    const msgId = typeof entry.msgId === "string" ? entry.msgId : ""
    if (msgId.length === 0) return []
    const read = new Map<string, number>()
    if (Array.isArray(entry.read)) {
      for (const pair of entry.read) {
        if (!Array.isArray(pair)) continue
        const [account, at] = pair
        if (typeof account !== "string" || account.length === 0) continue
        if (typeof at !== "number" || !Number.isFinite(at)) continue
        read.set(account, at)
      }
    }
    return [{ msgId, sessionId: typeof entry.sessionId === "string" ? entry.sessionId : "", read }]
  })
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}
