import { createMemo, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { createSizing } from "./helpers"
import type { SessionModel } from "./model"
import type { RegionEntry } from "@/runtime/plugin/panels"
import { panelKey } from "@/runtime/plugin/panel-keys"
import {
  clampSessionPanelWidth,
  SIDE_PANE_WIDTH_MIN,
  sessionPanelWidthCss,
  sessionPanelWidthMax,
  sidePanelWidthCss,
} from "./session-panel-width"

/** Side region widths of panels that size themselves, by `${plugin}:${panel id}`. */
export type PanelWidths = { get(panel: string): number | undefined; set(panel: string, width: number): void }

/**
 * wide asks for the wider session minimum. panel is the tab the side pane shows: while its panel has a width of its
 * own (stored in widths, else `Panel.width`), that width sizes the side region and a drag stores it there.
 */
export function createSessionScreenLayout(
  session: SessionModel,
  input: { wide: Accessor<boolean>; panel: Accessor<RegionEntry | undefined>; widths: PanelWidths },
) {
  const size = createSizing()
  const view = session.layout.view
  const tabsOpen = createMemo(() => session.isDesktop() && view().side.opened() && !!session.identity.params.id)

  const sized = createMemo(() => {
    const entry = input.panel()

    if (!entry) return
    const key = panelKey(entry.plugin, entry.provider.id)

    const width =
      input.widths.get(key) ?? (entry.provider.width === "narrow" ? SIDE_PANE_WIDTH_MIN : entry.provider.width)

    if (width === undefined) return

    return { width, resize: (next: number) => input.widths.set(key, next) }
  })

  const [rowSize, setRowSize] = createStore<{ width?: number; gap?: number }>({})
  let row: HTMLDivElement | undefined
  createResizeObserver(
    () => row,
    ({ width }) => {
      // The row's real gap, not a constant. The shell folds the side panel against the conversation and clears the
      // row's gap, so assuming 8px left the panel's contents 8px narrower than the box a panel flight measured, and
      // the panel's head shifted when the flight landed.
      setRowSize({ width, gap: row ? Number.parseFloat(getComputedStyle(row).columnGap) || 0 : 0 })
    },
  )

  const gap = () => rowSize.gap ?? 0

  const available = createMemo<number | undefined>(() => {
    const width = rowSize.width

    if (width === undefined) return undefined

    return width - gap()
  })

  const splitSide = createMemo(() => tabsOpen() && input.wide())

  const resizedWidth = createMemo(() => {
    const current = sized()
    const width = available()

    if (current && width !== undefined)
      return clampSessionPanelWidth({
        width: width - Math.max(SIDE_PANE_WIDTH_MIN, current.width),
        available: width,
        split: splitSide(),
        resized: true,
      })

    return clampSessionPanelWidth({
      width: view().session.width(),
      available: width,
      split: splitSide(),
      resized: view().session.resized(),
    })
  })

  const panelWidth = createMemo(() => {
    if (!tabsOpen()) return "100%"
    const current = sized()

    if (current) return sidePanelWidthCss(current.width, gap())

    return sessionPanelWidthCss({
      width: view().session.width(),
      split: splitSide(),
      resized: view().session.resized(),
      gap: gap(),
    })
  })

  const panelMax = createMemo(() => {
    const width = available()

    if (width === undefined) return 1000

    return sessionPanelWidthMax({ available: width, split: splitSide(), resized: true })
  })

  // The side panel's open width, kept through a close as the far end of its travel.
  const sideWidth = createMemo<number | undefined>((previous) => {
    const width = available()

    if (tabsOpen() && width !== undefined) return Math.max(0, width - resizedWidth())

    return previous
  })

  return {
    centered: createMemo(() => session.isDesktop()),
    panel: {
      max: panelMax,
      ref: (element: HTMLDivElement) => {
        row = element
      },
      resizable: tabsOpen,
      resizedWidth,
      width: panelWidth,
      /** A drag to this chat panel width: the shown panel keeps the side width it leaves, else the conversation does. */
      resize(width: number) {
        const current = sized()
        const space = available()

        if (current && space !== undefined) return current.resize(space - width)
        view().session.resize(width)
      },
    },
    side: {
      width: sideWidth,
      open: tabsOpen,
      tabs: { open: tabsOpen },
    },
    size,
  }
}

export type SessionScreenLayout = ReturnType<typeof createSessionScreenLayout>
