// Fingerprint normalization, grouping and component clues. The grouper takes its clock from the caller, so the
// aggregation is tested without a renderer or a fake globalThis.

import { describe, expect, test } from "bun:test"
import { componentOf, createErrorGrouper, fingerprintOf, normalizeStack } from "./error-group"

const stackWith = (line: string) =>
  `TypeError: failed to fetch\n    at ${line}\n    at render (http://localhost/app.js:20:5)`

describe("stack normalization", () => {
  test("drops column offsets, memory addresses and cache-busting queries", () => {
    expect(normalizeStack("TypeError: x\n    at fetchSession (/app.js:10:42)")).toEqual(["fetchSession /app.js:10"])

    const a = normalizeStack(stackWith("fetchSession (/app.js:10:42)"))
    const b = normalizeStack(stackWith("fetchSession (/app.js?v=9:10:99)"))
    expect(a).toEqual(b)
    expect(normalizeStack("Error: x\n    at Object.<anonymous> (0x1a2b3c)")).toEqual(["Object.<anonymous>"])
  })

  test("keeps the line, so a different failure site stays a different fingerprint", () => {
    expect(fingerprintOf(stackWith("fetchSession (/app.js:10:42)"), "failed")).toBe(
      fingerprintOf(stackWith("fetchSession (/app.js:10:7)"), "failed"),
    )
    expect(fingerprintOf(stackWith("fetchSession (/app.js:11:42)"), "failed")).not.toBe(
      fingerprintOf(stackWith("fetchSession (/app.js:10:42)"), "failed"),
    )
  })

  test("falls back to a message fingerprint when there is no stack", () => {
    expect(fingerprintOf("", "Failed to load id 42")).toBe(fingerprintOf("", "Failed to load id 7"))
    expect(fingerprintOf("", "Failed to load id 42")).not.toBe(fingerprintOf("", "Failed to save id 42"))
  })
})

describe("grouping", () => {
  test("aggregates repeats by fingerprint with first/last time and count", () => {
    const grouper = createErrorGrouper()
    const stack = stackWith("fetchSession (/app.js:10:42)")

    const first = grouper.add(
      { kind: "error", message: "TypeError: failed to fetch", stack, component: "slot=timeline" },
      100,
    )
    const second = grouper.add(
      { kind: "unhandledrejection", message: "TypeError: failed to fetch", stack, component: "" },
      1_250,
    )
    const separate = grouper.add({ kind: "error", message: "boom", stack: stackWith("save (/app.js:30:1)") }, 1_300)

    expect(first.count).toBe(1)
    expect(first.firstMs).toBe(100)
    expect(second.fingerprint).toBe(first.fingerprint)
    expect(second.count).toBe(2)
    expect(second.firstMs).toBe(100)
    expect(second.lastMs).toBe(1_250)
    expect(second.component).toBe("slot=timeline")
    expect(separate.fingerprint).not.toBe(first.fingerprint)
    expect(separate.count).toBe(1)
  })

  test("attributes the latest trace as an inference and names the first frame", () => {
    const grouper = createErrorGrouper()
    const group = grouper.add(
      {
        kind: "error",
        message: "TypeError: failed to fetch",
        stack: stackWith("fetchSession (/app.js:10:42)"),
        traceID: "4bf92f3577b34da6a3ce929d0e0e4736",
      },
      50,
    )

    expect(group.frame).toBe("fetchSession")
    expect(group.signature).toBe("fetchSession /app.js:10")
    expect(group.traceID).toBe("4bf92f3577b34da6a3ce929d0e0e4736")
    expect(group.inferred).toBe(true)
    expect(grouper.add({ kind: "error", message: "x", stack: "" }, 60).inferred).toBe(false)
  })
})

describe("component clues", () => {
  const fake = (attributes: Record<string, string>) => ({
    closest: (selector: string) => {
      const name = /^\[(.*)\]$/.exec(selector)?.[1] ?? ""
      return attributes[name] === undefined ? null : { getAttribute: () => attributes[name] }
    },
  })

  test("summarizes the nearest component, slot and aria-label", () => {
    expect(componentOf(fake({ "data-component": "composer", "data-slot": "prompt" }))).toBe(
      "component=composer slot=prompt",
    )
    expect(componentOf(fake({ "aria-label": "发送" }))).toBe("aria-label=发送")
    expect(componentOf(fake({}))).toBe("")
    expect(componentOf(null)).toBe("")
  })
})
