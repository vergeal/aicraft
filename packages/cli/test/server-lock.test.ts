import { expect, test } from "bun:test"
import { Effect } from "effect"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { ServerLock } from "../src/server-lock"

// The lease protects one contract: a live server over the same database file blocks the
// next one, while a crashed owner never wedges the environment. Real files and real pids,
// no mocks.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "aicraft-server-lock-"))
const leaseOf = (database: string) => `${database}.server.lock`
const writeLease = (file: string, holder: unknown) => fs.writeFileSync(file, JSON.stringify(holder), { mode: 0o600 })

test("a live holder outside this process blocks a second server", async () => {
  const database = path.join(root, "live.db")
  const contender = Bun.spawn(["sleep", "30"])
  try {
    writeLease(leaseOf(database), { pid: contender.pid, instanceID: "other", startedAt: "2026-01-01T00:00:00.000Z" })
    const attempt = ServerLock.acquire({ database, instanceID: "mine" })
    expect(attempt.ok).toBe(false)
    if (attempt.ok) return
    expect(attempt.busy).toBeInstanceOf(ServerLock.Busy)
    expect(attempt.busy.message).toContain(`pid ${contender.pid}`)
    expect(fs.existsSync(leaseOf(database))).toBe(true)
  } finally {
    contender.kill()
  }
})

test("a stale lease from a dead pid is reclaimed", async () => {
  const database = path.join(root, "stale.db")
  writeLease(leaseOf(database), { pid: 999_999, instanceID: "crashed", startedAt: "" })
  const attempt = ServerLock.acquire({ database, instanceID: "mine" })
  expect(attempt.ok).toBe(true)
  if (!attempt.ok) return
  expect(JSON.parse(fs.readFileSync(leaseOf(database), "utf8")).instanceID).toBe("mine")
  await Effect.runPromise(attempt.release)
  expect(fs.existsSync(leaseOf(database))).toBe(false)
})

test("a junk lease is reclaimed", async () => {
  const database = path.join(root, "junk.db")
  fs.writeFileSync(leaseOf(database), "not json")
  const attempt = ServerLock.acquire({ database, instanceID: "mine" })
  expect(attempt.ok).toBe(true)
  if (!attempt.ok) return
  await Effect.runPromise(attempt.release)
})

test("re-acquiring in the same owner process does not deadlock its own restart", async () => {
  const database = path.join(root, "self.db")
  const first = ServerLock.acquire({ database, instanceID: "first" })
  const second = ServerLock.acquire({ database, instanceID: "second" })
  expect(first.ok).toBe(true)
  expect(second.ok).toBe(true)
  if (!first.ok || !second.ok) return
  // The old owner's release must not delete the lease the newer attempt holds.
  await Effect.runPromise(first.release)
  expect(JSON.parse(fs.readFileSync(leaseOf(database), "utf8")).instanceID).toBe("second")
  await Effect.runPromise(second.release)
  expect(fs.existsSync(leaseOf(database))).toBe(false)
})

test("in-memory databases take no lease", async () => {
  const attempt = ServerLock.acquire({ database: ":memory:", instanceID: "mine" })
  expect(ServerLock.lockFile(":memory:")).toBeUndefined()
  expect(attempt.ok).toBe(true)
  if (!attempt.ok) return
  await Effect.runPromise(attempt.release)
})
