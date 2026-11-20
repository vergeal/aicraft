// Error attribution: a normalized stack fingerprint groups repeats, and stack/DOM clues name the component that
// produced them. Nothing here touches the capture directly; the errors recorder owns the `context.record` calls.

import { round, truncate } from "./format"

export type ErrorKind = "error" | "unhandledrejection"

export type ErrorSample = {
  kind: ErrorKind
  message: string
  stack?: string
  component?: string
  /** The trace of the most recent request, inferred rather than carried by the error itself. */
  traceID?: string
  spanID?: string
}

export type ErrorGroup = {
  fingerprint: string
  /** First normalized frame, or the normalized message when the error has no stack. */
  signature: string
  /** Function name from the first frame, the stack-side component clue. */
  frame: string
  component: string
  count: number
  firstMs: number
  lastMs: number
  traceID?: string
  inferred: boolean
}

const SIGNATURE_LIMIT = 160
const COMPONENT_LIMIT = 120
const FRAME_LIMIT = 60
const FRAME_COUNT = 20
const DIGEST_SEED = 0x811c9dc5
const DIGEST_PRIME = 0x01000193
const MEMORY_ADDRESS = /0x[0-9a-f]+/gi
const UUIDS = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

/**
 * Collapses a stack to comparable frames: function names and `file:line`, without memory addresses, column
 * offsets, cache-busting query strings or engine-specific punctuation.
 */
export function normalizeStack(stack: string): string[] {
  return framesOf(stack).map(normalizeFrame).filter(Boolean).slice(0, FRAME_COUNT)
}

export function fingerprintOf(stack: string | undefined, message: string): string {
  const frames = normalizeStack(stack ?? "")
  return digestOf(frames.length > 0 ? frames.join("\n") : `message:${normalizeMessage(message)}`)
}

export function createErrorGrouper() {
  const groups = new Map<string, { count: number; firstMs: number; lastMs: number; component: string }>()

  return {
    /** Adds one occurrence and returns the aggregate for its fingerprint. */
    add(sample: ErrorSample, at: number): ErrorGroup {
      const frames = normalizeStack(sample.stack ?? "")
      const message = truncate(normalizeMessage(sample.message), SIGNATURE_LIMIT)
      const fingerprint = digestOf(frames.length > 0 ? frames.join("\n") : `message:${message}`)
      const frame = truncate(firstFrameName(sample.stack ?? ""), FRAME_LIMIT)
      const component = truncate(sample.component ?? "", COMPONENT_LIMIT) || frame
      const previous = groups.get(fingerprint)
      const merged = {
        count: (previous?.count ?? 0) + 1,
        firstMs: previous?.firstMs ?? at,
        lastMs: at,
        component: previous?.component || component,
      }
      groups.set(fingerprint, merged)

      return {
        fingerprint,
        signature: frames[0] ?? message,
        frame,
        component: merged.component,
        count: merged.count,
        firstMs: round(merged.firstMs),
        lastMs: round(merged.lastMs),
        traceID: sample.traceID,
        inferred: sample.traceID !== undefined,
      }
    },
  }
}

type ClueNode = { closest(selector: string): { getAttribute(name: string): string | null } | null }

/** The nearest component/slot/label around an element, so an error points at a surface rather than a stack. */
export function componentOf(node: ClueNode | null | undefined): string {
  if (!node) return ""
  const parts: string[] = []
  const selectors = [
    ["component", "[data-component]"],
    ["slot", "[data-slot]"],
    ["aria-label", "[aria-label]"],
  ] as const

  for (const [name, selector] of selectors) {
    const value = node.closest(selector)?.getAttribute(name)
    if (value) parts.push(`${name}=${value}`)
  }

  return truncate(parts.join(" "), COMPONENT_LIMIT)
}

function framesOf(stack: string): string[] {
  return stack.split("\n").filter((line) => /^\s*at\s+/.test(line) || /@[^@\s]*:\d+/.test(line))
}

function normalizeFrame(line: string): string {
  const text = line
    .trim()
    .replace(/^\s*at\s+/, "")
    .replace(/\s+/g, " ")
  const safari = /^(.*?)@([^\s]+?:\d+(?::\d+)?)$/.exec(text)
  if (safari) return join(cleanName(safari[1]), cleanLocation(safari[2]))

  // The location is the trailing `file:line[:column]`; the function name is whatever precedes its parenthesis.
  const close = text.endsWith(")") ? text.slice(0, -1) : text
  const located = /([^\s()]+:\d+(?::\d+)?)$/.exec(close)
  if (located) return join(cleanName(close.slice(0, located.index)), cleanLocation(located[1]))

  return cleanName(text)
}

function cleanName(value: string): string {
  return value
    .replace(/^async\s+/, "")
    .replace(/\s*\($/, "")
    .replace(MEMORY_ADDRESS, "")
    .replace(/\s*\(\s*\)$/, "")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanLocation(value: string): string {
  const match = /^(.*?):(\d+)(?::\d+)?$/.exec(value.trim().replace(/^\(/, ""))
  if (!match) return value.trim()
  const file = match[1]
    .replace(/[?#].*$/, "")
    .replace(/^webpack:\/\//, "")
    .replace(/^file:\/\//, "")

  return `${file}:${match[2]}`
}

function join(name: string, location: string): string {
  return name ? `${name} ${location}` : location
}

function firstFrameName(stack: string): string {
  const text = framesOf(stack)[0]
    ?.trim()
    .replace(/^\s*at\s+/, "")
    .replace(/^async\s+/, "")
  if (!text) return ""
  const call = /^([^@\s(]+)\s*\(/.exec(text)
  if (call) return call[1]
  const safari = /^([^@\s]+)@/.exec(text)

  return safari ? safari[1] : ""
}

/** Message-only fingerprints still need to ignore ids, uuids and counts that change on every occurrence. */
function normalizeMessage(message: string): string {
  return message.replace(UUIDS, "#").replace(MEMORY_ADDRESS, "#").replace(/\d+/g, "#").replace(/\s+/g, " ").trim()
}

/** FNV-1a, 32-bit: a stable short id without pulling in crypto or a hashing dependency. */
function digestOf(value: string): string {
  let hash = DIGEST_SEED
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, DIGEST_PRIME)
  }

  return (hash >>> 0).toString(16).padStart(8, "0")
}
