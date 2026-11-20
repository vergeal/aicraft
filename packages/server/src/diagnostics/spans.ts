import { Exit, Option, Tracer } from "effect"

/** One finished span in the plain JSON shape a diagnostics dump carries. */
export interface SpanRecord {
  readonly traceID: string
  readonly spanID: string
  readonly parentSpanID?: string
  readonly name: string
  /** Unix milliseconds the span started. */
  readonly startWall: number
  readonly durationMs: number
  readonly attributes: Record<string, unknown>
  readonly status: "ok" | "error"
}

export const WINDOW_SECONDS = 60
export const WINDOW_MS = WINDOW_SECONDS * 1000
export const MAX_SPANS = 5000

/** Spans at or below this duration are noise unless they failed. */
export const MIN_DURATION_MS = 5

/** What the buffer sees of a finished span, decoupled from any tracer implementation. */
export interface FinishedSpan {
  readonly name: string
  readonly spanID: string
  readonly traceID: string
  readonly parentSpanID?: string
  readonly startTime: bigint
  readonly endTime: bigint
  readonly attributes: ReadonlyMap<string, unknown>
  readonly failed: boolean
}

/**
 * Converts a finished span, or returns `undefined` when it is neither slow nor a failure.
 *
 * Failures are always kept: a 1ms error is the interesting one, and dropping it by duration would
 * make the export lie about what went wrong.
 */
export function toRecord(span: FinishedSpan): SpanRecord | undefined {
  const durationMs = Math.max(0, Number(span.endTime - span.startTime) / 1e6)
  if (!span.failed && durationMs <= MIN_DURATION_MS) return undefined
  return {
    traceID: span.traceID,
    spanID: span.spanID,
    ...(span.parentSpanID === undefined ? {} : { parentSpanID: span.parentSpanID }),
    name: span.name,
    startWall: Number(span.startTime / 1_000_000n),
    durationMs: rounded(durationMs),
    attributes: plainAttributes(span.attributes),
    status: span.failed ? "error" : "ok",
  }
}

/**
 * Keeps the spans that finished inside the window, newest last, capped at `max`. Both limits are
 * applied here so the buffer never has to trust the order spans end in.
 */
export function trim(
  spans: readonly SpanRecord[],
  now: number,
  windowMs = WINDOW_MS,
  max = MAX_SPANS,
): { spans: SpanRecord[]; dropped: number } {
  const cutoff = now - windowMs
  const kept = spans.filter((span) => span.startWall + span.durationMs >= cutoff).slice(-max)
  return { spans: kept, dropped: spans.length - kept.length }
}

export interface Snapshot {
  readonly spans: SpanRecord[]
  /**
   * Every span the tracer saw but `spans` does not contain, counted since this process started:
   * faster than the threshold, or pushed out of the buffer by the window or the size limit.
   */
  readonly dropped: number
  readonly windowSeconds: number
}

const buffer: SpanRecord[] = []
let discarded = 0

function retain(span: SpanRecord, now: number): void {
  buffer.push(span)
  const oldest = buffer[0]
  // The expensive trim only runs when the buffer is actually over a limit; spans end nearly in order.
  if (buffer.length <= MAX_SPANS && oldest !== undefined && oldest.startWall + oldest.durationMs >= now - WINDOW_MS)
    return
  const trimmed = trim(buffer, now)
  buffer.length = 0
  buffer.push(...trimmed.spans)
  discarded += trimmed.dropped
}

export function spanSnapshot(now = Date.now()): Snapshot {
  const trimmed = trim(buffer, now)
  buffer.length = 0
  buffer.push(...trimmed.spans)
  discarded += trimmed.dropped
  return { spans: buffer.slice(), dropped: discarded, windowSeconds: WINDOW_SECONDS }
}

/**
 * Wraps the tracer that is already active so spans keep flowing wherever they went before (the OTel
 * layer when one is configured) while this process also keeps its own inspectable copy.
 */
export function makeTracer(inner: Tracer.Tracer): Tracer.Tracer {
  return Tracer.make({ span: (options) => new RetainedSpan(inner.span(options)) })
}

class RetainedSpan implements Tracer.Span {
  readonly _tag = "Span"

  constructor(private readonly inner: Tracer.Span) {}

  get name() {
    return this.inner.name
  }

  get spanId() {
    return this.inner.spanId
  }

  get traceId() {
    return this.inner.traceId
  }

  get parent() {
    return this.inner.parent
  }

  get annotations() {
    return this.inner.annotations
  }

  get status() {
    return this.inner.status
  }

  get attributes() {
    return this.inner.attributes
  }

  get links() {
    return this.inner.links
  }

  get sampled() {
    return this.inner.sampled
  }

  get kind() {
    return this.inner.kind
  }

  attribute(key: string, value: unknown): void {
    this.inner.attribute(key, value)
  }

  event(name: string, startTime: bigint, attributes?: Record<string, unknown>): void {
    this.inner.event(name, startTime, attributes)
  }

  addLinks(links: ReadonlyArray<Tracer.SpanLink>): void {
    this.inner.addLinks(links)
  }

  end(endTime: bigint, exit: Exit.Exit<unknown, unknown>): void {
    const status = this.inner.status
    if (status._tag === "Ended") return
    this.inner.end(endTime, exit)
    const record = toRecord({
      name: this.inner.name,
      spanID: this.inner.spanId,
      traceID: this.inner.traceId,
      parentSpanID: Option.getOrUndefined(this.inner.parent)?.spanId,
      startTime: status.startTime,
      endTime,
      attributes: this.inner.attributes,
      failed: Exit.isFailure(exit),
    })
    if (record === undefined) {
      discarded++
      return
    }
    retain(record, Date.now())
  }
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Keeps attribute values JSON-safe without walking arbitrary object graphs: a dump should never
 * serialize a provider client or fail on a cycle because someone annotated a span with one.
 */
function plainAttributes(attributes: ReadonlyMap<string, unknown>): Record<string, unknown> {
  return Object.fromEntries([...attributes].map(([key, value]) => [key, plain(value)]))
}

function plain(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value)
  if (typeof value === "bigint") return value.toString()
  if (Array.isArray(value)) return value.map(plain)
  return String(value)
}
