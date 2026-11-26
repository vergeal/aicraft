import type { Database } from "bun:sqlite"
import type { ChatRow } from "../chat/message.js"
import { PRESENCE_MSGTYPE, toMessage } from "../chat/message.js"

/**
 * 游标式增量读取：后台分析要的是「Id 比上次更大」的新消息，与 chat/store 里按会话分页的语义不同，
 * 所以放在 AI 侧。表结构以 ChatRow 为准，select * 的列名就是客户端原表列名。
 * 输入状态（MsgType 12 的 0/1 标记）不是消息，官方客户端写进库也不该进分析批次，这里直接读掉。
 */

export function readSince(db: Database, afterId: number, limit: number) {
  const rows = db
    .query<ChatRow, [number, number]>(
      `select * from chatmsg where Id > ?1 and MsgType <> ${PRESENCE_MSGTYPE} order by Id asc limit ?2`,
    )
    .all(Math.max(0, Math.trunc(afterId)), Math.min(Math.max(Math.trunc(limit), 1), 500))
  return rows.map(toMessage)
}

/** 本地库里最大的消息 Id，用于首次启动时「从当前尾巴开始」，避免一次性把历史全灌进分析队列。 */
export function lastMessageId(db: Database) {
  const row = db.query<{ id: number | null }, []>("select max(Id) as id from chatmsg").get()
  return row?.id ?? 0
}

export function sessionNames(db: Database) {
  const rows = db
    .query<{ sessionId: string; groupName: string }, []>(
      "select GroupId as sessionId, GroupName as groupName from keepgroup where GroupName is not null and GroupName <> ''",
    )
    .all()
  return new Map(rows.map((row) => [row.sessionId, row.groupName]))
}
