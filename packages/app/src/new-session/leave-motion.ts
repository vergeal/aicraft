import { createSignal } from "solid-js"

/** The frame the draft page leaves through, registered by the mounted draft screen. */
type LeaveEndpoint = {
  readonly root: HTMLElement
  readonly composer: HTMLElement
}

export type LeaveHandle = {
  readonly settled: Promise<void>
  cancel(): void
}

// The session composer rests 14px above the panel's bottom edge; Home keeps its 8px shell inset below the panel.
const SHELL_INSET = 8
const COMPOSER_GAP = 14
// A frame longer than the 260ms move, so a zero-distance or interrupted transition still lands the route.
const MOTION_TIMEOUT = 300

let endpoint: LeaveEndpoint | undefined
// Plain, not reactive: the pages that must hold still while the exit plays re-read it when their own state
// changes, and a signal would make them rebuild the moment the exit ends.
let leaving = false

const [text, setText] = createSignal<string | undefined>()

/** The prompt packed into the bubble as the draft page leaves; empty while the page rests. */
export const leavingText = text

/** Whether the draft page is playing its exit right now. */
export const isLeaving = () => leaving

export function registerLeaveEndpoint(value: LeaveEndpoint) {
  endpoint = value

  return () => {
    if (endpoint === value) endpoint = undefined
  }
}

/**
 * Plays the draft page's exit: the welcome header fades, the composer slides to where the session composer
 * rests, and the prompt leaves as a bubble. Resolves when the composer lands, or at once without motion.
 */
export function beginLeaveMotion(value: string): LeaveHandle {
  const target = endpoint

  if (!target || motionReduced()) return { settled: Promise.resolve(), cancel() {} }

  const composerRect = target.composer.getBoundingClientRect()
  const main = target.composer.closest<HTMLElement>('[data-slot="replica-main"]')
  const targetTop =
    (main?.getBoundingClientRect().bottom ?? composerRect.bottom) - SHELL_INSET - COMPOSER_GAP - composerRect.height
  const shift = Math.max(0, Math.round(targetTop - composerRect.top))
  const done = Promise.withResolvers<void>()

  const finish = () => {
    clearTimeout(timer)
    target.composer.removeEventListener("transitionend", ended)
    leaving = false
    done.resolve()
  }

  const ended = (event: TransitionEvent) => {
    if (event.target !== target.composer || event.propertyName !== "transform") return
    finish()
  }

  const timer = setTimeout(finish, MOTION_TIMEOUT)

  leaving = true
  setText(value)
  target.root.dataset.leaving = "true"
  target.composer.style.setProperty("--leave-shift", `${shift}px`)
  target.composer.addEventListener("transitionend", ended)

  return {
    settled: done.promise,
    cancel() {
      clearTimeout(timer)
      target.composer.removeEventListener("transitionend", ended)
      leaving = false
      cancelLeaveState(target)
      done.resolve()
    },
  }
}

function cancelLeaveState(target: LeaveEndpoint) {
  delete target.root.dataset.leaving
  target.composer.style.removeProperty("--leave-shift")
  setText(undefined)
}

function motionReduced() {
  return (
    document.documentElement.dataset.motion === "reduce" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}
