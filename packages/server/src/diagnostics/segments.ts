import type { SpanRecord } from "./spans"

/**
 * Model requests are the only part of a Session turn that already carries spans: the transport
 * annotates `SessionModelTransport.connect` (opening the WebSocket) and `SessionModelTransport.send`
 * (handing the request to the provider). There is no span around the model stream itself, so this
 * summary reports the transport phases that exist instead of inventing new instrumentation inside
 * the session runner.
 */
const LLM_SPAN_PREFIX = "SessionModelTransport."

export interface Segment {
  /** The part of the transport the span covers, taken from its name after the prefix. */
  readonly phase: string
  readonly spans: number
  readonly durationMs: number
}

export interface TraceSegments {
  readonly traceID: string
  readonly totalMs: number
  readonly segments: Segment[]
}

/**
 * Groups model-transport spans per trace and phase, slowest trace first.
 *
 * Only spans that entered the buffer participate, so a trace whose calls were all faster than the
 * span threshold is absent rather than reported as zero.
 */
export function traceSegments(spans: readonly SpanRecord[]): TraceSegments[] {
  const perTrace = new Map<string, Map<string, Segment>>()
  for (const span of spans) {
    if (!span.name.startsWith(LLM_SPAN_PREFIX)) continue
    const phase = span.name.slice(LLM_SPAN_PREFIX.length)
    if (phase.length === 0) continue
    const phases = perTrace.get(span.traceID) ?? new Map<string, Segment>()
    const current = phases.get(phase)
    phases.set(phase, {
      phase,
      spans: (current?.spans ?? 0) + 1,
      durationMs: rounded((current?.durationMs ?? 0) + span.durationMs),
    })
    perTrace.set(span.traceID, phases)
  }
  return [...perTrace]
    .map(([traceID, phases]) => {
      const segments = [...phases.values()].sort((left, right) => right.durationMs - left.durationMs)
      return { traceID, totalMs: rounded(segments.reduce((sum, segment) => sum + segment.durationMs, 0)), segments }
    })
    .sort((left, right) => right.totalMs - left.totalMs)
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000
}
