// Layout shifts (which feed the `cls` metric) and the geometry of the surfaces that are supposed to stay put.
// Reading rects once a second costs one style/layout pass and is what surfaces "the layout moved on its own"
// without a ResizeObserver on every node.

import { round } from "./format"
import { captureKeyframes, startKeyframeExport, type StyleReader } from "./frames"
import { observe } from "./observer"
import { isElement, stableSelector } from "./selector"
import type { Recorder } from "./types"

type LayoutShiftEntry = PerformanceEntry & {
  value: number
  hadRecentInput: boolean
  sources?: Array<{ node?: Node | null }>
}

type Rect = { x: number; y: number; w: number; h: number }
type RectSample = { rect: Rect; scrollTop: number }

const SAMPLE_INTERVAL_MS = 1000
const MAX_RECTS = 80
const MAX_RECT_CHANGES = 40
const MAX_SHIFT_SOURCES = 6
const DRIFT_TOLERANCE = 1
const SHIFT_PRECISION = 10_000

export const layoutRecorder: Recorder = {
  name: "layout",
  start(ctx) {
    let cls = 0

    observe<LayoutShiftEntry>("layout-shift", { type: "layout-shift", buffered: false }, (entries) => {
      ctx.observed(entries.length)
      for (const entry of entries) {
        if (entry.hadRecentInput) continue
        cls += entry.value
        ctx.metrics.update({ cls: round(cls) })
        const sources = (entry.sources ?? []).slice(0, MAX_SHIFT_SOURCES)
        ctx.record("layout.shift", {
          value: Math.round(entry.value * SHIFT_PRECISION) / SHIFT_PRECISION,
          sources: sources.map((source) => ctx.pathOf(source.node ?? null)),
          sourceSelectors: sources.map((source) => shiftSourceOf(source.node ?? null)),
        })
      }
    })

    startKeyframeExport(ctx)

    let rects = new Map<string, RectSample>()

    setInterval(() => {
      captureKeyframes(ctx, "interval")

      const next = new Map<string, RectSample>()
      const changes: unknown[] = []
      const elements = Array.from(document.querySelectorAll("[data-slot],[data-ui],[data-component]")).slice(
        0,
        MAX_RECTS,
      )
      ctx.observed(elements.length)

      for (let index = 0; index < elements.length; index++) {
        const element = elements[index]
        if (ctx.ignored(element)) continue
        // A box that is animating a transform has a bounding rect that changes every frame while its layout
        // never moves: the spinner ring turns this way, and a 14px square measures up to 20px at 45°. Sampling it
        // reports drift the reader cannot see.
        if (
          element.getAnimations().some((animation) => animation.playState === "running") &&
          animatesTransform(getComputedStyle(element))
        )
          continue
        const key = `${ctx.pathOf(element)}#${index}`
        const rect = element.getBoundingClientRect()
        const sample = {
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
          scrollTop: round(element.scrollTop),
        }
        next.set(key, sample)
        const previous = rects.get(key)
        if (!previous) continue

        const moved = !sameRect(previous.rect, sample.rect)
        const scrolled = Math.abs(previous.scrollTop - sample.scrollTop) > DRIFT_TOLERANCE
        if (!moved && !scrolled) continue

        changes.push({
          target: key,
          from: previous.rect,
          to: sample.rect,
          // Content moving under a scroll container and the container itself moving are different bugs; a
          // stacking context tells whether the surface paints above its siblings.
          stacking: createsStackingContext(getComputedStyle(element)),
          ...(scrolled ? { scroll: { from: previous.scrollTop, to: sample.scrollTop } } : {}),
        })
      }

      rects = next
      if (changes.length > 0) ctx.record("layout.rect", { changes: changes.slice(0, MAX_RECT_CHANGES) })
    }, SAMPLE_INTERVAL_MS)
  },
}

/** Whether this computed style makes the element a stacking context, i.e. it paints above siblings. */
export function createsStackingContext(styles: StyleReader): boolean {
  const value = (name: string) => styles.getPropertyValue(name)
  const willChange = value("will-change")

  return (
    value("transform") !== "none" ||
    value("filter") !== "none" ||
    Number(value("opacity") || "1") < 1 ||
    (willChange !== "" && willChange !== "auto")
  )
}

/** Whether the element's own transform can move its bounding rect without moving its layout. */
export function animatesTransform(styles: StyleReader): boolean {
  return styles.getPropertyValue("rotate") !== "none" || styles.getPropertyValue("transform") !== "none"
}

/** The shift's source node, resolved to something a dump reader can re-find in the snapshot. */
function shiftSourceOf(node: Node | null) {
  const element = node && isElement(node) ? node : (node?.parentElement ?? null)
  if (!element) return null

  const { selector, stable } = stableSelector(element)

  return { selector, stable, overflowAnchor: getComputedStyle(element).getPropertyValue("overflow-anchor") }
}

function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= DRIFT_TOLERANCE &&
    Math.abs(a.y - b.y) <= DRIFT_TOLERANCE &&
    Math.abs(a.w - b.w) <= DRIFT_TOLERANCE &&
    Math.abs(a.h - b.h) <= DRIFT_TOLERANCE
  )
}
