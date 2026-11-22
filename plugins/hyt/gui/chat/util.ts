import type { AvatarTone } from "./contract.js"

/**
 * 窗口侧的纯展示函数：头像底色、时间与大小、@ 高亮。
 * 不读盘、不依赖宿主 API，便于单独推理与测试。
 */

const TONES: readonly AvatarTone[] = ["blue", "green", "orange", "purple", "pink", "cyan", "yellow", "gray"]

/** 由会话 id 稳定散列出头像底色，同一个联系人每次都是同一种颜色。 */
export function toneOf(id: string): AvatarTone {
  let hash = 0
  for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003
  return TONES[hash % TONES.length] ?? "gray"
}

/** 头像里的字：中文取姓，英文取两个词的首字母。 */
export function initials(name: string) {
  const trimmed = name.trim()
  const first = trimmed.slice(0, 1)
  if (first.length === 0) return "?"
  if (!/^[A-Za-z]$/.test(first)) return first
  return (
    trimmed
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.slice(0, 1).toUpperCase())
      .join("") || first.toUpperCase()
  )
}

export function formatClock(locale: string, at: number) {
  if (at <= 0) return ""
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(at))
}

/** 列表里的时间：今天给时刻，昨天给「昨天」，更早给月日。 */
export function formatListTime(locale: string, at: number, now = Date.now()) {
  const bucket = dayBucket(at, now)
  if (bucket === "today") return formatClock(locale, at)
  if (bucket === "yesterday") return ""
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(new Date(at))
}

export function dayBucket(at: number, now = Date.now()): "today" | "yesterday" | "earlier" {
  const start = startOfDay(now)
  if (at >= start) return "today"
  if (at >= start - 86_400_000) return "yesterday"
  return "earlier"
}

/** 日期分隔符里的日期：今年省略年份。 */
export function formatDay(locale: string, at: number, now = Date.now()) {
  const date = new Date(at)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return new Intl.DateTimeFormat(locale, { year: sameYear ? undefined : "numeric", month: "long", day: "numeric" }).format(
    date,
  )
}

function startOfDay(value: number) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ""
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}

/** 把正文按 @ 到的名字切成高亮段与普通段。 */
export function splitMentions(text: string, names: readonly string[]) {
  const valid = names.filter((name) => name.length > 0).map(escapeRegExp)
  if (valid.length === 0) return [{ text, at: false }]
  const pattern = new RegExp(`@(?:${valid.join("|")})`, "g")
  const parts: { text: string; at: boolean }[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: text.slice(last, index), at: false })
    parts.push({ text: match[0], at: true })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), at: false })
  return parts.length === 0 ? [{ text, at: false }] : parts
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
