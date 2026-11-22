import { existsSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { resolveGroupNames } from "../../src/chat/groups.js"
import { kindOf, toMessage } from "../../src/chat/message.js"
import type { ChatRow } from "../../src/chat/message.js"
import type { MessageRow, SessionRow } from "./contract.js"
import { toneOf } from "./util.js"

/**
 * 主进程侧对客户端本地的只读访问。
 *
 * 不用 `src/chat/store.ts`：那份实现依赖 `bun:sqlite`，Electron 主进程里没有 Bun。这里的 SQL 与它保持一致
 * （同一张表、同一个分页游标），解析仍复用 `src/chat/message.ts`，避免两套字段含义。
 */

const COLUMNS =
  "Id, MsgType, MsgId, Msg, Sender, SenderNick, Receiver, CreatedTime, LocalTime, SessionId, SessionType, UserData, FileName, FileUrl, FileFullPath, FileSize, GroupId, isAt, ReadStatus"

const PAGE_SIZE = 40
const SESSION_LIMIT = 300

/** SQLite 的值只有这几种有效形态；在这里归一化一次，后面的代码只面对 `Cell`。 */
type Cell = string | number | null
type Row = Readonly<Record<string, Cell>>

export interface PersonView {
  readonly account: string
  readonly name: string
  readonly department: string
  readonly headPath: string
}

export function chatDbPath(root: string, account: string) {
  return join(root, account, "chatmsg.db")
}

export function addressDbPath(root: string, account: string) {
  return join(root, account, "AddressBookDB.db")
}

/** 本地有这个账号的消息库，才认为可以进入聊天界面。 */
export function hasChatData(root: string, account: string) {
  return account.length > 0 && existsSync(chatDbPath(root, account))
}

/** bridge 只把人端口写进发现文件；这里只判断它是否在，不连它。 */
export function bridgeRunning(root: string) {
  return existsSync(join(root, "Config", "bridge.json"))
}

/** 会话列表：消息表聚合 + 群名 + lastmsg 未读 + 通讯录显示名。 */
export function readSessions(root: string, account: string, marked: ReadonlyMap<string, number>): SessionRow[] {
  const path = chatDbPath(root, account)
  if (!existsSync(path)) return []
  const db = open(path)
  try {
    const aggregates = readAggregates(db)
    if (aggregates.length === 0) return []
    const details = query(
      db,
      `select Id, MsgType, Msg, Sender, SenderNick, Receiver, CreatedTime, FileName, SessionType, isAt
       from chatmsg where Id in (${aggregates.map(() => "?").join(",")})`,
      aggregates.map((item) => item.lastId),
    ).flatMap((row) => {
      const detail = chatRow(row)
      return detail.Id === null ? [] : [{ ...detail, Id: detail.Id }]
    })
    const byId = new Map(details.map((item) => [item.Id, item]))
    const groups = resolveGroupNames({
      root,
      keepgroup: readGroupNames(db),
      members: readGroupMembers(db, account),
    })
    const unread = readUnread(db, account)
    const people = readPeople(root, account)
    const groupHeads = readGroupHeads(db, people)
    return aggregates.flatMap((item) => {
      const detail = byId.get(item.lastId)
      if (detail === undefined) return []
      const group = detail.SessionType === 1 || item.sessionId.startsWith("g")
      const person = people.get(item.sessionId)
      const nick = detail.Sender === account ? "" : text(detail.SenderNick)
      const name = group
        ? (groups.get(item.sessionId) ?? "群聊")
        : (person?.remark || person?.name || nick || item.sessionId)
      return [
        {
          id: item.sessionId,
          name: name.length > 0 ? name : item.sessionId,
          preview: previewOf(detail),
          lastAt: item.lastAt ?? 0,
          unread: markedAt(item, marked, unread),
          atMe: item.atMe === 1,
          group,
          tone: toneOf(item.sessionId),
          headPaths: group
            ? groupHeadsFor(groupHeads.get(item.sessionId))
            : person?.headPath
              ? [person.headPath]
              : [],
        },
      ]
    })
  } finally {
    db.close()
  }
}

/** 一页消息，旧→新；`hasMore` 表示这一页之前还有更早的。 */
export function readMessages(
  root: string,
  account: string,
  sessionId: string,
  beforeId: number | undefined,
  limit = PAGE_SIZE,
): { messages: MessageRow[]; hasMore: boolean } {
  const path = chatDbPath(root, account)
  if (!existsSync(path) || sessionId.length === 0) return { messages: [], hasMore: false }
  const db = open(path)
  try {
    const rows = query(
      db,
      `select ${COLUMNS} from chatmsg
       where SessionId = ?1 and (?2 is null or Id < ?2)
       order by Id desc limit ?3`,
      [sessionId, beforeId ?? null, limit + 1],
    ).map(chatRow)
    const known = rows.filter((row): row is ChatRow & { Id: number } => row.Id !== null)
    const hasMore = known.length > limit
    const people = readPeople(root, account)
    const page = (hasMore ? known.slice(0, limit) : known).map((row) => messageRow(row, account, people))
    return { messages: page.reverse(), hasMore }
  } finally {
    db.close()
  }
}

/** 跨会话搜索正文、发送人与文件名。会话名由调用方补，避免这里再聚一次会话。 */
export function searchMessages(
  root: string,
  account: string,
  needle: string,
  limit = 30,
): { sessionId: string; message: MessageRow }[] {
  const path = chatDbPath(root, account)
  const body = needle.trim()
  if (!existsSync(path) || body.length === 0) return []
  const pattern = `%${body.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  const db = open(path)
  try {
    const people = readPeople(root, account)
    return query(
      db,
      `select ${COLUMNS} from chatmsg
       where (Msg like ?1 escape '\\' or SenderNick like ?1 escape '\\' or FileName like ?1 escape '\\')
       order by Id desc limit ?2`,
      [pattern, limit],
    ).flatMap((raw) => {
      const row = chatRow(raw)
      const sessionId = text(row.SessionId)
      if (row.Id === null || sessionId.length === 0) return []
      return [{ sessionId, message: messageRow({ ...row, Id: row.Id }, account, people) }]
    })
  } finally {
    db.close()
  }
}

/**
 * 当前会话的成员：只取在该会话里发过言的人，按最后发言时间倒序。
 *
 * 通讯录是全公司的（实测 800 人），把它整表铺到右栏既没用又刺眼；群聊看群成员，
 * 单聊只剩对方一个。没在会话里说过话的人不列出来，@ 选人也只在这个范围内找人。
 */
export function readSessionMembers(
  root: string,
  account: string,
  sessionId: string,
  limit = 40,
): PersonView[] {
  if (sessionId.length === 0) return []
  const chatPath = chatDbPath(root, account)
  const addressPath = addressDbPath(root, account)
  if (!existsSync(chatPath) || !existsSync(addressPath)) return []

  const chat = open(chatPath)
  let order: string[] = []
  try {
    order = query(
      chat,
      `select Sender, max(CreatedTime) as last from chatmsg
       where SessionId = ?1 and Sender is not null and Sender <> ''
       group by Sender order by last desc limit ?2`,
      [sessionId, limit],
    ).flatMap((row) => {
      const id = text(row.Sender)
      return id.length === 0 || id === account ? [] : [id]
    })
  } finally {
    chat.close()
  }
  if (order.length === 0) return []

  const address = open(addressPath)
  try {
    const rows = query(
      address,
      `select Account, Name, Remark, DptFullName, LocalHeadUrl from Person
       where Account in (${order.map(() => "?").join(", ")})`,
      order,
    )
    const known = new Map(
      rows.flatMap((row) => {
        const id = text(row.Account)
        if (id.length === 0) return []
        return [
          [
            id,
            {
              account: id,
              name: text(row.Remark) || text(row.Name) || id,
              department: text(row.DptFullName),
              headPath: text(row.LocalHeadUrl),
            } satisfies PersonView,
          ] as const,
        ]
      }),
    )
    // 保持「最近发言在前」的顺序；通讯录里查不到的人仍占一行，用账号当名字。
    return order.map((id) => known.get(id) ?? { account: id, name: id, department: "", headPath: "" })
  } finally {
    address.close()
  }
}

export function countSessions(root: string, account: string) {
  const path = chatDbPath(root, account)
  if (!existsSync(path)) return 0
  const db = open(path)
  try {
    const row = db.prepare("select count(distinct SessionId) as total from chatmsg").get()
    return row === undefined ? 0 : (numberOf(row.total) ?? 0)
  } catch {
    return 0
  } finally {
    db.close()
  }
}

function open(path: string) {
  return new DatabaseSync(path, { readOnly: true })
}

/** 读一行数据；查询失败返回空表，界面显示空态而不是崩掉。 */
function query(db: DatabaseSync, sql: string, params: readonly (string | number | null)[]): Row[] {
  try {
    return db.prepare(sql).all(...params).flatMap(normalize)
  } catch {
    return []
  }
}

/** `node:sqlite` 还会返回 bigint 与字节数组：前者安全转数字，其余一律当空值。 */
function normalize(value: unknown): Row[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return []
  const out: Record<string, Cell> = {}
  for (const [key, cell] of Object.entries(value)) {
    out[key] = typeof cell === "string" || typeof cell === "number" ? cell : numberOf(cell)
  }
  return [out]
}

function readAggregates(db: DatabaseSync) {
  return query(db, aggregatesSql(), [SESSION_LIMIT]).flatMap((row) => {
    const sessionId = text(row.sessionId)
    const lastId = numberOf(row.lastId)
    if (sessionId.length === 0 || lastId === null) return []
    return [
      {
        sessionId,
        lastId,
        total: numberOf(row.total) ?? 0,
        atMe: numberOf(row.atMe),
        lastAt: numberOf(row.lastAt),
      },
    ]
  })
}

function aggregatesSql() {
  return `select SessionId as sessionId, max(Id) as lastId, count(*) as total,
                 max(isAt) as atMe, max(cast(CreatedTime as integer)) as lastAt
          from chatmsg group by SessionId order by lastAt desc limit ?1`
}

function readGroupNames(db: DatabaseSync) {
  const map = new Map<string, string>()
  for (const row of query(db, "select GroupId, GroupName from keepgroup where GroupName is not null and GroupName <> ''", [])) {
    const id = text(row.GroupId)
    const name = text(row.GroupName)
    if (id.length > 0 && name.length > 0) map.set(id, name)
  }
  return map
}

/** 群里发过言的成员昵称，按发言条数排序；用来给没有名字的群拼一个默认名。 */
function readGroupMembers(db: DatabaseSync, account: string) {
  const map = new Map<string, string[]>()
  for (const row of query(
    db,
    `select SessionId as sessionId, SenderNick as nick, count(*) as total
     from chatmsg
     where SessionType = 1 and Sender <> ? and SenderNick is not null and SenderNick <> ''
     group by SessionId, SenderNick
     order by SessionId, total desc, min(Id)`,
    [account],
  )) {
    const sessionId = text(row.sessionId)
    const nick = text(row.nick)
    if (sessionId.length === 0 || nick.length === 0) continue
    const names = map.get(sessionId) ?? []
    names.push(nick)
    map.set(sessionId, names)
  }
  return map
}

function markedAt(
  item: { readonly sessionId: string; readonly lastAt: number | null },
  marked: ReadonlyMap<string, number>,
  unread: ReadonlyMap<string, number>,
) {
  const at = marked.get(item.sessionId)
  if (at !== undefined && (item.lastAt ?? 0) <= at) return 0
  return unread.get(item.sessionId) ?? 0
}

/**
 * 未读以 `chatmsg.ReadStatus = 0` 为准，不看 `lastmsg.UnReadCount`。
 *
 * 客户端收到消息时把 `ReadStatus` 置 0、看过置 1；而 `lastmsg.UnReadCount` 会被客户端在启动后清空
 * （实测全表为 0），拿它算角标永远是 0。系统通知的 `Sender` 为空，也要算未读。
 */
function readUnread(db: DatabaseSync, account: string) {
  const map = new Map<string, number>()
  const rows = query(
    db,
    `select SessionId, count(*) as total from chatmsg
     where ReadStatus = 0 and (? = '' or Sender is null or Sender <> ?)
     group by SessionId`,
    [account, account],
  )
  for (const row of rows) {
    const id = text(row.SessionId)
    const count = numberOf(row.total)
    if (id.length > 0 && count !== null) map.set(id, count)
  }
  return map
}

interface PersonEntry {
  readonly name: string
  readonly remark: string
  readonly headPath: string
}

function readPeople(root: string, account: string) {
  const map = new Map<string, PersonEntry>()
  const path = addressDbPath(root, account)
  if (!existsSync(path)) return map
  const db = open(path)
  try {
    for (const row of query(db, "select Account, Name, Remark, DptFullName, IsFriend, LocalHeadUrl, Url from Person where Account is not null and Account <> ''", [])) {
      const key = text(row.Account)
      if (key.length === 0) continue
      map.set(key, {
        name: text(row.Name),
        remark: text(row.Remark),
        headPath: localHeadFile(root, text(row.LocalHeadUrl), text(row.Url)),
      })
    }
  } finally {
    db.close()
  }
  return map
}

/**
 * 本地头像文件。`LocalHeadUrl` 有文件就直接用；否则按 `Url` 最后一段首个 `.` 之前的部分去 `HeadFiles` 找。
 * 客户端下载头像时就是用这个文件名，所以远程地址与本地文件能对得上。
 */
function localHeadFile(root: string, local: string, url: string) {
  if (local.length > 0 && existsSync(local)) return local
  const base = url.split("?")[0]?.split("/").pop() ?? ""
  const key = base.split(".")[0] ?? ""
  if (key.length === 0) return ""
  const path = join(root, "HeadFiles", key)
  return existsSync(path) ? path : ""
}

/**
 * 群聊头像只用能拼成合照的两张以上：客户端在只有一名成员有头像时画的是群默认图，
 * 把某个成员的证件照当成群头像，在列表里会分不清群聊和单聊。
 */
function groupHeadsFor(heads: readonly string[] | undefined) {
  return heads !== undefined && heads.length > 1 ? heads : []
}

/**
 * 群聊头像：取该群消息发送人里前 4 个有头像的账号，按首次出现顺序。
 */
function readGroupHeads(db: DatabaseSync, people: Map<string, PersonEntry>) {
  const map = new Map<string, string[]>()
  for (const row of query(
    db,
    "select SessionId, Sender from chatmsg where SessionType = 1 group by SessionId, Sender order by SessionId, min(Id)",
    [],
  )) {
    const sessionId = text(row.SessionId)
    const sender = text(row.Sender)
    if (sessionId.length === 0 || sender.length === 0) continue
    const headPath = people.get(sender)?.headPath
    if (headPath === undefined || headPath.length === 0) continue
    const heads = map.get(sessionId) ?? []
    if (heads.length >= 4 || heads.includes(headPath)) {
      map.set(sessionId, heads)
      continue
    }
    heads.push(headPath)
    map.set(sessionId, heads)
  }
  return map
}

/** 把一行归一到 `ChatRow`；缺失列留 null，`toMessage` 自己兜底。 */
function chatRow(row: Row): ChatRow {
  return {
    Id: numberOf(row.Id),
    MsgType: numberOf(row.MsgType),
    MsgId: text(row.MsgId) || null,
    Msg: text(row.Msg) || null,
    Sender: text(row.Sender) || null,
    SenderNick: text(row.SenderNick) || null,
    Receiver: text(row.Receiver) || null,
    CreatedTime: text(row.CreatedTime) || null,
    LocalTime: text(row.LocalTime) || null,
    SessionId: text(row.SessionId) || null,
    SessionType: numberOf(row.SessionType),
    UserData: text(row.UserData) || null,
    FileName: text(row.FileName) || null,
    FileUrl: text(row.FileUrl) || null,
    FileFullPath: text(row.FileFullPath) || null,
    FileSize: text(row.FileSize) || null,
    GroupId: text(row.GroupId) || null,
    isAt: numberOf(row.isAt),
    ReadStatus: numberOf(row.ReadStatus),
  }
}

function messageRow(row: ChatRow, account: string, people: Map<string, PersonEntry>): MessageRow {
  const message = toMessage(row)
  return {
    id: message.id,
    kind: message.kind,
    text: message.text,
    sender: message.sender,
    senderNick: message.senderNick,
    senderHead: people.get(message.sender)?.headPath ?? "",
    outgoing: account.length > 0 && message.sender === account,
    createdAt: message.createdAt,
    atMe: message.isAt,
    atNames: message.at.map((item) => item.name).filter((name) => name.length > 0),
    fileName: message.fileName,
    fileSize: numberOf(row.FileSize) ?? 0,
    filePath: message.fileFullPath,
  }
}

function previewOf(row: ChatRow) {
  const kind = kindOf(row.MsgType ?? 0)
  const body = text(row.Msg).replace(/\s+/g, " ").trim()
  if (body.length > 0) return body.length > 60 ? `${body.slice(0, 60)}…` : body
  const name = text(row.FileName)
  const label: Readonly<Record<string, string>> = {
    voice: "[语音]",
    video: "[视频]",
    image: "[图片]",
    file: name.length > 0 ? `[文件]${name}` : "[文件]",
    recall: "[撤回了一条消息]",
    call: "[通话]",
    notice: "[系统通知]",
    merge: name.length > 0 ? `[合并转发]${name}` : "[合并转发]",
    other: "[消息]",
  }
  return label[kind] ?? ""
}

/** 单元格转展示文本：数字转字符串，空值给空串。 */
function text(value: Cell | undefined) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return String(value)
  return ""
}

/** 单元格转整数：容忍 epoch 毫秒的字符串与大整数。 */
function numberOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null
  if (typeof value === "bigint") return Number.isSafeInteger(Number(value)) ? Number(value) : null
  if (typeof value !== "string") return null
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 发送成功后把这条消息写进客户端同一张表，界面下一次刷新就能看到。
 *
 * 与 `src/chat/store.ts` 的写入保持一致；那份实现依赖 `bun:sqlite`，这里用 `node:sqlite`。
 * 客户端可能同时写库，靠 busy_timeout 退让，而不是失败后重试。
 */
export function appendOwnMessage(
  root: string,
  account: string,
  input: { sessionId: string; text: string; sender: string; senderNick: string; msgId?: string },
): { recorded: boolean; error: string } {
  const path = chatDbPath(root, account)
  if (!existsSync(path)) return { recorded: false, error: "本地消息库不存在" }

  const text = input.text.trim()
  if (text.length === 0) return { recorded: false, error: "消息内容不能为空" }

  const createdAt = Date.now()
  const msgId = input.msgId ?? `${createdAt}|${Math.floor(Math.random() * 1_000_000)}`
  const sessionType = input.sessionId.startsWith("g") ? 1 : 0

  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(path)
    db.exec("pragma busy_timeout = 3000")
    db.prepare(
      `insert into chatmsg
         (MsgType, MsgId, Msg, Sender, Receiver, CreatedTime, LocalTime, SessionId, SessionType, SenderNick, UserData, ReadStatus, isAt, isSave, isSuccess)
       values (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 1, 0, 1, 1)`,
    ).run(
      msgId,
      text,
      input.sender,
      input.sessionId,
      String(createdAt),
      String(createdAt),
      input.sessionId,
      sessionType,
      input.senderNick,
    )
    db.prepare("insert or ignore into lastmsg (SessionId, UnReadCount) values (?, 0)").run(input.sessionId)
    return { recorded: true, error: "" }
  } catch (cause) {
    return { recorded: false, error: cause instanceof Error ? cause.message : String(cause) }
  } finally {
    db?.close()
  }
}

/**
 * 打开会话时把未读落库清零。
 *
 * 界面上的角标只改了内存，桥或客户端写进 `lastmsg` 的 `UnReadCount` 不会降，重启后未读会复活。
 * 客户端可能同时写库，靠 busy_timeout 退让；失败不阻断界面，只是角标下次刷新会回来。
 */
export function markSessionRead(root: string, account: string, sessionId: string) {
  const path = chatDbPath(root, account)
  if (!existsSync(path)) return { cleared: false, error: "本地消息库不存在" }

  let db: DatabaseSync | undefined
  try {
    db = new DatabaseSync(path)
    db.exec("pragma busy_timeout = 3000")
    db.prepare("update lastmsg set UnReadCount = 0 where SessionId = ?").run(sessionId)
    db.prepare("update chatmsg set ReadStatus = 1 where SessionId = ? and ReadStatus = 0").run(sessionId)
    return { cleared: true, error: "" }
  } catch (cause) {
    return { cleared: false, error: cause instanceof Error ? cause.message : String(cause) }
  } finally {
    db?.close()
  }
}
