import type { ChatMessage } from "../chat/message.js"
import { isOutgoing } from "../chat/message.js"
import { isEmojiOnly, isLinkOnly, normalizeText } from "../text.js"
import { isAtSelf, isDirectSession, signalScore } from "./prefilter.js"

/**
 * 任务识别：本地规则预筛 + 期限（dueAt）解析。判定「是不是模型该判」的活留给分析会话，
 * 这里只做两件确定性的事：挑出候选消息，能把期限解析成时间的就解析。
 */

export interface DueOptions {
  /** 计算基准，默认当前时间；单测必须传入固定值。 */
  readonly now?: Date
  /** 「下班前」几点算下班，默认 18 点。 */
  readonly workEndHour?: number
}

const DEFAULT_WORK_END = 18

const TASK_WORDS = [
  "请",
  "麻烦",
  "帮忙",
  "帮我",
  "看下",
  "确认",
  "跟进",
  "处理",
  "排查",
  "完成",
  "需求",
  "工单",
  "待办",
  "汇总",
  "统计",
  "提交",
  "申请",
  "对接",
  "安排",
  "之前",
  "下班前",
  "明天",
]

const TITLE_NOISE = /^(麻烦你|麻烦|请你|请|帮忙|帮我|劳驾)[:：，,\s]*/u

export interface TaskCandidate {
  readonly messageId: number
  readonly sessionId: string
  readonly sender: string
  readonly senderNick: string
  readonly text: string
  readonly title: string
  readonly dueAt?: string
  /** 预筛理由，方便分析会话判断要不要真的登记。 */
  readonly reasons: readonly string[]
  readonly score: number
}

/** 规则预筛：@我、私聊、任务词、问句 + 时间词。返回候选，不做模型判断。 */
export function findCandidates(
  messages: readonly ChatMessage[],
  options: { selfAccount: string; now?: Date; workEndHour?: number },
): TaskCandidate[] {
  const now = options.now ?? new Date()
  return messages.flatMap((message) => {
    if (isOutgoing(message, options.selfAccount)) return []
    if (message.kind !== "text" && message.kind !== "file" && message.kind !== "image") return []
    const text = message.text.trim()
    if (text.length === 0) return []
    if (isEmojiOnly(text) || isLinkOnly(text) || normalizeText(text).length < 2) return []
    const reasons = reasonsOf(message, text, options.selfAccount)
    if (reasons.length === 0) return []
    const dueAt = parseDueAt(text, { now, ...(options.workEndHour === undefined ? {} : { workEndHour: options.workEndHour }) })
    return [
      {
        messageId: message.id,
        sessionId: message.sessionId,
        sender: message.sender,
        senderNick: message.senderNick,
        text,
        title: titleOf(text),
        ...(dueAt === undefined ? {} : { dueAt }),
        reasons,
        score: signalScore(text) + reasons.length,
      },
    ]
  })
}

function reasonsOf(message: ChatMessage, text: string, selfAccount: string) {
  const reasons: string[] = []
  if (isAtSelf(message, selfAccount)) reasons.push("at-me")
  if (isDirectSession(message.sessionId)) reasons.push("direct")
  const hits = TASK_WORDS.filter((word) => text.includes(word))
  if (hits.length > 0) reasons.push(`word:${hits.slice(0, 3).join("|")}`)
  if (/[？?]|吗|呢/.test(text) && /\d|今天|明天|后天|周|号|点|之前/.test(text)) reasons.push("question-with-time")
  return reasons
}

/** 标题：去掉客套前缀，压掉空白，截到 40 字；太短时补上发送人。 */
export function titleOf(text: string, senderNick = "") {
  const cleaned = text
    .replace(TITLE_NOISE, "")
    .replace(/^(哈喽|你好|您好|在吗|在么)[，,。\s]*/u, "")
    .replace(/\s+/g, " ")
    .trim()
  const body = cleaned.length > 0 ? cleaned : text.trim()
  const clipped = body.length > 40 ? `${body.slice(0, 40)}…` : body
  return senderNick.length > 0 && clipped.length < 6 ? `${senderNick}：${clipped}` : clipped
}

const WEEKDAYS: Readonly<Record<string, number>> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
}

export function parseDueAt(text: string, options: DueOptions = {}): string | undefined {
  const now = options.now ?? new Date()
  const workEnd = options.workEndHour ?? DEFAULT_WORK_END
  const normalized = normalizeText(text)

  const explicit = explicitDate(text, now)
  if (explicit !== undefined) return formatLocal(withTime(explicit, text, workEnd, now))

  const weekday = weekdayTarget(normalized, now)
  if (weekday !== undefined) return formatLocal(withTime(weekday, text, workEnd, now))

  if (normalized.includes("下班前")) {
    const today = new Date(now)
    today.setHours(workEnd, 0, 0, 0)
    if (today.getTime() <= now.getTime()) today.setDate(today.getDate() + 1)
    return formatLocal(today)
  }

  if (normalized.includes("月底")) {
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return formatLocal(withTime(end, text, workEnd, now))
  }

  const relative = relativeDay(normalized)
  if (relative !== undefined) {
    const target = new Date(now)
    target.setDate(target.getDate() + relative)
    return formatLocal(withTime(target, text, workEnd, now))
  }

  const clock = clockOf(text)
  if (clock !== undefined) {
    const target = new Date(now)
    target.setHours(clock.hours, clock.minutes, 0, 0)
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
    return formatLocal(target)
  }

  return undefined
}

/** 明确的日期：2026-11-30、11月30日、11/30、30号。 */
function explicitDate(text: string, now: Date): Date | undefined {
  const iso = text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/u)
  if (iso !== null) return valid(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const monthDay = text.match(/(\d{1,2})[/月](\d{1,2})/u)
  if (monthDay !== null) {
    const target = valid(now.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]))
    if (target === undefined) return undefined
    return target.getTime() < startOfDay(now).getTime() ? valid(now.getFullYear() + 1, target.getMonth(), target.getDate()) : target
  }
  const day = text.match(/(\d{1,2})\s*号/u)
  if (day !== null) {
    const number = Number(day[1])
    const thisMonth = valid(now.getFullYear(), now.getMonth(), number)
    if (thisMonth === undefined) return undefined
    if (thisMonth.getTime() < startOfDay(now).getTime()) return valid(now.getFullYear(), now.getMonth() + 1, number)
    return thisMonth
  }
  return undefined
}

/** 星期：周五、星期五、礼拜五、下周五。 */
function weekdayTarget(normalized: string, now: Date): Date | undefined {
  const match = normalized.match(/(下下|下|这|本)?(?:周|星期|礼拜)([一二三四五六日天])/u)
  if (match === null) return undefined
  const day = WEEKDAYS[match[2] ?? ""]
  if (day === undefined) return undefined
  const prefix = match[1] ?? ""
  const current = now.getDay()
  if (prefix === "下下") return addDays(now, 7 - current + day + 7)
  if (prefix === "下") return addDays(now, 7 - current + day)
  const forward = (day - current + 7) % 7
  return addDays(now, forward)
}

/** 今天 / 明天 / 明早 / 后天 / 大后天 / N 天后。 */
function relativeDay(normalized: string): number | undefined {
  if (/大后天/.test(normalized)) return 3
  if (/后天/.test(normalized)) return 2
  if (/明天|明日|明早|明晚|明儿/.test(normalized)) return 1
  if (/today|今天|今日|今晚|今早/.test(normalized)) return 0
  const days = normalized.match(/(\d{1,2})\s*(?:天|日)(?:之?后|内|以后)/u)
  if (days !== null) return Number(days[1])
  return undefined
}

/** 具体时刻：下午5点、17:00、上午九点半。没写就算下班点。 */
function clockOf(text: string): { hours: number; minutes: number } | undefined {
  const colon = text.match(/(\d{1,2})[:：](\d{2})/u)
  if (colon !== null) return { hours: clampHour(Number(colon[1])), minutes: clampMinute(Number(colon[2])) }
  const cn = text.match(/(上午|中午|下午|晚上)?\s*(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[点時时](半|\d{1,2}分?)?/u)
  if (cn === null) return undefined
  const raw = cn[2] ?? ""
  const base = /^\d+$/.test(raw) ? Number(raw) : chineseNumber(raw)
  if (base === undefined) return undefined
  const period = cn[1] ?? ""
  const hours = period === "下午" || period === "晚上" ? (base < 12 ? base + 12 : base) : period === "中午" && base < 12 ? base + 12 : base
  const minutes = cn[3] === "半" ? 30 : cn[3] === undefined ? 0 : clampMinute(Number.parseInt(cn[3], 10) || 0)
  return { hours: clampHour(hours), minutes }
}

function chineseNumber(value: string) {
  const digits: Readonly<Record<string, number>> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  }
  if (value === "十") return 10
  if (value.length === 1) return digits[value]
  const [tens, ones] = value.split("")
  if (tens === "十") return 10 + (digits[ones ?? ""] ?? 0)
  if (ones === "十") return (digits[tens ?? ""] ?? 0) * 10
  return undefined
}

function withTime(target: Date, text: string, workEnd: number, now: Date) {
  const clock = clockOf(text)
  const result = new Date(target)
  if (clock !== undefined) {
    result.setHours(clock.hours, clock.minutes, 0, 0)
    return result
  }
  const morning = /上午|明早|早上|今早/.test(text)
  result.setHours(morning ? 9 : workEnd, 0, 0, 0)
  // 「今天」但已经过了这个点：顺延到明天同一时刻，避免生成一个已经到期的任务。
  if (result.getTime() <= now.getTime()) result.setDate(result.getDate() + 1)
  return result
}

function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function addDays(date: Date, days: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function valid(year: number, month: number, day: number) {
  const result = new Date(year, month, day)
  if (result.getFullYear() !== year || result.getMonth() !== ((month % 12) + 12) % 12) return undefined
  if (result.getDate() !== day) return undefined
  return result
}

function clampHour(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(23, Math.max(0, Math.trunc(value)))
}

function clampMinute(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(59, Math.max(0, Math.trunc(value)))
}

/** 本地时区的 ISO 字符串，带偏移，例如 2026-11-30T18:00:00+08:00。 */
export function formatLocal(date: Date) {
  const pad = (value: number) => String(Math.abs(value)).padStart(2, "0")
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? "+" : "-"
  const body = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
  return `${body}${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
}

/** 期限是否已过（提醒用）。 */
export function isDue(dueAt: string | undefined, now = new Date()) {
  if (dueAt === undefined) return false
  const parsed = Date.parse(dueAt)
  return Number.isFinite(parsed) && parsed <= now.getTime()
}
