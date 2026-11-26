export * as MemorySettings from "./settings.js"
import { DEFAULT_SETTINGS } from "./types.js"
import type { Settings } from "./types.js"

/**
 * Settings arrive from a config file and from the server's per-channel overrides, so every
 * value is validated here, once, at the boundary the subsystem owns. Retrieval policy that
 * depends on these numbers must not have to defend itself against `maxInjectedChars: 0` or
 * an unknown `inject` string arriving from disk.
 */
export function resolveSettings(input?: Partial<Settings> | undefined): Settings {
  if (input === undefined) return DEFAULT_SETTINGS
  return {
    inject: input.inject === "off" || input.inject === "trigger" ? input.inject : DEFAULT_SETTINGS.inject,
    maxInjectedChars: positive(input.maxInjectedChars, DEFAULT_SETTINGS.maxInjectedChars),
    lexicalTopK: positive(input.lexicalTopK, DEFAULT_SETTINGS.lexicalTopK),
    lexicalThreshold: ratio(input.lexicalThreshold, DEFAULT_SETTINGS.lexicalThreshold),
    lexicalScanLimit: positive(input.lexicalScanLimit, DEFAULT_SETTINGS.lexicalScanLimit),
    maxEntries: positive(input.maxEntries, DEFAULT_SETTINGS.maxEntries),
    vectorTopK: positive(input.vectorTopK, DEFAULT_SETTINGS.vectorTopK),
    vectorThreshold: ratio(input.vectorThreshold, DEFAULT_SETTINGS.vectorThreshold),
    vectorScanLimit: positive(input.vectorScanLimit, DEFAULT_SETTINGS.vectorScanLimit),
    sessionIndex: input.sessionIndex === "on" ? "on" : "off",
    extract: input.extract === "off" ? "off" : "on",
    extractMinUserTurns: positive(input.extractMinUserTurns, DEFAULT_SETTINGS.extractMinUserTurns),
    extractMaxCandidates: capped(input.extractMaxCandidates, DEFAULT_SETTINGS.extractMaxCandidates, 10),
    extractCooldownMs: floored(input.extractCooldownMs, DEFAULT_SETTINGS.extractCooldownMs, 30_000),
    nearDuplicateThreshold: ratio(input.nearDuplicateThreshold, DEFAULT_SETTINGS.nearDuplicateThreshold),
    browseLimit: positive(input.browseLimit, DEFAULT_SETTINGS.browseLimit),
  }
}

/** A budget below the section header cannot inject anything; say so by reporting the floor
 *  rather than letting the renderer emit a header-only block. */
export function injectionFloor(settings: Settings, headerChars: number): number {
  return settings.maxInjectedChars > headerChars ? settings.maxInjectedChars : 0
}

function positive(value: number | undefined, fallback: number): number {
  const floored = Number.isFinite(value) ? Math.floor(value!) : 0
  return floored >= 1 ? floored : fallback
}

function capped(value: number | undefined, fallback: number, max: number): number {
  return Math.min(positive(value, fallback), max)
}

function floored(value: number | undefined, fallback: number, min: number): number {
  const taken = Number.isFinite(value) ? Math.floor(value!) : 0
  return taken >= min ? taken : fallback
}

function ratio(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! >= 0 && value! <= 1 ? value! : fallback
}
