import { BrandMark } from "@aicraft/ui/brand-mark"
import type { Platform } from "@aicraft/app/desktop"
import { onCleanup, onMount, Show } from "solid-js"
import "./splash.css"

export function LoadingSplash(props: {
  deep: boolean
  firstLaunch: boolean
  platform: Platform
  drawingPaused: boolean
  onDrawStart: () => void
  onDrawEnd: () => void
}) {
  onMount(() => {
    if (!props.drawingPaused) return
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")

    const start = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return
      props.onDrawStart()

      if (motion.matches) props.onDrawEnd()
    }

    window.addEventListener("focus", start)
    document.addEventListener("visibilitychange", start)
    motion.addEventListener("change", start)
    start()
    onCleanup(() => {
      window.removeEventListener("focus", start)
      document.removeEventListener("visibilitychange", start)
      motion.removeEventListener("change", start)
    })
  })

  const titlebarHeight = () => {
    const zoom = props.platform.webviewZoom?.() ?? 1

    if (props.platform.os === "macos") return `max(36px, ${36 / zoom}px)`

    if (props.platform.os === "windows")
      return `max(36px, env(titlebar-area-height, ${48 / Math.min(Math.max(zoom, 0.25), 1)}px))`

    return "36px"
  }

  return (
    <Show
      when={props.firstLaunch}
      fallback={
        <div
          data-component="startup-splash"
          class="h-dvh w-screen flex flex-col items-center justify-center"
          classList={{
            "bg-v2-background-bg-deep": props.deep,
            "bg-v2-background-bg-base": !props.deep,
          }}
        >
          <BrandMark class="w-[128px]" />
        </div>
      }
    >
      <div
        data-component="first-launch-splash"
        data-drawing={props.drawingPaused ? "pending" : "running"}
        aria-hidden="true"
        class="h-dvh w-screen bg-v2-background-bg-base"
        style={{
          // Match the default session's titlebar and panel insets, so the app underneath does not move when this lifts.
          "padding-block-start": `calc(${titlebarHeight()} + ${props.platform.os === "windows" ? 1 : 8}px)`,
          "padding-block-end": "8px",
          "padding-inline": "32px",
        }}
        onAnimationEnd={(event) => {
          if (event.animationName === "first-launch-logo-in") props.onDrawEnd()
        }}
      >
        {/*
          Centered in the content area rather than parked at a fraction of the window height. The old
          `top-[25.375%]` followed the wordmark line of a 1280x800 window, and the sheet now opens maximized: on a
          tall display that put the mark well above the middle, which reads as a layout bug rather than a design
          choice, and a waiting mark has nothing to align with yet.
        */}
        <div class="flex size-full items-center justify-center">
          <div class="w-full max-w-[720px]" data-slot="first-launch-logo">
            <BrandMark class="mx-auto w-[160px]" />
          </div>
        </div>
      </div>
    </Show>
  )
}
