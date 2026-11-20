// `fetch` is wrapped so every request lands in the capture, including the ones that reject.

import { round, short } from "./format"
import {
  createRetryTracker,
  inputUrl,
  isAbortError,
  isEventStream,
  matchResource,
  rememberTrace,
  requestDetail,
  responseDetail,
  RETRY_WINDOW_MS,
  retryKey,
  RESOURCE_TOLERANCE_MS,
  sseTracker,
  timingOf,
  type RequestDetail,
} from "./http-detail"
import { observe } from "./observer"
import type { Recorder } from "./types"

/** A request waiting for its resource timing entry. Entries land after the body finishes, sometimes never. */
type Pending = { url: string; start: number; method: string; display: string }

const PENDING_LIMIT = 200
const PENDING_TTL_MS = 15_000

export const networkRecorder: Recorder = {
  name: "network",
  start(ctx) {
    const original = window.fetch.bind(window)
    const retries = createRetryTracker(RETRY_WINDOW_MS)
    const pending: Pending[] = []

    const prune = (now: number) => {
      const cutoff = now - PENDING_TTL_MS
      while (pending.length > 0 && pending[0].start < cutoff) pending.shift()
    }

    // Resource timing arrives after the response body ends, so the lookup happens when the entry lands rather
    // than when `fetch` resolves. A request that never produced an entry simply has no timing event.
    observe<PerformanceResourceTiming>("resource", { type: "resource", buffered: false }, (entries) => {
      prune(performance.now())
      for (let index = pending.length - 1; index >= 0; index--) {
        const request = pending[index]
        const entry = matchResource(entries, request.url, request.start, RESOURCE_TOLERANCE_MS)
        if (!entry) continue
        pending.splice(index, 1)
        ctx.record("network.timing", { method: request.method, url: request.display, ...timingOf(entry) })
      }
    })

    // SSE is read from a clone: the caller keeps the response it was given, and only the counts leave this module.
    const trackStream = (response: Response, request: RequestDetail, started: number) => {
      // `clone()` throws once the body is disturbed or locked, and a stream failure must never break the request.
      if (response.bodyUsed || response.body?.locked) return
      const clone = response.clone()
      if (!clone.body) return
      const reader = clone.body.getReader()
      const decoder = new TextDecoder()
      const tracker = sseTracker(() => ctx.now())
      const flush = (extra: Record<string, unknown>) => {
        const detail = tracker.snapshot()
        ctx.record("network.stream", {
          method: request.method,
          url: request.url,
          status: response.status,
          traceID: request.traceID,
          events: detail.events,
          firstEventMs: detail.firstEventMs,
          gaps: detail.gaps,
          gapCount: detail.gaps.length,
          ms: round(ctx.now() - started),
          ...extra,
        })
      }

      const pump = async () => {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) return flush({})
          tracker.push(decoder.decode(value, { stream: true }))
        }
      }

      pump().catch((error: unknown) => flush({ error: short(error), cancelled: isAbortError(error) }))
    }

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      ctx.observed()
      const started = ctx.now()
      const startedPerf = performance.now()
      const request = requestDetail(input, init)
      if (request.traceID) rememberTrace({ traceID: request.traceID, spanID: request.spanID }, startedPerf)

      const retry = retries.register(retryKey(request.method, request.url, request.traceID), startedPerf)
      if (retry) {
        ctx.record("network.retry", {
          method: request.method,
          url: request.url,
          traceID: request.traceID,
          spanID: request.spanID,
          attempt: retry.attempt,
          gapMs: round(retry.gapMs),
        })
      }

      prune(startedPerf)
      pending.push({
        url: inputUrl(input),
        start: startedPerf,
        method: request.method,
        display: request.url,
      })
      if (pending.length > PENDING_LIMIT) pending.splice(0, pending.length - PENDING_LIMIT)

      try {
        const response = await original(input, init)
        const detail = responseDetail(response, started, ctx.now())
        ctx.record("network", {
          method: request.method,
          url: request.url,
          status: detail.status,
          ok: detail.ok,
          ms: detail.ms,
          contentType: detail.contentType,
          contentLength: detail.contentLength,
          retryAfter: detail.retryAfter,
          traceID: request.traceID,
          spanID: request.spanID,
        })
        if (isEventStream(detail.contentType)) trackStream(response, request, started)

        return response
      } catch (error) {
        const ms = round(ctx.now() - started)
        const shared = {
          method: request.method,
          url: request.url,
          ms,
          traceID: request.traceID,
          spanID: request.spanID,
        }
        // A caller-side abort says nothing about the network, so it is a cancel rather than a failure.
        if (isAbortError(error)) ctx.record("network.cancel", { ...shared, aborted: request.aborted })
        else ctx.record("network.error", { ...shared, error: short(error), aborted: request.aborted })
        throw error
      }
    }) as typeof fetch
  },
}
