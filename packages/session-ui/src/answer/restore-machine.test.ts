import { describe, expect, test } from "bun:test"
import { createRestoreState, transitionRestore } from "./restore-machine"

const activate = () => transitionRestore(createRestoreState(), { type: "activate" })

describe("restore", () => {
  test("an activation is attempted once, whether it placed a row or opened at the end", () => {
    const placed = activate()

    expect(placed).toBe("placed")
    // A page-in asks again when rows change; a decided attempt must not start over.
    expect(transitionRestore(placed, { type: "activate" })).toBe(placed)
    expect(transitionRestore(placed, { type: "miss" })).toBe(placed)
  })

  test("a miss is final for this activation", () => {
    // The deadline only reports while the attempt is still undecided: a loaded key that leaves the window before its
    // row commits.
    const missed = transitionRestore(createRestoreState(), { type: "miss" })

    expect(missed).toBe("missed")
    expect(transitionRestore(missed, { type: "activate" })).toBe(missed)
  })

  test("a new activation resets a decided attempt", () => {
    expect(transitionRestore(transitionRestore(activate(), { type: "miss" }), { type: "reset" })).toBe("idle")
    expect(transitionRestore(createRestoreState(), { type: "reset" })).toBe("idle")
  })
})
