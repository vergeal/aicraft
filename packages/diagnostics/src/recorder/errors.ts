// Uncaught errors and rejected promises, grouped by a normalized stack fingerprint and attributed to the surface
// that raised them.

import { componentOf, createErrorGrouper, type ErrorGroup, type ErrorSample } from "./error-group"
import { short, truncate } from "./format"
import { recentTrace, sanitizeUrl } from "./http-detail"
import type { Recorder } from "./types"

export const errorsRecorder: Recorder = {
  name: "errors",
  start(ctx) {
    const groups = createErrorGrouper()

    // The error path never carries a trace of its own, so the trace of the latest request is an inference.
    const attribute = (sample: Omit<ErrorSample, "traceID" | "spanID">) => {
      const trace = recentTrace(performance.now())

      return groups.add({ ...sample, traceID: trace?.traceID, spanID: trace?.spanID }, ctx.now())
    }

    const recordGroup = (group: ErrorGroup, message: string) => {
      ctx.record("error.group", {
        message: truncate(message, 200),
        signature: group.signature,
        count: group.count,
        first: group.firstMs,
        last: group.lastMs,
        fingerprint: group.fingerprint,
        frame: group.frame,
        component: group.component,
        traceID: group.traceID,
        inferred: group.inferred,
      })
    }

    window.addEventListener(
      "error",
      (event) => {
        ctx.observed()
        const error = event.error instanceof Error ? event.error : undefined
        const source = event.target instanceof HTMLElement ? event.target.getAttribute("src") : null
        const resource =
          event.target instanceof HTMLElement && !event.message
            ? `${event.target.tagName.toLowerCase()} ${source ? sanitizeUrl(source) : ""}`.trim()
            : undefined
        // `event.message` is empty for a failed subresource, so the element is what identifies the fault.
        const message = event.message || resource || "unknown error"
        const group = attribute({
          kind: "error",
          message,
          stack: error?.stack,
          component: componentOf(event.target instanceof Element ? event.target : document.activeElement),
        })

        ctx.record("error", {
          message: truncate(event.message, 400),
          source: event.filename,
          line: event.lineno,
          column: event.colno,
          stack: truncate(error?.stack ?? "", 1500),
          resource,
          fingerprint: group.fingerprint,
          frame: group.frame,
          component: group.component,
          traceID: group.traceID,
          inferred: group.inferred,
        })
        recordGroup(group, message)
      },
      true,
    )

    window.addEventListener("unhandledrejection", (event) => {
      ctx.observed()
      const error = event.reason instanceof Error ? event.reason : undefined
      const message = error ? `${error.name}: ${error.message}` : short(event.reason)
      const group = attribute({
        kind: "unhandledrejection",
        message,
        stack: error?.stack,
        component: componentOf(document.activeElement),
      })

      ctx.record("unhandledrejection", {
        reason: short(event.reason),
        name: error?.name,
        stack: truncate(error?.stack ?? "", 1500),
        fingerprint: group.fingerprint,
        frame: group.frame,
        component: group.component,
        traceID: group.traceID,
        inferred: group.inferred,
      })
      recordGroup(group, message)
    })
  },
}
