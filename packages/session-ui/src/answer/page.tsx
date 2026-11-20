import { For, Show, createContext, createEffect, createMemo, createRenderEffect, createSignal, createUniqueId, on, onCleanup, untrack, useContext, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Predicate } from "effect"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { isIconName, type IconName } from "@opencode/ui/icons/catalog"
import { TextShimmer } from "@opencode/ui/text-shimmer"
import { Spinner } from "@opencode/ui/spinner"
import { useI18n, type UiI18nOrdinaryKey } from "@opencode/ui/context/i18n"
import { hasMarkdownSyntax, Markdown } from "../components/markdown"
import { writeClipboard } from "../components/markdown-clipboard"
import { childrenOf, projectTimeline } from "./project"
import { toolDescription, toolError, toolInput, toolLabel, toolMark, toolOutput } from "./tool"
import { entryLayout, estimateEntryHeight, learnedEntryHeights, positionAt, visibleRange } from "./virtual"
import {
  createRestoreState,
  restorePinning,
  transitionRestore,
  type RestoreEvent,
  type RestoreState,
} from "./restore-machine"
import type {
  ContextSource,
  GroupItem,
  NodePayload,
  ProcessActivity,
  Snapshot,
  TimelineEntry,
  TimelineGroup,
  TimelineNode,
  TimelineTurn,
} from "./types"
import "./answer.css"

export type TranscriptView = "compact" | "standard" | "detailed" | "verbose"

export type CollapseTiming = "completion" | "next-input"

export type FoldedReplies = "all" | "final"

type RowDisclosure = {
  open: (key: string) => boolean | undefined
  toggle: (key: string, next: boolean) => void
}

const RowDisclosureContext = createContext<RowDisclosure>()

/** Rows mounted beyond the viewport on each side, so a fast scroll does not show a blank slice. */
const OVERSCAN = 600

export interface AnswerPageProps {
  readonly messages: () => readonly SessionMessageInfo[]
  readonly view?: TranscriptView
  readonly collapseTiming?: CollapseTiming
  readonly foldedReplies?: FoldedReplies
  readonly class?: string
  /** The scroll container this page renders into. Windowing is off until it exists. */
  readonly viewport?: () => HTMLDivElement | undefined
  /** Every row must stay mounted so a DOM-based search can collect its matches. */
  readonly searching?: () => boolean
  /** A reveal is about to run, so the target row must be in the document. */
  readonly revealAll?: () => boolean
  /** The reader still follows the newest content, so layout changes must not restore an anchor. */
  readonly following?: () => boolean
  /**
   * The view is the routed session. A cached view outlives its DOM node: on a session switch the element leaves the
   * document, which zeroes its scroll offset, and it comes back on the next activation. Every activation therefore
   * starts a fresh restore attempt instead of trusting anything read at first mount.
   */
  readonly active?: () => boolean
  /** The row and offset the reader last stopped at. Re-read on each activation, so a cached view remembers its place. */
  readonly restore?: () => { readonly key: string; readonly offset: number } | undefined
  /**
   * The remembered row is not loaded, so restoring it is impossible. The host must settle the view at the newest
   * content: leaving it alone would park the reader at the windowed list's start offset, which reads as a jump to the
   * top of the transcript.
   */
  readonly onRestoreMiss?: () => void
  /** Reports the row under the top edge, so the host can remember where the reader stopped. */
  readonly onPositionChange?: (position: { readonly key: string; readonly offset: number }) => void
}

const STEP_LIVE = {
  thinking: "ui.answer.step.thinking",
  read: "ui.answer.step.read",
  readImage: "ui.answer.step.readImage",
  write: "ui.answer.step.write",
  search: "ui.answer.step.search",
  edit: "ui.answer.step.edit",
  commands: "ui.answer.step.commands",
  code: "ui.answer.step.code",
  webSearch: "ui.answer.step.webSearch",
  webFetch: "ui.answer.step.webFetch",
  subagents: "ui.answer.step.subagents",
  plan: "ui.answer.step.plan",
  questions: "ui.answer.step.questions",
  context: "ui.answer.step.done.context",
  tools: "ui.answer.step.tools",
} as const

const STEP_DONE = {
  thinking: "ui.answer.step.done.thinking",
  read: "ui.answer.step.done.read",
  readImage: "ui.answer.step.done.readImage",
  write: "ui.answer.step.done.write",
  search: "ui.answer.step.done.search",
  edit: "ui.answer.step.done.edit",
  commands: "ui.answer.step.done.commands",
  code: "ui.answer.step.done.code",
  webSearch: "ui.answer.step.done.webSearch",
  webFetch: "ui.answer.step.done.webFetch",
  subagents: "ui.answer.step.done.subagents",
  plan: "ui.answer.step.done.plan",
  questions: "ui.answer.step.done.questions",
  context: "ui.answer.step.done.context",
  tools: "ui.answer.step.done.tools",
} as const

const ACTIVITY_ICONS: Record<ProcessActivity, IconName> = {
  thinking: "answer-thinking",
  read: "answer-read",
  readImage: "answer-read",
  write: "answer-edit",
  search: "answer-search",
  edit: "answer-edit",
  commands: "answer-console",
  code: "answer-console",
  webSearch: "answer-web-search",
  webFetch: "answer-browse",
  subagents: "answer-subagent",
  plan: "answer-list",
  questions: "answer-context",
  context: "answer-context",
  tools: "answer-tool",
}

const TOOL_ACTIONS = {
  runCommand: "ui.answer.tool.runCommand",
  read: "ui.answer.tool.read",
  search: "ui.answer.tool.search",
  list: "ui.answer.tool.list",
  edit: "ui.answer.tool.edit",
  write: "ui.answer.tool.write",
  browse: "ui.answer.tool.browse",
  webSearch: "ui.answer.tool.webSearch",
  subagent: "ui.answer.tool.subagent",
  skill: "ui.answer.tool.skill",
  call: "ui.answer.tool.call",
} as const

/** Which disclosure the work-details mode gives process groups. */
function stepGrouping(view: TranscriptView): "collapsed" | "history" | "none" {
  if (view === "verbose") return "none"

  if (view === "detailed") return "history"

  return "collapsed"
}

function foldState(status: TimelineTurn["status"]): "working" | "worked" | "stopped" | "failed" {
  if (status === "stopped") return "stopped"

  if (status === "failed") return "failed"

  if (status === "open") return "working"

  return "worked"
}

function actionKey(name: string): keyof typeof TOOL_ACTIONS {
  if (["shell", "bash", "execute"].includes(name)) return "runCommand"

  if (name === "read") return "read"

  if (["grep", "glob"].includes(name)) return "search"

  if (["list", "ls"].includes(name)) return "list"

  if (["edit", "patch", "apply_patch"].includes(name)) return "edit"

  if (name === "write") return "write"

  if (name === "webfetch") return "browse"

  if (name === "websearch") return "webSearch"

  if (["subagent", "task"].includes(name)) return "subagent"

  if (name === "skill") return "skill"

  return "call"
}

/**
 * Every built-in tool phrases its own call, in the tense the call's state asks for.
 * A tool absent here falls back to its category phrase, or to naming itself when it has no category.
 */
const TOOL_TITLES: Record<string, { readonly live: UiI18nOrdinaryKey; readonly done: UiI18nOrdinaryKey }> = {
  create: { live: "ui.answer.call.create", done: "ui.answer.call.create.done" },
  deliver: { live: "ui.answer.call.deliver", done: "ui.answer.call.deliver.done" },
  fork: { live: "ui.answer.call.fork", done: "ui.answer.call.fork.done" },
  queue: { live: "ui.answer.call.queue", done: "ui.answer.call.queue.done" },
  steer: { live: "ui.answer.call.steer", done: "ui.answer.call.steer.done" },
  recall: { live: "ui.answer.call.recall", done: "ui.answer.call.recall.done" },
  sessions: { live: "ui.answer.call.sessions", done: "ui.answer.call.sessions.done" },
  transcript: { live: "ui.answer.call.transcript", done: "ui.answer.call.transcript.done" },
  artifact_create: { live: "ui.answer.call.artifact_create", done: "ui.answer.call.artifact_create.done" },
  artifact_read: { live: "ui.answer.call.artifact_read", done: "ui.answer.call.artifact_read.done" },
  artifact_update: { live: "ui.answer.call.artifact_update", done: "ui.answer.call.artifact_update.done" },
  artifact_delete: { live: "ui.answer.call.artifact_delete", done: "ui.answer.call.artifact_delete.done" },
  schedule_create: { live: "ui.answer.call.schedule_create", done: "ui.answer.call.schedule_create.done" },
  schedule_list: { live: "ui.answer.call.schedule_list", done: "ui.answer.call.schedule_list.done" },
  schedule_pause: { live: "ui.answer.call.schedule_pause", done: "ui.answer.call.schedule_pause.done" },
  schedule_resume: { live: "ui.answer.call.schedule_resume", done: "ui.answer.call.schedule_resume.done" },
  schedule_delete: { live: "ui.answer.call.schedule_delete", done: "ui.answer.call.schedule_delete.done" },
  worktree_create: { live: "ui.answer.call.worktree_create", done: "ui.answer.call.worktree_create.done" },
  worktree_list: { live: "ui.answer.call.worktree_list", done: "ui.answer.call.worktree_list.done" },
  worktree_remove: { live: "ui.answer.call.worktree_remove", done: "ui.answer.call.worktree_remove.done" },
  session_move: { live: "ui.answer.call.session_move", done: "ui.answer.call.session_move.done" },
  session_rename: { live: "ui.answer.call.session_rename", done: "ui.answer.call.session_rename.done" },
  models: { live: "ui.answer.call.models", done: "ui.answer.call.models.done" },
  knowledge_search: { live: "ui.answer.call.knowledge_search", done: "ui.answer.call.knowledge_search.done" },
  list_mcp_resources: { live: "ui.answer.call.list_mcp_resources", done: "ui.answer.call.list_mcp_resources.done" },
  read_mcp_resource: { live: "ui.answer.call.read_mcp_resource", done: "ui.answer.call.read_mcp_resource.done" },
  experimental_image_generate: {
    live: "ui.answer.call.experimental_image_generate",
    done: "ui.answer.call.experimental_image_generate.done",
  },
  subagent: { live: "ui.answer.call.subagent", done: "ui.answer.call.subagent.done" },
  skill: { live: "ui.answer.call.skill", done: "ui.answer.call.skill.done" },
  todowrite: { live: "ui.answer.call.todowrite", done: "ui.answer.call.todowrite.done" },
}

/** One tool's own phrase, in the tense its state asks for. */
function toolTitle(i18n: ReturnType<typeof useI18n>, tool: Extract<NodePayload, { kind: "tool" }>["tool"], done: boolean) {
  const entry = TOOL_TITLES[toolLabel(tool.name)]

  if (!entry) return undefined

  return i18n.t(done ? entry.done : entry.live)
}

/** The short noun a summary calls a tool by: English keeps the advertised name, Chinese names the action. */
const TOOL_NAMES: Record<string, UiI18nOrdinaryKey> = {
  create: "ui.answer.tool.name.create",
  deliver: "ui.answer.tool.name.deliver",
  fork: "ui.answer.tool.name.fork",
  queue: "ui.answer.tool.name.queue",
  steer: "ui.answer.tool.name.steer",
  recall: "ui.answer.tool.name.recall",
  sessions: "ui.answer.tool.name.sessions",
  transcript: "ui.answer.tool.name.transcript",
  artifact_create: "ui.answer.tool.name.artifact_create",
  artifact_read: "ui.answer.tool.name.artifact_read",
  artifact_update: "ui.answer.tool.name.artifact_update",
  artifact_delete: "ui.answer.tool.name.artifact_delete",
  schedule_create: "ui.answer.tool.name.schedule_create",
  schedule_list: "ui.answer.tool.name.schedule_list",
  schedule_pause: "ui.answer.tool.name.schedule_pause",
  schedule_resume: "ui.answer.tool.name.schedule_resume",
  schedule_delete: "ui.answer.tool.name.schedule_delete",
  worktree_create: "ui.answer.tool.name.worktree_create",
  worktree_list: "ui.answer.tool.name.worktree_list",
  worktree_remove: "ui.answer.tool.name.worktree_remove",
  session_move: "ui.answer.tool.name.session_move",
  session_rename: "ui.answer.tool.name.session_rename",
  models: "ui.answer.tool.name.models",
  knowledge_search: "ui.answer.tool.name.knowledge_search",
  list_mcp_resources: "ui.answer.tool.name.list_mcp_resources",
  read_mcp_resource: "ui.answer.tool.name.read_mcp_resource",
  experimental_image_generate: "ui.answer.tool.name.experimental_image_generate",
  todowrite: "ui.answer.tool.name.todowrite",
  question: "ui.answer.tool.name.question",
  skill: "ui.answer.tool.name.skill",
  subagent: "ui.answer.tool.name.subagent",
}

/** One category's phrase. Tools with no category of their own are named rather than called "tools". */
function stepLabel(i18n: ReturnType<typeof useI18n>, kind: ProcessActivity, group: TimelineGroup, done: boolean) {
  if (kind === "tools" && group.uncategorized.length > 0 && group.uncategorized.length <= 2)
    return i18n.t(done ? "ui.answer.step.done.named" : "ui.answer.step.named", {
      tool: i18n.list(
        group.uncategorized.map((name) => {
          const key = TOOL_NAMES[name]

          return key ? i18n.t(key) : name
        }),
      ),
    })

  return i18n.t(done ? STEP_DONE[kind] : STEP_LIVE[kind])
}

/** DSH's closed-group title: the top categories as one past-tense phrase. */
function processTitle(i18n: ReturnType<typeof useI18n>, group: TimelineGroup) {
  const labels = group.counts.slice(0, 3).map((item) => stepLabel(i18n, item.kind, group, true))
  const first = labels[0]

  if (first === undefined) return i18n.t(STEP_DONE.thinking)

  const rest = labels.slice(1)
  const continuation = (label: string) => label.charAt(0).toLowerCase() + label.slice(1)
  const second = rest[0]

  if (second === undefined) return first

  if (rest.length === 1) {
    const prefix = i18n.t("ui.answer.step.sharedPrefix")
    const shared = prefix !== "" && first.startsWith(prefix) && second.startsWith(prefix)

    return i18n.t("ui.answer.step.joinTwo", {
      first,
      second: continuation(shared ? second.slice(prefix.length) : second),
    })
  }

  const title = [first, ...rest.map(continuation)].join(i18n.t("ui.answer.step.comma"))

  return group.counts.length > 3 ? i18n.t("ui.answer.step.more", { title }) : title
}

function liveTitle(i18n: ReturnType<typeof useI18n>, group: TimelineGroup) {
  return stepLabel(i18n, group.running ?? group.counts[0]?.kind ?? "thinking", group, false)
}

/** The answer column: one column of turns, each with its process run and answer. */
/** The row covering the top edge, read from the DOM: `offset` is how far its top sits above the viewport. */
function measureTopRow(root: HTMLDivElement): { key: string; offset: number } | undefined {
  const frame = root.getBoundingClientRect()
  const row = [...root.querySelectorAll<HTMLElement>("[data-answer-key]")].find((node) => {
    const rect = node.getBoundingClientRect()

    // The window trails a fast scroll by a frame, so only a row that actually covers the edge counts.
    return rect.bottom > frame.top + 1 && rect.top <= frame.top + 1
  })
  const key = row?.dataset.answerKey

  if (!row || !key) return undefined

  return { key, offset: frame.top - row.getBoundingClientRect().top }
}

export function AnswerPage(props: AnswerPageProps) {
  const snapshot = createMemo(() => projectTimeline(props.messages()))
  const [folded, setFolded] = createStore<Record<number, boolean | undefined>>({})
  const [openGroups, setOpenGroups] = createStore<Record<string, boolean | undefined>>({})
  // Row disclosures live here rather than in the row components: streamed projection rebuilds those
  // components, and local state would come back closed.
  const [openRows, setOpenRows] = createStore<Record<string, boolean | undefined>>({})
  const [now, setNow] = createSignal(Date.now())

  const view = () => props.view ?? "standard"

  // A mode change resets the transcript layout, including the groups the reader opened.
  createEffect(
    on(
      () => props.view,
      () => setOpenGroups({}),
    ),
  )

  const entryKey = (entry: TimelineEntry) => (entry.kind === "fold" ? `fold:${entry.turn}` : `node:${entry.key}`)

  const entries = createMemo(() => snapshot().entries)
  const keys = createMemo(() => entries().map(entryKey))
  const index = createMemo(() => new Map(entries().map((entry) => [entryKey(entry), entry] as const)))
  const running = createMemo(() => [...snapshot().turns.values()].findLast((turn) => turn.status === "open"))

  const rowIndex = createMemo(() => new Map(keys().map((key, position) => [key, position] as const)))
  const rowGaps = createMemo(() => entries().map((_, position) => flowGapPx(snapshot(), entries(), position)))

  // Measured border boxes, keyed by row identity. A key leaves the cache with its row, which is what
  // lets a regrouped or folded row re-estimate instead of keeping a stale height.
  const [rowSizes, setRowSizes] = createStore<Record<string, number>>({})
  const [scrollTop, setScrollTop] = createSignal(0)
  const [viewportHeight, setViewportHeight] = createSignal(0)

  // An unmeasured row is estimated from its own family's measured median where one exists. A fixed guess is 2-3x off
  // for a long answer, and that error is what moves the total height (and the reader) every time a row measures.
  const learnedHeights = createMemo(() => learnedEntryHeights(entries(), snapshot(), (key) => rowSizes[key]))
  const estimates = createMemo(
    () =>
      new Map(
        entries().map(
          (entry) => [entryKey(entry), estimateEntryHeight(entry, snapshot(), learnedHeights())] as const,
        ),
      ),
  )

  const virtualize = () => !!props.viewport?.() && !props.searching?.() && !props.revealAll?.()

  const layout = createMemo(() =>
    entryLayout(keys(), (key, position) => rowSizes[key] ?? (estimates().get(key) ?? 80) + (rowGaps()[position] ?? 0)),
  )

  const windowRange = createMemo(() => {
    if (!virtualize()) return { start: 0, end: keys().length - 1 }

    return visibleRange(layout(), scrollTop(), viewportHeight(), OVERSCAN)
  })

  const windowKeys = createMemo(() => {
    const range = windowRange()

    return keys().slice(range.start, range.end + 1)
  })

  const leadingSpacer = () => layout().tops[windowRange().start] ?? 0

  const trailingSpacer = createMemo(() => {
    const range = windowRange()
    const value = layout()
    const top = value.tops[range.end]
    const height = value.heights[range.end]

    if (top === undefined || height === undefined) return 0

    return Math.max(0, value.total - top - height)
  })

  // Mounted rows report their real box. A row that is only in the tree because it is on screen keeps
  // the estimate while detached, so the scrollbar never collapses.
  const measure =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver((measured) => {
          for (const entry of measured) {
            const node = entry.target

            if (!(node instanceof HTMLElement)) continue
            const key = node.dataset.answerKey

            if (!key) continue
            const size = Math.round(entry.borderBoxSize[0]?.blockSize ?? node.offsetHeight)

            if (size > 0) setRowSizes(key, size)
          }
        })

  onCleanup(() => measure?.disconnect())

  // The row under the top edge of the viewport. It holds the reader's place when rows above it
  // change height or an older page is prepended.
  let anchor: { key: string; offset: number } | undefined
  let anchorTop = 0

  const rememberAnchor = (top: number) => {
    const root = props.viewport?.()
    const measured = root ? measureTopRow(root) : undefined

    // While the window catches up with a fast scroll no row covers the edge; keep the last real anchor.
    if (!measured && anchor !== undefined) {
      anchorTop = top
      return
    }

    const currentKeys = keys()
    const value = layout()
    const position = positionAt(value, top)

    // The layout is still an estimate on the frame a scroll lands, so the DOM row wins when it exists.
    anchor =
      measured ??
      (position === undefined ? undefined : { key: currentKeys[position]!, offset: top - value.tops[position]! })
    anchorTop = top

    if (anchor) props.onPositionChange?.(anchor)
  }

  // A restore attempt belongs to one activation: it waits for the rows, then holds the target until the layout
  // settles. A cached view reuses this scope across activations, so the attempt is re-armed rather than read once.
  let pendingRestore: { key: string; offset: number } | undefined
  const [restoreState, setRestoreState] = createSignal<RestoreState>(createRestoreState())
  let pinFrame: number | undefined

  const cancelPin = () => {
    if (pinFrame !== undefined) cancelAnimationFrame(pinFrame)
    pinFrame = undefined
  }

  const dispatchRestore = (event: RestoreEvent) => {
    const current = restoreState()
    const next = transitionRestore(current, event)

    if (next !== current) setRestoreState(next)
    // A miss is final for this activation: the host lands on the newest content and holds the remembered row.
    if (next.status === "missed") props.onRestoreMiss?.()

    return next
  }

  // Rows above the target shrink from their estimate as they measure, which would drag the restored row upward.
  // Hold it on the target for the frames the layout settles, then let the anchor take over.
  const stepRestore = () => {
    pinFrame = undefined
    const current = restoreState()

    if (current.status !== "pinning") return

    const root = props.viewport?.()

    if (!root) return cancelPin()

    const row = [...root.querySelectorAll<HTMLElement>("[data-answer-key]")].find(
      (node) => node.dataset.answerKey === current.key,
    )

    if (!row) {
      // The row is outside the window: land near it with the estimate, then measure once it renders.
      const index = keys().indexOf(current.key)

      if (index < 0) return dispatchRestore({ type: "missing" })

      root.scrollTop = layout().tops[index]! + current.offset
      rememberAnchor(root.scrollTop)
      dispatchRestore({ type: "frame", found: false, delta: 0 })

      return continueRestore()
    }

    // Measure the row itself: layout tops are estimates for every row above the window, and their
    // accumulated error is what used to park the reader a message away from where they stopped.
    const frame = root.getBoundingClientRect()
    const delta = row.getBoundingClientRect().top - frame.top + current.offset

    if (Math.abs(delta) > 1) root.scrollTop += delta

    rememberAnchor(root.scrollTop)
    dispatchRestore({ type: "frame", found: true, delta })

    continueRestore()
  }

  const continueRestore = () => {
    if (restorePinning(restoreState())) pinFrame = requestAnimationFrame(stepRestore)
  }

  onCleanup(cancelPin)

  // Each activation starts one restore attempt. The cached view keeps its scope but loses its DOM node on a session
  // switch, so anything decided at first mount is stale by the time the session comes back.
  //
  // The scroll position has one ordered set of moments, and each depends on the one before it:
  //   1. `active` flips: the effect below deactivates the previous attempt.
  //   2. Solid commits, reinserting the cached node; reading `scrollTop` here shows the clamp the browser applied.
  //   3. This function runs from a microtask: after the insert, so rows are measurable, and before the paint and
  //      the browser's own scroll event, which reports that clamp as "arrived at the end".
  //   4. `stepRestore()` runs synchronously on the first frame, so the zeroed offset is never painted.
  //   5. `AnswerTimeline`'s activation effect runs in the same microtask: it releases follow for a remembered middle
  //      row, or re-arms the end landing for a view that left at the end.
  // A new writer must slot into this order. Anything that scrolls before (3) fights the clamp; anything after the
  // browser's event is undone by the machine's `scrolled()`.
  const attemptRestore = () => {
    const root = props.viewport?.()
    const currentKeys = keys()

    if (!root || currentKeys.length === 0) return
    // One attempt per activation: the layout effect below calls this again once rows exist, and a running or
    // finished restore must not start over.
    if (restoreState().status !== "idle") return

    const target = pendingRestore

    if (target && currentKeys.includes(target.key)) {
      dispatchRestore({ type: "activate", position: target })
      stepRestore()

      return
    }

    dispatchRestore({ type: "activate", position: undefined })

    // The remembered row is not loaded: the host lands on the newest content instead of leaving the view at the
    // windowed list's start offset, which reads as a jump to the top of the transcript.
    if (target) return props.onRestoreMiss?.()

    // No remembered row: open at the newest content, where a following view belongs.
    if (props.following?.() === true) root.scrollTop = root.scrollHeight
  }

  createRenderEffect(
    on(
      () => props.active?.() !== false,
      (isActive) => {
        if (!isActive) return

        // A new activation invalidates the previous attempt: its pin, its settled state, and its remembered row.
        cancelPin()
        dispatchRestore({ type: "deactivate" })
        pendingRestore = props.restore?.()
        // Run after the DOM insert this activation triggers but before the browser paints and dispatches the scroll
        // event the reinsertion causes. That event reports the clamped offset as "arrived at the end", which would
        // otherwise pull a restored middle row back to the bottom.
        queueMicrotask(attemptRestore)
      },
      { defer: false },
    ),
  )

  createEffect(() => {
    const root = props.viewport?.()

    if (!root) return

    // The page keeps its own anchor while estimated rows measure, so a second browser correction would
    // fight it: every row above the window that swaps its estimate for a measured box also moves the
    // content under the reader. The virtualized timeline disables it for the same reason.
    root.style.overflowAnchor = "none"

    // The cached view is removed from its parent on a session switch and reinserted on the next activation. That
    // detach is owned by the activation effect above, which restores the remembered row before the browser paints;
    // this effect only mirrors geometry and keeps the anchor current while the view is live.
    const sync = () => {
      if (!root.isConnected) return

      setViewportHeight(root.clientHeight)
      setScrollTop(root.scrollTop)
    }
    sync()

    let frame: number | undefined
    const onScroll = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        // Detaching zeroes scrollTop, which is not the reader scrolling to the top.
        if (!root.isConnected) return
        setScrollTop(root.scrollTop)
        // A real scroll moves the anchor with the reader, so a later content change holds this place.
        rememberAnchor(root.scrollTop)
      })
    }
    const observer = new ResizeObserver(sync)
    observer.observe(root)
    root.addEventListener("scroll", onScroll, { passive: true })

    onCleanup(() => {
      root.removeEventListener("scroll", onScroll)
      observer.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
    })
  })

  // Keeps the row at the top of the viewport in place when rows above it change height or an older
  // page is prepended. While the reader follows the end, the host owns the scroll position instead.
  createEffect(() => {
    const currentKeys = keys()
    const value = layout()
    const root = props.viewport?.()

    if (!root || currentKeys.length === 0) return

    const top = root.scrollTop
    const previous = anchor
    // Read without subscribing: the pin writes this signal every frame, and re-running the content effect for each
    // of those frames would re-enter the restore it is guarding.
    const pinning = untrack(() => restorePinning(restoreState()))

    // The rows may not have existed when the activation began, so this is the second chance to restore.
    untrack(attemptRestore)

    // A real scroll already moved the anchor; only a content change may restore it.
    const scrolled = Math.abs(top - anchorTop) > 1

    if (!pinning && !scrolled && previous && currentKeys.includes(previous.key) && props.following?.() === false) {
      const row = [...root.querySelectorAll<HTMLElement>("[data-answer-key]")].find(
        (node) => node.dataset.answerKey === previous.key,
      )

      if (row) {
        // Measure the row instead of trusting the estimate for everything above the window.
        const frame = root.getBoundingClientRect()
        const delta = row.getBoundingClientRect().top - frame.top + previous.offset

        if (Math.abs(delta) > 1) root.scrollTop += delta
      } else {
        const position = currentKeys.indexOf(previous.key)
        const target = value.tops[position]! + previous.offset

        if (Math.abs(top - target) > 1) root.scrollTop = target
      }
    }

    if (!pinning) rememberAnchor(root.scrollTop)
  })

  createEffect(() => {
    if (!running()) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)

    onCleanup(() => window.clearInterval(timer))
  })

  const lastTurn = () => Math.max(...[...snapshot().turns.keys()])

  const isFolded = (turn: number) => {
    const value = snapshot().turns.get(turn)

    if (!value || value.status !== "closed" || view() === "verbose") return false
    const explicit = folded[turn]

    if (explicit !== undefined) return explicit

    if ((props.collapseTiming ?? "completion") === "next-input" && turn === lastTurn()) return false

    return true
  }

  const renderEntry = (key: string) => {
    const position = () => rowIndex().get(key) ?? 0
    const entry = createMemo(() => index().get(key))

    const node = createMemo(() => {
      const value = entry()

      return value?.kind === "node" ? snapshot().nodes.get(value.key) : undefined
    })

    const visibleNode = createMemo(() => {
      const value = node()

      if (!value) return undefined

      if ((props.foldedReplies ?? "final") !== "final" || value.payload.kind !== "assistant") return value

      const owner = snapshot().turns.get(value.turn)

      if (!owner || owner.status !== "closed" || !isFolded(owner.turn)) return value

      if (value.anchor === owner.answer) return value

      return undefined
    })

    const turn = createMemo(() => {
      const value = entry()

      return value?.kind === "fold" ? snapshot().turns.get(value.turn) : undefined
    })

    return (
      <div
        data-answer-key={key}
        class="select-text"
        style={{ "padding-top": `${rowGaps()[position()] ?? 0}px` }}
        ref={(node) => {
          measure?.observe(node)
          onCleanup(() => measure?.unobserve(node))
        }}
      >
        <Show when={visibleNode()}>
          {(value) => (
            <NodeRow node={value()} view={view()} live={snapshot().turns.get(value().turn)?.status === "open"} />
          )}
        </Show>
        <Show when={turn()}>
          {(value) => (
            <FoldRow
              turn={value()}
              open={!isFolded(value().turn)}
              snapshot={snapshot()}
              view={view()}
              foldedReplies={props.foldedReplies ?? "final"}
              now={now()}
              groupOpen={(key) => openGroups[key] ?? false}
              toggleGroup={(key) => setOpenGroups(key, !(openGroups[key] ?? false))}
              deferred={
                value().status === "closed" &&
                (props.collapseTiming ?? "completion") === "next-input" &&
                value().turn === lastTurn()
              }
              onToggle={() => setFolded(value().turn, !isFolded(value().turn))}
            />
          )}
        </Show>
      </div>
    )
  }

  return (
    <RowDisclosureContext.Provider
      value={{
        open: (key) => openRows[key],
        toggle: (key, next) => setOpenRows(key, next),
      }}
    >
      <div class={`answer-scope flex flex-col ${props.class ?? ""}`} data-component="answer-page">
        <div class="mx-auto flex w-full max-w-[var(--container-session,840px)] flex-col px-4 pt-4 pb-10">
          <Show when={virtualize()} fallback={<For each={keys()}>{(key) => renderEntry(key)}</For>}>
            <div aria-hidden="true" style={{ height: `${leadingSpacer()}px`, "flex-shrink": 0 }} />
            <For each={windowKeys()}>{(key) => renderEntry(key)}</For>
            <div aria-hidden="true" style={{ height: `${trailingSpacer()}px`, "flex-shrink": 0 }} />
          </Show>
        </div>
      </div>
    </RowDisclosureContext.Provider>
  )
}

function RunningStatus(props: { elapsedMs?: number }) {
  const i18n = useI18n()

  const label = () => i18n.t("ui.answer.workingPrefix")

  return (
    <div
      role="status"
      data-slot="answer-running"
      class="relative flex min-h-[33px] min-w-0 w-full flex-col items-start justify-center border-b-[0.5px] border-v2-border-border-muted pb-2 text-[13px] leading-[24px]"
    >
      <div class="flex h-[24px] min-w-0 items-center gap-[6px]" style={{ color: "var(--answer-ink-secondary)" }}>
        <span class="grid size-[18px] shrink-0 place-items-center overflow-hidden [&_svg]:size-[18px] [&_svg]:translate-y-[0.5px]">
          <Spinner width={18} height={18} class="size-[18px]" />
        </span>
        <span class="min-w-0 shrink-0 overflow-hidden leading-[24px]">
          <TextShimmer text={label()} active />
        </span>
        <Show when={props.elapsedMs !== undefined && props.elapsedMs >= 1000 ? props.elapsedMs : undefined}>
          {(ms) => <span class="shrink-0 leading-[24px] tabular-nums">{durationText(i18n, ms())}</span>}
        </Show>
        <span class="shrink-0 leading-[24px]">{i18n.t("ui.answer.deepDivingEllipsis")}</span>
      </div>
    </div>
  )
}

function runningElapsed(turn: TimelineTurn | undefined, now: number) {
  return turn?.startedAt === undefined ? undefined : Math.max(0, now - turn.startedAt)
}

/** Turn spacing: process rows 4px, an assistant response 16px, a process head 12px. */
/**
 * The leading gap of one row in pixels. It is padding inside the row box rather than a margin, so the
 * measured border box already covers it and the window offsets stay exact.
 */
function flowGapPx(snapshot: Snapshot, entries: readonly TimelineEntry[], index: number) {
  if (index <= 0) return 0

  const current = entries[index]
  const previous = entries[index - 1]

  if (!current || !previous) return 0

  if (previous.kind === "node" && snapshot.nodes.get(previous.key)?.payload.kind === "input") return 8

  if (current.kind === "fold") return 12

  if (isResponse(snapshot, current) || isResponse(snapshot, previous)) return 16

  return 4
}

function isResponse(snapshot: Snapshot, entry: TimelineEntry) {
  return entry.kind === "node" && snapshot.nodes.get(entry.key)?.payload.kind === "assistant"
}

/** The row a repeat run folds from: its first member names the run and carries its icon. */
function repeatLabel(i18n: ReturnType<typeof useI18n>, node: TimelineNode | undefined) {
  if (node?.payload.kind === "tool") return i18n.t(TOOL_ACTIONS[actionKey(node.payload.tool.name)])

  if (node?.payload.kind === "reasoning") return i18n.t("ui.answer.thinking")

  if (node?.payload.kind === "notice") return node.payload.text

  return i18n.t("ui.answer.step.tools")
}

function repeatSummary(node: TimelineNode | undefined) {
  if (node?.payload.kind === "tool") return toolDescription(node.payload.tool)

  return undefined
}

function durationText(i18n: ReturnType<typeof useI18n>, ms: number) {
  const total = Math.round(ms / 1000)

  if (total < 60) return i18n.t("ui.message.duration.seconds", { count: String(total) })

  if (total < 3600)
    return i18n.t("ui.message.duration.minutesSeconds", {
      minutes: String(Math.floor(total / 60)),
      seconds: String(total % 60),
    })

  return i18n.t("ui.message.duration.hoursMinutes", {
    hours: String(Math.floor(total / 3600)),
    minutes: String(Math.floor(total / 60) % 60),
  })
}

function FoldRow(props: {
  turn: TimelineTurn
  open: boolean
  snapshot: Snapshot
  view: TranscriptView
  foldedReplies: FoldedReplies
  now: number
  deferred: boolean
  groupOpen: (key: string) => boolean
  toggleGroup: (key: string) => void
  onToggle: () => void
}) {
  const grouping = () => stepGrouping(props.view)
  const expandable = () => props.turn.status === "closed" && grouping() !== "none"
  const open = () => (expandable() ? props.open : true)

  // A fold hides the turn's rows; the reader's own disclosure state survives it, so reopening the
  // turn shows the same rows they had opened.

  // A running Turn keeps its process expanded; detailed only groups process rows once they are history.
  const flat = () =>
    grouping() === "none" || (grouping() === "history" && (props.turn.status === "open" || props.deferred))

  const elapsedMs = () =>
    props.turn.status === "open" ? runningElapsed(props.turn, props.now) : props.turn.elapsedMs

  const children = createMemo(() => childrenOf(props.snapshot, props.turn.turn))
  // `children()` returns new objects each projection. Key the rows by id so streamed updates reuse the
  // group and row components instead of rebuilding them under the pointer.
  const childKeys = createMemo(() => children().map((child) => child.key))
  const childIndex = createMemo(() => new Map(children().map((child) => [child.key, child] as const)))

  return (
    <section
      data-slot="answer-fold"
      data-turn={props.turn.turn}
      data-state={foldState(props.turn.status)}
      class="flex flex-col"
    >
      <Show when={props.turn.status === "open"}>
        <RunningStatus elapsedMs={elapsedMs()} />
      </Show>
      <Show when={props.turn.status !== "open"}>
        <RunHeader
          state={foldState(props.turn.status)}
          elapsedMs={elapsedMs()}
          expandable={expandable()}
          open={open()}
          onToggle={props.onToggle}
        />
      </Show>
      <Show when={open()}>
        <div class={flat() ? "flex flex-col gap-1 pt-2" : "flex flex-col gap-3 pt-2"}>
          <For each={childKeys()}>
            {(key) => {
              const child = createMemo(() => childIndex().get(key))

              return (
                <Show when={child()}>
                  {(value) => {
                    if (value().kind === "node") {
                      const node = createMemo(() => props.snapshot.nodes.get(key))

                      return (
                        <Show when={node()}>
                          {(nodeValue) => <NodeRow node={nodeValue()} view={props.view} live={props.turn.status === "open"} />}
                        </Show>
                      )
                    }

                    const group = createMemo(() => props.snapshot.groups.get(key))

                    return (
                      <Show when={group()}>
                        {(groupValue) => (
                          <GroupSeat
                            group={groupValue()}
                            snapshot={props.snapshot}
                            view={props.view}
                            flat={flat()}
                            open={props.groupOpen(key)}
                            onToggle={() => props.toggleGroup(key)}
                          />
                        )}
                      </Show>
                    )
                  }}
                </Show>
              )
            }}
          </For>
        </div>
      </Show>
      {/* Without a closing answer, a folded turn still keeps its last step summary readable. */}
      <Show when={!open() && props.turn.answer === null}>
        <div class="flex flex-col gap-1 pt-2">
          <Show when={lastReply(props.snapshot, props.turn.turn)}>
            {(node) => <NodeRow node={node()} view={props.view} live={false} />}
          </Show>
        </div>
      </Show>
    </section>
  )
}

/** The last reply of a turn that never produced a closing answer. */
function lastReply(snapshot: Snapshot, turn: number) {
  return [...snapshot.nodes.values()]
    .filter((node) => node.turn === turn && node.payload.kind === "assistant" && !node.hidden)
    .at(-1)
}

/** L1: one contiguous work run, its own disclosure and verb-phrase title. */
function GroupSeat(props: {
  group: TimelineGroup
  snapshot: Snapshot
  view: TranscriptView
  flat: boolean
  open: boolean
  onToggle: () => void
}) {
  const i18n = useI18n()
  const live = () => !props.group.closed

  const activity = () => props.group.running ?? props.group.counts[0]?.kind ?? "thinking"

  // While the heading reads as a pending analysis it carries the thinking mark, even when the
  // group mixes in a tool. Settled groups keep marking their tools.
  const icon = (): IconName => {
    if (live() && activity() === "thinking") return ACTIVITY_ICONS.thinking

    const declared = props.group.icon

    return declared && isIconName(declared) ? declared : ACTIVITY_ICONS[activity()]
  }

  // Standard appends the live task detail to the category summary while the group is still running.
  const detail = () => (props.view === "standard" && live() ? props.group.runningDetail : "")

  const title = () => {
    // A run of one tool phrases that tool itself; a mixed run still reads as a summary of categories.
    const own = props.group.single && props.group.lead ? toolTitle(i18n, props.group.lead, !live()) : undefined

    if (own) return own

    return live() ? liveTitle(i18n, props.group) : processTitle(i18n, props.group)
  }
  const bodyID = createUniqueId()

  return (
    <section
      data-slot="answer-group"
      data-state={props.open ? "open" : "closed"}
      data-process-activity={activity()}
      class="flex flex-col"
    >
      <button
        type="button"
        data-process-activity={activity()}
        aria-expanded={props.open}
        aria-controls={bodyID}
        hidden={props.flat}
        class="group/heading flex min-w-0 w-full items-center gap-[6px] text-start text-[14px] leading-[24px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
        style={{ color: "var(--answer-ink-tertiary)" }}
        onClick={(event) => {
          event.currentTarget.focus()
          props.onToggle()
        }}
      >
        <span class="flex min-w-0 items-center" data-slot="answer-group-leading">
          <LeadingSlot icon={<FlowIcon name={icon()} />} open={props.open} scope="heading" />
        </span>
        <span class="flex h-[24px] min-w-0 flex-1 items-center overflow-hidden" data-slot="answer-group-content">
          <span class="shrink-0">
            <TextShimmer text={title()} active={live()} />
          </span>
          <Show when={detail()}>
            {(value) => <span class="min-w-0 flex-1 truncate opacity-70">{` · ${value()}`}</span>}
          </Show>
        </span>
      </button>
      <Show when={props.flat || props.open}>
        <div id={bodyID} class={props.flat ? "flex flex-col gap-1" : "answer-tree flex flex-col gap-1 pt-1"}>
          <For each={props.group.items.map((item) => item.key)}>
            {(key) => {
              const item = createMemo(() => props.group.items.find((entry) => entry.key === key))

              return (
                <Show when={item()}>
                  {(value) => (
                    <GroupItemRow item={value()} snapshot={props.snapshot} view={props.view} live={!props.group.closed} />
                  )}
                </Show>
              )
            }}
          </For>
        </div>
      </Show>
    </section>
  )
}

/** One entry of a group body: a plain row, or a folded run of identical consecutive steps. */
function GroupItemRow(props: { item: GroupItem; snapshot: Snapshot; view: TranscriptView; live: boolean }) {
  return props.item.kind === "row" ? (
    <Show when={props.snapshot.nodes.get(props.item.key)}>
      {(node) => <NodeRow node={node()} view={props.view} live={props.live} />}
    </Show>
  ) : (
    <RepeatRow item={props.item} snapshot={props.snapshot} view={props.view} live={props.live} />
  )
}

/** L2: identical consecutive steps folded into one row; open it to read each step, and each step again. */
function RepeatRow(props: {
  item: Extract<GroupItem, { kind: "repeat" }>
  snapshot: Snapshot
  view: TranscriptView
  live: boolean
}) {
  const i18n = useI18n()
  const rows = useContext(RowDisclosureContext)
  // The run's disclosure outlives a streamed projection for the same reason the rows' does.
  const expanded = () => rows?.open(props.item.key) ?? false
  const first = createMemo(() => props.snapshot.nodes.get(props.item.members[0]))

  const count = () => i18n.t("ui.answer.repeat.count", { count: String(props.item.members.length) })

  const summary = () => {
    const detail = repeatSummary(first())

    return detail ? `${detail} ${count()}` : count()
  }

  const state = () => {
    const members = props.item.members.map((key) => props.snapshot.nodes.get(key)?.payload)

    if (members.some((payload) => payload?.kind === "tool" && payload.tool.state.status === "error")) return "error"
    if (members.some((payload) => payload?.kind === "tool" && (payload.tool.state.status === "running" || payload.tool.state.status === "streaming")))
      return "running"

    return "ok"
  }

  return (
    <DisclosureRow
      title={repeatLabel(i18n, first())}
      summary={summary()}
      summaryDanger={state() === "error"}
      state={state()}
      expanded={expanded()}
      leading={<FlowIcon name={ACTIVITY_ICONS[props.item.activity]} />}
      onToggle={() => rows?.toggle(props.item.key, !expanded())}
    >
      <div class="answer-tree answer-tree-nested flex flex-col gap-1">
        <For each={props.item.members}>
          {(key) => (
            <Show when={props.snapshot.nodes.get(key)}>
              {(node) => <NodeRow node={node()} view={props.view} live={props.live} />}
            </Show>
          )}
        </For>
      </div>
    </DisclosureRow>
  )
}

/** The settled turn header: label, duration, chevron, and a hairline under it. */
function RunHeader(props: {
  state: "working" | "worked" | "stopped" | "failed"
  elapsedMs?: number
  expandable?: boolean
  open?: boolean
  onToggle?: () => void
}) {
  const i18n = useI18n()
  const showDuration = () => props.state === "working" || props.state === "worked"

  const label = () => {
    if (props.state === "stopped") return i18n.t("ui.answer.stopped")

    if (props.state === "failed") return i18n.t("ui.answer.failed")
    const timed = props.elapsedMs !== undefined && props.elapsedMs >= 1000

    if (props.state === "working") return timed ? i18n.t("ui.answer.workingPrefix") : i18n.t("ui.answer.working")

    return timed ? i18n.t("ui.answer.workedPrefix") : i18n.t("ui.answer.worked")
  }

  return (
    <div role="status" class="min-w-0 w-full" data-slot="answer-run-header" data-state={props.state}>
      <button
        type="button"
        aria-expanded={props.open}
        disabled={!props.expandable}
        aria-label={props.expandable ? i18n.t(props.open ? "ui.sessionTurn.steps.hide" : "ui.sessionTurn.steps.show") : undefined}
        class="flex min-h-[33px] min-w-0 w-full items-center gap-1.5 border-b-[0.5px] border-v2-border-border-muted pb-2 text-start text-[14px] leading-[normal] disabled:cursor-default enabled:hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
        style={{ color: "var(--answer-ink-tertiary)" }}
        onClick={(event) => {
          event.currentTarget.focus()
          props.onToggle?.()
        }}
      >
        <Show
          when={props.state === "working"}
          fallback={<bdi dir="auto" class="min-w-0 truncate">{label()}</bdi>}
        >
          <TextShimmer text={label()} active />
        </Show>
        <Show when={showDuration() ? props.elapsedMs : undefined}>
          {(ms) => (
            <Show when={ms() >= 1000}>
              <span class="shrink-0 font-mono tabular-nums">{durationText(i18n, ms())}</span>
            </Show>
          )}
        </Show>
        <Show when={props.expandable}>
          <Icon
            aria-hidden="true"
            name="chevron-down"
            size="small"
            class={`shrink-0 transition-transform motion-reduce:transition-none ${props.open ? "rotate-180" : ""}`}
          />
        </Show>
      </button>
    </div>
  )
}

function NodeRow(props: { node: TimelineNode; view: TranscriptView; live: boolean }): JSX.Element | null {
  if (props.node.hidden) return null

  const rows = useContext(RowDisclosureContext)
  const key = props.node.key

  return (
    <div
      data-slot="answer-row"
      data-kind={props.node.payload.kind}
      data-message-id={props.node.messageID}
      data-timeline-part-id={props.node.partID}
    >
      <Payload
        payload={props.node.payload}
        cacheKey={key}
        view={props.view}
        live={props.live}
        rowOpen={rows?.open(key)}
        onToggleRow={rows ? (next) => rows.toggle(key, next) : undefined}
      />
    </div>
  )
}

function Payload(props: {
  payload: NodePayload
  cacheKey: string
  view: TranscriptView
  live: boolean
  rowOpen?: boolean
  onToggleRow?: (next: boolean) => void
}): JSX.Element {
  switch (props.payload.kind) {
    case "input":
      return (
        <div data-slot="user-message-body" class="flex w-fit max-w-[min(82%,64ch)] flex-col items-end ms-auto">
          <div
            dir="auto"
            data-slot="user-message-text"
            class="inline-block max-w-full overflow-hidden whitespace-pre-wrap rounded-[14px] bg-v2-background-bg-layer-02 px-3 py-2 text-[14px] leading-[22px] [overflow-wrap:anywhere] [unicode-bidi:plaintext]"
            style={{ color: "var(--answer-ink)" }}
          >
            <Show when={hasMarkdownSyntax(props.payload.text)} fallback={<>{props.payload.text}</>}>
              <Markdown text={props.payload.text} cacheKey={`${props.cacheKey}:input`} class="answer-input-markdown" />
            </Show>
          </div>
        </div>
      )
    case "assistant":
      return (
        <div data-slot="text-part-body">
          <Markdown
            text={props.payload.text}
            cacheKey={props.cacheKey}
            streaming={props.payload.streaming}
            deferUntilReady
            class="answer-markdown [overflow-wrap:anywhere]"
          />
        </div>
      )
    case "reasoning":
      return (
        <ReasoningRow
          text={props.payload.text}
          streaming={props.payload.streaming}
          live={props.live}
          preview={props.view !== "compact"}
          rowOpen={props.rowOpen}
          onToggleRow={props.onToggleRow}
        />
      )
    case "tool":
      return <ToolRow tool={props.payload.tool} rowOpen={props.rowOpen} onToggleRow={props.onToggleRow} />
    case "notice":
      return (
        <NoticeRow
          text={props.payload.text}
          detail={props.payload.detail}
          notice={props.payload.notice}
          cacheKey={props.cacheKey}
          rowOpen={props.rowOpen}
          onToggleRow={props.onToggleRow}
        />
      )
    case "context":
      return (
        <ContextRow
          cacheKey={props.cacheKey}
          sources={props.payload.sources}
          change={props.payload.change}
          rowOpen={props.rowOpen}
          onToggleRow={props.onToggleRow}
        />
      )
    case "error":
      return (
        <div class="text-[13px] leading-[24px] break-words text-v2-state-fg-danger [overflow-wrap:anywhere]">
          {props.payload.text}
        </div>
      )
    case "retry":
      return (
        <div class="text-[13px] leading-[24px]" style={{ color: "var(--answer-ink-secondary)" }}>
          {props.payload.attempt} · <bdi dir="auto">{props.payload.text}</bdi>
        </div>
      )
  }
}

/** An injected context keeps its body behind a disclosure; a plain notice stays one truncated line. */
function NoticeRow(props: {
  text: string
  detail?: string
  notice?: "instructions-updated"
  cacheKey: string
  rowOpen?: boolean
  onToggleRow?: (next: boolean) => void
}) {
  const i18n = useI18n()
  const expanded = () => props.rowOpen ?? false
  const title = () =>
    props.notice === "instructions-updated" ? i18n.t("ui.answer.notice.instructionsUpdated") : props.text

  if (!props.detail)
    return (
      <div class="flex min-w-0 items-center gap-1.5 text-[13px] leading-[24px]" style={{ color: "var(--answer-ink-tertiary)" }}>
        <FlowIcon name="answer-context" />
        <bdi dir="auto" class="min-w-0 truncate">
          {title()}
        </bdi>
      </div>
    )

  return (
    <DisclosureRow
      title={title()}
      state="ok"
      expanded={expanded()}
      leading={<FlowIcon name="answer-context" />}
      onToggle={() => props.onToggleRow?.(!expanded())}
    >
      <Markdown
        text={props.detail}
        cacheKey={`${props.cacheKey}:detail`}
        deferUntilReady
        class="answer-markdown ps-[30px] py-1 [overflow-wrap:anywhere]"
      />
    </DisclosureRow>
  )
}

/** Sources of the context a Step injected ahead of the conversation, each expandable to its text. */
function ContextRow(props: {
  cacheKey: string
  sources: readonly ContextSource[]
  change: "inject" | "change"
  rowOpen?: boolean
  onToggleRow?: (next: boolean) => void
}) {
  const i18n = useI18n()
  const rows = useContext(RowDisclosureContext)
  const expanded = () => props.rowOpen ?? false
  const label = (key: string) => {
    const known = CONTEXT_LABELS[key]
    if (known) return i18n.t(known)
    return key.startsWith("api/") ? key.slice(4) : key
  }
  // A source that breaks down into files lists the files directly; anything else is one entry of its own.
  const entries = () =>
    props.sources.flatMap((source) =>
      source.items && source.items.length > 0
        ? source.items.map((item, index) => ({
            key: `${props.cacheKey}:context:${source.key}:${index}`,
            title: item.name,
            chars: item.chars,
            text: item.text,
          }))
        : [
            {
              key: `${props.cacheKey}:context:${source.key}`,
              title: label(source.key),
              chars: source.chars,
              text: source.text,
            },
          ],
    )
  return (
    <DisclosureRow
      title={i18n.t(props.change === "inject" ? "ui.answer.context.inject" : "ui.answer.context.change")}
      summary={expanded() ? undefined : props.sources.map((source) => label(source.key)).join(i18n.t("ui.answer.step.comma"))}
      state="ok"
      expanded={expanded()}
      leading={<FlowIcon name="answer-context" />}
      onToggle={() => props.onToggleRow?.(!expanded())}
    >
      <div data-slot="answer-context-sources" class="answer-tree flex flex-col gap-1 py-1">
        <For each={entries()}>
          {(entry) => {
            const open = () => rows?.open(entry.key) ?? false
            const chars = () => i18n.t("ui.answer.context.chars", { count: String(entry.chars) })
            return (
              <Show
                when={entry.text}
                fallback={
                  <div
                    class="flex min-w-0 items-center gap-1.5 text-[13px] leading-[var(--line-height-compact)]"
                    style={{ color: "var(--answer-ink-secondary)" }}
                  >
                    <FlowIcon name="file-document" />
                    <bdi dir="auto" class="min-w-0 truncate">
                      {entry.title}
                    </bdi>
                    <span class="ms-auto shrink-0 tabular-nums" style={{ color: "var(--answer-ink-tertiary)" }}>
                      {chars()}
                    </span>
                  </div>
                }
              >
                {(text) => (
                  <DisclosureRow
                    title={entry.title}
                    summary={chars()}
                    state="ok"
                    expanded={open()}
                    leading={<FlowIcon name="file-document" />}
                    onToggle={() => rows?.toggle(entry.key, !open())}
                  >
                    <Markdown
                      text={text()}
                      cacheKey={`${entry.key}:text`}
                      deferUntilReady
                      class="answer-markdown ps-[30px] py-1 [overflow-wrap:anywhere]"
                    />
                  </DisclosureRow>
                )}
              </Show>
            )
          }}
        </For>
      </div>
    </DisclosureRow>
  )
}

const CONTEXT_LABELS: Record<string, UiI18nOrdinaryKey> = {
  system: "ui.answer.context.system",
  "core/project": "ui.answer.context.project",
  session: "ui.answer.context.session",
  "core/language": "ui.answer.context.language",
  "core/date": "ui.answer.context.date",
  "core/environment": "ui.answer.context.environment",
  "core/instructions": "ui.answer.context.instructions",
  "core/mcp-guidance": "ui.answer.context.mcp",
  "core/skill-guidance": "ui.answer.context.skills",
  "core/codemode": "ui.answer.context.codemode",
  "core/reference-guidance": "ui.answer.context.references",
}

function FlowIcon(props: { name: IconName }) {
  return (
    <span class="flex h-[24px] shrink-0 items-center [&_svg]:size-[18px] [&_svg]:translate-y-[0.5px]">
      <Icon aria-hidden="true" name={props.name} size="small" />
    </span>
  )
}

/**
 * One icon slot for an expandable row: the activity icon sits in place and the chevron replaces it on
 * hover or keyboard focus, the way DSH stacks iconIdle and chevronHover.
 */
function LeadingSlot(props: { icon: JSX.Element; open: boolean; expandable?: boolean; scope: "row" | "heading" }) {
  if (props.expandable === false)
    return <span class="flex h-6 w-[18px] shrink-0 items-center justify-start [&_svg]:translate-y-[0.5px]">{props.icon}</span>

  // Static class strings so the Tailwind scanner keeps the two named group variants.
  const idle =
    props.scope === "row"
      ? "flex items-center justify-center transition-opacity group-hover/row:opacity-0 group-focus-visible/row:opacity-0"
      : "flex items-center justify-center transition-opacity group-hover/heading:opacity-0 group-focus-visible/heading:opacity-0"

  const chevron = () =>
    props.scope === "row"
      ? `absolute opacity-0 transition-[opacity,transform] group-hover/row:opacity-100 group-focus-visible/row:opacity-100 motion-reduce:transition-none ${props.open ? "rotate-180" : ""}`
      : `absolute opacity-0 transition-[opacity,transform] group-hover/heading:opacity-100 group-focus-visible/heading:opacity-100 motion-reduce:transition-none ${props.open ? "rotate-180" : ""}`

  return (
    <span class="relative grid h-6 w-[18px] shrink-0 items-center justify-items-start [&_svg]:size-[18px] [&_svg]:translate-y-[0.5px]">
      <span data-slot="leading-idle" class={`${idle} col-start-1 row-start-1`}>
        {props.icon}
      </span>
      <Icon
        data-leading="chevron"
        aria-hidden="true"
        name="chevron-down"
        size="small"
        class={`col-start-1 row-start-1 ${chevron()}`}
      />
    </span>
  )
}

/** L2: one disclosure row. The chevron only appears on hover, as in DSH. */
function DisclosureRow(props: {
  title: string
  summary?: string
  summaryDanger?: boolean
  state: "ok" | "error" | "running"
  expanded: boolean
  leading: JSX.Element
  onToggle: () => void
  children: JSX.Element
}) {
  const i18n = useI18n()
  const id = createUniqueId()

  return (
    <div class="min-w-0" data-slot="answer-disclosure" data-state={props.state}>
      <div
        role="button"
        tabindex={0}
        data-disclosure-row=""
        aria-expanded={props.expanded}
        aria-controls={id}
        class="group/row flex min-w-0 cursor-pointer items-center gap-[6px] text-[13px] leading-[24px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
        style={{ color: "var(--answer-ink-secondary)" }}
        onClick={props.onToggle}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          props.onToggle()
        }}
      >
        <LeadingSlot icon={props.leading} open={props.expanded} scope="row" />
        <span class="flex h-[24px] min-w-0 items-center overflow-hidden">
          <bdi dir="auto" class="min-w-0 shrink truncate">{props.title}</bdi>
          <Show when={props.summary}>
            {(value) => (
              <span
                class={`min-w-0 flex-1 truncate ${props.summaryDanger ? "text-v2-state-fg-danger" : ""}`}
              >
                {i18n.t("ui.answer.separator")}
                {value()}
              </span>
            )}
          </Show>
        </span>
        <Show when={props.state === "error"}>
          <span class="sr-only">{i18n.t("ui.messagePart.diagnostic.error")}</span>
        </Show>
      </div>
      <Show when={props.expanded}>
        <div id={id}>{props.children}</div>
      </Show>
    </div>
  )
}

function ReasoningRow(props: {
  text: string
  streaming?: boolean
  live: boolean
  preview?: boolean
  rowOpen?: boolean
  onToggleRow?: (next: boolean) => void
}) {
  const i18n = useI18n()
  // Only this reasoning part, inside a running turn, is live; a finished step stops spinning at once.
  const streaming = () => props.live === true && props.streaming === true
  // The row's disclosure outlives this component, so a streamed rebuild cannot close it again.
  const expanded = () => props.rowOpen ?? streaming()

  const preview = () => (props.preview === false ? undefined : reasoningPreview(props.text, streaming()))

  return (
    <DisclosureRow
      title={i18n.t("ui.answer.thinking")}
      summary={expanded() ? undefined : preview()}
      state={streaming() ? "running" : "ok"}
      expanded={expanded()}
      leading={
        <Show when={streaming()} fallback={<FlowIcon name="answer-thinking" />}>
          <span data-slot="answer-reasoning-spinner" class="grid size-[18px] shrink-0 place-items-center overflow-hidden [&_svg]:size-[18px] [&_svg]:translate-y-[0.5px]">
            <Spinner width={18} height={18} class="size-[18px]" />
          </span>
        </Show>
      }
      onToggle={() => props.onToggleRow?.(!expanded())}
    >
      <Markdown
        text={props.text}
        cacheKey={props.text.length.toString()}
        streaming={streaming()}
        deferUntilReady
        class="answer-markdown ps-[30px] py-1 [overflow-wrap:anywhere]"
      />
    </DisclosureRow>
  )
}

function ToolRow(props: {
  tool: Extract<NodePayload, { kind: "tool" }>["tool"]
  rowOpen?: boolean
  onToggleRow?: (next: boolean) => void
}) {
  const i18n = useI18n()
  const failed = () => props.tool.state.status === "error"
  const running = () => props.tool.state.status === "running" || props.tool.state.status === "streaming"
  // Kept outside the component so a streamed rebuild does not close the row the reader opened.
  const expanded = () => props.rowOpen ?? false
  const [copied, setCopied] = createSignal(false)
  let copyTimer: number | undefined

  // The tool declares its own mark; parts recorded before that field resolve by name, and only an unknown one falls back.
  const icon = (): IconName => {
    const declared = toolMark(props.tool)

    return isIconName(declared) ? declared : "tool-default"
  }

  // A tool with its own phrase uses it; the rest fall back to the category, then to naming themselves.
  const title = () => {
    const own = toolTitle(i18n, props.tool, !running())

    if (own) return own

    const key = actionKey(props.tool.name)

    if (key !== "call") return i18n.t(TOOL_ACTIONS[key])

    return i18n.t("ui.answer.tool.callNamed", { tool: toolLabel(props.tool.name) })
  }

  onCleanup(() => {
    if (copyTimer !== undefined) window.clearTimeout(copyTimer)
  })

  const copy = async (text: string) => {
    if (!(await writeClipboard(text))) return
    setCopied(true)

    if (copyTimer !== undefined) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => setCopied(false), 1200)
  }

  const input = () => {
    const value = toolInput(props.tool)

    return Predicate.isString(value) ? value : JSON.stringify(value, null, 2)
  }

  const output = () => toolOutput(props.tool) ?? toolError(props.tool) ?? ""

  const summary = () => {
    if (failed()) return toolError(props.tool) ?? undefined

    return toolDescription(props.tool)
  }

  return (
    <DisclosureRow
      title={title()}
      summary={summary()}
      summaryDanger={failed()}
      state={failed() ? "error" : running() ? "running" : "ok"}
      expanded={expanded()}
      leading={
        <Show when={running()} fallback={<FlowIcon name={icon()} />}>
          <span data-slot="answer-tool-spinner" class="grid size-[18px] shrink-0 place-items-center overflow-hidden [&_svg]:size-[18px] [&_svg]:translate-y-[0.5px]">
            <Spinner width={18} height={18} class="size-[18px]" />
          </span>
        </Show>
      }
      onToggle={() => props.onToggleRow?.(!expanded())}
    >
      <div
        data-slot="answer-io-card"
        class="mt-1 ms-[30px] flex flex-col gap-2 rounded-[12px] px-[22px] pt-[10px] pb-[12px]"
        style={{ background: "var(--answer-surface)" }}
      >
        <section class="flex flex-col gap-1">
          <span
            class="font-mono text-[11px] leading-[19px]"
            style={{ color: "var(--answer-ink-tertiary)" }}
          >
            {i18n.t("ui.answer.io.input")}
          </span>
          <pre
            class="whitespace-pre-wrap break-words font-mono text-[11px] leading-[19px] [overflow-wrap:anywhere]"
            style={{ color: "var(--answer-ink-secondary)" }}
          >
            {input()}
          </pre>
        </section>
        <div class="h-[0.5px] w-full bg-v2-border-border-muted" />
        <section class="flex flex-col gap-1" data-error={failed() ? "" : undefined}>
          <div class="flex min-w-0 items-center justify-between gap-2">
            <span
              class="font-mono text-[11px] leading-[19px]"
              style={{ color: "var(--answer-ink-tertiary)" }}
            >
              {i18n.t("ui.answer.io.output")}
            </span>
            <button
              type="button"
              data-slot="answer-copy"
              class="shrink-0 text-[11px] leading-[19px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
              style={{ color: "var(--answer-ink-secondary)" }}
              onClick={() => void copy(output())}
            >
              {copied() ? i18n.t("ui.answer.copied") : i18n.t("ui.answer.copy")}
            </button>
          </div>
          <pre
            class="whitespace-pre-wrap break-words font-mono text-[11px] leading-[19px] [overflow-wrap:anywhere]"
            style={{ color: failed() ? "var(--v2-state-fg-danger)" : "var(--answer-ink-secondary)" }}
          >
            {output()}
          </pre>
        </section>
        <button
          type="button"
          data-slot="answer-inspect"
          class="mt-1 flex h-[22px] w-fit items-center gap-1 rounded-full border-[0.5px] border-v2-border-border-base px-2 text-[11px] leading-[16px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
          style={{ color: "var(--answer-ink-secondary)", background: "var(--v2-background-bg-base)" }}
          onClick={(event) => {
            const next = event.currentTarget.nextElementSibling

            if (next instanceof HTMLDialogElement) next.showModal()
          }}
        >
          <Icon aria-hidden="true" name="answer-search" width={12} height={12} />
          {i18n.t("ui.answer.inspect")}
        </button>
        <dialog
          data-slot="answer-inspect-dialog"
          class="max-h-[70vh] max-w-[min(680px,90vw)] rounded-[12px] border-[0.5px] border-v2-border-border-base p-4 backdrop:bg-black/30"
          style={{ background: "var(--v2-background-bg-base)", color: "var(--answer-ink)" }}
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close()
          }}
        >
          <div class="flex flex-col gap-2">
            <span class="text-[13px] leading-[20px]">{i18n.t(TOOL_ACTIONS[actionKey(props.tool.name)])}</span>
            <pre class="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-[19px] [overflow-wrap:anywhere]">
              {input()}
              {"\n\n"}
              {output()}
            </pre>
            <form method="dialog" class="flex items-center justify-end gap-3">
              <button
                type="button"
                data-slot="answer-copy"
                class="text-[12px] leading-[20px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
                style={{ color: "var(--answer-ink-secondary)" }}
                onClick={() => void copy(`${input()}\n\n${output()}`)}
              >
                {copied() ? i18n.t("ui.answer.copied") : i18n.t("ui.answer.copy")}
              </button>
              <button type="submit" class="text-[12px] leading-[20px]" style={{ color: "var(--answer-ink-secondary)" }}>
                {i18n.t("ui.answer.inspect.close")}
              </button>
            </form>
          </div>
        </dialog>
      </div>
    </DisclosureRow>
  )
}


/** The one-line summary a reasoning row previews beside its title. */
function reasoningPreview(text: string, streaming: boolean) {
  const blocks = text.split(/\n\s*\n/).filter((block) => block.trim())

  if (streaming) return blocks.at(-1)?.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").trim()

  return blocks[0]?.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").trim()
}
