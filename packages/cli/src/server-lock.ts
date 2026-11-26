export * as ServerLock from "./server-lock.js"

import { dirname } from "node:path"
import { linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { Effect } from "effect"

/** Contents of the lease file. `startedAt` makes a crashed owner recognizable in errors. */
type Holder = {
  readonly pid: number
  readonly instanceID: string
  readonly startedAt: string
}

/** Another live process holds the lease. The service mode retires on this; a manual serve fails on it. */
export class Busy extends Error {
  constructor(readonly holder: Holder | undefined, readonly database: string) {
    super(
      `Another aicraft server is already running for this environment ` +
        `(database ${database}${holder ? `, pid ${holder.pid}${holder.startedAt ? `, started ${holder.startedAt}` : ""}` : ""}). ` +
        "Only one server may run per environment; stop the other process first, " +
        "or set AICRAFT_DB to a different database to run a second server.",
    )
    this.name = "ServerLock.Busy"
  }
}

export type Lease = { readonly ok: true; readonly release: Effect.Effect<void> } | { readonly ok: false; readonly busy: Busy }

/**
 * Take the single-server lease for `database`, or report the live holder.
 * The isolation key is the database file itself — the same one `databasePath` produces —
 * so each environment (channel, or an `AICRAFT_DB` override) runs exactly one server at a time.
 * In-memory databases are private to their process and take no lease.
 * A successful take returns the release effect; the caller runs it when the server stops.
 */
export function acquire(input: { readonly database: string; readonly instanceID: string }): Lease {
  const file = lockFile(input.database)
  if (file === undefined) return { ok: true, release: Effect.void }
  const holder: Holder = { pid: process.pid, instanceID: input.instanceID, startedAt: new Date().toISOString() }
  try {
    takeLock(file, holder, input.database)
  } catch (error) {
    if (error instanceof Busy) return { ok: false, busy: error }
    throw error
  }
  return { ok: true, release: Effect.sync(() => release(file, holder)) }
}

/** The lease path beside the database it guards. Exported for tests and error copy. */
export function lockFile(database: string) {
  return database === ":memory:" ? undefined : `${database}.server.lock`
}

function takeLock(file: string, holder: Holder, database: string) {
  mkdirSync(dirname(file), { recursive: true })
  if (create(file, holder)) return
  evictIfStale(file, holder, database)
  // Both contenders evicted a stale lock at once and one won the exclusive link;
  // the winner is starting, so this loser reports it as the holder.
  if (create(file, holder)) return
  throw new Busy(readHolder(file), database)
}

/** Exclusive create via link: readers only ever see a fully written lease, never a gap between create and write. */
function create(file: string, holder: Holder) {
  const temp = `${file}.${holder.instanceID}.tmp`
  try {
    writeFileSync(temp, JSON.stringify(holder), { mode: 0o600 })
    try {
      linkSync(temp, file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false
      throw error
    }
    return true
  } finally {
    remove(temp)
  }
}

function evictIfStale(file: string, holder: Holder, database: string) {
  const found = readHolder(file)
  // Junk (unreadable or malformed) counts as stale; a live owner of another process does not.
  if (found && found.pid !== holder.pid && alive(found.pid)) throw new Busy(found, database)
  remove(file)
}

/** A lease may only be deleted by its current owner; a reclaimed one belongs to someone else. */
function release(file: string, holder: Holder) {
  const found = readHolder(file)
  if (found && found.instanceID !== holder.instanceID) return
  remove(file)
}

function readHolder(file: string): Holder | undefined {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return undefined
  }
  if (typeof value !== "object" || value === null) return undefined
  const found = value as Record<string, unknown>
  if (typeof found.pid !== "number" || typeof found.instanceID !== "string") return undefined
  return {
    pid: found.pid,
    instanceID: found.instanceID,
    startedAt: typeof found.startedAt === "string" ? found.startedAt : "",
  }
}

/** EPERM means the process exists under another user, so the lease is still held. */
function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

function remove(file: string) {
  try {
    unlinkSync(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}
