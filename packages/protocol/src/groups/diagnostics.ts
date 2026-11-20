import { Schema } from "effect"
import { HttpApiEndpoint, OpenApi } from "effect/http-api"

const Span = Schema.Struct({
  traceID: Schema.String.annotate({ description: "Effect trace id of the span." }),
  spanID: Schema.String,
  parentSpanID: Schema.optional(Schema.String),
  name: Schema.String.annotate({
    description: 'Span name as written in `Effect.withSpan`, for example "Vcs.refreshBranch".',
  }),
  startWall: Schema.Number.annotate({ description: "Unix milliseconds the span started." }),
  durationMs: Schema.Number,
  attributes: Schema.Record(Schema.String, Schema.Unknown).annotate({
    description: "Span attributes, flattened to JSON-safe primitives.",
  }),
  status: Schema.Literals(["ok", "error"]),
}).annotate({ identifier: "Diagnostics.Span" })

const SlowQuery = Schema.Struct({
  sql: Schema.String.annotate({
    description: "Statement text with whitespace collapsed; bound parameters are never recorded.",
  }),
  durationMs: Schema.Number,
  at: Schema.Number.annotate({ description: "Unix milliseconds the statement started." }),
  traceID: Schema.optional(Schema.String),
  spanID: Schema.optional(Schema.String),
  span: Schema.optional(
    Schema.String.annotate({
      description: "Span that was active when the statement ran, standing in for a call site.",
    }),
  ),
}).annotate({ identifier: "Diagnostics.SlowQuery" })

const LlmTrace = Schema.Struct({
  traceID: Schema.String,
  totalMs: Schema.Number,
  segments: Schema.Array(
    Schema.Struct({
      phase: Schema.String,
      spans: Schema.Number,
      durationMs: Schema.Number,
    }),
  ),
}).annotate({ identifier: "Diagnostics.LlmTrace" })

export const ServerResponse = Schema.Struct({
  spans: Schema.Array(Span),
  slowQueries: Schema.Array(SlowQuery),
  llm: Schema.Array(LlmTrace).annotate({
    description: "Model transport phases grouped by trace, built from the existing SessionModelTransport spans.",
  }),
  dropped: Schema.Number.annotate({
    description:
      "Spans the tracer did not keep since this process started: faster than the threshold, or pushed out of the 60 second window.",
  }),
  windowSeconds: Schema.Number,
}).annotate({ identifier: "Diagnostics.Server" })
export type ServerResponse = typeof ServerResponse.Type

/** Lives in the `server.experimental` group (see `groups/experimental.ts`). */
export const DiagnosticsEndpoints = [
  HttpApiEndpoint.get("diagnostics.server", "/api/experimental/diagnostics/server", {
    success: ServerResponse,
  }).annotateMerge(
    OpenApi.annotations({
      identifier: "experimental.diagnostics.server",
      summary: "Read server diagnostics",
      description:
        "Return this server process's recent spans, database statements slower than 50ms, and model transport phases grouped by trace, all read from in-memory buffers. Spans are kept for 60 seconds, at most 5000 of them, and only when they are slower than 5ms or failed. Slow query entries carry statement text and the active span but never bound parameters. Experimental: may change without compatibility guarantees.",
      transform: (operation) => ({ ...operation, tags: ["experimental"] }),
    }),
  ),
] as const
