import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { prefersReducedMotion } from "@opencode/ui/motion"
import { ScrollView } from "@opencode/ui/scroll-view"
import { AnswerPage, type CollapseTiming, type FoldedReplies, type TranscriptView } from "@opencode/session-ui/answer"
import { useLanguage } from "@/runtime/i18n/language"
import { revealInTimeline } from "./answer-reveal"

const BOTTOM_THRESHOLD = 24

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
  const [atBottom, setAtBottom] = createSignal(true)
  let viewport: HTMLDivElement | undefined
  // The reader stays pinned to the end until they scroll away, across streamed growth.
  let stick = true

  const measureBottom = () => {
    if (!viewport) return

    // Only a reader resting at the very end keeps following. A looser threshold would pull back a
    // reader who scrolled up but stayed within the composer inset, which reads as the content jumping.
    stick = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BOTTOM_THRESHOLD
    setAtBottom(stick)
  }

  const jumpToLatest = () => {
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" })
  }

  // A scroll gesture ends following immediately, before the next content growth can pull the reader
  // back; the scroll handler re-pins once the reader comes back to the end.
  const releaseFollow = () => {
    stick = false
    setAtBottom(false)
  }

  let follow: ResizeObserver | undefined

  onMount(() => {
    props.setRevealMessage?.((id, partID) => {
      if (viewport) revealInTimeline(viewport, id, partID)
    })
    props.setRevealPart?.((target) => (viewport ? revealInTimeline(viewport, target) : false))
    props.setScrollToEnd?.((behavior) => {
      viewport?.scrollTo({ top: viewport.scrollHeight, behavior })
    })
    props.setPage?.((direction) => viewport?.scrollBy({ top: direction * viewport.clientHeight * 0.9 }))

    // The ScrollView hands over its viewport after this component mounts, so observe from the next
    // frame, once the rows are laid out.
    requestAnimationFrame(() => {
      measureBottom()
      if (!viewport) return

      // Streamed text and disclosures grow the rows without changing the message list identity, so
      // follow the observed layout instead of the list: every child that grows pulls the viewport back
      // to the end while the reader is still pinned there. Nothing else measures the bottom while
      // content grows, because that would clear `stick` before the follow-up scroll runs.
      follow = new ResizeObserver(() => {
        if (!stick || !viewport) return
        viewport.scrollTop = viewport.scrollHeight
        measureBottom()
      })

      for (const child of Array.from(viewport.children)) follow.observe(child)
    })
  })

  onCleanup(() => follow?.disconnect())

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
          props.setScrollRef(element)
        }}
        thumbContainer={visible()}
        onScroll={(event) => {
          props.onUserScroll(event.target)

          if (!viewport) return
          measureBottom()
          props.onScheduleScrollState(viewport)
          props.onContentResize()
          props.onHistoryScroll()
        }}
        onWheel={releaseFollow}
        onTouchMove={releaseFollow}
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
          class="absolute right-4 z-[8] flex h-[34px] w-[34px] items-center justify-center rounded-full border-[0.5px] border-v2-border-border-base text-v2-text-text-base backdrop-blur-[2px] hover:bg-[linear-gradient(var(--v2-overlay-simple-overlay-hover),var(--v2-overlay-simple-overlay-hover))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
          style={{
            bottom: `${props.bottomInset + 16}px`,
            "background-color": "color-mix(in srgb, var(--v2-background-bg-base) 92%, transparent)",
            "box-shadow": "var(--v2-elevation-raised), 0px 2px 8px var(--v2-background-bg-base)",
          }}
          onClick={jumpToLatest}
        >
          <Icon aria-hidden="true" name="chevron-down" size="small" />
        </button>
      </Show>
    </div>
  )
}
