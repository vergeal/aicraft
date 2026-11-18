import { describe, expect, test } from "bun:test"
import { showsProvider, visibleProviders } from "./order"

describe("provider visibility", () => {
  test("offers only the OpenAI and DeepSeek catalog providers", () => {
    expect([...visibleProviders].sort()).toEqual(["deepseek", "openai"])
  })

  test("shows every offered provider", () => {
    for (const id of visibleProviders) expect(showsProvider(id)).toBe(true)
  })

  test("hides a catalog provider outside the list, even when configured", () => {
    expect(showsProvider("groq")).toBe(false)
  })
})
