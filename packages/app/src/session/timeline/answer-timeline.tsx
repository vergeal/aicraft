import { Show, createRenderEffect, createSignal, on, onCleanup, onMount, type JSX } from "solid-js"
import type { SessionMessageInfo } from "@aicraft/client/promise"
import { Icon } from "@aicraft/ui/icon"
import { ScrollView } from "@aicraft/ui/scroll-view"
import { AnswerPage, type CollapseTiming, type FoldedReplies, type TranscriptView } from "@aicraft/session-ui/answer"
import type { SessionUserActions } from "@aicraft/session-ui/actions"
import { useLanguage } from "@/runtime/i18n/language"
import { usePluginHost } from "@/runtime/plugin/host"
import { usePluginAttachment } from "@/runtime/plugin/host-apis"
import { useData } from "@/runtime/server/current"
import { revealInTimeline } from "./answer-reveal"
import type { TimelineFollow } from "./follow"
import { END_EPSILON, MIN_OVERFLOW, ZOOM_SLACK, needsEndProbe } from "./machine"
import { readPosition, writePosition, type SavedPosition } from "./position"

const SAVE_DELAY = 200

// The remembered row's key carries its message id; the anchor page is fetched by that id.
const anchorMessageID = (key: string) => key.match(/msg_[0-9A-Za-z]+/)?.[0]

// A scroll has come to rest once no new offset arrives for this long. The follow machine only probes a zoomed end
// from a settled scroll, so this is the timer that lets a detached view resume following by reaching the end.
const SCROLL_SETTLE_DELAY = 120

// Rows still settle after a placement lands (markdown, fold metrics); reveal only once the height stops moving.
const RESTORE_SETTLE_MS = 60

// The fade that carries the rows back in when the restore gate lifts.
const RESTORE_REVEAL_MS = 200

// The gate's final write needs two paint frames before the reveal. Timers, not rAF: a hidden window freezes rAF and
// would strand the gate; two timer frames cover the same write-then-paint order when the window is visible.
const RESTORE_GATE_FRAME_MS = 16

// A stream that never rests must not strand the gate: this watchdog settles the attempt whatever else is pending.
const RESTORE_HARD_MS = 3000

// A hot session places from rows already in the transcript, so the reveal waits only one render frame instead of
// the settle window: the activation must read as instant, not as a load.
const RESTORE_LOCAL_SETTLE_MS = 8

// A streaming session grows the height forever, so a placed restore reveals by this deadline even while the height
// still moves. The settle window only wins while the growth stays quiet.
const RESTORE_REVEAL_MAX_MS = 600

// The serial leading-turn enrich loop pauses between wide page reads; a row count changed inside this window
// means another page is about to publish, so the reveal must not open on the gap.
const LEADING_PAGE_GAP = 150

/** The conversation column: the session header, the answer area, and the composer's bottom lane. */
export function AnswerTimeline(props: {
  header: JSX.Element
  showHeader: boolean
  activity: JSX.Element
  messages: () => readonly SessionMessageInfo[]
  /** Inputs still queued behind the active turn, so a delivered-only wake can split its own block. */
  pendingInputIDs?: () => ReadonlySet<string> | undefined
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
  const data = useData()
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
  let activationAnchor: SavedPosition | undefined
  // The activation gate: while a remembered mid-transcript row is being fetched and placed, the transcript rows stay
  // hidden (layout intact, so measurement works) and no host write is visible. The reader sees exactly one position
  // per activation: whichever place the attempt settles on when the gate lifts.
  const [restorePending, setRestorePending] = createSignal(false)
  // The anchor page request is in flight; the page's miss watchdog waits for this to clear.
  const [restoreSeeking, setRestoreSeeking] = createSignal(false)
  // Bumped on every content-height change while a restore still owes its placement: an offset the transcript cannot
  // reach yet is a not-yet, and the page re-measures with the growth instead of idling on the miss watchdog.
  const [restoreTick, setRestoreTick] = createSignal(0)
  // The landing is decided: no page-side placement attempt may write anymore, even if its watchdog fires late.
  const [restoreSettled, setRestoreSettled] = createSignal(false)
  // A short fade carries the rows back in, so the reveal does not read as a hard cut.
  const [restoreReveal, setRestoreReveal] = createSignal(false)
  let restorePlaced = false
  let restorePlacedAt = 0
  let lastRowsChange = 0

  createRenderEffect(
    on(
      () => props.messages().length,
      () => {
        lastRowsChange = performance.now()
      },
      { defer: true },
    ),
  )
  let restoreLocal = false
  let restoreLanding = false
  let revealTop = 0
  // The placed row's screen position for this activation's landing: the machine's `anchored` state holds the key,
  // this holds the top edge as the placement write left it. Every height change is corrected back to it in the
  // observer frame that measures it, so the reveal shows one position and no later restream visibly moves it.
  let placedAnchor: { top: number } | undefined
  let restoreGeneration = 0
  let seekController: AbortController | undefined
  let settleTimer: ReturnType<typeof setTimeout> | undefined
  let gateTimer: ReturnType<typeof setTimeout> | undefined
  let revealTimer: ReturnType<typeof setTimeout> | undefined
  let restoreTimer: ReturnType<typeof setTimeout> | undefined
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
  let contentWatcher: MutationObserver | undefined

  const following = () => props.follow.following()

  // A following view writes `scrollTop` itself on every growth. The browser's own scroll anchoring would add a second
  // correction to the same container, and the two together move the rows the reader is watching (a 0.28 layout shift in
  // the captured session). A detached reader keeps the browser's anchoring: nothing writes their offset then.
  const applyAnchoring = () => {
    // The gate also owns the offset: while it is up, the browser's anchoring must not "helpfully" correct the
    // placement writes it cannot see.
    if (viewport)
      viewport.style.overflowAnchor =
        following() || restorePending() || props.follow.anchor() !== undefined ? "none" : "auto"
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
    if (!viewport) return
    // History pages above keep the offset anchored at the end, so a viewport that is already there owes no write:
    // re-assigning the clamped end would be a redundant visible write on every later growth.
    if (viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 0) return
    viewport.scrollTop = viewport.scrollHeight
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
    // A reader who asks for the newest content ends the activation's attempt on the spot, under the same gate.
    settleRestore("end")
    props.follow.dispatch({ type: "follow" })
    stickToEnd()
  }

  // After a placement the landing is the row's screen position, not the offset number: re-measure the placed row
  // inside the observer frame that saw the height change, and give the offset back the difference. The write runs
  // before paint, so no visible position is ever added; the reveal shows the same single place the page wrote.
  const correctPlacedAnchor = (key: string) => {
    if (!placedAnchor || !viewport) return

    const row = viewport.querySelector<HTMLElement>(`[data-answer-key="${CSS.escape(key)}"]`)

    if (!row) return

    const delta = row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - placedAnchor.top

    if (Math.abs(delta) > 1) viewport.scrollTop += delta
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

  // An activation with a remembered mid-transcript row opens the gate and asks the store for the row's page. The
  // page places the row as soon as its message lands; these helpers only decide what happens when placement cannot
  // happen (first row, deleted row, failed fetch) and when the view may be revealed.
  // Both gated paths (a remembered-row restore and a plain landing) share one hard deadline, so no path can leave
  // the view hidden if placement, reveal scheduling or a fetch goes missing.
  const armRestoreDeadline = () => {
    if (restoreTimer !== undefined) clearTimeout(restoreTimer)

    restoreTimer = setTimeout(() => {
      restoreTimer = undefined
      if (!restorePending() || restoreSettled()) return

      if (restorePlaced) finishRestore()
      else settleRestore("end")
    }, RESTORE_HARD_MS)
  }

  const beginRestore = (saved: SavedPosition) => {
    activationAnchor = saved
    restorePlaced = false
    restorePlacedAt = 0
    restoreLocal = false
    restoreLanding = false
    placedAnchor = undefined
    setRestorePending(true)
    setRestoreSettled(false)

    // Whatever the page and the fetch decide downstream, the gate opens by this deadline: a placed attempt reveals,
    // an undecided one lands at the newest content. The view is never left hidden.
    armRestoreDeadline()

    const sessionID = props.sessionID?.()
    const messageID = anchorMessageID(saved.key)

    if (!sessionID || !messageID) return
    // The anchor row is in the transcript already (a hot session): the page places it without waiting on anything,
    // so skip the fetch and let the reveal take the short settle instead of the quiet window.
    restoreLocal = props.messages().some((item) => item.id === messageID)

    if (restoreLocal) {
      // The row is in this window already: nothing pages in, so a placement miss is decided at once. Undo a
      // synchronous seek claim that raced a message write between the claim and here.
      if (!seekController) setRestoreSeeking(false)

      return
    }
    const controller = new AbortController()
    const generation = restoreGeneration
    seekController = controller
    setRestoreSeeking(true)
    void data.session.message.loadAround(sessionID, messageID, { signal: controller.signal }).then(
      (result) => {
        if (generation !== restoreGeneration || seekController !== controller) return
        seekController = undefined
        setRestoreSeeking(false)

        // "loaded" means the row is in the transcript now: the page's rows effect places it under the gate.
        if (result === "head") settleRestore("top")
        else if (result === "missing") {
          settleRestore("end")
          healStaleAnchor(saved, true)
        }
      },
      () => {
        if (generation !== restoreGeneration || seekController !== controller) return
        // The fetch failed; clearing `seeking` lets the page's watchdog decide the miss.
        seekController = undefined
        setRestoreSeeking(false)
      },
    )
  }

  const abortSeek = () => {
    seekController?.abort()
    seekController = undefined
    setRestoreSeeking(false)
  }

  // Two frames after the final write: the placement paints once while still hidden, then the reveal shows a single
  // position with a short fade. The generation check drops a close whose activation has already been superseded.
  // Timers rather than rAF: a backgrounded window freezes rAF, which would strand the gate shut forever.
  const closeRestoreGate = () => {
    const generation = restoreGeneration
    // The frame the reveal waits for is also the last recheck: async rendering (highlighting, images) can grow the
    // transcript inside it, and revealing mid-growth would hand the reader the following stickToEnd writes as jumps.
    const gateHeight = viewport?.scrollHeight ?? 0

    const step = () => {
      if (generation !== restoreGeneration) return

      if (restoreLanding && viewport && viewport.scrollHeight !== gateHeight) {
        setRestoreSettled(false)
        scheduleReveal()

        return
      }

      setRestorePending(false)
      setRestoreReveal(true)

      if (revealTimer !== undefined) clearTimeout(revealTimer)

      revealTimer = setTimeout(() => {
        revealTimer = undefined
        setRestoreReveal(false)
      }, RESTORE_REVEAL_MS)
    }
    if (settleTimer !== undefined) clearTimeout(settleTimer)
    // One frame while still hidden paints the final offset, then the reveal shows a single position with a fade.
    // The close runs on its own timer: heights still moving after the settle must not clear this timeout and
    // strand the gate open forever.
    if (gateTimer !== undefined) clearTimeout(gateTimer)

    gateTimer = setTimeout(step, RESTORE_GATE_FRAME_MS)
  }

  // A landing decided without row placement. Ending the page's attempt first stops its watchdog and page-in retries
  // from writing after this decision, so the gate release shows exactly one position.
  const settleRestore = (mode: "top" | "end") => {
    if (!restorePending() || restoreSettled()) return
    abortSeek()
    setRestoreSettled(true)
    restoreLanding = false

    if (mode === "top" && viewport) viewport.scrollTop = 0

    if (mode === "end" && viewport) {
      props.follow.dispatch({ type: "follow" })
      stickToEnd()
      revealTop = viewport.scrollTop
    }

    closeRestoreGate()
  }

  // The page placed the remembered row and the heights have stopped moving: reveal the settled transcript.
  const finishRestore = () => {
    if (!restorePending() || restoreSettled()) return
    abortSeek()
    setRestoreSettled(true)
    closeRestoreGate()
  }

  // Rows still land after a placement (markdown, fold metrics), but the landing is the offset, not the height:
  // reveal once the offset has stopped being pushed around (and a plain landing has actually reached the end).
  // Growth below the reader's row must not delay the reveal, so a chain already in flight is never restarted;
  // the tick itself re-arms when the offset turns out to have moved. A deadline keeps a streamed session from
  // holding the gate shut forever.
  // A cold transcript keeps growing while history pages in: a load is in flight, or the row count changed so
  // recently that the serial leading-turn enrich loop is almost certainly between pages. Revealing mid-claim
  // shows the reader the following page pulls as jumps, so those keep the gate shut.
  const growthClaimed = () => {
    const landingSession = props.sessionID?.()

    return (
      (landingSession !== undefined && data.session.message.loading(landingSession)) ||
      performance.now() - lastRowsChange < LEADING_PAGE_GAP
    )
  }

  const scheduleReveal = () => {
    if (restoreSettled() || settleTimer !== undefined) return
    const quiet = restoreLocal
      ? RESTORE_LOCAL_SETTLE_MS
      : restoreLanding && growthClaimed()
        ? RESTORE_GATE_FRAME_MS
        : performance.now() - restorePlacedAt >= RESTORE_REVEAL_MAX_MS
          ? 0
          : RESTORE_SETTLE_MS
    // The tick compares against this snapshot, not against values the ResizeObserver keeps refreshing: growth
    // between the schedule and the tick must re-arm the window instead of looking quiet.
    const snapshot = viewport ? { height: viewport.scrollHeight, rows: props.messages().length } : undefined

    settleTimer = setTimeout(() => {
      settleTimer = undefined

      if (!viewport || !restorePending()) return

      if (restoreLanding) {
        // A landing shows the newest content, so it releases once nothing moves anymore: no page in flight (the
        // enrich loop included), no taller transcript, no new rows. The gate hides the chasing; a release
        // mid-climb would show it.
        if (growthClaimed()) {
          scheduleReveal()

          return
        }

        if (snapshot && (viewport.scrollHeight !== snapshot.height || props.messages().length !== snapshot.rows)) {
          scheduleReveal()

          return
        }

        if (!atEnd()) landOnEnd()
        finishRestore()

        return
      }

      // Growth below the reader's row is not a move: the offset itself must stop changing before the reveal.
      if (Math.abs(viewport.scrollTop - revealTop) > 1) {
        revealTop = viewport.scrollTop
        scheduleReveal()

        return
      }
      finishRestore()
    }, quiet)
  }

  // The remembered row will not arrive: it is gone or the transcript never had it. Settle at the newest content
  // under the gate, so the activation still paints one position. The record is held for a later manual page-in.
  // A remembered anchor that can never be placed again has to stop costing every activation: the message is loaded
  // but its row is gone (a re-fold rewrote the fold key, or the answer was replaced), or the server reports the
  // message missing. Mark the saved position as an end exit so the next activation takes the plain landing path;
  // a failed fetch keeps the memory, the row may still exist.
  const healStaleAnchor = (saved: SavedPosition | undefined, anchorGone: boolean) => {
    if (!saved || saved.bottom || !viewport) return

    const messageID = anchorMessageID(saved.key)

    if (!messageID) return

    const inWindow = props.messages().some((item) => item.id === messageID)
    const rowMissing = !viewport.querySelector(`[data-answer-key="${CSS.escape(saved.key)}"]`)

    if (anchorGone || (inWindow && rowMissing)) {
      lastPosition = { ...saved, bottom: true }
      flushPosition()
    }
  }

  const restoreMissed = () => {
    holdPosition = true
    settleRestore("end")
    healStaleAnchor(activationAnchor ?? lastPosition, false)
    props.onRestoreMiss?.()
  }

  // A session switch moves this cached view out of the document and back. Re-arm the landing here: the rows measure
  // again on the next activation, so the view must not keep the settled state it reached before leaving.
  createRenderEffect(
    on(
      () => props.active?.() !== false,
      (isActive) => {
        if (!isActive) return

        // Open the gate synchronously for a remembered mid-transcript row: the reinsertion must never paint a frame
        // at the clamped offset while the microtask below is still queued.
        const armed = savedPosition()

        if (armed && !armed.bottom) {
          setRestorePending(true)
          activationAnchor = armed

          // Claim the seek before any microtask runs: the page's first placement attempt lands with the mutation
          // observer, ahead of the queued `beginRestore`, and an unclaimed fetch would read as "nobody is fetching",
          // missing an anchor that the page-in is about to deliver.
          const messageID = anchorMessageID(armed.key)

          if (messageID && !props.messages().some((item) => item.id === messageID)) setRestoreSeeking(true)
        }

        // Same timing as the page's restore: decide the landing after the DOM insert, before the reinsertion's scroll
        // event reaches the machine.
        queueMicrotask(() => {
          const saved = savedPosition()
          // A new activation supersedes any attempt still in flight from the last one.
          restoreGeneration += 1
          abortSeek()

          if (settleTimer !== undefined) clearTimeout(settleTimer)

          if (viewport) lastContentHeight = viewport.scrollHeight

          if (!saved || saved.bottom) {
            // The landing is gated too: the reader meets the transcript once, already at the end, instead of
            // watching it climb while the window pages in. The reveal follows the same quiet-height rule.
            restorePlaced = false
            restorePlacedAt = performance.now()
            restoreLocal = false
            restoreLanding = true
            placedAnchor = undefined
            setRestorePending(true)
            setRestoreSettled(false)
            armRestoreDeadline()
            startLanding()
            revealTop = viewport?.scrollTop ?? 0
            scheduleReveal()

            return
          }

          // A remembered mid-transcript row is the reader's own intent: the host releases follow and restores it, so
          // this activation does not owe a landing. The gate keeps the transcript hidden until one place settles.
          props.follow.dispatch({ type: "landing.cancel" })
          props.onRestore?.()
          beginRestore(saved)
        })
      },
      { defer: false },
    ),
  )

  onMount(() => {
    props.setRevealMessage?.(reveal)
    props.setRevealPart?.(revealTarget)
    props.setScrollToEnd?.((_behavior) => {
      // While the gate is up the activation owns the position; a dock resize must not fight it. The observer
      // re-runs this once the inset has settled and the gate is gone.
      if (restorePending()) return
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

        const height = viewport.scrollHeight
        const delta = height - lastContentHeight
        lastContentHeight = height

        // Before a placement, height changes are the transcript still settling (async render, a finished turn
        // folding). Hand them to the page as re-measure retries under the same gate that owns the visible offset.
        if (restorePending() && !restorePlaced && !restoreLanding) setRestoreTick((tick) => tick + 1)

        // The gate: nothing may pull the rows while the activation is still deciding its landing. A placed row
        // reveals once the height stops moving; growth before placement just keeps the gate shut. A landing is the
        // exception it owns: while hidden it keeps chasing the moving end, so the reveal shows a final position.
        if (restorePending()) {
          if (restoreLanding) {
            if (following()) stickToEnd()
            scheduleReveal()

            return
          }

          if (restorePlaced) {
            const anchored = props.follow.peek()

            if (anchored.type === "anchored") correctPlacedAnchor(anchored.anchor.key)
          }

          return
        }

        const state = props.follow.peek()

        // The landing's anchor outlives the gate: a row that measures a different height later, above the placed
        // one, would otherwise drag the reader's place along with it. The write lands in this observer frame,
        // before paint, and the placed row's screen position holds through it.
        if (state.type === "anchored") {
          correctPlacedAnchor(state.anchor.key)

          return
        }

        // A press pauses the landing: the rows must hold still between pointerdown and pointerup, or the click lands on
        // whatever moved under the pointer instead.
        if (state.type !== "landing" && state.gesture === "pointer") return

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

      // Rows remount on activation and on every page-in, and the resize observer keeps no reference to replaced
      // children: a child-list watcher re-syncs the observed set, or growth after a remount reports to nobody.
      // The sync is incremental on purpose. Disconnecting and re-observing the whole list drops the entries the
      // browser had already collected for this frame and re-seeds each child with its current size, so a height
      // change that arrived in the same batch as a remount is never reported - and the anchor correction for it
      // slips a frame or disappears.
      const root = viewport
      const observed = new Set<Element>()
      const syncObserved = () => {
        const next = new Set(Array.from(root.children))

        for (const node of Array.from(observed)) {
          if (next.has(node)) continue
          observed.delete(node)
          contentObserver?.unobserve(node)
        }

        for (const node of next) {
          if (observed.has(node)) continue
          observed.add(node)
          contentObserver?.observe(node)
        }
      }
      syncObserved()
      contentWatcher = new MutationObserver(() => {
        syncObserved()

        // Rows a page-in mounts are nested children of the transcript container: no viewport-direct child list
        // changes, and no already-observed box changes size, so the resize observer first hears of the shift from
        // the newcomers' own initial delivery, a frame late - and the pushed-down position paints displaced. A
        // subtree mutation callback runs in the inserting task's microtask, pre-paint, so holding the anchor row
        // here corrects in the frame that moved it.
        const anchored = props.follow.peek()

        if (placedAnchor && anchored.type === "anchored") correctPlacedAnchor(anchored.anchor.key)
      })
      contentWatcher.observe(root, { childList: true, subtree: true })
    })
  })

  // The anchoring follows the follow intent: a landing, a fresh activation and a streamed growth all write the offset,
  // so all of them run with the browser's anchoring off.
  createRenderEffect(() => {
    following()
    restorePending()
    props.follow.anchor()
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
  onCleanup(() => contentWatcher?.disconnect())
  onCleanup(() => {
    if (scrollSettleTimer !== undefined) clearTimeout(scrollSettleTimer)

    if (landingTimer !== undefined) clearTimeout(landingTimer)

    if (settleTimer !== undefined) clearTimeout(settleTimer)

    if (gateTimer !== undefined) clearTimeout(gateTimer)

    if (revealTimer !== undefined) clearTimeout(revealTimer)

    if (restoreTimer !== undefined) clearTimeout(restoreTimer)
    abortSeek()
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
    /* The timeline paints its own canvas because the dark replica sets `session-panel` transparent, and it has to
       take the shell's canvas variable rather than a literal: the canvas is `#141414` in dark but `#ffffff` in light,
       so a hardcoded dark grey turned the whole answer column black under the light scheme, with the answer's own
       near-black ink on top of it. Outside the replica shell (web, stories) the variable is absent and the design
       system's canvas stands in. */
    <div
      data-slot="answer-timeline"
      class="relative h-full w-full min-w-0"
      style={{ background: "var(--color-main, var(--v2-background-bg-base))" }}
    >
      <ScrollView
        data-slot="session-timeline-scroll"
        data-restore-pending={restorePending() ? "true" : undefined}
        data-restore-reveal={restoreReveal() ? "true" : undefined}
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

          // Under the gate the follow machine must not react: the offsets moving are the activation's own writes,
          // not the reader. History paging and row tracking keep running so the placement can reach its row.
          if (restorePending()) {
            lastScrollTop = top
            lastMaxScroll = max
            props.onContentResize()
            props.onHistoryScroll()

            return
          }

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
          pendingInputIDs={props.pendingInputIDs}
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
          restorePending={restorePending}
          restoreSeeking={restoreSeeking}
          restoreSettled={restoreSettled}
          restoreTick={restoreTick}
          onRestorePlaced={(target) => {
            restorePlaced = true
            restorePlacedAt = performance.now()
            revealTop = viewport?.scrollTop ?? 0
            // The reader is back at a remembered mid position, not at the newest content. The machine may still
            // carry following from before the switch, and the gate hides scroll events that would correct it:
            // anchor now, or the first growth after the reveal would stickToEnd on stale intent. The anchor holds
            // the placed row until the reader's own input lets it go.
            props.follow.dispatch({ type: "anchor", anchor: { key: target.key } })
            // Record the row's top edge as the placement write left it; the observer frames correct back to it.
            const row = viewport?.querySelector<HTMLElement>(`[data-answer-key="${CSS.escape(target.key)}"]`)
            placedAnchor = row && viewport
              ? { top: row.getBoundingClientRect().top - viewport.getBoundingClientRect().top }
              : undefined
            finishRestore()
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
