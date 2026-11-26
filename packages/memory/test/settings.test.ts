import { describe, expect, test } from "bun:test"
import { DEFAULT_SETTINGS, MemoryInject, injectionFloor, resolveSettings } from "../src/index.js"
import type { Settings } from "../src/index.js"

describe("resolveSettings — one validation at the boundary that owns it", () => {
  test("no input means the shipped defaults, by identity", () => {
    expect(resolveSettings()).toBe(DEFAULT_SETTINGS)
    expect(resolveSettings(undefined)).toBe(DEFAULT_SETTINGS)
  })

  test("every field survives a round trip when valid", () => {
    expect(resolveSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
  })

  test("out-of-range numbers fall back rather than disabling a channel", () => {
    const hostile = {
      maxInjectedChars: 0,
      lexicalTopK: -3,
      lexicalThreshold: 1.5,
      vectorThreshold: -0.1,
      lexicalScanLimit: Number.NaN,
      vectorScanLimit: Number.POSITIVE_INFINITY,
      nearDuplicateThreshold: 2,
      browseLimit: 0,
      maxEntries: -1,
    } as unknown as Partial<Settings>
    const resolved = resolveSettings(hostile)
    for (const key of Object.keys(hostile) as (keyof Settings)[]) {
      expect(resolved[key]).toBe(DEFAULT_SETTINGS[key])
    }
  })

  test("a threshold of exactly zero or one is a real choice, not a mistake", () => {
    expect(resolveSettings({ vectorThreshold: 0 }).vectorThreshold).toBe(0)
    expect(resolveSettings({ nearDuplicateThreshold: 1 }).nearDuplicateThreshold).toBe(1)
  })

  test("an unknown injection mode falls back to the default mode", () => {
    expect(resolveSettings({ inject: "always" } as unknown as Partial<Settings>).inject).toBe(DEFAULT_SETTINGS.inject)
    expect(resolveSettings({ inject: "off" }).inject).toBe("off")
    expect(resolveSettings({ inject: "trigger" }).inject).toBe("trigger")
  })

  test("session index is off unless explicitly on", () => {
    expect(resolveSettings({}).sessionIndex).toBe("off")
    expect(resolveSettings({ sessionIndex: "off" }).sessionIndex).toBe("off")
    expect(resolveSettings({ sessionIndex: "on" }).sessionIndex).toBe("on")
  })

  test("fractional scan limits floor down instead of rounding up into a bigger scan", () => {
    expect(resolveSettings({ lexicalScanLimit: 41.9 }).lexicalScanLimit).toBe(41)
  })

  test("a budget that cannot fit the header reports a floor of zero", () => {
    expect(injectionFloor({ ...DEFAULT_SETTINGS, maxInjectedChars: 40 }, MemoryInject.SECTION_HEADER_CHARS)).toBe(0)
    expect(injectionFloor(DEFAULT_SETTINGS, MemoryInject.SECTION_HEADER_CHARS)).toBe(DEFAULT_SETTINGS.maxInjectedChars)
  })

  test("the protocol section stays a fixed, cheap prefix", () => {
    expect(MemoryInject.PROTOCOL_SHORT.length).toBeLessThan(450)
    expect(MemoryInject.PROTOCOL_SHORT).toContain("Memory protocol")
  })
})
