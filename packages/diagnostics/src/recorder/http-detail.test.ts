// The network detail rules are pure, so they are covered here rather than through a wrapped `fetch`: URL
// redaction, header whitelisting, cancellation, retry windows, SSE counting and resource timing association.

import { describe, expect, test } from "bun:test"
import {
  createRetryTracker,
  isAbortError,
  isEventStream,
  matchResource,
  parseTraceparent,
  pickHeaders,
  recentTrace,
  rememberTrace,
  requestDetail,
  RESOURCE_TOLERANCE_MS,
  responseDetail,
  RETRY_WINDOW_MS,
  retryKey,
  sanitizeUrl,
  sseTracker,
  timingOf,
  type ResourceEntry,
} from "./http-detail"

const traceID = "4bf92f3577b34da6a3ce929d0e0e4736"
const spanID = "00f067aa0ba902b7"
const traceparent = `00-${traceID}-${spanID}-01`

describe("URL redaction", () => {
  test("keeps query keys, drops every value and the fragment", () => {
    expect(sanitizeUrl(`https://api.test/v1/session?token=secret&limit=10#frag`)).toBe(
      "https://api.test/v1/session?token&limit",
    )
    expect(sanitizeUrl(`https://api.test/v1/session?token=secret`)).not.toContain("secret")
  })

  test("dedupes repeated keys and handles relative URLs and empty queries", () => {
    expect(sanitizeUrl("/api/x?a=1&a=2&b=3")).toBe("/api/x?a&b")
    expect(sanitizeUrl("/api/x?")).toBe("/api/x")
    expect(sanitizeUrl("/api/x#only-fragment")).toBe("/api/x")
  })
})

describe("headers", () => {
  test("keeps only whitelisted names, so authorization and cookies never reach an event", () => {
    const headers = new Headers({
      authorization: "Bearer secret",
      cookie: "session=secret",
      "content-type": "application/json",
      "content-length": "42",
      traceparent,
    })
    const picked = pickHeaders(headers, ["accept", "content-type", "content-length", "traceparent"])

    expect(picked).toEqual({ "content-type": "application/json", "content-length": "42", traceparent })
    expect(JSON.stringify(picked)).not.toContain("secret")
  })

  test("requestDetail reads the trace, size and abort state without the body", () => {
    const controller = new AbortController()
    const request = new Request(`https://api.test/v1/items?token=secret&limit=10`, {
      method: "post",
      headers: { authorization: "Bearer secret", "content-type": "application/json", traceparent },
      signal: controller.signal,
    })
    const detail = requestDetail(request)
    controller.abort()

    expect(detail).toEqual({
      method: "POST",
      url: "https://api.test/v1/items?token&limit",
      contentType: "application/json",
      contentLength: undefined,
      traceID,
      spanID,
      aborted: false,
    })
    expect(requestDetail(request).aborted).toBe(true)
    expect(JSON.stringify(detail)).not.toContain("secret")
  })

  test("init headers override request headers and content-length is parsed", () => {
    const request = new Request("https://api.test/v1/items", { headers: { "content-type": "text/plain" } })
    const detail = requestDetail(request, {
      method: "put",
      headers: { "content-type": "application/json", "content-length": "17" },
    })

    expect(detail.method).toBe("PUT")
    expect(detail.contentType).toBe("application/json")
    expect(detail.contentLength).toBe(17)
    expect(detail.aborted).toBe(false)
  })

  test("parseTraceparent accepts only well-formed W3C values", () => {
    expect(parseTraceparent(traceparent)).toEqual({ traceID, spanID })
    expect(parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01")).toBeUndefined()
    expect(parseTraceparent(`01-${traceID}-${spanID}-01`)).toBeUndefined()
    expect(parseTraceparent("b3")).toBeUndefined()
    expect(parseTraceparent(undefined)).toBeUndefined()
  })
})

describe("responses", () => {
  test("keeps status, size, retry-after and content type but not response cookies", () => {
    const response = new Response("x", {
      status: 503,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "content-length": "1",
        "retry-after": "3",
        "set-cookie": "session=secret",
      },
    })
    const detail = responseDetail(response, 100, 350)

    expect(detail).toEqual({
      status: 503,
      ok: false,
      contentType: "text/event-stream; charset=utf-8",
      contentLength: 1,
      retryAfter: "3",
      ms: 250,
    })
    expect(JSON.stringify(detail)).not.toContain("secret")
    expect(isEventStream(detail.contentType)).toBe(true)
    expect(isEventStream("application/json")).toBe(false)
    expect(isEventStream(undefined)).toBe(false)
  })
})

describe("cancellation", () => {
  test("an AbortError is a cancel, a network rejection is not", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true)
    expect(isAbortError(Object.assign(new Error("failed"), { name: "AbortError" }))).toBe(true)
    expect(isAbortError(new TypeError("Failed to fetch"))).toBe(false)
    expect(isAbortError(undefined)).toBe(false)
    expect(isAbortError("AbortError")).toBe(false)
  })
})

describe("retries", () => {
  test("counts attempts inside the window and starts over after it", () => {
    const tracker = createRetryTracker(5_000)
    const key = retryKey("GET", "/api/x?a", traceID)

    expect(tracker.register(key, 1_000)).toBeUndefined()
    expect(tracker.register(key, 1_400)).toEqual({ attempt: 2, gapMs: 400 })
    // A gap wider than the window starts a new burst rather than joining the old one.
    expect(tracker.register(key, 6_500)).toBeUndefined()
    expect(tracker.register(key, 6_600)).toEqual({ attempt: 2, gapMs: 100 })
    expect(tracker.register(key, 20_000)).toBeUndefined()
  })

  test("different trace ids or methods are different logical requests", () => {
    const tracker = createRetryTracker(5_000)

    expect(tracker.register(retryKey("GET", "/api/x", traceID), 0)).toBeUndefined()
    expect(tracker.register(retryKey("GET", "/api/x", "a".repeat(32)), 100)).toBeUndefined()
    expect(tracker.register(retryKey("POST", "/api/x", traceID), 200)).toBeUndefined()
    expect(tracker.register(retryKey("GET", "/api/x", traceID), 300)?.attempt).toBe(2)
  })
})

describe("SSE counting", () => {
  test("counts data blocks across chunk boundaries and ignores keep-alive comments", () => {
    let at = 0
    const tracker = sseTracker(() => at)

    tracker.push(": ping\n\n")
    tracker.push("data: one\n\ndata: tw")
    at = 400
    tracker.push("o\n\n")
    at = 1_800
    tracker.push("event: done\ndata: three\n\n")

    expect(tracker.snapshot()).toEqual({ events: 3, firstEventMs: 0, gaps: [1_400] })
    expect(tracker.snapshot().gaps).not.toBe(tracker.snapshot().gaps)
  })

  test("reports unavailable when no event ever arrives", () => {
    const tracker = sseTracker(() => 10)
    tracker.push(": ping\n\n")

    expect(tracker.snapshot()).toEqual({ events: 0, firstEventMs: "unavailable", gaps: [] })
  })
})

describe("trace inference", () => {
  test("remembers the trace a request carried and expires it", () => {
    const id = "f".repeat(32)
    rememberTrace({ traceID: id, spanID }, 1_000)

    expect(recentTrace(1_500)).toEqual({ traceID: id, spanID })
    expect(recentTrace(1_500 + RETRY_WINDOW_MS + 1)).toBeUndefined()
    // A clock that jumped backwards must not attribute a later error to this request either.
    expect(recentTrace(500)).toBeUndefined()
  })
})

describe("resource timing", () => {
  const entry = (overrides: Partial<ResourceEntry> = {}): ResourceEntry => ({
    name: "https://api.test/v1/items?limit=10",
    startTime: 1_000,
    fetchStart: 1_005,
    domainLookupStart: 1_010,
    domainLookupEnd: 1_020,
    connectStart: 1_020,
    connectEnd: 1_050,
    secureConnectionStart: 1_035,
    requestStart: 1_055,
    responseStart: 1_085,
    nextHopProtocol: "h2",
    ...overrides,
  })

  test("matches only the entry for the same URL within the tolerance", () => {
    const entries = [entry(), entry({ name: "https://api.test/other", startTime: 1_000 })]

    expect(matchResource(entries, "https://api.test/v1/items?limit=10", 1_030)).toBe(entries[0])
    expect(
      matchResource(entries, "https://api.test/v1/items?limit=10", 1_030 + RESOURCE_TOLERANCE_MS + 1),
    ).toBeUndefined()
    expect(matchResource(entries, "https://api.test/missing", 1_000)).toBeUndefined()
  })

  test("splits dns, tcp, tls and ttfb, and marks missing phases unavailable", () => {
    expect(timingOf(entry())).toEqual({ dns: 10, tcp: 15, tls: 15, ttfb: 30, protocol: "h2" })
    expect(timingOf(entry({ secureConnectionStart: 0 }))).toEqual({
      dns: 10,
      tcp: 30,
      tls: "unavailable",
      ttfb: 30,
      protocol: "h2",
    })
    expect(
      timingOf(entry({ domainLookupStart: 0, domainLookupEnd: 0, connectStart: 0, connectEnd: 0, responseStart: 0 })),
    ).toEqual({ dns: "unavailable", tcp: "unavailable", tls: "unavailable", ttfb: "unavailable", protocol: "h2" })
    expect(timingOf(entry({ nextHopProtocol: "" })).protocol).toBe("unavailable")
  })
})
