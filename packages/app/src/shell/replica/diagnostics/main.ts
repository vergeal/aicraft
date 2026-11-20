import { diagnostics } from "@opencode/diagnostics"
import type { Platform } from "@/runtime/platform/platform"

// The main process captures its own half of a dump: IPC round trips, window and display changes, process
// metrics and a log slice. The renderer only takes a snapshot at export time and registers it under
// `sections.main`. The section provider is synchronous, so the snapshot has to be fetched before
// `diagnostics.dump(...)` assembles the document.

let latest: unknown

diagnostics.section("main", () => latest)

export async function captureMainDiagnostics(platform: Platform) {
  const read = platform.readDiagnosticsMain

  if (!read) return undefined

  // Both clocks go on one timeline: the reply spent half the round trip travelling back, so the main
  // process stamp corresponds to the midpoint between the request and its response.
  const requestedAt = Date.now()
  const snapshot = await read()
  const receivedAt = Date.now()

  latest = snapshot
  diagnostics.setClockOffset(snapshot.clock.wall - (requestedAt + receivedAt) / 2)

  return snapshot
}
