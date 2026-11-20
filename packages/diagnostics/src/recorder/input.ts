// Pointer, keyboard and viewport activity. Payloads carry the target and the shape of the interaction, never
// the typed content: `input.value` records a length and password keystrokes are redacted.
//
// Wheel and touch moves are recorded as evidence that the user was scrolling, not as a position: a reader only
// needs to know that the input channel was active, so a wheel keeps its direction and drops its delta.

import { installScrollTrace } from "./scroll-trace"
import type { Recorder, RecorderContext } from "./types"

const SCROLL_INTERVAL_MS = 100
const RESIZE_INTERVAL_MS = 250
const WHEEL_INTERVAL_MS = 250
const TOUCH_INTERVAL_MS = 250

export const inputRecorder: Recorder = {
  name: "input",
  start(ctx) {
    // One-time and idempotent: the disposable is module-owned, so a restarted capture never double-wraps.
    installScrollTrace(ctx)
    const scrollInput = createScrollInput(ctx)

    window.addEventListener(
      "wheel",
      (event) => scrollInput.wheel(event.deltaY, event.ctrlKey, event.target as Node | null),
      { capture: true, passive: true },
    )

    window.addEventListener("touchmove", (event) => scrollInput.touchmove(event.target as Node | null), {
      capture: true,
      passive: true,
    })

    window.addEventListener(
      "pointerdown",
      (event) => {
        ctx.observed()
        if (ctx.ignored(event.target as Node)) return
        ctx.record("input.pointer", {
          x: Math.round(event.clientX),
          y: Math.round(event.clientY),
          button: event.button,
          target: ctx.pathOf(event.target as Node),
        })
      },
      true,
    )

    window.addEventListener(
      "click",
      (event) => {
        ctx.observed()
        if (ctx.ignored(event.target as Node)) return
        ctx.record("input.click", {
          x: Math.round(event.clientX),
          y: Math.round(event.clientY),
          target: ctx.pathOf(event.target as Node),
        })
      },
      true,
    )

    window.addEventListener(
      "keydown",
      (event) => {
        ctx.observed()
        if (ctx.ignored(event.target as Node)) return
        const target = event.target
        const password = target instanceof HTMLInputElement && target.type === "password"
        ctx.record("input.key", {
          key: password ? "[redacted]" : event.key,
          meta: event.metaKey,
          ctrl: event.ctrlKey,
          alt: event.altKey,
          shift: event.shiftKey,
          target: ctx.pathOf(target as Node),
        })
      },
      true,
    )

    window.addEventListener(
      "input",
      (event) => {
        ctx.observed()
        if (ctx.ignored(event.target as Node)) return
        const target = event.target
        ctx.record("input.value", {
          target: ctx.pathOf(target as Node),
          length: target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value.length : 0,
        })
      },
      true,
    )

    window.addEventListener("focusin", (event) => {
      ctx.observed()
      if (ctx.ignored(event.target as Node)) return
      ctx.record("focus", { target: ctx.pathOf(event.target as Node) })
    })

    let scrollAt = 0
    window.addEventListener(
      "scroll",
      (event) => {
        ctx.observed()
        const now = ctx.now()
        if (now - scrollAt < SCROLL_INTERVAL_MS) return
        scrollAt = now
        const target = event.target
        const scrolling = target === document ? document.scrollingElement : (target as Element)
        if (ctx.ignored(scrolling)) return
        ctx.record("scroll", {
          target: target === document ? "#document" : ctx.pathOf(target as Node),
          top: Math.round(scrolling?.scrollTop ?? 0),
          left: Math.round(scrolling?.scrollLeft ?? 0),
          height: Math.round(scrolling?.scrollHeight ?? 0),
        })
      },
      true,
    )

    let resizeAt = 0
    window.addEventListener("resize", () => {
      ctx.observed()
      const now = ctx.now()
      if (now - resizeAt < RESIZE_INTERVAL_MS) return
      resizeAt = now
      ctx.record("resize", { width: innerWidth, height: innerHeight, dpr: devicePixelRatio })
    })

    document.addEventListener("visibilitychange", () => {
      ctx.observed()
      ctx.record("visibility", { state: document.visibilityState })
    })
  },
}

/**
 * Wheel and touch evidence. Both are throttled like `scroll`: the fact that the channel was active is the
 * signal, and `wheel` only keeps the direction of `deltaY` because the magnitude answers nothing here.
 */
export function createScrollInput(ctx: RecorderContext) {
  let wheelAt = Number.NEGATIVE_INFINITY
  let touchAt = Number.NEGATIVE_INFINITY

  return {
    wheel(deltaY: number, ctrl: boolean, target: Node | null) {
      ctx.observed()
      if (ctx.ignored(target)) return
      const now = ctx.now()
      if (now - wheelAt < WHEEL_INTERVAL_MS) return
      wheelAt = now
      ctx.record("wheel", { target: ctx.pathOf(target), dy: Math.sign(deltaY), ctrl })
    },
    touchmove(target: Node | null) {
      ctx.observed()
      if (ctx.ignored(target)) return
      const now = ctx.now()
      if (now - touchAt < TOUCH_INTERVAL_MS) return
      touchAt = now
      ctx.record("touchmove", { target: ctx.pathOf(target) })
    },
  }
}
