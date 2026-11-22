import type { ChatMessage } from "../chat/message.js"
import { isOutgoing, mentionsAll } from "../chat/message.js"
import type { HytScene } from "../profile/schema.js"
import { emojiCount, isEmojiOnly, isLinkOnly, normalizeText } from "../text.js"

/**
 * 本地预过滤：任何模型调用之前的第一道闸门，纯规则、无 IO。
 * 目标不是「判断重不重要」，而是「便宜的丢掉明显不需要本人的」：自己的消息、系统通知、
 * 纯表情/纯链接、太短、群里没人 @ 的闲聊。留下的一律进批次，由分析会话判断。
 */

export interface FilterOptions {
  /** 当前账号，用于排除自己发出的消息。 */
  readonly selfAccount: string
  /** 开启的场景；no-miss 会放宽群聊闲聊的过滤。 */
  readonly scenes?: readonly HytScene[]
  /** 群里是否 @ 了本人；不传时按消息自带的 isAt 与 at 列表判断。 */
  readonly isAtMe?: boolean
}

export type SkipReason =
  | "self"
  | "system"
  | "empty"
  | "emoji"
  | "link"
  | "too-short"
  | "chatter"
  | "duplicate"

export type Verdict = { readonly keep: true; readonly score: number } | { readonly keep: false; readonly reason: SkipReason }

/** 求助与任务的信号词：命中的消息几乎一定要本人处理。 */
const SIGNALS = [
  "报错",
  "错误",
  "异常",
  "失败",
  "打不开",
  "连不上",
  "登录不了",
  "宕机",
  "超时",
  "卡住",
  "帮忙",
  "帮看",
  "看下",
  "确认下",
  "排查",
  "处理",
  "跟进",
  "申请",
  "审批",
  "工单",
  "需求",
  "汇总",
  "统计",
  "什么时候",
  "怎么",
  "为什么",
  "能否",
  "可以吗",
]

/** 时间词与截止词：有它们基本就是任务。 */
const DUE_WORDS = ["今天", "明天", "后天", "本周", "下周", "下班前", "月底", "之前", "尽快", "上午", "下午", "晚上"]

/** 纯通知/寒暄类：群聊里默认不打扰。 */
const SOCIAL = ["收到", "好的", "谢谢", "辛苦了", "早上好", "下午好", "晚上好", "晚安", "哈哈哈", "在吗"]

const MIN_CHARS = 2
const SYSTEM_KINDS = new Set(["notice", "recall", "call", "other", "voice", "video"])

export function judge(message: ChatMessage, options: FilterOptions): Verdict {
  if (isOutgoing(message, options.selfAccount)) return { keep: false, reason: "self" }
  if (SYSTEM_KINDS.has(message.kind)) return { keep: false, reason: "system" }

  const text = message.text.trim()
  const attachment = message.kind === "file" || message.kind === "image" || message.kind === "merge"
  if (text.length === 0) return attachment ? { keep: true, score: 3 } : { keep: false, reason: "empty" }
  if (isEmojiOnly(text)) return { keep: false, reason: "emoji" }
  if (isLinkOnly(text)) return { keep: false, reason: "link" }
  if (normalizeText(text).length < MIN_CHARS) return { keep: false, reason: "too-short" }

  const atMe = options.isAtMe ?? isAtSelf(message, options.selfAccount)
  const direct = isDirectSession(message.sessionId)
  const score = signalScore(text) + (atMe ? 4 : 0) + (direct ? 2 : 0)

  if (score >= 2) return { keep: true, score }
  if (options.scenes?.includes("no-miss") === true && message.kind === "text" && !isSocial(text))
    return { keep: true, score }
  if (attachment) return { keep: true, score }
  return { keep: false, reason: "chatter" }
}

/** 批次内按会话去重：同一会话连续多条只保留最后一条，正文完全相同的也去掉。 */
export function dedupeBatch(messages: readonly ChatMessage[], limit: number): ChatMessage[] {
  const seen = new Set<string>()
  const kept: ChatMessage[] = []
  for (const message of [...messages].sort((left, right) => left.id - right.id)) {
    const key = `${message.sessionId}:${normalizeText(message.text)}`
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(message)
  }
  return kept.slice(-Math.max(1, limit))
}

/** 私聊：会话 id 不以 g 开头，也没有群标记。 */
export function isDirectSession(sessionId: string) {
  return sessionId.length > 0 && !sessionId.startsWith("g")
}

export function isAtSelf(message: ChatMessage, selfAccount: string) {
  if (message.isAt) return true
  if (selfAccount.length === 0) return false
  return message.at.some((item) => item.account === selfAccount)
}

/** @所有人 不等于 @本人：值班消息里它只说明「通知了所有人」。 */
export function atEveryone(message: ChatMessage) {
  return mentionsAll(message.at, message.sessionId)
}

export function signalScore(text: string) {
  const body = text.toLowerCase()
  const hits = SIGNALS.filter((word) => body.includes(word)).length
  const due = DUE_WORDS.filter((word) => body.includes(word)).length
  const question = /[？?]|吗|呢|怎么|为什么|能否/.test(text) ? 1 : 0
  const emojiHeavy = emojiCount(text) >= 3 ? -1 : 0
  return hits + due + question + emojiHeavy
}

export function isSocial(text: string) {
  const normalized = normalizeText(text)
  if (normalized.length <= 6 && SOCIAL.some((word) => normalized === normalizeText(word))) return true
  return emojiCount(text) > 0 && normalized.length <= 3
}

/** 预过滤的统计口径，供批次文件与日志展示。 */
export function summarize(messages: readonly ChatMessage[], options: FilterOptions) {
  const counts: Record<SkipReason | "keep", number> = {
    keep: 0,
    self: 0,
    system: 0,
    empty: 0,
    emoji: 0,
    link: 0,
    "too-short": 0,
    chatter: 0,
    duplicate: 0,
  }
  const kept: ChatMessage[] = []
  for (const message of messages) {
    const verdict = judge(message, options)
    if (verdict.keep) {
      counts.keep += 1
      kept.push(message)
    } else counts[verdict.reason] += 1
  }
  return { counts, kept }
}
