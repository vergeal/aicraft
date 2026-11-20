// Request, response, retry and connection detail for the `network` recorder. Everything here is derived from
// headers, the URL and the timing entry: query values, bodies, cookies and authorization never leave this module.
//
// The functions are pure (or take the clock as an argument) so the rules can be tested without a renderer.

import { round, truncate } from "./format"

export const URL_LIMIT = 200

/** Request headers that are safe to keep; `authorization`, `cookie` and every custom auth header are dropped. */
export const REQUEST_HEADER_KEYS = ["accept", "content-type", "content-length", "traceparent"] as const

/** Response headers that explain a failure without echoing server internals or session cookies. */
export const RESPONSE_HEADER_KEYS = ["content-type", "content-length", "retry-after"] as const

/** Repeated attempts of one logical request inside this window are reported as a retry. */
export const RETRY_WINDOW_MS = 5_000

/** How far a resource timing entry may be from the `fetch` it belongs to. */
export const RESOURCE_TOLERANCE_MS = 50

/** An SSE gap is an event that arrives more than this long after the previous one. */
export const STREAM_GAP_MS = 1_000

const HEADER_LIMIT = 200
const STREAM_BUFFER_LIMIT = 64 * 1024
const TRACE_ID = /^[0-9a-f]{32}$/
const SPAN_ID = /^[0-9a-f]{16}$/
const ZERO = /^0+$/

export type Segment = number | "unavailable"

export type NetworkTiming = {
  dns: Segment
  tcp: Segment
  tls: Segment
  ttfb: Segment
  protocol: string
}

export type TraceIds = { traceID: string; spanID?: string }

export type RequestDetail = {
  method: string
  /** Origin, path and query *keys*; values are dropped. */
  url: string
  contentType?: string
  contentLength?: number
  traceID?: string
  spanID?: string
  aborted: boolean
}

export type ResponseDetail = {
  status: number
  ok: boolean
  contentType?: string
  contentLength?: number
  retryAfter?: string
  ms: number
}

export type StreamDetail = {
  events: number
  firstEventMs: Segment
  gaps: number[]
}

export type RetryHit = { attempt: number; gapMs: number }

/** The structural slice of `PerformanceResourceTiming` we read, so tests can pass plain objects. */
export type ResourceEntry = {
  name: string
  startTime: number
  fetchStart: number
  domainLookupStart: number
  domainLookupEnd: number
  connectStart: number
  connectEnd: number
  secureConnectionStart: number
  requestStart: number
  responseStart: number
  nextHopProtocol?: string
}

/**
 * Drops query values and the fragment, keeping the query keys so two calls to the same endpoint still compare.
 * Works on relative URLs too, which `new URL` rejects without a base.
 */
export function sanitizeUrl(value: string, limit = URL_LIMIT): string {
  const hash = value.indexOf("#")
  const withoutHash = hash >= 0 ? value.slice(0, hash) : value
  const query = withoutHash.indexOf("?")
  if (query < 0) return truncate(withoutHash, limit)

  const keys = new Set(
    withoutHash
      .slice(query + 1)
      .split("&")
      .map((pair) => pair.split("=")[0])
      .filter(Boolean),
  )
  const base = withoutHash.slice(0, query)

  return truncate(keys.size === 0 ? base : `${base}?${Array.from(keys).join("&")}`, limit)
}

/** The URL as the caller wrote it; resource timing entries carry it absolute. */
export function inputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

/** The URL a resource timing entry will carry: absolute, so it can be compared with `entry.name`. */
export function resourceUrl(value: string): string {
  try {
    return new URL(value, typeof location === "undefined" ? "http://localhost/" : location.href).href
  } catch {
    return value
  }
}

export function parseTraceparent(value: string | undefined): TraceIds | undefined {
  if (value === undefined) return undefined
  const parts = value.split("-")
  if (parts.length !== 4) return undefined
  const [version, traceID, spanID, flags] = parts
  if (version !== "00" || flags.length !== 2) return undefined
  if (!TRACE_ID.test(traceID) || !SPAN_ID.test(spanID)) return undefined
  if (ZERO.test(traceID) || ZERO.test(spanID)) return undefined
  return { traceID, spanID }
}

/** Whitelist filter: only the listed lowercase header names survive, values are bounded. */
export function pickHeaders(headers: Headers | undefined, keys: readonly string[]): Record<string, string> {
  const picked: Record<string, string> = {}
  if (!headers) return picked
  for (const key of keys) {
    const value = headers.get(key)
    if (value !== null) picked[key] = truncate(value, HEADER_LIMIT)
  }

  return picked
}

export function requestDetail(input: RequestInfo | URL, init?: RequestInit): RequestDetail {
  const request = input instanceof Request ? input : undefined
  const headers = new Headers(request?.headers)
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
  const picked = pickHeaders(headers, REQUEST_HEADER_KEYS)
  const trace = parseTraceparent(picked.traceparent)

  return {
    method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
    url: sanitizeUrl(inputUrl(input)),
    contentType: picked["content-type"],
    contentLength: bytes(picked["content-length"]),
    traceID: trace?.traceID,
    spanID: trace?.spanID,
    aborted: (init?.signal ?? request?.signal)?.aborted ?? false,
  }
}

export function responseDetail(response: Response, started: number, now: number): ResponseDetail {
  const picked = pickHeaders(response.headers, RESPONSE_HEADER_KEYS)

  return {
    status: response.status,
    ok: response.ok,
    contentType: picked["content-type"],
    contentLength: bytes(picked["content-length"]),
    retryAfter: picked["retry-after"],
    ms: round(now - started),
  }
}

/** A cancelled request is not a failure: the caller aborted it and the rejection proves nothing about the server. */
export function isAbortError(error: unknown): boolean {
  const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined
  return name === "AbortError"
}

export function isEventStream(contentType: string | undefined): boolean {
  return contentType?.toLowerCase().trimStart().startsWith("text/event-stream") ?? false
}

/** One logical request: method, sanitized URL and the trace it belongs to. */
export function retryKey(method: string, url: string, traceID?: string): string {
  return `${method.toUpperCase()} ${url} ${traceID ?? "-"}`
}

/**
 * Counts attempts per key. A hit means the same key came back inside the window; a hit after the window starts a
 * fresh burst instead of joining the old one.
 */
export function createRetryTracker(windowMs = RETRY_WINDOW_MS) {
  const seen = new Map<string, { attempts: number; last: number }>()

  const prune = (now: number) => {
    for (const [key, value] of seen) if (now - value.last > windowMs) seen.delete(key)
  }

  return {
    register(key: string, now: number): RetryHit | undefined {
      prune(now)
      const previous = seen.get(key)
      if (previous === undefined) {
        seen.set(key, { attempts: 1, last: now })
        return undefined
      }

      const attempt = previous.attempts + 1
      const gapMs = now - previous.last
      seen.set(key, { attempts: attempt, last: now })

      return { attempt, gapMs }
    },
  }
}

/**
 * Counts SSE events without keeping their payload. A block counts when it carries at least one `data:` line, so
 * comment keep-alives (`: ping`) do not inflate the number.
 */
export function sseTracker(clock: () => number, gapMs = STREAM_GAP_MS) {
  let buffer = ""
  let events = 0
  let firstAt: number | undefined
  let lastAt = 0
  const gaps: number[] = []

  const accept = (block: string) => {
    if (!block.split(/\r?\n/).some((line) => line.startsWith("data:"))) return
    const at = clock()
    if (firstAt === undefined) firstAt = at
    else if (at - lastAt > gapMs) gaps.push(round(at - lastAt))
    events++
    lastAt = at
  }

  const push = (chunk: string) => {
    buffer += chunk
    for (;;) {
      const match = /\r?\n\r?\n/.exec(buffer)
      if (!match || match.index === undefined) break
      accept(buffer.slice(0, match.index))
      buffer = buffer.slice(match.index + match[0].length)
    }

    // A stream that never sends the separator must not grow without bound.
    if (buffer.length > STREAM_BUFFER_LIMIT) buffer = buffer.slice(-STREAM_BUFFER_LIMIT)
  }

  return {
    push,
    snapshot(): StreamDetail {
      return {
        events,
        firstEventMs: firstAt === undefined ? "unavailable" : round(firstAt),
        gaps: [...gaps],
      }
    },
  }
}

/** The first resource entry for `url` that started within the tolerance of the `fetch` call. */
export function matchResource(
  entries: readonly ResourceEntry[],
  url: string,
  start: number,
  tolerance = RESOURCE_TOLERANCE_MS,
): ResourceEntry | undefined {
  const target = resourceUrl(url)

  return entries.find((entry) => entry.name === target && Math.abs(entry.startTime - start) <= tolerance)
}

/**
 * Connection phases in milliseconds. Chromium reports `0` for a phase it reused or never ran (cache hit, same
 * connection, cross-origin without Timing-Allow-Origin), which is marked unavailable rather than shown as `0`.
 */
export function timingOf(entry: ResourceEntry): NetworkTiming {
  const secure = entry.secureConnectionStart

  return {
    dns: span(entry.domainLookupStart, entry.domainLookupEnd),
    tcp: span(entry.connectStart, secure > 0 && secure >= entry.connectStart ? secure : entry.connectEnd),
    tls: span(secure, entry.connectEnd),
    ttfb: span(entry.requestStart || entry.fetchStart, entry.responseStart),
    protocol: entry.nextHopProtocol?.trim() || "unavailable",
  }
}

const span = (start: number, end: number): Segment => (start > 0 && end >= start ? round(end - start) : "unavailable")

const bytes = (value: string | undefined) => {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// The last `traceparent` seen on a request, so an error raised right after a failed call can be attributed
// without inventing a trace of our own.
let recent: { traceID: string; spanID?: string; at: number } | undefined

export function rememberTrace(trace: TraceIds, at: number): void {
  recent = { traceID: trace.traceID, spanID: trace.spanID, at }
}

export function recentTrace(at: number, withinMs = RETRY_WINDOW_MS): TraceIds | undefined {
  if (recent === undefined || at - recent.at > withinMs || at < recent.at) return undefined
  return { traceID: recent.traceID, spanID: recent.spanID }
}
