/**
 * One activation's attempt to put a remembered row back where the reader left it.
 *
 * Frames count instead of a timer. A long transcript that keeps measuring past any fixed delay would lose its pin
 * early and fall back to the same estimated layout that was wrong in the first place, so the attempt ends when the
 * measured row stops moving or when the frame budget runs out.
 */
export const RESTORE_STABLE_FRAMES = 3
export const RESTORE_FRAME_LIMIT = 180

export type RestoreState =
  | { readonly status: "idle" }
  | {
      readonly status: "pinning"
      readonly key: string
      readonly offset: number
      readonly stable: number
      readonly frames: number
    }
  | { readonly status: "settled" }
  | { readonly status: "missed" }

export type RestoreEvent =
  /** A new activation. `position` omitted: nothing remembered, or the reader left at the end. */
  | { readonly type: "activate"; readonly position: { readonly key: string; readonly offset: number } | undefined }
  /** One animation frame: the measured row, or `found: false` while it is still outside the window. */
  | { readonly type: "frame"; readonly found: boolean; readonly delta: number }
  /** The remembered row is not in the page at all, so the anchor cannot be restored. */
  | { readonly type: "missing" }
  | { readonly type: "deactivate" }

const IDLE: RestoreState = Object.freeze({ status: "idle" })

const SETTLED: RestoreState = Object.freeze({ status: "settled" })

const MISSED: RestoreState = Object.freeze({ status: "missed" })

export function createRestoreState(): RestoreState {
  return IDLE
}

export function transitionRestore(state: RestoreState, event: RestoreEvent): RestoreState {
  if (event.type === "deactivate") return state.status === "idle" ? state : IDLE

  if (event.type === "activate") {
    // One attempt per activation: the layout effect asks again once rows exist, and a running or finished restore
    // must not start over from that second call.
    if (state.status !== "idle") return state

    return event.position
      ? { status: "pinning", key: event.position.key, offset: event.position.offset, stable: 0, frames: 0 }
      : SETTLED
  }

  if (state.status !== "pinning") return state

  if (event.type === "missing") return MISSED

  const frames = state.frames + 1
  const stable = event.found && Math.abs(event.delta) <= 1 ? state.stable + 1 : 0

  // A few unchanged frames mean the windowed layout has settled; the frame limit is the budget for one that never does.
  if (stable >= RESTORE_STABLE_FRAMES || frames >= RESTORE_FRAME_LIMIT) return SETTLED

  return { ...state, stable, frames }
}

/** Whether this activation still owns the scroll position, so the anchor must not fight it. */
export function restorePinning(state: RestoreState) {
  return state.status === "pinning"
}
