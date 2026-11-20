/**
 * One activation's attempt to put a remembered row back where the reader left it.
 *
 * Every loaded row is in the DOM, so the attempt is decided on the activation frame by one measured write. These
 * states exist for the two things that write cannot express: the attempt happens once per activation (a page-in asks
 * again when rows change, and a decided attempt must not start over), and the host learns when the row never arrived.
 */
export type RestoreState = "idle" | "placed" | "missed"

export type RestoreEvent =
  /** The attempt is starting: a remembered row is being placed, or the view opens at the newest content. */
  | { readonly type: "activate" }
  /** The remembered row did not page in within the deadline, so the host lands at the newest content. */
  | { readonly type: "miss" }
  /** A new activation invalidates the previous attempt. */
  | { readonly type: "reset" }

export function createRestoreState(): RestoreState {
  return "idle"
}

export function transitionRestore(state: RestoreState, event: RestoreEvent): RestoreState {
  if (event.type === "reset") return "idle"
  // One attempt per activation: the page-in effect asks again whenever rows change, and a decided attempt must not
  // start over from that second call.
  if (state !== "idle") return state

  return event.type === "miss" ? "missed" : "placed"
}
