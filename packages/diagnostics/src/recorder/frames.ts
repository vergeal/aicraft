// Keyframe geometry for the surfaces that are supposed to stay put. A `dom` event proves a node changed;
// only geometry proves the change was visible, so this module samples the `[data-slot]` containers on a
// mutation cooldown, once a second, and once more at export time.

import { round } from "./format"
import { stableSelector } from "./selector"
import type { RecorderContext } from "./types"

export type FrameTrigger = "mutation" | "interval" | "export"

/**
 * Computed properties kept per frame. Anything else would dwarf the events it is supposed to explain; these
 * six decide whether a surface moved, floated, clipped, or painted above the thing next to it.
 */
export const STYLE_KEYS = ["display", "position", "overflow", "transform", "opacity", "z-index"]

export const MAX_KEYFRAMES = 40

const BATCH_COOLDOWN_MS = 100
const SELECTOR_CACHE_LIMIT = MAX_KEYFRAMES * 4

export type StyleReader = { getPropertyValue(name: string): string }

export type Keyframe = {
  selector: string
  rect: { x: number; y: number; w: number; h: number }
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  styles: Record<string, string>
}

export type KeyframeSnapshot = {
  trigger: FrameTrigger
  /** Capture-relative milliseconds, so a section value can be placed on the event timeline. */
  at: number
  /** `[data-slot]` elements that existed, covered or not. */
  total: number
  /** Covered elements that produced no frame: ignored, or without a usable selector. */
  skipped: number
  keyframes: Keyframe[]
}

let mutationAt = Number.NEGATIVE_INFINITY
let selectorCache = new Map<Element, string>()

export function pickStyles(styles: StyleReader): Record<string, string> {
  return Object.fromEntries(STYLE_KEYS.map((key) => [key, styles.getPropertyValue(key)]))
}

/** Samples keyframes and records them as one `frames` event. */
export function captureKeyframes(ctx: RecorderContext, trigger: FrameTrigger): void {
  const snapshot = sampleKeyframes(ctx, trigger)
  if (snapshot) ctx.record("frames", snapshot)
}

/** The export-time sample: the dump already froze its events, so this only feeds the `frames` section. */
export function keyframeForExport(ctx: RecorderContext): KeyframeSnapshot | undefined {
  return sampleKeyframes(ctx, "export")
}

/**
 * Samples after a dom batch that changed structure, at most once per 100ms. Leading-edge on purpose: the
 * mutations are already applied and reading geometry now is what shows the post-change layout.
 */
export function keyframeAfterMutation(ctx: RecorderContext): void {
  const now = ctx.now()
  if (now - mutationAt < BATCH_COOLDOWN_MS) return
  mutationAt = now
  selectorCache.clear()
  captureKeyframes(ctx, "mutation")
}

/**
 * Registers the export-time sample. `dump` reads its sections after it has frozen the event list, so a
 * section provider is the only way to photograph the layout at export. The import stays dynamic because the
 * recorder registry is evaluated before the collector finishes defining `diagnostics`.
 */
export function startKeyframeExport(ctx: RecorderContext): void {
  void import("../collector").then(({ diagnostics }) => {
    diagnostics.section("frames", () => keyframeForExport(ctx))
  })
}

function sampleKeyframes(ctx: RecorderContext, trigger: FrameTrigger): KeyframeSnapshot | undefined {
  if (typeof document === "undefined") return undefined
  const elements = Array.from(document.querySelectorAll("[data-slot]"))
  const covered = Math.min(elements.length, MAX_KEYFRAMES)

  // The gap is counted, never recorded: a container outside the cap must not look unchanged.
  if (elements.length > covered) ctx.observed(elements.length - covered)

  const keyframes: Keyframe[] = []
  let skipped = 0

  for (const element of elements.slice(0, covered)) {
    if (ctx.ignored(element)) {
      skipped++
      continue
    }

    const selector = selectorOf(element)
    if (!selector) {
      skipped++
      continue
    }

    keyframes.push(frameOf(element, selector))
  }

  if (keyframes.length === 0) return undefined
  return { trigger, at: ctx.now(), total: elements.length, skipped, keyframes }
}

/** Selector lookups are the expensive part of a frame; the cache is dropped whenever structure changes. */
function selectorOf(element: Element): string {
  const known = selectorCache.get(element)
  if (known !== undefined) return known

  if (selectorCache.size >= SELECTOR_CACHE_LIMIT) selectorCache.clear()
  const { selector } = stableSelector(element)
  selectorCache.set(element, selector)

  return selector
}

function frameOf(element: Element, selector: string): Keyframe {
  const rect = element.getBoundingClientRect()

  return {
    selector,
    rect: { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) },
    scrollTop: round(element.scrollTop),
    scrollHeight: Math.round(element.scrollHeight),
    clientHeight: Math.round(element.clientHeight),
    styles: pickStyles(getComputedStyle(element)),
  }
}
