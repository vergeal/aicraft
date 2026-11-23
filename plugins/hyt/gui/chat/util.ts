/**
 * 窗口侧的纯展示函数：时间、大小、@ 高亮。
 * 不读盘、不依赖宿主 API，便于单独推理与测试。头像规则在 `head.ts`。
 */

/** 快捷键提示里的修饰键：macOS 给 ⌘，其他平台给 Ctrl。图上的「⌘K」「⌘+Enter」都按这个渲染。 */
export function modKey() {
  const agent = globalThis.navigator?.userAgent ?? ""
  return /Mac|iPhone|iPad/.test(agent) ? "⌘" : "Ctrl"
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

/**
 * 轮询每 4 秒都会推来一批全新对象。内容没变时复用旧引用，
 * `<For>` 才不会每次把整列 DOM 拆掉重建——列表闪屏、图片重载都是它引起的。
 */
export function reuseRows<T>(previous: readonly T[], next: readonly T[], key: (row: T) => string | number) {
  if (previous.length === 0) return next
  const index = new Map(previous.map((row) => [key(row), row]))
  return next.map((row) => {
    const old = index.get(key(row))
    return old !== undefined && sameValue(old, row) ? old : row
  })
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameValue(value, right[index]))
  }
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((name) =>
      sameValue((left as Record<string, unknown>)[name], (right as Record<string, unknown>)[name]),
    )
  )
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
