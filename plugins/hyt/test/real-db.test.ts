import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { accountDirectory, accountOf, readCredentials, readLastUser, resolveChfileRoot } from "../src/account.js"
import { readMergeFile } from "../src/chat/merge.js"
import { openReadonly, listMessages, listSessions } from "../src/chat/store.js"

/**
 * 真实库的只读冒烟：确认字段形状与解析假设仍然成立。
 * 只以 readonly 打开，绝不写入；本机没有虹云通数据时整组跳过。
 */

const root = resolveChfileRoot("")
const credentials = readCredentials(root)
const chatPath = credentials === undefined ? "" : join(accountDirectory(root, credentials.account), "chatmsg.db")
const available = credentials !== undefined && existsSync(chatPath)

describe.skipIf(!available)("真实库只读", () => {
  test("login.db：上次登录用户能解析出账号与目录", () => {
    expect(readLastUser(root)?.length).toBeGreaterThan(0)
    expect(credentials?.account.startsWith("cs")).toBe(true)
    expect(credentials?.account).toBe(accountOf(credentials?.userName ?? ""))
    expect(existsSync(chatPath)).toBe(true)
  })

  test("chatmsg.db：会话与消息字段形状", () => {
    const db = openReadonly(chatPath)
    try {
      const sessions = listSessions(db, { limit: 5 })
      expect(Array.isArray(sessions)).toBe(true)
      for (const session of sessions) {
        expect(session.sessionId.length).toBeGreaterThan(0)
        expect(session.lastAt).toBeGreaterThan(0)
        expect(session.total).toBeGreaterThan(0)
      }
      const first = sessions[0]
      if (first === undefined) return
      const messages = listMessages(db, { sessionId: first.sessionId, limit: 5 })
      for (const message of messages) {
        expect(message.id).toBeGreaterThan(0)
        expect(message.sessionId).toBe(first.sessionId)
        expect(message.createdAt).toBeGreaterThan(0)
        expect(message.kind.length).toBeGreaterThan(0)
      }
    } finally {
      db.close()
    }
  })

  test("合并转发的文件能读就解码，读不到时返回空数组", async () => {
    const db = openReadonly(chatPath)
    try {
      const sessions = listSessions(db, { limit: 3 })
      const found = sessions.flatMap((session) =>
        listMessages(db, { sessionId: session.sessionId, limit: 50 }).filter((message) => message.kind === "merge"),
      )[0]
      if (found === undefined) return
      const items = await readMergeFile(found.fileFullPath)
      expect(Array.isArray(items)).toBe(true)
      for (const item of items) {
        expect(item.kind === "text" || item.kind === "image" || item.kind === "other").toBe(true)
      }
    } finally {
      db.close()
    }
  })
})
