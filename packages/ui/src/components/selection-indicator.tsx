import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"
import "./selection-indicator.css"

type Bounds = { x: number; y: number; width: number; height: number }

/** Long enough to cover a pointer crossing a separator, short enough that a real dismissal still reads as immediate. */
const HIDE_DELAY = 160

/**
 * The sliding highlight shared by every list, menu and picker that has a keyboard selection. It is one absolutely
 * positioned layer inside the list, moved with `transform` between the rows that own the selection, so the highlight
 * travels instead of blinking from row to row. See docs/standard/design/13-motion.md.
 *
 * The list must establish a positioning context and its rows must keep their own background transparent; this layer
 * draws the selection for all of them. Rows may scroll inside a separate viewport; the layer re-measures on scroll so
 * it stays under the row it marks.
 */
export function SelectionIndicator(props: {
  /** The element the rows are positioned in. The indicator is placed in its padding box. */
  container: Accessor<HTMLElement | undefined>
  /** Selector for the row that currently has the selection. */
  selector: string
  /** The attribute that row toggles, watched so a keyboard or pointer move repositions the indicator. */
  attribute: string
  class?: string
}) {
  const [bounds, setBounds] = createSignal<Bounds>()
  const [target, setTarget] = createSignal<HTMLElement>()
  const [animated, setAnimated] = createSignal(false)
  let hide: ReturnType<typeof setTimeout> | undefined
  let placed = false

  // Crossing a separator or a section gap drops the highlight for a moment. Hiding at once would make the block blink
  // and animate back in from the corner, so it keeps its last position and only disappears if nothing takes over.
  const scheduleHide = () => {
    clearTimeout(hide)
    hide = setTimeout(() => {
      setBounds(undefined)
      setAnimated(false)
      placed = false
    }, HIDE_DELAY)
  }

  const measure = () => {
    const host = props.container()
    const row = target()

    if (!host || !row || !host.contains(row)) return scheduleHide()

    clearTimeout(hide)
    const rowBox = row.getBoundingClientRect()
    const hostBox = host.getBoundingClientRect()

    // These boxes are measured as rendered, but a popover scaling in transforms the whole subtree while the layer's
    // `translate3d` and size are layout values. Divide the scale out so the block matches the row through the opening
    // animation. The container's own scroll is added back because the layer scrolls with its content.
    const scaleX = host.offsetWidth ? hostBox.width / host.offsetWidth : 1
    const scaleY = host.offsetHeight ? hostBox.height / host.offsetHeight : 1

    setBounds({
      x: (rowBox.left - hostBox.left) / scaleX - host.clientLeft + host.scrollLeft,
      y: (rowBox.top - hostBox.top) / scaleY - host.clientTop + host.scrollTop,
      width: rowBox.width / scaleX,
      height: rowBox.height / scaleY,
    })
  }

  createEffect(() => {
    const host = props.container()

    if (!host) return

    const sync = () => setTarget(host.querySelector<HTMLElement>(props.selector) ?? undefined)
    const mutations = new MutationObserver(sync)
    const resizes = new ResizeObserver(measure)

    sync()
    mutations.observe(host, { attributes: true, subtree: true, attributeFilter: [props.attribute], childList: true })
    resizes.observe(host)
    // Scroll events do not bubble. The list may sit inside a viewport that scrolls instead of the list itself, so watch
    // every scrolling ancestor as well as the list; capture covers a viewport nested inside the list.
    const scrollers = scrollAncestors(host)

    for (const scroller of scrollers) scroller.addEventListener("scroll", measure, true)

    onCleanup(() => {
      mutations.disconnect()
      resizes.disconnect()
      clearTimeout(hide)

      for (const scroller of scrollers) scroller.removeEventListener("scroll", measure, true)
    })
  })

  createEffect(() => {
    const row = target()

    measure()

    if (!row) return
    const resizes = new ResizeObserver(measure)
    resizes.observe(row)
    onCleanup(() => resizes.disconnect())
  })

  // The first position snaps into place with the list; only later moves animate.
  createEffect(() => {
    if (!bounds()) return

    if (!placed) {
      placed = true

      return
    }

    setAnimated(true)
  })

  const style = () => {
    const value = bounds()

    if (!value) return undefined

    return {
      transform: `translate3d(${value.x}px, ${value.y}px, 0)`,
      width: `${value.width}px`,
      height: `${value.height}px`,
    }
  }

  return (
    <div
      aria-hidden="true"
      data-slot="selection-indicator"
      data-visible={bounds() ? "" : undefined}
      data-animated={animated() ? "" : undefined}
      class={props.class}
      style={style()}
    />
  )
}

/** The list itself plus every ancestor that scrolls, so the layer re-measures wherever the rows move. */
function scrollAncestors(host: HTMLElement) {
  const found = [host]

  for (let element = host.parentElement; element; element = element.parentElement) {
    const style = getComputedStyle(element)

    if (style.overflowX === "auto" || style.overflowX === "scroll") found.push(element)
    else if (style.overflowY === "auto" || style.overflowY === "scroll") found.push(element)
  }

  return found
}
