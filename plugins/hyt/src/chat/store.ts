import { Database } from "bun:sqlite"
import { noticeNames, resolveGroupNames } from "./groups.js"
import type { ChatRow } from "./message.js"
import { toMessage } from "./message.js"

/**
 * chatmsg.db / keepgroup / lastmsg 的读写，全部是「拿一个句柄做事」的纯函数：不缓存连接、不保留全局状态。
 * 读用只读连接；写自己发出的消息时用短事务 + busy_timeout + 失败重试，且不改 journal_mode（客户端默认 delete，
 * 改成 WAL 会改变客户端的行为）。
 */

const COLUMNS =
  "Id, MsgType, MsgId, Msg, Sender, SenderNick, Receiver, CreatedTime, LocalTime, SessionId, SessionType, UserData, FileName, FileUrl, FileFullPath, FileSize, GroupId, isAt, ReadStatus"

export function openReadonly(path: string) {
  const db = new Database(path, { readonly: true })
  db.exec("PRAGMA busy_timeout = 3000")
  return db
}

export function openWritable(path: string) {
  const db = new Database(path)
  db.exec("PRAGMA busy_timeout = 5000")
  return db
}

export interface SessionSummary {
  readonly sessionId: string
  readonly total: number
  readonly lastAt: number
  readonly lastText: string
  readonly groupName: string
  readonly unread: number
}

/**
 * 会话列表：以消息表为准聚出会话，群名按「手动映射 → 桥接缓存 → keepgroup → 成员默认名」解析，
 * 未读数来自 lastmsg。按最后一条消息时间倒序。
 */
export function listSessions(db: Database, input: { limit?: number; root?: string; account?: string } = {}): SessionSummary[] {
  const rows = db
    .query<
      { sessionId: string; total: number; lastAt: number | null; lastText: string | null; lastMsgType: number | null },
      [number]
    >(
      `select SessionId as sessionId, count(*) as total, max(cast(CreatedTime as integer)) as lastAt,
              (select Msg from chatmsg m2 where m2.SessionId = m1.SessionId order by m2.Id desc limit 1) as lastText,
              (select MsgType from chatmsg m3 where m3.SessionId = m1.SessionId order by m3.Id desc limit 1) as lastMsgType
       from chatmsg m1 group by SessionId order by lastAt desc limit ?1`,
    )
    .all(Math.min(Math.max(input.limit ?? 50, 1), 500))
  const groups = resolveGroupNames({
    root: input.root ?? "",
    keepgroup: new Map(groupNames(db).map((item) => [item.groupId, item.groupName])),
    members: groupMembers(db),
  })
  const unread = new Map(unreadCounts(db, input.account ?? "").map((item) => [item.sessionId, item.unread]))
  return rows.map((row) => ({
    sessionId: row.sessionId,
    total: row.total,
    lastAt: row.lastAt ?? 0,
    lastText: previewOf(row.lastMsgType, row.lastText),
    groupName: groups.get(row.sessionId) ?? "",
    unread: unread.get(row.sessionId) ?? 0,
  }))
}

export interface MessagesQuery {
  readonly sessionId: string
  /** 上一页最后一条的 Id；首页省略。 */
  readonly beforeId?: number
  readonly limit?: number
  /** epoch 毫秒，含边界。 */
  readonly since?: number
  readonly until?: number
}

/** 按会话分页，返回的是新→旧（和客户端聊天窗口的上滑加载一致）。 */
export function listMessages(db: Database, input: MessagesQuery) {
  const rows = db
    .query<ChatRow, [string, number | null, number | null, number | null, number]>(
      `select ${COLUMNS} from chatmsg
       where SessionId = ?1
         and (?2 is null or Id < ?2)
         and (?3 is null or cast(CreatedTime as integer) >= ?3)
         and (?4 is null or cast(CreatedTime as integer) <= ?4)
       order by Id desc limit ?5`,
    )
    .all(
      input.sessionId,
      input.beforeId ?? null,
      input.since ?? null,
      input.until ?? null,
      Math.min(Math.max(input.limit ?? 50, 1), 500),
    )
  return rows.map(toMessage)
}

/** 关键词搜索：正文、发送人昵称、文件名。query 里的 % 和 _ 按字面量处理。 */
export function searchMessages(
  db: Database,
  input: { query: string; sessionId?: string; limit?: number },
) {
  const needle = `%${input.query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  const rows = db
    .query<ChatRow, [string, string | null, number]>(
      `select ${COLUMNS} from chatmsg
       where (Msg like ?1 escape '\\' or SenderNick like ?1 escape '\\' or FileName like ?1 escape '\\')
         and (?2 is null or SessionId = ?2)
       order by Id desc limit ?3`,
    )
    .all(needle, input.sessionId ?? null, Math.min(Math.max(input.limit ?? 50, 1), 500))
  return rows.map(toMessage)
}

export function countMessages(db: Database, sessionId: string) {
  const row = db
    .query<{ total: number }, [string]>("select count(*) as total from chatmsg where SessionId = ?1")
    .get(sessionId)
  return row?.total ?? 0
}

/** 未读来自消息表：客户端把收到的消息记 `ReadStatus = 0`，看过置 1；`lastmsg.UnReadCount` 会被清空。 */
export function unreadCounts(db: Database, account: string) {
  return db
    .query<{ sessionId: string; unread: number }, [string, string, number]>(
      `select SessionId as sessionId, count(*) as unread from chatmsg
       where ReadStatus = 0 and (? = '' or Sender is null or Sender <> ?)
       group by SessionId order by unread desc limit ?`,
    )
    .all(account, account, 500)
}

export function groupNames(db: Database) {
  return db
    .query<{ groupId: string; groupName: string }, []>(
      "select GroupId as groupId, GroupName as groupName from keepgroup where GroupName is not null and GroupName <> ''",
    )
    .all()
}

/**
 * 群里发过言的成员昵称，按发言条数排序；用来给没有名字的群拼一个默认名。
 *
 * 客户端生成的默认群名包含自己，所以这里不按账号过滤。同一个人可能改过昵称，
 * 按发送者去重只留发言最多的那个，避免一个人占掉两个默认名位置。
 */
function groupMembers(db: Database) {
  const rows = db
    .query<{ sessionId: string; sender: string; nick: string; total: number }, []>(
      `select SessionId as sessionId, Sender as sender, SenderNick as nick, count(*) as total
       from chatmsg
       where SessionType = 1 and Sender is not null and Sender <> ''
         and SenderNick is not null and SenderNick <> ''
       group by SessionId, Sender, SenderNick
       order by SessionId, total desc, min(Id)`,
    )
    .all()
  const map = new Map<string, string[]>()
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.sessionId.length === 0 || row.sender.length === 0 || row.nick.length === 0) continue
    const key = `${row.sessionId}\u0000${row.sender}`
    if (seen.has(key)) continue
    seen.add(key)
    const names = map.get(row.sessionId) ?? []
    names.push(row.nick)
    map.set(row.sessionId, names)
  }
  // 只有邀请通知和自己的消息的群，从通知补出邀请人与被邀请人；排在发言成员之后，只在前三个不够时补位。
  for (const row of db
    .query<{ sessionId: string; userData: string }, []>(
      `select SessionId as sessionId, UserData as userData from chatmsg
       where SessionType = 1 and MsgType = 246 and UserData is not null and UserData <> ''
       order by Id`,
    )
    .all()) {
    if (row.sessionId.length === 0 || row.userData.length === 0) continue
    const names = map.get(row.sessionId) ?? []
    for (const name of noticeNames(row.userData)) {
      if (!names.includes(name)) names.push(name)
    }
    if (names.length > 0) map.set(row.sessionId, names)
  }
  return map
}

export interface OutgoingMessage {
  readonly sessionId: string
  readonly text: string
  readonly sender: string
  readonly senderNick: string
  /** epoch 毫秒，默认当前时间。 */
  readonly createdAt?: number
  /** 客户端同表同格式的 MsgId；省略时按「时间|随机」生成。 */
  readonly msgId?: string
}

/**
 * 把自己发出的消息写进 chatmsg，与客户端同表同格式，让原生客户端和插件看到同一份历史。
 * 插入 lastmsg 只是补一条未读计数为 0 的会话记录（insert or ignore），不覆盖客户端已有的未读数。
 */
export async function appendOwnMessage(db: Database, input: OutgoingMessage) {
  const text = input.text.trim()
  if (text.length === 0) throw new Error("消息内容不能为空。")
  const createdAt = input.createdAt ?? Date.now()
  const msgId = input.msgId ?? `${createdAt}|${Math.floor(Math.random() * 1_000_000)}`
  const sessionType = input.sessionId.startsWith("g") ? 1 : 0
  const write = db.transaction(() => {
    db.query(
      `insert into chatmsg
         (MsgType, MsgId, Msg, Sender, Receiver, CreatedTime, LocalTime, SessionId, SessionType, SenderNick, UserData, ReadStatus, isAt, isSave, isSuccess)
       values (1, ?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8, '', 1, 0, 1, 1)`,
    ).run(msgId, text, input.sender, input.sessionId, String(createdAt), input.sessionId, sessionType, input.senderNick)
    db.query("insert or ignore into lastmsg (SessionId, UnReadCount) values (?1, 0)").run(input.sessionId)
  })
  await retryBusy(() => write())
  return { msgId, createdAt }
}

/** 客户端同时写这张库，拿到 busy 就退让一下再试；三次之后把错误交给调用方。 */
async function retryBusy<T>(task: () => T, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return task()
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      if (!/SQLITE_BUSY|database is locked|SQLITE_LOCKED/i.test(message)) throw error
      await Bun.sleep(150 * attempt)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** 只有正文的会话摘要用类型标签兜底，和客户端的列表一致。 */
function previewOf(msgType: number | null, text: string | null) {
  const body = (text ?? "").replace(/\s+/g, " ").trim()
  if (body.length > 0) return body
  const label: Readonly<Record<number, string>> = {
    2: "[语音]",
    3: "[视频]",
    4: "[图片]",
    6: "[文件]",
    7: "[文件]",
    25: "[撤回了一条消息]",
    101: "[通话]",
    150: "[系统通知]",
    245: "[合并转发]",
    246: "[系统通知]",
  }
  return label[msgType ?? 0] ?? ""
}
