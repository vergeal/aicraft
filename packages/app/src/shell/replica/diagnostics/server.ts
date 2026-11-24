import { diagnostics } from "@aicraft/diagnostics"
import type { ServerCtx } from "@/runtime/server/runtime"

// The server keeps an in-process span and slow-query buffer and exposes it through an experimental
// endpoint. This module fetches that snapshot at export time and registers it under `sections.server`.
// A server that predates the endpoint simply contributes nothing.

let latest: unknown

diagnostics.section("server", () => latest)

export async function captureServerDiagnostics(ctx: ServerCtx) {
  latest = await ctx.sdk.api.experimental.diagnostics.server()

  return latest
}
