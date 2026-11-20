import { describe, expect, test } from "bun:test"
import { createSnapshotCache } from "./snapshot"

describe("createSnapshotCache", () => {
  test("captures a redacted copy without touching the source", () => {
    const source = {
      apiKey: "sk-live",
      nested: {
        Authorization: "Bearer secret",
        cookie: "session=abc",
        password: "hunter2",
        accessToken: "tok",
        clientSecret: "shh",
        keep: 1,
      },
      items: [{ token: "t" }, { keep: true }],
    }
    const cache = createSnapshotCache({ read: () => source })

    const snapshot = cache.capture()

    expect(snapshot.value).toEqual({
      apiKey: "[redacted]",
      nested: {
        Authorization: "[redacted]",
        cookie: "[redacted]",
        password: "[redacted]",
        accessToken: "[redacted]",
        clientSecret: "[redacted]",
        keep: 1,
      },
      items: [{ token: "[redacted]" }, { keep: true }],
    })
    expect(snapshot.truncated).toBe(false)
    expect(snapshot.trimmed).toBeUndefined()
    expect(source.apiKey).toBe("sk-live")
  })

  test("trims an oversized snapshot and marks every cut", () => {
    const cache = createSnapshotCache({
      read: () => ({ items: Array.from({ length: 2_000 }, (_, index) => ({ index, text: "x".repeat(400) })) }),
      limitBytes: 4_096,
    })

    const snapshot = cache.capture()
    const serialized = JSON.stringify(snapshot.value)

    expect(snapshot.truncated).toBe(true)
    expect(snapshot.bytes).toBeLessThanOrEqual(4_096)
    expect(snapshot.trimmed?.arrays).toBeGreaterThan(0)
    expect(snapshot.trimmed?.strings).toBeGreaterThan(0)
    expect(serialized).toContain("items trimmed")
    expect(serialized).toContain("chars trimmed")
  })

  test("keeps an extreme budget without throwing", () => {
    const cache = createSnapshotCache({ read: () => ({ text: "x".repeat(10_000) }), limitBytes: 64 })

    const snapshot = cache.capture()

    expect(typeof snapshot.value).toBe("string")
    expect(snapshot.truncated).toBe(true)
    expect(snapshot.bytes).toBeLessThanOrEqual(64)
  })

  test("marks values JSON cannot represent instead of throwing", () => {
    const circular: { self?: unknown } = {}
    circular.self = circular
    const cache = createSnapshotCache<unknown>({
      read: () => ({ circular, big: 10n, missing: undefined, callback: () => 1 }),
    })

    const snapshot = cache.capture()

    expect(snapshot.value).toEqual({
      circular: { self: "[circular]" },
      big: "10n",
      missing: null,
      callback: null,
    })
    expect(snapshot.truncated).toBe(false)
  })

  test("diffs added, removed and changed values by deep path", () => {
    let source: unknown = {
      session: { id: "s1", title: "old", tags: ["a", "b"] },
      composer: { text: "hi", draft: { body: "x" } },
    }
    const cache = createSnapshotCache({ read: () => source })
    const first = cache.capture()

    expect(cache.previous()).toBeUndefined()

    source = {
      session: { id: "s1", title: "new", tags: ["a", "c", "d"] },
      composer: { text: "hi", busy: true },
    }
    const second = cache.capture()
    const diff = cache.diff(first, second)

    expect(cache.previous()).toEqual(first)
    expect(diff.changed).toEqual([
      { path: "session.title", previous: "old", next: "new" },
      { path: "session.tags[1]", previous: "b", next: "c" },
    ])
    expect(diff.added).toEqual([
      { path: "session.tags[2]", value: "d" },
      { path: "composer.busy", value: true },
    ])
    expect(diff.removed).toEqual([{ path: "composer.draft", value: { body: "x" } }])
    expect(diff.truncated).toBe(false)
  })
})
