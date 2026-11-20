// Snapshot cache for the dump's `state` section: read an app-owned state slice at dump time, redact
// secret-looking keys, trim the copy to a byte budget, and diff it against the previous capture.
// This file is platform-free (no Solid, router or server) so the trimming and diff rules are testable.

const DEFAULT_LIMIT_BYTES = 256 * 1024

const SENSITIVE_KEY = /api[-_]?key|token|password|passwd|secret|authorization|cookie/i
const REDACTED = "[redacted]"
const CIRCULAR = "[circular]"
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

const encoder = new TextEncoder()

/** Where a snapshot had to cut to fit its byte budget. Every count is a marker left in the dump. */
export type SnapshotTrimming = {
  strings: number
  arrays: number
  keys: number
  depth: number
}

/** One capture: the redacted, byte-fitted copy plus how much of it had to be cut. */
export type Snapshot<T = unknown> = {
  capturedAt: string
  value: T
  /** Serialized size of `value`, in bytes. */
  bytes: number
  truncated: boolean
  trimmed?: SnapshotTrimming
}

/** Structural changes only: unchanged subtrees produce no entry. Paths are `key.sub[0].key`. */
export type SnapshotDiff = {
  added: { path: string; value: unknown }[]
  removed: { path: string; value: unknown }[]
  changed: { path: string; previous: unknown; next: unknown }[]
  /** True when the change list hit its cap; both snapshots still hold the rest. */
  truncated: boolean
}

export type SnapshotCache<T = unknown> = {
  capture(): Snapshot<T>
  /** The snapshot taken before the latest `capture()`, when there is one. */
  previous(): Snapshot<T> | undefined
  diff(before: Snapshot<T>, after: Snapshot<T>): SnapshotDiff
}

type Stage = { strings: number; array: number; keys: number; depth: number }

// Ordered from the least to the most aggressive cut. The first stage that fits wins, so a small overrun
// keeps most of the value instead of flattening it immediately.
const STAGES: readonly Stage[] = [
  { strings: 4_000, array: 500, keys: 200, depth: 12 },
  { strings: 1_000, array: 100, keys: 100, depth: 8 },
  { strings: 200, array: 20, keys: 40, depth: 6 },
  { strings: 80, array: 5, keys: 10, depth: 4 },
]

const DIFF_LIMIT = 500

export function createSnapshotCache<T = unknown>(input: {
  read: () => T
  /** Serialized byte budget for one snapshot. Defaults to 256 KiB. */
  limitBytes?: number
  /** Replace secret-looking key values. Defaults to true. */
  redact?: boolean
}): SnapshotCache<T> {
  const limitBytes = input.limitBytes ?? DEFAULT_LIMIT_BYTES
  const redact = input.redact ?? true
  let latest: Snapshot<T> | undefined
  let earlier: Snapshot<T> | undefined

  return {
    capture() {
      const snapshot = take(input.read(), limitBytes, redact)
      earlier = latest
      latest = snapshot

      return snapshot
    },
    previous: () => earlier,
    diff: (before, after) => diffValues(before.value, after.value),
  }
}

function take<T>(value: T, limitBytes: number, redact: boolean): Snapshot<T> {
  // `seen` tracks the current ancestor chain, so a repeated sibling is copied twice but a cycle is marked.
  const fitted = fit(normalize(value, redact, new WeakSet()), limitBytes)

  return {
    capturedAt: new Date().toISOString(),
    value: fitted.value as T,
    bytes: fitted.bytes,
    truncated: fitted.truncated,
    ...(fitted.trimmed ? { trimmed: fitted.trimmed } : {}),
  }
}

function normalize(value: unknown, redact: boolean, seen: WeakSet<object>): unknown {
  if (value === null) return null
  if (typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "bigint") return `${value}n`
  if (typeof value !== "object") return null

  // A cycle cannot be serialized; mark it instead of letting JSON.stringify throw at dump time.
  if (seen.has(value)) return CIRCULAR
  seen.add(value)

  const out = Array.isArray(value)
    ? value.map((item) => normalize(item, redact, seen))
    : isPlainObject(value)
      ? normalizeProperties(value, redact, seen)
      : value

  // Dates, URLs and class instances keep their own JSON shape; only plain objects and arrays are walked.
  seen.delete(value)

  return out
}

function normalizeProperties(
  value: Record<string, unknown>,
  redact: boolean,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(value)) {
    out[key] = redact && SENSITIVE_KEY.test(key) ? REDACTED : normalize(entry, redact, seen)
  }

  return out
}

function fit(value: unknown, limitBytes: number) {
  const full = bytesOf(value)
  if (full <= limitBytes) return { value, bytes: full, truncated: false, trimmed: undefined }

  for (const stage of STAGES) {
    const trimmed: SnapshotTrimming = { strings: 0, arrays: 0, keys: 0, depth: 0 }
    const candidate = shrink(value, stage, 0, trimmed)
    const bytes = bytesOf(candidate)
    if (bytes <= limitBytes) return { value: candidate, bytes, truncated: true, trimmed }
  }

  // Nothing but a summary fits; say so instead of dropping the section silently.
  const summary = `[snapshot trimmed: ${full} bytes]`

  return { value: summary, bytes: bytesOf(summary), truncated: true, trimmed: undefined }
}

function shrink(value: unknown, stage: Stage, depth: number, trimmed: SnapshotTrimming): unknown {
  if (typeof value === "string") {
    if (value.length <= stage.strings) return value
    trimmed.strings++

    return `${value.slice(0, stage.strings)}…[${value.length - stage.strings} chars trimmed]`
  }

  if (Array.isArray(value)) {
    if (depth >= stage.depth) {
      trimmed.depth++

      return "[depth trimmed]"
    }

    const kept = value.slice(0, stage.array).map((item) => shrink(item, stage, depth + 1, trimmed))
    if (value.length > stage.array) {
      trimmed.arrays++
      kept.push(`[${value.length - stage.array} items trimmed]`)
    }

    return kept
  }

  if (isPlainObject(value)) {
    if (depth >= stage.depth) {
      trimmed.depth++

      return "[depth trimmed]"
    }

    const keys = Object.keys(value)
    const out: Record<string, unknown> = {}
    for (const key of keys.slice(0, stage.keys)) out[key] = shrink(value[key], stage, depth + 1, trimmed)
    if (keys.length > stage.keys) {
      trimmed.keys++
      out["[trimmed]"] = `${keys.length - stage.keys} keys trimmed`
    }

    return out
  }

  return value
}

function diffValues(previous: unknown, next: unknown): SnapshotDiff {
  const diff: SnapshotDiff = { added: [], removed: [], changed: [], truncated: false }
  walk(previous, next, "", diff)

  return diff
}

function walk(previous: unknown, next: unknown, path: string, diff: SnapshotDiff): void {
  if (previous === next) return

  if (Array.isArray(previous) && Array.isArray(next)) {
    const shared = Math.min(previous.length, next.length)
    for (let index = 0; index < shared; index++) walk(previous[index], next[index], `${path}[${index}]`, diff)
    for (let index = shared; index < next.length; index++) {
      if (!push(diff, diff.added, { path: `${path}[${index}]`, value: next[index] })) return
    }
    for (let index = shared; index < previous.length; index++) {
      if (!push(diff, diff.removed, { path: `${path}[${index}]`, value: previous[index] })) return
    }

    return
  }

  if (isPlainObject(previous) && isPlainObject(next)) {
    for (const key of Object.keys(previous)) {
      if (Object.hasOwn(next, key)) continue
      if (!push(diff, diff.removed, { path: childPath(path, key), value: previous[key] })) return
    }
    for (const key of Object.keys(next)) {
      if (Object.hasOwn(previous, key)) continue
      if (!push(diff, diff.added, { path: childPath(path, key), value: next[key] })) return
    }
    for (const key of Object.keys(previous)) {
      if (!Object.hasOwn(next, key)) continue
      walk(previous[key], next[key], childPath(path, key), diff)
    }

    return
  }

  push(diff, diff.changed, { path, previous, next })
}

/** Records one change; a full list keeps the first `DIFF_LIMIT` entries and marks itself truncated. */
function push<T>(diff: SnapshotDiff, bucket: T[], entry: T): boolean {
  if (diff.added.length + diff.removed.length + diff.changed.length >= DIFF_LIMIT) {
    diff.truncated = true

    return false
  }

  bucket.push(entry)

  return true
}

function childPath(path: string, key: string): string {
  if (!IDENTIFIER.test(key)) return `${path}[${JSON.stringify(key)}]`

  return path ? `${path}.${key}` : key
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false
  const prototype = Object.getPrototypeOf(value)

  return prototype === Object.prototype || prototype === null
}

function bytesOf(value: unknown): number {
  return encoder.encode(JSON.stringify(value) ?? "null").length
}
