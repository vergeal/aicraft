import { text } from "./i18n.js"

/**
 * 展示层的纯函数：时间、日期、文件名大小、头像字与底色。
 * 全部无副作用，方便在模板里直接调用。
 */

const DAY = 86_400_000

export function startOfDay(at: number) {
  const date = new Date(at)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** 左栏与消息流共用的日期标题：今天、昨天，再往前是「11月17日」，跨年补年份。 */
export function dayLabel(ctx: { t(key: string, params?: Record<string, string | number>): string }, at: number) {
  const now = new Date()
  const diff = Math.round((startOfDay(now.getTime()) - startOfDay(at)) / DAY)
  if (diff === 0) return text(ctx, "hyt.chat.day.today")
  if (diff === 1) return text(ctx, "hyt.chat.day.yesterday")
  const date = new Date(at)
  if (date.getFullYear() !== now.getFullYear())
    return text(ctx, "hyt.chat.time.dateYear", { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
  return text(ctx, "hyt.chat.time.date", { month: date.getMonth() + 1, day: date.getDate() })
}

/** 时:分。跨天的会话在标题里另有日期，气泡上只留时刻。 */
export function clockOf(at: number) {
  if (at <= 0) return ""
  const date = new Date(at)
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

/** 会话行的时间：今天只写时刻，更早写日期。 */
export function rowTime(ctx: { t(key: string, params?: Record<string, string | number>): string }, at: number) {
  if (at <= 0) return ""
  const date = new Date(at)
  const today = startOfDay(Date.now())
  if (startOfDay(at) >= today) return clockOf(at)
  if (today - startOfDay(at) === DAY) return text(ctx, "hyt.chat.day.yesterday")
  if (date.getFullYear() !== new Date().getFullYear())
    return text(ctx, "hyt.chat.time.dateYear", { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
  return text(ctx, "hyt.chat.time.date", { month: date.getMonth() + 1, day: date.getDate() })
}

export function sizeOf(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 头像里的两个字：群名取第一段，中文取前两字，西文取首字母。 */
export function initialsOf(name: string) {
  const first = name.split(/[、,，/]/)[0]?.trim() ?? ""
  if (first.length === 0) return "?"
  if (/^[\x00-\x7f]+$/.test(first)) return first.slice(0, 1).toUpperCase()
  return first.slice(0, 2)
}

/** 两种底色：名字散列到 a 或默认灰，长列表里相邻的人不会一片同色。 */
export function hueOf(name: string) {
  let sum = 0
  for (const char of name) sum = (sum + char.codePointAt(0)!) % 97
  return sum % 2 === 0 ? "a" : undefined
}

/** 超长正文折叠阈值：微信/钉钉这一档，超过 400 字就先折六行。 */
export const CLAMP_AT = 400

export function isMentioned(message: { atMe: boolean }, toMe: boolean) {
  return toMe && message.atMe
}
