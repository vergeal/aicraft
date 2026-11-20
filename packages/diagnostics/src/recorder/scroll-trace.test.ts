import { describe, expect, test } from "bun:test"
import { isMeaningful, parseStack } from "./scroll-trace"

const at = (line: string) => `    ${line}`

describe("parseStack", () => {
  test("drops this module's frames and every sibling recorder frame", () => {
    const stack = [
      "Error",
      at("at Element.scrollTo (http://localhost:5173/src/recorder/scroll-trace.ts:120:5)"),
      at("at setScroll (http://localhost:5173/src/components/timeline.tsx:88:7)"),
      at("at Object.start (http://localhost:5173/src/recorder/input.ts:31:11)"),
      at("at http://localhost:5173/src/components/timeline.tsx:120:3"),
    ].join("\n")

    expect(parseStack(stack)).toEqual([
      { fn: "setScroll", file: "http://localhost:5173/src/components/timeline.tsx", line: 88 },
      { fn: "<anonymous>", file: "http://localhost:5173/src/components/timeline.tsx", line: 120 },
    ])
  })

  test("keeps at most three frames and skips lines it cannot resolve", () => {
    const stack = [
      "Error",
      at("at one (/src/a.tsx:1:1)"),
      at("at two (/src/a.tsx:2:1)"),
      at("at three (/src/a.tsx:3:1)"),
      at("at four (/src/a.tsx:4:1)"),
      at("at native"),
    ].join("\n")

    expect(parseStack(stack).map((frame) => frame.fn)).toEqual(["one", "two", "three"])
  })

  test("returns nothing for a missing or empty stack", () => {
    expect(parseStack(undefined)).toEqual([])
    expect(parseStack("")).toEqual([])
  })
})

describe("isMeaningful", () => {
  test("records a return to zero even when the distance is small", () => {
    expect(isMeaningful({ top: 12, left: 0 }, { top: 0, left: 0 })).toBe(true)
    expect(isMeaningful({ top: 0, left: 120 }, { top: 0, left: 0 })).toBe(true)
  })

  test("records a move of at least 32px and ignores anything smaller", () => {
    expect(isMeaningful({ top: 400, left: 0 }, { top: 431, left: 0 })).toBe(false)
    expect(isMeaningful({ top: 400, left: 0 }, { top: 432, left: 0 })).toBe(true)
    expect(isMeaningful({ top: 0, left: 400 }, { top: 0, left: 368 })).toBe(true)
  })

  test("ignores a call that left the offsets where they were", () => {
    expect(isMeaningful({ top: 320, left: 40 }, { top: 320, left: 40 })).toBe(false)
    expect(isMeaningful({ top: 0, left: 0 }, { top: 0, left: 0 })).toBe(false)
  })
})
