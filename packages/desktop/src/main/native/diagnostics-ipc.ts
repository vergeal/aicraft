// IPC round-trip capture for the diagnostics dump. The transport reports the moment a request enters
// the server and the moment its reply is posted; this module pairs the two and keeps only the replies
// worth looking at. It imports no Electron module so the transport's own tests stay runnable under Bun.

import type { RpcMessage } from "effect/rpc"
import { createRing } from "./diagnostics-ring"
import type { DiagnosticsMainIpc, DiagnosticsMainIpcSample } from "../../shared/diagnostics"

/** Matches the renderer's capture window, so both halves of a dump cover the same minute. */
const WINDOW_MS = 60_000

/** Replies faster than this are counted, not kept: they are the healthy majority. */
const THRESHOLD_MS = 5

const MAX_SAMPLES = 2_000

const MAX_PENDING = 500

const samples = createRing<DiagnosticsMainIpcSample>({ windowMs: WINDOW_MS, max: MAX_SAMPLES })

// Requests received but not answered yet, keyed by client and request id: renderer request ids are
// per window, so the client id is part of the key.
const pending = new Map<string, { channel: string; at: number }>()

// Only a dev main process starts the capture, so a packaged build never pays for this bookkeeping.
let active = false

// SAFETY: these are encoded wire messages from the IPC port, not Effect values; their tags are the
// transport's own vocabulary, so they are compared literally instead of through Effect's Match.
/* oxlint-disable anti-slop-effect/no-manual-tag-comparison -- see SAFETY above */
export const ipcDiagnostics = {
  /** A request entered the server. Notifications never get a reply, so they are not tracked. */
  request(clientId: number, message: RpcMessage.FromClientEncoded): void {
    if (!active) return
    if (message._tag !== "Request" || message.isNotification) return

    // A request whose reply never arrives (a stream that never ends, a killed renderer) would
    // otherwise stay pending forever.
    const cutoff = performance.now() - WINDOW_MS

    for (const [key, entry] of pending) {
      if (entry.at >= cutoff) break
      pending.delete(key)
    }

    if (pending.size >= MAX_PENDING) {
      const oldest = pending.keys().next()

      if (!oldest.done) pending.delete(oldest.value)
    }

    pending.set(`${clientId}:${String(message.id)}`, { channel: message.tag, at: performance.now() })
  },
  /** The server posted a reply. Pair it with its request and keep the slow or failed ones. */
  response(clientId: number, message: RpcMessage.FromServerEncoded): void {
    if (!active) return
    if (message._tag === "Defect") {
      // A defect carries no request id, so nothing still pending for this client can be answered.
      for (const key of pending.keys()) {
        if (key.startsWith(`${clientId}:`)) pending.delete(key)
      }

      return
    }

    if (message._tag !== "Exit") return

    const key = `${clientId}:${String(message.requestId)}`
    const request = pending.get(key)

    pending.delete(key)

    if (!request) return

    const ms = Math.round((performance.now() - request.at) * 10) / 10
    const failed = message.exit._tag === "Failure"

    if (!failed && ms <= THRESHOLD_MS) {
      samples.observe()

      return
    }

    samples.push({ at: Date.now(), channel: request.channel, ms, failed })
  },
  snapshot(): DiagnosticsMainIpc {
    return {
      windowMs: WINDOW_MS,
      thresholdMs: THRESHOLD_MS,
      ...samples.stats(),
      pending: pending.size,
      samples: samples.values(),
    }
  },
  /** Enabled once the dev main process starts capturing. */
  start(): void {
    active = true
  },
  /** Detaches the transport hooks and drops everything captured so far. */
  stop(): void {
    active = false
    samples.clear()
    pending.clear()
  },
  clear(): void {
    samples.clear()
    pending.clear()
  },
}
/* oxlint-enable anti-slop-effect/no-manual-tag-comparison */
