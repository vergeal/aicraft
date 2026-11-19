import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { prefersReducedMotion } from "@opencode/ui/motion"
import { ScrollView } from "@opencode/ui/scroll-view"
import { AnswerPage, type CollapseTiming, type FoldedReplies, type TranscriptView } from "@opencode/session-ui/answer"
import { useLanguage } from "@/runtime/i18n/language"
import { revealInTimeline } from "./answer-reveal"
import { readPosition, writePosition, type SavedPosition } from "./position"

const BOTTOM_THRESHOLD = 24

const SAVE_DELAY = 200

// A fresh page estimates the height of rows it has not measured yet, so the height keeps moving for
// the first frames. This is how long it must hold still before the first landing on the end.
const SETTLE_DELAY = 120

// Never wait longer than this for the measurements to settle, so a streaming session still follows.
const SETTLE_TIMEOUT = 1000

/** The conversation column: the session header, the answer area, and the composer's bottom lane. */
export function AnswerTimeline(props: {
  header: JSX.Element
  showHeader: boolean
  activity: JSX.Element
  messages: () => readonly SessionMessageInfo[]
  view?: TranscriptView
  collapseTiming?: CollapseTiming
  foldedReplies?: FoldedReplies
  bottomInset: number
  /** Every row must stay mounted while the reader searches the transcript. */
  searching?: () => boolean
  /** Session identity for the remembered reading position. */
  positionKey?: () => string
  /** The page is about to restore a mid-transcript position, so the host must not scroll to the end. */
  onRestore?: () => void
  /** The remembered row is not loaded, so the host must resume following the newest content instead. */
  onRestoreMiss?: () => void
  setScrollRef: (element: HTMLDivElement | undefined) => void
  setVisibleRef?: (element: HTMLDivElement | undefined) => void
  onScheduleScrollState: (element: HTMLDivElement) => void
  onUserScroll: (target?: EventTarget | null) => void
  onHistoryScroll: () => void
  onContentResize: () => void
  setRevealMessage?: (reveal: (id: string, partID?: string) => void) => void
  setRevealPart?: (reveal: (target: string) => boolean) => void
  setScrollToEnd?: (scroll: (behavior?: ScrollBehavior) => void) => void
  setPage?: (scroll: (direction: 1 | -1) => void) => void
}) {
  const language = useLanguage()
  const [visible, setVisible] = createSignal<HTMLDivElement>()
  const [viewportElement, setViewportElement] = createSignal<HTMLDivElement>()
  const [atBottom, setAtBottom] = createSignal(true)
  // An off-window reveal unmounts the page's rows, so it mounts everything for the frames the reveal needs.
  const [revealAll, setRevealAll] = createSignal(false)
  let viewport: HTMLDivElement | undefined
  // Where the reader stopped last time. A fresh session opens at its newest message instead.
  const restore = readPosition(props.positionKey?.())
  // A reader who left at the end comes back at the end, not at the row that happened to be on top.
  let stick = restore === undefined || restore.bottom
  // Whether this open ends at the newest message. `stick` alone cannot decide it: on a fresh page the
  // rows have not filled the viewport yet, so the reader is not near the bottom until they land there.
  // A reader who leaves the end clears it, so following their own scroll never pulls them back.
  let landAtEnd = !restore || restore.bottom
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let lastPosition: SavedPosition | undefined
  // A restore that could not find its row leaves the view at the newest content, not where the reader stopped. Hold the
  // saved record until the reader actually moves, or a failed restore would erase the position worth paging back to.
  let holdPosition = false

  const flushPosition = () => {
    if (!lastPosition) return
    writePosition(props.positionKey?.(), lastPosition)
  }

  const rememberPosition = (position: { key: string; offset: number }) => {
    if (holdPosition) return
    lastPosition = { ...position, bottom: stick }

    if (saveTimer !== undefined) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      flushPosition()
    }, SAVE_DELAY)
  }

  const virtualize = () => !!viewport && !props.searching?.() && !revealAll()

  const reveal = (id: string, partID?: string) => {
    if (!viewport) return false
    if (!virtualize()) return revealInTimeline(viewport, id, partID)

    // Solid commits the full page synchronously; two frames let the rows and their Markdown lay out.
    setRevealAll(true)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!viewport) {
          setRevealAll(false)
          return
        }

        const done = () => requestAnimationFrame(() => setRevealAll(false))

        // A row that never appears must not leave the page stuck on a full mount.
        if (!revealInTimeline(viewport, id, partID, done)) setRevealAll(false)
      }),
    )

    return true
  }

  const revealTarget = (target: string) => {
    if (!viewport) return false
    if (!virtualize()) return revealInTimeline(viewport, target)

    setRevealAll(true)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!viewport) {
          setRevealAll(false)
          return
        }

        const done = () => requestAnimationFrame(() => setRevealAll(false))

        if (!revealInTimeline(viewport, target, undefined, done)) setRevealAll(false)
      }),
    )

    return true
  }

  const setFollowing = (next: boolean) => {
    if (stick === next) return

    // The reader moved away from the newest content on their own, so their position is worth recording again.
    if (!next) holdPosition = false
    stick = next
    setAtBottom(next)

    // Persist the change now: the page may not report a new anchor while the content is still moving,
    // and a reader who left at the end must come back at the end.
    if (lastPosition) {
      lastPosition = { ...lastPosition, bottom: next }
      flushPosition()
    }
  }

  const measureBottom = () => {
    if (!viewport) return

    // Only a reader resting at the very end keeps following. A looser threshold would pull back a
    // reader who scrolled up but stayed within the composer inset, which reads as the content jumping.
    setFollowing(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BOTTOM_THRESHOLD)

    // A reader who leaves the end is no longer waiting to land on it, and must not be pulled back
    // when a row they open changes the content height.
    if (!stick) {
      landAtEnd = false
      cancelSettle()
    }
  }

  const jumpToLatest = () => {
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" })
  }

  // A scroll gesture ends following immediately, before the next content growth can pull the reader
  // back; the scroll handler re-pins once the reader comes back to the end.
  const releaseFollow = () => {
    setFollowing(false)
  }

  // A press pauses following without changing the button state: the rows must hold still between
  // pointerdown and pointerup, or the click lands on whatever moved under the pointer instead.
  // The release restores what the press paused, unless the pointer actually scrolled upward.
  let pressed: { top: number; following: boolean } | undefined
  const pauseFollow = () => {
    if (!viewport) return
    pressed = { top: viewport.scrollTop, following: stick }
    stick = false
  }

  const resumeFollow = () => {
    const before = pressed
    pressed = undefined

    if (!before || !viewport) return
    // An upward move under the pointer is the reader's own; keep it detached.
    if (viewport.scrollTop < before.top - 1 || !before.following) return measureBottom()

    viewport.scrollTop = viewport.scrollHeight
    measureBottom()  }

  let follow: ResizeObserver | undefined
  // Content height at the last follow. A renderer that collapses and re-expands a block within one
  // frame would otherwise drag the viewport up and straight back down.
  let lastContentHeight = 0
  // Scroll offset at the last scroll event, so a follow scroll is told from the reader's own move.
  let lastScrollTop = 0
  // The page has landed on the end once its windowed measurements stopped moving. Until then the
  // growing height is an estimate, and chasing it would slide the transcript down the screen.
  let positioned = false
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let settleDeadline = 0

  const cancelSettle = () => {
    if (settleTimer !== undefined) clearTimeout(settleTimer)
    settleTimer = undefined
  }

  const landOnEnd = () => {
    cancelSettle()
    if (!viewport || !(landAtEnd || stick)) return

    positioned = true
    viewport.scrollTop = viewport.scrollHeight
    measureBottom()
  }

  // The remembered row is not loaded, so there is nothing to restore. Land on the newest content instead of leaving the
  // view at the windowed list's start offset, which reads as a jump to the top of the transcript.
  const restoreMissed = () => {
    landAtEnd = true
    holdPosition = true
    landOnEnd()
    props.onRestoreMiss?.()
  }

  onMount(() => {
    // The reader stopped mid-transcript last time, so a host that follows the newest message must let go
    // before it scrolls the restored view to the end.
    if (restore && !restore.bottom) props.onRestore?.()

    props.setRevealMessage?.(reveal)
    props.setRevealPart?.(revealTarget)
    props.setScrollToEnd?.((behavior) => {
      viewport?.scrollTo({ top: viewport.scrollHeight, behavior })
    })
    props.setPage?.((direction) => viewport?.scrollBy({ top: direction * viewport.clientHeight * 0.9 }))

    // The ScrollView hands over its viewport after this component mounts, so observe from the next
    // frame, once the rows are laid out.
    requestAnimationFrame(() => {
      if (!viewport) return

      settleDeadline = performance.now() + SETTLE_TIMEOUT

      lastContentHeight = viewport.scrollHeight
      lastScrollTop = viewport.scrollTop
      measureBottom()

      // No remembered position, or the reader left at the end: land on the newest message, but only
      // once the windowed measurements stop moving. Until then the height is an estimate.
      if (landAtEnd && !positioned) settleTimer = setTimeout(landOnEnd, SETTLE_DELAY)

      // The page restores a remembered row on its own frame; re-read the bottom once it has.
      requestAnimationFrame(() => {
        if (!viewport) return
        lastContentHeight = viewport.scrollHeight
        lastScrollTop = viewport.scrollTop
        measureBottom()
      })

      // Streamed text and disclosures grow the rows without changing the message list identity, so
      // follow the observed layout instead of the list: every child that grows pulls the viewport back
      // to the end while the reader is still pinned there. Nothing else measures the bottom while
      // content grows, because that would clear `stick` before the follow-up scroll runs.
      follow = new ResizeObserver(() => {
        if (!viewport || !(landAtEnd || stick)) return

        const height = viewport.scrollHeight
        const delta = height - lastContentHeight
        lastContentHeight = height

        if (!positioned) {
          // The windowed page is still measuring the rows above the fold, so its height grows every
          // frame. Scroll once the measurements stop moving, not after each one.
          if (settleTimer !== undefined) clearTimeout(settleTimer)
          settleTimer = setTimeout(landOnEnd, SETTLE_DELAY)

          if (performance.now() < settleDeadline) return

          // A session that is streaming never holds still; stop waiting and follow it live.
          landOnEnd()
          return
        }

        // Growth always keeps the end visible. A large shrink, such as a thinking block collapsing
        // when it finishes, must follow too or the reader is left above the fold looking at content
        // that just disappeared. Small back-and-forth changes are renderer noise: following those
        // would drag the viewport up and down every frame.
        if (delta <= 0 && delta > -200) return

        viewport.scrollTop = height
        measureBottom()
      })

      for (const child of Array.from(viewport.children)) follow.observe(child)
    })
  })

  onCleanup(() => follow?.disconnect())
  onCleanup(() => cancelSettle())

  onCleanup(() => {
    if (saveTimer !== undefined) clearTimeout(saveTimer)
    flushPosition()
  })

  onCleanup(() => {
    props.setScrollRef(undefined)
    props.setRevealMessage?.(() => {})
    props.setRevealPart?.(() => false)
  })

  return (
    <div class="relative h-full w-full min-w-0">
      <ScrollView
        data-slot="session-timeline-scroll"
        viewportRef={(element) => {
          viewport = element
          setViewportElement(element)
          props.setScrollRef(element)
        }}
        thumbContainer={visible()}
        onScroll={(event) => {
          props.onUserScroll(event.target)

          if (!viewport) return
          const top = viewport.scrollTop
          // A follow scroll moves down, and by the time its event arrives the content has already
          // grown past what was followed. Measuring that would read the gap as the reader leaving
          // and clear `stick`, stopping the follow after a couple of chunks. Only an upward move, or
          // a reader who is already detached, re-measures.
          if (!stick || top < lastScrollTop - 1) measureBottom()
          lastScrollTop = top
          props.onScheduleScrollState(viewport)
          props.onContentResize()
          props.onHistoryScroll()
        }}
        // Only an upward wheel gesture leaves the end. A downward one may already rest at the end,
        // where the browser sends no further scroll event, so measure here or the jump button never
        // clears. A touch drag has no direction of its own: release, then measure, which restores
        // following unless the drag actually scrolled upward.
        onWheel={(event) => {
          if (event.deltaY < 0) return releaseFollow()
          // A downward wheel while following must not re-measure: the growth it has not followed
          // yet would read as distance from the end and stop the follow.
          if (!stick) measureBottom()
        }}
        onTouchMove={releaseFollow}
        onPointerDown={pauseFollow}
        onPointerUp={() => requestAnimationFrame(resumeFollow)}
        class="relative h-full w-full min-w-0"
        style={{ "--sticky-accordion-top": props.showHeader ? "var(--session-header-height, 48px)" : "0px" }}
      >
        <Show when={props.showHeader} fallback={<div aria-hidden="true" class="h-4 md:hidden" />}>
          {props.header}
        </Show>
        <AnswerPage
          messages={props.messages}
          view={props.view}
          collapseTiming={props.collapseTiming}
          foldedReplies={props.foldedReplies}
          viewport={viewportElement}
          searching={props.searching}
          revealAll={revealAll}
          following={() => stick}
          restore={restore?.bottom ? undefined : restore}
          onRestoreMiss={restoreMissed}
          onPositionChange={rememberPosition}
        />
        <div data-timeline-row="bottom-spacer" class="w-full">
          {props.activity}
        </div>
        <div aria-hidden="true" data-timeline-inset class="shrink-0" style={{ height: `${props.bottomInset}px` }} />
      </ScrollView>
      <div
        ref={(element) => {
          setVisible(element)
          props.setVisibleRef?.(element)
        }}
        data-slot="session-timeline-visible"
        class="pointer-events-none absolute inset-x-0 top-0"
        style={{ bottom: `${props.bottomInset}px` }}
      />
      <Show when={!atBottom()}>
        <button
          type="button"
          data-slot="answer-to-bottom"
          aria-label={language.t("session.messages.jumpToLatest")}
          class="absolute left-1/2 z-[8] flex size-7 -translate-x-1/2 items-center justify-center rounded-full transition-opacity hover:opacity-90 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
          style={{
            bottom: `${props.bottomInset + 16}px`,
            "background-color": "#000",
            color: "#fff",
            "box-shadow": "var(--v2-elevation-raised)",
          }}
          onClick={jumpToLatest}
        >
          <Icon aria-hidden="true" name="arrow-down" size="small" />
        </button>
      </Show>
    </div>
  )
}
