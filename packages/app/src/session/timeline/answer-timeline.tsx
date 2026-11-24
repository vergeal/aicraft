import { Show, createRenderEffect, createSignal, on, onCleanup, onMount, type JSX } from "solid-js"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { ScrollView } from "@opencode/ui/scroll-view"
import { AnswerPage, type CollapseTiming, type FoldedReplies, type TranscriptView } from "@opencode/session-ui/answer"
import type { SessionUserActions } from "@opencode/session-ui/actions"
import { useLanguage } from "@/runtime/i18n/language"
import { usePluginHost } from "@/runtime/plugin/host"
import { usePluginAttachment } from "@/runtime/plugin/host-apis"
import { revealInTimeline } from "./answer-reveal"
import type { TimelineFollow } from "./follow"
import { END_EPSILON, MIN_OVERFLOW, ZOOM_SLACK, needsEndProbe } from "./machine"
import { readPosition, writePosition, type SavedPosition } from "./position"

const SAVE_DELAY = 200

// A scroll has come to rest once no new offset arrives for this long. The follow machine only probes a zoomed end
// from a settled scroll, so this is the timer that lets a detached view resume following by reaching the end.
const SCROLL_SETTLE_DELAY = 120

/** The conversation column: the session header, the answer area, and the composer's bottom lane. */
export function AnswerTimeline(props: {
  header: JSX.Element
  showHeader: boolean
  activity: JSX.Element
  messages: () => readonly SessionMessageInfo[]
  /** The session these messages belong to, so a message action addresses the right session. */
  sessionID?: () => string | undefined
  actions?: SessionUserActions
  view?: TranscriptView
  collapseTiming?: CollapseTiming
  foldedReplies?: FoldedReplies
  bottomInset: number
  /** Session identity for the remembered reading position. */
  positionKey?: () => string
  /**
   * The view is the routed session. A cached view keeps its scope but loses its DOM node on a session switch, so every
   * activation re-reads the remembered position and re-arms the landing instead of trusting first-mount state.
   */
  active?: () => boolean
  /** The single source of truth for "follow the newest content". */
  follow: TimelineFollow
  /** The page is about to restore a mid-transcript position, so the host must not scroll to the end. */
  onRestore?: () => void
  /** The remembered row is not loaded, so the host must resume following the newest content instead. */
  onRestoreMiss?: () => void
  setScrollRef: (element: HTMLDivElement | undefined) => void
  setVisibleRef?: (element: HTMLDivElement | undefined) => void
  onUserScroll: (target?: EventTarget | null) => void
  onHistoryScroll: () => void
  onContentResize: () => void
  setRevealMessage?: (reveal: (id: string, partID?: string) => void) => void
  setRevealPart?: (reveal: (target: string) => boolean) => void
  setScrollToEnd?: (scroll: (behavior?: ScrollBehavior) => void) => void
  setPage?: (scroll: (direction: 1 | -1) => void) => void
}) {
  const language = useLanguage()
  const links = usePluginHost().links
  const attachment = usePluginAttachment()
  const [visible, setVisible] = createSignal<HTMLDivElement>()
  const [viewportElement, setViewportElement] = createSignal<HTMLDivElement>()
  let viewport: HTMLDivElement | undefined
  // Where the reader stopped last time. Re-read on each activation: the cached view outlives its DOM node, so a value
  // captured at first mount would describe a session the reader has long since left.
  const savedPosition = () => readPosition(props.positionKey?.())
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let lastPosition: SavedPosition | undefined
  // A restore that could not find its row leaves the view at the newest content, not where the reader stopped. Hold the
  // saved record until the reader's own gesture moves, or a failed restore would erase the anchor worth paging back to.
  let holdPosition = false
  // A landing owes exactly one write. The intent itself lives in the follow machine's `landing` state; this timer only
  // expires it, so a scrollbar drag (which never reaches the viewport's pointer handlers) is not pulled back forever.
  const LAND_WINDOW = 3000
  let landingTimer: ReturnType<typeof setTimeout> | undefined
  // The bottom edge only needs to be read when the machine asks for it; the offsets are tracked here so the scroll
  // event passes the geometry it already read and the machine never forces a layout of its own.
  let lastScrollTop = 0
  let lastMaxScroll = 0
  let lastContentHeight = 0
  let scrollSettleTimer: ReturnType<typeof setTimeout> | undefined
  // The page's own reveal, which can mount a row outside the window before scrolling to it.
  let pageReveal: ((id: string, partID?: string) => boolean) | undefined
  let contentObserver: ResizeObserver | undefined

  const following = () => props.follow.following()

  // A following view writes `scrollTop` itself on every growth. The browser's own scroll anchoring would add a second
  // correction to the same container, and the two together move the rows the reader is watching (a 0.28 layout shift in
  // the captured session). A detached reader keeps the browser's anchoring: nothing writes their offset then.
  const applyAnchoring = () => {
    if (viewport) viewport.style.overflowAnchor = following() ? "none" : "auto"
  }

  // Where the reader left the transcript is a fact about the viewport, not the follow intent. The machine can still
  // read `following` after an upward wheel (a downward one never detaches), so `bottom` taken from it is true for a
  // reader who sits mid-transcript. Saving that true makes the next activation skip the restore and land on the end.
  const atEnd = () => {
    if (!viewport) return false
    // A session that has not loaded its rows yet has scrollHeight === clientHeight, where "at the end" is trivially
    // true. Recording that would mark a reader who never moved as having left at the bottom, and the next activation
    // would skip the restore and land on the end.
    if (viewport.scrollHeight <= viewport.clientHeight + END_EPSILON) return false

    return viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - END_EPSILON
  }

  const flushPosition = () => {
    if (!lastPosition) return
    writePosition(props.positionKey?.(), lastPosition)
  }

  const rememberPosition = (position: { key: string; offset: number }) => {
    if (holdPosition) return
    lastPosition = { ...position, bottom: atEnd() }

    if (saveTimer !== undefined) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      flushPosition()
    }, SAVE_DELAY)
  }

  // Every loaded row is in the document, so a reveal scrolls straight to its target.
  const reveal = (id: string, partID?: string) => {
    if (!viewport) return false

    // The page knows which entry owns a row and can mount it; the DOM search only reaches rows already in the document.
    if (pageReveal?.(id, partID)) return true

    return revealInTimeline(viewport, id, partID)
  }

  const revealTarget = (target: string) => {
    if (!viewport) return false

    if (pageReveal?.(target)) return true

    return revealInTimeline(viewport, target)
  }

  // The end is one value and one write: every path that goes there uses this, so no two callers can disagree about what
  // "the end" is. A smooth scroll would aim at the height it started from, and a growing reply outruns it.
  const stickToEnd = () => {
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }

  // A landing write reports back so the machine can stop owing it, and clears the deadline that would otherwise expire
  // an already-satisfied intent three seconds later.
  const settleLanding = () => {
    props.follow.dispatch({ type: "landed" })
    if (landingTimer !== undefined) clearTimeout(landingTimer)
    landingTimer = undefined
  }

  // Content grew, or the view activated, and the newest content must stay in view. Every loaded row is a real box, so
  // the write happens in the frame that observed the new height: the write is one assignment, and the landing reports
  // back once it lands. A reader who left the end is never pulled back.
  const landOnEnd = () => {
    if (!viewport || !following()) return

    stickToEnd()
    settleLanding()
  }

  const jumpToLatest = () => {
    props.follow.dispatch({ type: "follow" })
    stickToEnd()
  }

  // This activation owes the view a landing. The intent lives in the follow machine's `landing` state, so the clamp a
  // reinsert produces cannot be mistaken for the reader leaving the end. The timer only expires the intent, which keeps
  // a scrollbar drag (which never reaches the viewport's pointer handlers) from being pulled back forever.
  const startLanding = () => {
    if (landingTimer !== undefined) clearTimeout(landingTimer)
    props.follow.dispatch({ type: "landing.start", deadline: performance.now() + LAND_WINDOW })
    landingTimer = setTimeout(() => {
      landingTimer = undefined
      props.follow.dispatch({ type: "landing.expire", now: performance.now() })
    }, LAND_WINDOW)
    landOnEnd()
  }

  const scheduleSettled = () => {
    if (scrollSettleTimer !== undefined) clearTimeout(scrollSettleTimer)
    scrollSettleTimer = setTimeout(() => {
      scrollSettleTimer = undefined
      if (!viewport) return

      // Under page zoom the furthest offset Chrome reaches can sit a few pixels short of the visual end, so the probe
      // the machine asks for is the only one allowed to accept that slack. A plain rest still needs the tight epsilon.
      const slack = needsEndProbe(props.follow.peek()) ? ZOOM_SLACK : END_EPSILON

      props.follow.dispatch({
        type: "scroll.settled",
        atReachableEnd: viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= slack,
      })
    }, SCROLL_SETTLE_DELAY)
  }

  // The remembered row is in an older page that is not loaded yet, so there is nothing to measure here. Landing on
  // the end throws the reader across the transcript (18k-22k px in the capture) and away from where they stopped, so
  // hold the current position instead and let a later page-in land the restore once the row appears.
  const restoreMissed = () => {
    holdPosition = true
    props.follow.dispatch({ type: "follow" })
    // Settle at the newest content. A view left at its clamped offset reads as a jump to the first message, so the
    // miss ends with the end in view while the saved record stays held for a later page-in.
    stickToEnd()
    props.onRestoreMiss?.()
  }

  // A session switch moves this cached view out of the document and back. Re-arm the landing here: the rows measure
  // again on the next activation, so the view must not keep the settled state it reached before leaving.
  createRenderEffect(
    on(
      () => props.active?.() !== false,
      (isActive) => {
        if (!isActive) return

        // Same timing as the page's restore: decide the landing after the DOM insert, before the reinsertion's scroll
        // event reaches the machine.
        queueMicrotask(() => {
          const saved = savedPosition()
          if (viewport) lastContentHeight = viewport.scrollHeight

          if (!saved || saved.bottom) {
            startLanding()

            return
          }

          // A remembered mid-transcript row is the reader's own intent: the host releases follow and restores it, so
          // this activation does not owe a landing.
          props.follow.dispatch({ type: "landing.cancel" })
          props.onRestore?.()
        })
      },
      { defer: false },
    ),
  )

  onMount(() => {
    props.setRevealMessage?.(reveal)
    props.setRevealPart?.(revealTarget)
    props.setScrollToEnd?.((_behavior) => {
      props.follow.dispatch({ type: "follow" })
      stickToEnd()
    })
    props.setPage?.((direction) => {
      if (!viewport) return
      // A page key is the reader's own move: it ends any landing the activation still owed and detaches before the
      // scroll lands.
      props.follow.dispatch({ type: "landing.cancel" })
      props.follow.dispatch({
        type: "scroll.intent",
        upward: direction < 0,
        overflow: viewport.scrollHeight - viewport.clientHeight > MIN_OVERFLOW,
      })
      viewport.scrollBy({ top: direction * viewport.clientHeight * 0.9 })
    })

    // The ScrollView hands over its viewport after this component mounts, so observe from the next
    // frame, once the rows are laid out.
    requestAnimationFrame(() => {
      if (!viewport) return

      lastContentHeight = viewport.scrollHeight
      lastScrollTop = viewport.scrollTop
      lastMaxScroll = viewport.scrollHeight - viewport.clientHeight

      // No remembered position, or the reader left at the end: land on the newest message at once.
      if (following()) landOnEnd()

      // Streamed text and disclosures grow the rows without changing the message list identity, so follow the observed
      // layout instead of the list. A following view (including one still landing) absorbs every growth; a reader who
      // left the end keeps their position while rows above them change height.
      contentObserver = new ResizeObserver(() => {
        if (!viewport) return

        const state = props.follow.peek()
        if (state.type === "anchored") return
        // A press pauses the landing: the rows must hold still between pointerdown and pointerup, or the click lands on
        // whatever moved under the pointer instead.
        if (state.type !== "landing" && state.gesture === "pointer") return

        const height = viewport.scrollHeight
        const delta = height - lastContentHeight
        lastContentHeight = height

        // Small back-and-forth changes are renderer noise: following those would drag the viewport up and down every
        // frame. A large shrink, such as a thinking block collapsing when it finishes, still follows, or the reader is
        // left above the fold looking at content that just disappeared.
        if (delta <= 0 && delta > -200) return

        // Only a following view absorbs growth. An older page paged in above a detached reader grows the height while
        // the reader keeps their own offset, so pinning to the end here would drag them down for every page that lands
        // and hide the position they scrolled to. Reaching the end again re-follows through the scroll event.
        if (following()) {
          stickToEnd()
          // A landing settles on its first write, whether that write came from the activation frame or from here.
          if (props.follow.peek().type === "landing") settleLanding()
        }
      })

      for (const child of Array.from(viewport.children)) contentObserver.observe(child)
    })
  })

  // The anchoring follows the follow intent: a landing, a fresh activation and a streamed growth all write the offset,
  // so all of them run with the browser's anchoring off.
  createRenderEffect(() => {
    following()
    applyAnchoring()
  })

  // The transcript's bottom fade ends where the composer region begins, so it fades out under the composer instead of
  // being cut off by its opaque card. The length lives on the viewport itself: neither the property nor the mask
  // inherits, and the mask's rule reads it there.
  createRenderEffect(() => {
    const inset = props.bottomInset

    if (!viewport) return

    viewport.style.setProperty("--session-timeline-inset", `${inset}px`)
  })

  onCleanup(() => contentObserver?.disconnect())
  onCleanup(() => {
    if (scrollSettleTimer !== undefined) clearTimeout(scrollSettleTimer)
    if (landingTimer !== undefined) clearTimeout(landingTimer)
  })

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
          element.style.setProperty("--session-timeline-inset", `${props.bottomInset}px`)
          setViewportElement(element)
          props.setScrollRef(element)
          applyAnchoring()
        }}
        thumbContainer={visible()}
        onScroll={(event) => {
          props.onUserScroll(event.target)

          if (!viewport) return
          const top = viewport.scrollTop
          const max = viewport.scrollHeight - viewport.clientHeight
          // The machine gets the geometry this event already read, plus the previous range so it can tell a growing
          // content from the reader moving. It is the only place that decides whether the view still follows.
          props.follow.dispatch({
            type: "scroll",
            scrollTop: top,
            previousTop: lastScrollTop,
            maxScroll: max,
            previousMaxScroll: lastMaxScroll,
          })
          lastScrollTop = top
          lastMaxScroll = max

          scheduleSettled()
          props.onContentResize()
          props.onHistoryScroll()
        }}
        // Only an upward wheel gesture leaves the end. A downward one keeps whatever the machine already decided,
        // and the scroll event re-pins once the reader reaches the end again.
        onWheel={(event) => {
          if (!viewport) return
          holdPosition = false
          props.follow.dispatch({
            type: "scroll.intent",
            upward: event.deltaY < 0,
            overflow: viewport.scrollHeight - viewport.clientHeight > MIN_OVERFLOW,
          })
        }}
        onTouchStart={(event) => {
          holdPosition = false
          const target = event.target instanceof Element ? event.target : undefined
          const nested = target?.closest("[data-scrollable]")
          props.follow.dispatch({ type: "touch.start", nested: !!nested && nested !== viewport })
        }}
        onTouchMove={() => {
          if (!viewport) return
          holdPosition = false
          props.follow.dispatch({
            type: "touch.drag",
            overflow: viewport.scrollHeight - viewport.clientHeight > MIN_OVERFLOW,
          })
        }}
        onTouchEnd={() => props.follow.dispatch({ type: "touch.end", scrolling: false })}
        onPointerDown={() => {
          holdPosition = false
          props.follow.dispatch({ type: "pointer.down" })
        }}
        onPointerUp={() => props.follow.dispatch({ type: "pointer.up" })}
        onPointerCancel={() => props.follow.dispatch({ type: "pointer.up" })}
        class="relative h-full w-full min-w-0"
        style={{ "--sticky-accordion-top": props.showHeader ? "var(--session-header-height, 48px)" : "0px" }}
      >
        <Show when={props.showHeader} fallback={<div aria-hidden="true" class="h-4 md:hidden" />}>
          {props.header}
        </Show>
        <AnswerPage
          messages={props.messages}
          sessionID={props.sessionID?.()}
          actions={props.actions}
          view={props.view}
          collapseTiming={props.collapseTiming}
          foldedReplies={props.foldedReplies}
          viewport={viewportElement}
          following={following}
          active={props.active}
          restore={() => {
            const saved = savedPosition()

            return saved?.bottom ? undefined : saved
          }}
          onRestoreMiss={restoreMissed}
          onPositionChange={rememberPosition}
          setReveal={(next) => (pageReveal = next)}
          onOpenFile={(path) =>
            links.open({ href: path, exact: true, background: true, session: attachment.current() })
          }
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
      <Show when={!following()}>
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
