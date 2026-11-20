import { describe, expect, test } from "bun:test"
import {
  createRestoreState,
  RESTORE_FRAME_LIMIT,
  RESTORE_STABLE_FRAMES,
  RESTORE_VEIL_FRAMES,
  restoreVeiled,
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

  test("the veil covers the frames that move rows and lifts on its own budget", () => {
    // A row that keeps moving never settles early, so the veil is all that keeps the correction unseen.
    const before = frames(activate(target), RESTORE_VEIL_FRAMES - 1, 40)
    expect(restoreVeiled(before)).toBe(true)
    expect(before.status).toBe("pinning")

    const after = frames(activate(target), RESTORE_VEIL_FRAMES, 40)
    expect(restoreVeiled(after)).toBe(false)
    // The pin outlives the veil: the position is still owned, the page is just visible again.
    expect(after.status).toBe("pinning")
    expect(RESTORE_VEIL_FRAMES).toBeLessThan(RESTORE_FRAME_LIMIT)
  })

  test("a settled or absent activation is never veiled", () => {
    expect(restoreVeiled(frames(activate(target), RESTORE_STABLE_FRAMES, 0))).toBe(false)
    expect(restoreVeiled(activate(undefined))).toBe(false)
    expect(restoreVeiled(createRestoreState())).toBe(false)
    expect(restoreVeiled(transitionRestore(activate(target), { type: "missing" }))).toBe(false)
  })
})
