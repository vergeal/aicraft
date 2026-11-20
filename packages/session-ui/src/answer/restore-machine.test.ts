import { describe, expect, test } from "bun:test"
import {
  createRestoreState,
  RESTORE_FRAME_LIMIT,
  RESTORE_STABLE_FRAMES,
  transitionRestore,
  type RestoreState,
} from "./restore-machine"

const target = { key: "node:input:msg_1", offset: 134 }

function activate(position: { key: string; offset: number } | undefined): RestoreState {
  return transitionRestore(createRestoreState(), { type: "activate", position })
}

function frames(state: RestoreState, count: number, delta: number): RestoreState {
  let next = state

  for (let index = 0; index < count; index++) next = transitionRestore(next, { type: "frame", found: true, delta })

  return next
}

describe("restore", () => {
  test("an activation without a remembered row finishes immediately, so it is attempted once", () => {
    const state = activate(undefined)

    expect(state.status).toBe("settled")
    // A second attempt in the same activation must not restart it.
    expect(transitionRestore(state, { type: "activate", position: target })).toBe(state)
  })

  test("a stable measured row settles the pin", () => {
    expect(frames(activate(target), RESTORE_STABLE_FRAMES - 1, 0).status).toBe("pinning")
    expect(frames(activate(target), RESTORE_STABLE_FRAMES, 0).status).toBe("settled")
  })

  test("a moving row keeps the pin instead of giving up after a fixed delay", () => {
    // The frames a slow, long transcript keeps measuring: the pin must survive far past any short timeout.
    expect(frames(activate(target), RESTORE_FRAME_LIMIT - 1, 40).status).toBe("pinning")
  })

  test("an unsettled layout ends at the frame budget", () => {
    expect(frames(activate(target), RESTORE_FRAME_LIMIT, 40).status).toBe("settled")
  })

  test("a row outside the window counts as a frame but not as stable", () => {
    const state = frames(activate(target), RESTORE_STABLE_FRAMES, 0)
    const offWindow = transitionRestore(activate(target), { type: "frame", found: false, delta: 0 })

    expect(state.status).toBe("settled")
    expect(offWindow.status).toBe("pinning")
    expect(offWindow).toMatchObject({ stable: 0, frames: 1 })
  })

  test("a missing row reports a miss rather than settling in place", () => {
    expect(transitionRestore(activate(target), { type: "missing" }).status).toBe("missed")
  })

  test("deactivating returns to idle so the next activation starts over", () => {
    expect(transitionRestore(activate(target), { type: "deactivate" })).toBe(createRestoreState())
    expect(transitionRestore(createRestoreState(), { type: "deactivate" })).toBe(createRestoreState())
  })

  test("an inapplicable frame leaves the state object untouched", () => {
    const state = createRestoreState()

    expect(transitionRestore(state, { type: "frame", found: true, delta: 0 })).toBe(state)
    expect(transitionRestore(activate(undefined), { type: "missing" }).status).toBe("settled")
  })
})
