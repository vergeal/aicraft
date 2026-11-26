import { describe, expect, test } from "bun:test"
import { MemoryTokens } from "../src/index.js"

describe("tokenize", () => {
  test("CJK runs produce adjacent bigrams — the two-character query case unicode61 cannot match", () => {
    const tokens = MemoryTokens.tokenize("字体栈采用")
    expect(tokens).toContain("字体")
    expect(tokens).toContain("体栈")
    expect(tokens).toContain("栈采")
    expect(tokens).toContain("采用")
    expect(tokens).not.toContain("字")
  })

  test("a lone CJK character contributes itself", () => {
    expect(MemoryTokens.tokenize("用 户")).toEqual(expect.arrayContaining(["用", "户"]))
  })

  test("ASCII words are kept whole, lowercased through NFKC", () => {
    const tokens = MemoryTokens.tokenize("Push CODE to remote_1")
    expect(tokens).toContain("push")
    expect(tokens).toContain("code")
    expect(tokens).toContain("remote_1")
  })

  test("mixed text routes both scripts without losing either", () => {
    const tokens = MemoryTokens.tokenize("commit 字体栈")
    expect(tokens).toContain("commit")
    expect(tokens).toContain("字体")
  })

  test("tokens are deduplicated", () => {
    const tokens = MemoryTokens.tokenize("字体字体")
    expect(tokens.filter((token) => token === "字体")).toHaveLength(1)
  })
})

describe("tokenOverlap", () => {
  test("query-normalized: half the query tokens present scores 0.5", () => {
    expect(MemoryTokens.tokenOverlap(new Set(["字体", "体栈"]), ["默认", "认字", "字体", "库大"]))
      .toBeCloseTo(0.5)
  })

  test("empty query never matches", () => {
    expect(MemoryTokens.tokenOverlap(new Set(), ["字体"])).toBe(0)
  })
})
