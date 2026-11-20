// Names the code that moved a viewport. The input recorder already says a scroll happened; this wraps the
// programmatic entry points so a dump can say which call moved it and from where.
//
// Only a call that actually moved something is recorded: the offsets are read before and after, so a no-op
// assignment or a smooth-scroll animation that has not moved yet does not fill the buffer with noise.

import { pathOf } from "./tree"
import type { RecorderContext } from "./types"

/** One resolved stack frame, newest call first. `fn` is `<anonymous>` for a call without a name. */
export type StackFrame = { fn: string; file: string; line: number }

/** A scroll offset pair, in the shape `scroll` events report. */
export type ScrollPosition = { top: number; left: number }

export type ScrollKind =
  | "scrollTo"
  | "scrollBy"
  | "scrollIntoView"
  | "scrollTop"
  | "scrollLeft"
  | "window.scrollTo"
  | "window.scrollBy"

/** A move smaller than this is noise; a return to zero always explains a reset. */
const MIN_DELTA_PX = 32
const EMIT_INTERVAL_MS = 100
const MAX_FRAMES = 3
// Wrapper and sibling-recorder frames never name the app code that scrolled.
const OWN_FRAME = /scroll-trace|[\\/]recorder[\\/]/

type Method = (...args: unknown[]) => unknown

let active: (() => void) | undefined

/**
 * Wraps `scrollTo`/`scrollBy`/`scrollIntoView`, the `scrollTop`/`scrollLeft` setters and the window methods,
 * recording one `scroll.program` event per meaningful move. Installing twice returns the first disposable, so
 * a captured window that restarts never double-wraps.
 */
export function installScrollTrace(ctx: RecorderContext): () => void {
  if (active) return active
  // Not a browser: nothing to wrap. Keeps this module importable outside the renderer.
  if (typeof Element === "undefined" || typeof window === "undefined") return () => {}

  const restores: Array<() => void> = []
  const unavailable = new Set<string>()
  let emittedAt = Number.NEGATIVE_INFINITY

  /** A prototype that refuses redefinition is a degradation, reported once, not a failure. */
  const report = (entry: string) => {
    if (unavailable.has(entry)) return
    unavailable.add(entry)
    ctx.record("scroll.trace.unavailable", { entry })
  }

  const attempt = (entry: string, install: () => boolean) => {
    let installed = false
    try {
      installed = install()
    } catch {
      // Reported below: the only recovery is to leave that entry unwrapped.
    }
    if (!installed) report(entry)
  }

  const emit = (kind: ScrollKind, target: string, from: ScrollPosition, to: ScrollPosition) => {
    const now = ctx.now()
    if (now - emittedAt < EMIT_INTERVAL_MS) return
    emittedAt = now
    ctx.record("scroll.program", { target, kind, from, to, stack: parseStack(new Error().stack) })
  }

  const installElementMethod = (name: "scrollTo" | "scrollBy" | "scrollIntoView", kind: ScrollKind) => {
    attempt(`Element.prototype.${name}`, () => {
      const original = Element.prototype[name] as unknown as Method
      const wrapper = function (this: Element, ...args: unknown[]) {
        ctx.observed()
        const before = positionOf(this)
        const viewportBefore = name === "scrollIntoView" ? viewportPosition() : undefined
        const result = Reflect.apply(original, this, args)
        const after = positionOf(this)
        if (isMeaningful(before, after)) {
          emit(kind, targetOf(this), before, after)
          return result
        }
        // `scrollIntoView` scrolls the nearest scrollable ancestor, so the element itself often stays put.
        if (!viewportBefore) return result
        const viewportAfter = viewportPosition()
        if (isMeaningful(viewportBefore, viewportAfter)) emit(kind, "#document", viewportBefore, viewportAfter)
        return result
      }
      const restore = defineMethod(Element.prototype, name, wrapper)
      if (!restore) return false
      restores.push(restore)
      return true
    })
  }

  const installElementAccessor = (name: "scrollTop" | "scrollLeft") => {
    attempt(`Element.prototype.${name}`, () => {
      const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, name)
      const original = descriptor?.set
      if (!descriptor || !original || !descriptor.configurable) return false

      const wrapper = function (this: Element, value: number) {
        ctx.observed()
        const before = positionOf(this)
        Reflect.apply(original, this, [value])
        const after = positionOf(this)
        if (isMeaningful(before, after)) emit(name, targetOf(this), before, after)
      }

      Object.defineProperty(Element.prototype, name, { ...descriptor, set: wrapper })
      if (Object.getOwnPropertyDescriptor(Element.prototype, name)?.set !== wrapper) return false
      restores.push(() => Object.defineProperty(Element.prototype, name, descriptor))
      return true
    })
  }

  const installWindowMethod = (name: "scrollTo" | "scrollBy", kind: ScrollKind) => {
    attempt(`window.${name}`, () => {
      const original = window[name] as unknown as Method
      const wrapper = function (this: unknown, ...args: unknown[]) {
        ctx.observed()
        const before = viewportPosition()
        const result = Reflect.apply(original, this, args)
        const after = viewportPosition()
        if (isMeaningful(before, after)) emit(kind, "#document", before, after)
        return result
      }
      const restore = defineMethod(window, name, wrapper)
      if (!restore) return false
      restores.push(restore)
      return true
    })
  }

  installElementMethod("scrollTo", "scrollTo")
  installElementMethod("scrollBy", "scrollBy")
  installElementMethod("scrollIntoView", "scrollIntoView")
  installElementAccessor("scrollTop")
  installElementAccessor("scrollLeft")
  installWindowMethod("scrollTo", "window.scrollTo")
  installWindowMethod("scrollBy", "window.scrollBy")

  const dispose = () => {
    if (active !== dispose) return
    for (const restore of restores.reverse()) restore()
    restores.length = 0
    active = undefined
  }

  active = dispose
  return dispose
}

/** Whether a call moved far enough to explain a jump. */
export function isMeaningful(before: ScrollPosition, after: ScrollPosition): boolean {
  return axisMoved(before.top, after.top) || axisMoved(before.left, after.left)
}

/**
 * Resolves a raw `Error.stack` into the app frames a reader can act on, newest call first. Frames from this
 * module and from sibling recorders are dropped: they name the wrapper, not the call site.
 */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return []

  const frames: StackFrame[] = []
  for (const line of stack.split("\n")) {
    const frame = parseFrame(line)
    if (!frame || OWN_FRAME.test(frame.file)) continue
    frames.push(frame)
    if (frames.length >= MAX_FRAMES) break
  }

  return frames
}

/** Replaces a data property and hands back the undo. Returns undefined when the property refuses it. */
function defineMethod(owner: object, name: string, wrapper: Method): (() => void) | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(owner, name)
  if (!descriptor?.configurable) return undefined

  Object.defineProperty(owner, name, { ...descriptor, value: wrapper })
  if (Object.getOwnPropertyDescriptor(owner, name)?.value !== wrapper) return undefined

  return () => Object.defineProperty(owner, name, descriptor)
}

function axisMoved(before: number, after: number): boolean {
  return Math.abs(after - before) >= MIN_DELTA_PX || (after === 0 && before !== 0)
}

function positionOf(element: Element): ScrollPosition {
  return { top: element.scrollTop, left: element.scrollLeft }
}

function viewportPosition(): ScrollPosition {
  return positionOf(document.scrollingElement ?? document.documentElement)
}

/** The scrolling element itself reports through `#document`: that is the target its `scroll` event carries. */
function targetOf(element: Element): string {
  const root = document.scrollingElement ?? document.documentElement
  return element === root ? "#document" : pathOf(element)
}

function parseFrame(line: string): StackFrame | undefined {
  const body = line.trim()
  if (!body.startsWith("at ")) return undefined

  const rest = body.slice(3)
  const open = rest.indexOf("(")
  const fn = open > 0 ? rest.slice(0, open).trim() : ""
  const location = (open > 0 ? rest.slice(open + 1).replace(/\)$/, "") : rest).trim()
  // `file:line:column`, where `file` may itself contain colons (`file:///…`, `http://…`).
  const parts = location.split(":")
  if (parts.length < 3) return undefined

  const lineNumber = Number(parts[parts.length - 2])
  const file = parts.slice(0, -2).join(":")
  if (!file || !Number.isInteger(lineNumber)) return undefined

  return { fn: fn || "<anonymous>", file, line: lineNumber }
}
