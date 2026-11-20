import { createSnapshotCache, diagnostics } from "@opencode/diagnostics"

// Wires an app-owned state slice into the dump's `state` section. The read function is injected because
// the stores live outside the diagnostics package; this file only captures, trims, redacts and diffs,
// and never guesses the slice's shape.

export function installStateSection(readState: () => unknown) {
  const cache = createSnapshotCache({ read: readState })

  return diagnostics.section("state", () => {
    const snapshot = cache.capture()
    const previous = cache.previous()

    return {
      ...(isRecord(snapshot.value) ? snapshot.value : { value: snapshot.value }),
      capturedAt: snapshot.capturedAt,
      bytes: snapshot.bytes,
      truncated: snapshot.truncated,
      ...(snapshot.trimmed ? { trimmed: snapshot.trimmed } : {}),
      ...(previous ? { diff: cache.diff(previous, snapshot) } : {}),
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
