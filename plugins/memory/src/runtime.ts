export * as MemoryRuntime from "./runtime.js"

import type { Session } from "@opencode/schema/session"
import * as Store from "./store.js"

export interface Settings {
  readonly autoInject: boolean
  readonly maxInjectedChars: number
  readonly maxEntries: number
}

export const DEFAULTS: Settings = { autoInject: true, maxInjectedChars: 4_000, maxEntries: 200 }

export function readSettings(config: Record<string, unknown>): Settings {
  return {
    autoInject: typeof config.autoInject === "boolean" ? config.autoInject : DEFAULTS.autoInject,
    maxInjectedChars: bounded(config.maxInjectedChars, DEFAULTS.maxInjectedChars, 200, 40_000),
    maxEntries: bounded(config.maxEntries, DEFAULTS.maxEntries, 1, 2_000),
  }
}

function bounded(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

/** The host surface these tools need; keeping it narrow lets the tests drive the tools without a plugin host. */
export interface Host {
  readonly location: { readonly project: { readonly id: string } }
  readonly session: { readonly get: (input: { readonly sessionID: Session.ID }) => Promise<{ readonly projectID: string }> }
}

/**
 * The Project a Session belongs to. A process can serve several Projects, so the Session is authoritative and the
 * activation location is only the fallback for a Session that has just been removed.
 */
export async function projectID(host: Host, sessionID: Session.ID) {
  try {
    return (await host.session.get({ sessionID })).projectID
  } catch {
    return host.location.project.id
  }
}

export interface Deps {
  readonly storage: Store.Storage
  readonly projectID: (sessionID: Session.ID) => Promise<string>
  readonly settings: () => Promise<Settings>
  readonly now: () => string
}
