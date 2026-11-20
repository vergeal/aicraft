import { describe, expect, test } from "bun:test"
import { animatesTransform, createsStackingContext } from "./layout"

const reader = (values: Record<string, string>) => ({ getPropertyValue: (name: string) => values[name] ?? "" })

describe("layout.rect stacking", () => {
  const cases: Array<[string, Record<string, string>, boolean]> = [
    ["static element", { transform: "none", filter: "none", opacity: "1", "will-change": "auto" }, false],
    [
      "transformed element",
      { transform: "translateY(1px)", filter: "none", opacity: "1", "will-change": "auto" },
      true,
    ],
    ["filtered element", { transform: "none", filter: "blur(2px)", opacity: "1", "will-change": "auto" }, true],
    ["translucent element", { transform: "none", filter: "none", opacity: "0.99", "will-change": "auto" }, true],
    ["promoted element", { transform: "none", filter: "none", opacity: "1", "will-change": "transform" }, true],
  ]

  test.each(cases)("%s", (_name, values, expected) => {
    expect(createsStackingContext(reader(values))).toBe(expected)
  })
})

describe("layout.rect transform animation", () => {
  const cases: Array<[string, Record<string, string>, boolean]> = [
    ["static element", { rotate: "none", transform: "none" }, false],
    ["rotating ring", { rotate: "123deg", transform: "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)" }, true],
    ["promoted box", { rotate: "none", transform: "translateZ(0)" }, true],
  ]

  test.each(cases)("%s", (_name, values, expected) => {
    expect(animatesTransform(reader(values))).toBe(expected)
  })
})
