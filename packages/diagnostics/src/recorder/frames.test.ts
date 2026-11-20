import { describe, expect, test } from "bun:test"
import { pickStyles, STYLE_KEYS } from "./frames"

const reader = (values: Record<string, string>) => ({ getPropertyValue: (name: string) => values[name] ?? "" })

describe("keyframe styles", () => {
  test("keeps only the six properties that explain a visible jump", () => {
    const styles = reader({
      display: "flex",
      position: "sticky",
      overflow: "auto",
      transform: "translateY(12px)",
      opacity: "1",
      "z-index": "40",
      color: "red",
      background: "black",
    })

    expect(pickStyles(styles)).toEqual({
      display: "flex",
      position: "sticky",
      overflow: "auto",
      transform: "translateY(12px)",
      opacity: "1",
      "z-index": "40",
    })
    expect(STYLE_KEYS).toHaveLength(6)
  })
})
