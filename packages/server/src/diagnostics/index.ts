import { SlowQuery } from "@opencode/core/database/slow-query"
import { traceSegments } from "./segments"
import { spanSnapshot } from "./spans"

/**
 * Everything this server process can say about its own work: the spans it kept, the statements that
 * ran long, and the transport phases of model requests grouped by trace. Read-only and in-memory, so
 * a caller can ask as often as it likes without touching the database.
 */
export function snapshot() {
  const spans = spanSnapshot()
  return {
    spans: spans.spans,
    slowQueries: SlowQuery.snapshot(),
    llm: traceSegments(spans.spans),
    dropped: spans.dropped,
    windowSeconds: spans.windowSeconds,
  }
}
