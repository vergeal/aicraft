/**
 * 消息已读回执：把桥接推过来的 `event.onReadReceipt` 归一到「哪条消息被谁读了」。
 *
 * 这里只放纯函数。SDK 不同版本把被读消息 id 放在不同字段里，归一放在一处，
 * 主进程与测试都调这一份，避免各自写一套猜测。
 */

/** 一条回执通知，对应 `native/PROTOCOL.md` 的 `event.onReadReceipt`。 */
export interface ReceiptNotice {
  /** 回执通知自身的消息 id。 */
  readonly msgId: string
  readonly sessionId: string
  /** 读的人。 */
  readonly account: string
  readonly nick: string
  /** 已读时间，epoch 毫秒；0 表示通知里没给。 */
  readonly at: number
  /** 语音消息的已读通知。 */
  readonly voice: boolean
  /** SDK 直接给出的被读消息 id，可能为空。 */
  readonly targetId: string
  /** 通知正文原文，部分版本在这里带被读消息 id。 */
  readonly content: string
  readonly userData: string
  readonly relate: readonly string[]
}

/** 虹云通的消息 id 形如 `1795146745802|95360`。 */
const MESSAGE_ID = /\d{10,}\|\d+/

/** 从任意文本里挑出第一个像消息 id 的片段；没有就返回空串。 */
export function extractMessageId(text: string): string {
  const hit = text.match(MESSAGE_ID)
  return hit === null ? "" : hit[0]
}

/**
 * 被读消息 id：按 `targetId` → 正文 → 关联数组的顺序取第一个像 id 的。
 * 都取不到时退回通知自身 id——宁可不显示，也不把回执挂到别的消息上。
 */
export function targetMessageId(notice: ReceiptNotice): string {
  if (notice.targetId.length > 0) return notice.targetId
  const fromContent = extractMessageId(notice.content)
  if (fromContent.length > 0) return fromContent
  for (const item of notice.relate) {
    const found = extractMessageId(item)
    if (found.length > 0) return found
  }
  return notice.msgId
}

/** 已读时间：秒级/毫秒级 epoch 或可解析的时间串；都解析不出来就用 fallback。 */
export function parseReceiptTime(value: string, fallback: number): number {
  const text = value.trim()
  if (text.length === 0) return fallback
  if (/^\d{10}$/.test(text)) return Number.parseInt(text, 10) * 1000
  if (/^\d{13}$/.test(text)) return Number.parseInt(text, 10)
  const parsed = Date.parse(text.replace(" ", "T"))
  return Number.isFinite(parsed) ? parsed : fallback
}

/** 事件参数校验：字段缺失或类型不对时返回 undefined，不把脏数据写进库。 */
export function parseReceipt(params: unknown): ReceiptNotice | undefined {
  if (!isRecord(params)) return undefined
  const msgId = str(params.msgId)
  const account = str(params.account)
  if (msgId.length === 0 || account.length === 0) return undefined
  return {
    msgId,
    sessionId: str(params.sessionId),
    account,
    nick: str(params.nick),
    at: parseReceiptTime(str(params.at), Date.now()),
    voice: params.voice === true,
    targetId: str(params.targetId),
    content: str(params.content),
    userData: str(params.userData),
    relate: Array.isArray(params.relate) ? params.relate.filter((item): item is string => typeof item === "string") : [],
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null
}

function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}
