import { describe, expect, test } from "bun:test"
import { showsProvider, visibleProviders } from "./order"

describe("provider visibility", () => {
  test("shows every offered provider", () => {
    for (const id of visibleProviders) expect(showsProvider(id, false)).toBe(true)
  })

  test("hides an unconfigured provider outside the list", () => {
    expect(showsProvider("groq", false)).toBe(false)
  })

  test("shows a configured provider outside the list", () => {
    expect(showsProvider("groq", true)).toBe(true)
  })
})
