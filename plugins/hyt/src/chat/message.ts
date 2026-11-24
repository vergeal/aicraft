/**
 * chatmsg.db 的一行消息，与客户端的表结构同名，读进来后统一转成 ChatMessage。
 * CreatedTime / LocalTime 都是 epoch 毫秒字符串；分页游标用 Id（自增，稳定）。
 */

export type MessageKind =
  | "text"
  | "voice"
  | "video"
  | "image"
  | "file"
  | "recall"
  | "call"
  | "notice"
  | "merge"
  | "app"
  | "other"

export interface ChatRow {
  readonly Id: number | null
  readonly MsgType: number | null
  readonly MsgId: string | null
  readonly Msg: string | null
  readonly Sender: string | null
  readonly SenderNick: string | null
  readonly Receiver: string | null
  readonly CreatedTime: string | null
  readonly LocalTime: string | null
  readonly SessionId: string | null
  readonly SessionType: number | null
  readonly UserData: string | null
  readonly FileName: string | null
  readonly FileUrl: string | null
  readonly FileFullPath: string | null
  readonly FileSize: string | null
  readonly GroupId: string | null
  readonly isAt: number | null
  readonly ReadStatus: number | null
}

export interface AtRef {
  readonly account: string
  readonly name: string
}

export interface ChatMessage {
  readonly id: number
  readonly msgId: string
  readonly msgType: number
  readonly kind: MessageKind
  readonly text: string
  readonly sender: string
  readonly senderNick: string
  readonly receiver: string
  readonly sessionId: string
  readonly sessionType: number
  readonly createdAt: number
  readonly time: string
  readonly isAt: boolean
  readonly at: readonly AtRef[]
  readonly fileName: string
  readonly fileUrl: string
  readonly fileFullPath: string
  readonly groupId: string
}

/** 客户端 MsgType 的含义；未列出的按 other 处理，不丢消息。 */
export const KIND_BY_TYPE: Readonly<Record<number, MessageKind>> = {
  1: "text",
  2: "voice",
  3: "video",
  4: "image",
  6: "file",
  7: "file",
  11: "text",
  12: "notice",
  17: "app",
  25: "recall",
  26: "notice",
  60: "notice",
  101: "call",
  150: "app",
  245: "merge",
  246: "notice",
}

/** 应用消息卡片：`UserData` 里的 `icon` / `agentName` / `title` / `fields`。 */
export interface AppCardField {
  readonly key: string
  readonly value: string
}

export interface AppCard {
  readonly icon: string
  readonly name: string
  readonly title: string
  readonly fields: readonly AppCardField[]
}


export function kindOf(msgType: number | null | undefined): MessageKind {
  if (typeof msgType !== "number") return "other"
  return KIND_BY_TYPE[msgType] ?? "other"
}

/**
 * UserData 里的 @ 列表：`{"at":[{"account":"cs20254801","name":"刘程"}]}`。
 * @所有人 的 account 是会话 id（g…），照原样保留；字段缺失或 JSON 坏掉都返回空列表，不抛错。
 */
/**
 * 应用消息的卡片内容。
 *
 * `fields` 是二次编码的 JSON 字符串，里面 `TEXTAREA` 的 `value` 又是一组 `{key, value}`。
 * 解析失败就只留能读到的标题，卡片退化成一则普通通知，不能让整条消息消失。
 */
export function parseAppCard(userData: string | null | undefined, fallbackTitle = ""): AppCard {
  const parsed = parseJson(userData)
  if (!isRecord(parsed)) return { icon: "", name: "", title: fallbackTitle, fields: [] }
  const fields = typeof parsed.fields === "string" ? parseJson(parsed.fields) : parsed.fields
  return {
    icon: typeof parsed.icon === "string" ? parsed.icon.trim() : "",
    name: typeof parsed.agentName === "string" ? parsed.agentName.trim() : "",
    title: typeof parsed.title === "string" && parsed.title.trim().length > 0 ? parsed.title.trim() : fallbackTitle,
    fields: appFields(fields),
  }
}

function appFields(value: unknown): readonly AppCardField[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((group) => {
    if (!isRecord(group) || !Array.isArray(group.value)) return []
    return group.value.flatMap((item) => {
      if (!isRecord(item)) return []
      const key = typeof item.key === "string" ? item.key.trim() : ""
      const text = typeof item.value === "string" ? item.value.trim() : ""
      if (key.length === 0 || text.length === 0) return []
      return [{ key, value: text }]
    })
  })
}

export function parseAt(userData: string | null | undefined): AtRef[] {
  const parsed = parseJson(userData)
  if (!isRecord(parsed) || !Array.isArray(parsed.at)) return []
  return parsed.at.flatMap((item) => {
    if (!isRecord(item)) return []
    const account = typeof item.account === "string" ? item.account.trim() : ""
    const name = typeof item.name === "string" ? item.name.trim() : ""
    if (account.length === 0 && name.length === 0) return []
    return [{ account, name }]
  })
}

/** 是否 @ 了所有人：account 与会话 id 相同，或名字就是「所有人」。 */
export function mentionsAll(at: readonly AtRef[], sessionId: string) {
  return at.some((item) => item.account === sessionId || item.name === "所有人" || item.name === "@所有人")
}

export function toMessage(row: ChatRow): ChatMessage {
  const createdAt = epoch(row.CreatedTime)
  return {
    id: row.Id ?? 0,
    msgId: row.MsgId ?? "",
    msgType: row.MsgType ?? 0,
    kind: kindOf(row.MsgType),
    text: row.Msg ?? "",
    sender: row.Sender ?? "",
    senderNick: row.SenderNick ?? (row.Sender ?? ""),
    receiver: row.Receiver ?? "",
    sessionId: row.SessionId ?? "",
    sessionType: row.SessionType ?? 0,
    createdAt,
    time: createdAt > 0 ? new Date(createdAt).toISOString() : "",
    isAt: row.isAt === 1,
    at: parseAt(row.UserData),
    fileName: row.FileName ?? "",
    fileUrl: row.FileUrl ?? "",
    fileFullPath: row.FileFullPath ?? "",
    groupId: row.GroupId ?? "",
  }
}

/** 列表里的一行摘要：非文本消息用标签，文本截断到一行。 */
export function preview(message: ChatMessage, limit = 60) {
  const body = message.text.replace(/\s+/g, " ").trim()
  if (body.length > 0) return body.length > limit ? `${body.slice(0, limit)}…` : body
  const label: Readonly<Record<MessageKind, string>> = {
    text: "",
    voice: "[语音]",
    video: "[视频]",
    image: "[图片]",
    file: `[文件]${message.fileName}`,
    recall: "[撤回了一条消息]",
    call: "[通话]",
    notice: "[系统通知]",
    merge: `[合并转发]${message.fileName}`,
    app: message.text || "[应用消息]",
    other: "[消息]",
  }
  return label[message.kind]
}

export function isOutgoing(message: ChatMessage, selfAccount: string) {
  return selfAccount.length > 0 && message.sender === selfAccount
}

function epoch(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function parseJson(value: string | null | undefined): unknown {
  if (typeof value !== "string" || value.trim().length === 0) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
