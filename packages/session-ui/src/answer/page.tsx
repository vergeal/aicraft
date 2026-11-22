import { For, Show, createContext, createEffect, createMemo, createRenderEffect, createSignal, createUniqueId, on, onCleanup, onMount, untrack, useContext, type JSX } from "solid-js"
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
import { UserMessageActions } from "../message/user-message-actions"
import type { SessionUserActions } from "../actions"
import { File } from "../components/file"
import { changedFileDiff } from "../components/apply-patch-file"
import { resolveFileDiff } from "../components/session-diff"
import { createImagePreview } from "../components/image-preview"
import { localImagePath } from "../components/markdown-image"
import { useMarkdown } from "../context/markdown"
import { childrenOf, projectTimeline } from "./project"
import { toolActivity, toolDescription, toolError, toolImages, toolInput, toolLabel, toolMark, toolOutput } from "./tool"
import {
  createRestoreState,
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

/** The session and its message actions, so an input row can offer revert, fork and its sent time. */
type MessageActionsValue = { sessionID?: string; actions?: SessionUserActions }

const MessageActionsContext = createContext<MessageActionsValue>({})

export interface AnswerPageProps {
  readonly messages: () => readonly SessionMessageInfo[]
  readonly view?: TranscriptView
  readonly collapseTiming?: CollapseTiming
  readonly foldedReplies?: FoldedReplies
  /** The session these messages belong to, so a row's actions address the right session. */
  readonly sessionID?: string
  readonly actions?: SessionUserActions
  readonly class?: string
  /** The scroll container this page renders into. Placement is skipped until it exists. */
  readonly viewport?: () => HTMLDivElement | undefined
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
  /**
   * Registers this page's own reveal. A row's content may sit outside the mounted window, where the host's DOM search
   * finds only a reserved box; this reveal expands what hides the row, mounts it, and scrolls it into view.
   */
  readonly setReveal?: (reveal: ((id: string, partID?: string) => boolean) | undefined) => void
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

/** Which disclosure the work-details mode gives process groups. Only the verbose mode lays them flat. */
function stepGrouping(view: TranscriptView): "collapsed" | "none" {
  if (view === "verbose") return "none"

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
  question: { live: "ui.answer.call.question", done: "ui.answer.call.question.done" },
  todowrite: { live: "ui.answer.call.todowrite", done: "ui.answer.call.todowrite.done" },
}

/** One tool's own phrase, in the tense its state asks for. */
function toolTitle(i18n: ReturnType<typeof useI18n>, tool: Extract<NodePayload, { kind: "tool" }>["tool"], done: boolean) {
  if (toolActivity(tool) === "readImage") return i18n.t("ui.answer.tool.identifyImage")

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
function measureTopRow(
  root: HTMLDivElement,
): { key: string; offset: number; row: HTMLElement } | undefined {
  const frame = root.getBoundingClientRect()

  if (frame.height <= 0) return undefined

  // Ask the hit test what is under the top edge instead of measuring every loaded row: the transcript is fully
  // rendered, so a per-frame scan over thousands of boxes is the scroll cost the reader would feel.
  let row: HTMLElement | undefined

  if (typeof document.elementsFromPoint === "function") {
    const x = frame.left + frame.width / 2
    const y = frame.top + 1

    for (const element of document.elementsFromPoint(x, y)) {
      if (!(element instanceof HTMLElement) || !root.contains(element)) continue

      const candidate = element.closest<HTMLElement>("[data-answer-key]")

      if (candidate && root.contains(candidate) && candidate.getBoundingClientRect().bottom > frame.top + 1) {
        row = candidate
        break
      }
    }
  }

  if (!row) {
    // A sticky header or an overlay can cover the edge; fall back to the first row that spans it.
    row = [...root.querySelectorAll<HTMLElement>("[data-answer-key]")].find((node) => {
      const rect = node.getBoundingClientRect()

      return rect.bottom > frame.top + 1 && rect.top <= frame.top + 1
    })
  }

  const key = row?.dataset.answerKey

  if (!row || !key) return undefined

  return { key, offset: frame.top - row.getBoundingClientRect().top, row }
}

export function AnswerPage(props: AnswerPageProps) {
  // A streamed delta arrives many times a second, and every one of them would reproject the whole transcript. The
  // projection is linear in the transcript, so a long session would spend the frame budget on snapshots nobody sees.
  // Fold the deltas into one projection per animation frame; the reader still gets every new state, just once per paint.
  const [messages, setMessages] = createSignal<readonly SessionMessageInfo[]>(props.messages())
  let latestMessages = props.messages()
  let messagesQueued = false

  createEffect(() => {
    latestMessages = props.messages()

    if (messagesQueued) return
    messagesQueued = true
    requestAnimationFrame(() => {
      messagesQueued = false
      setMessages(latestMessages)
    })
  })

  // The previous projection is passed back in so unchanged rows keep their payload object: a streamed
  // delta then only invalidates the row it touched instead of every memo in the transcript.
  const snapshot = createMemo<Snapshot>((previous) => projectTimeline(messages(), previous))
  const [folded, setFolded] = createStore<Record<string, boolean | undefined>>({})
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

  const entryKey = (entry: TimelineEntry) => (entry.kind === "fold" ? entry.key : `node:${entry.key}`)

  const entries = createMemo(() => snapshot().entries)
  const keys = createMemo(() => entries().map(entryKey))
  const index = createMemo(() => new Map(entries().map((entry) => [entryKey(entry), entry] as const)))
  const running = createMemo(() => [...snapshot().turns.values()].findLast((turn) => turn.status === "open"))

  const rowIndex = createMemo(() => new Map(keys().map((key, position) => [key, position] as const)))
  const rowGaps = createMemo(() => entries().map((_, position) => flowGapPx(snapshot(), entries(), position)))

  // Every row keeps its box in the document, so a restore, a position report or a reveal still reads a real offset for
  // any row. Only the rows near the viewport render their content; the rest reserve the height they last measured at.
  // A long transcript therefore keeps its true height while the live DOM holds a window of rows instead of all of them.
  const heights = new Map<string, number>()
  const [measured, setMeasured] = createSignal(0)
  const [near, setNear] = createStore<Record<string, boolean | undefined>>({})
  const forced = new Set<string>()
  const [forcedVersion, setForcedVersion] = createSignal(0)
  const [observer, setObserver] = createSignal<IntersectionObserver>()

  let measuredQueued = false

  const resize = new ResizeObserver((records) => {
    let changed = false

    for (const record of records) {
      const element = record.target as HTMLElement
      const key = element.dataset.answerKey

      if (!key) continue
      const height = record.borderBoxSize?.[0]?.blockSize ?? element.offsetHeight

      if (height <= 0 || heights.get(key) === height) continue
      heights.set(key, height)
      changed = true
    }

    // One bump per frame: a streamed row grows every frame, and every row that reads its reserved height depends on it.
    if (!changed || measuredQueued) return
    measuredQueued = true
    requestAnimationFrame(() => {
      measuredQueued = false
      setMeasured((version) => version + 1)
    })
  })

  onCleanup(() => resize.disconnect())

  createEffect(() => {
    const root = props.viewport?.()

    if (!root) return
    const next = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          const key = (record.target as HTMLElement).dataset.answerKey

          if (key) setNear(key, record.isIntersecting)
        }
      },
      // A screen of overscan each way mounts a row before it reaches an edge, so scrolling rarely meets a placeholder.
      { root, rootMargin: "800px 0px" },
    )

    setObserver(next)
    onCleanup(() => next.disconnect())
  })

  const lastTurn = () => Math.max(...[...snapshot().turns.keys()])

  // Turns are numbered by their position in the loaded window, so paging an older page in shifts every existing
  // number. The disclosure state has to be keyed by the row's own key, which survives that shift.
  const foldKeys = createMemo(() => {
    const map = new Map<number, string>()

    for (const entry of entries()) if (entry.kind === "fold") map.set(entry.turn, entry.key)

    return map
  })

  const isFolded = (key: string | undefined) => {
    const entry = key ? index().get(key) : undefined

    if (!entry || entry.kind !== "fold" || !key) return false
    const value = snapshot().turns.get(entry.turn)

    if (!value || value.status !== "closed" || view() === "verbose") return false
    const explicit = folded[key]

    if (explicit !== undefined) return explicit

    if ((props.collapseTiming ?? "completion") === "next-input" && entry.turn === lastTurn()) return false

    return true
  }

  // This page never holds a scroll position. `AnswerTimeline` owns that: its follow state decides when the newest
  // content is kept in view, and the browser's own anchoring keeps a reader's row while content above it changes
  // height. What this page contributes is the reader's place, so the next activation can put them back there.
  const reportPosition = () => {
    const root = props.viewport?.()
    const measured = root ? measureTopRow(root) : undefined

    if (measured) props.onPositionChange?.({ key: measured.key, offset: measured.offset })
  }

  const findRow = (root: HTMLElement, key: string) =>
    [...root.querySelectorAll<HTMLElement>("[data-answer-key]")].find((node) => node.dataset.answerKey === key)

  const rowInView = (root: HTMLElement, row: HTMLElement) => {
    const frame = root.getBoundingClientRect()
    const box = row.getBoundingClientRect()

    return box.bottom > frame.top && box.top < frame.bottom
  }

  // A turn that finishes under the reader's eyes stays open: folding it takes the steps they are reading with it. The
  // decision is made once, on the frame the turn closes, so scrolling later never reopens a turn already folded.
  let lastRunning: number | undefined

  // A step the reader opened inside a turn is what they are reading. It keeps the turn open when the turn settles,
  // even with the turn's own header scrolled out of view, because folding it would take the opened step away.
  const readerOpenedTurn = (turn: number) => {
    const inTurn = (key: string) => snapshot().nodes.get(key)?.turn === turn
    const groups = snapshot().groups
    // A group's members all belong to one turn, so any member decides.
    const inTurnGroup = (key: string) => groups.get(key)?.members.some(inTurn) ?? false

    const inTurnRepeat = (key: string) =>
      [...groups].some(([group, value]) => key.startsWith(`repeat:${group}:`) && value.members.some(inTurn))

    return (
      Object.entries(openGroups).some(([key, open]) => open === true && inTurnGroup(key)) ||
      Object.entries(openRows).some(([key, open]) => open === true && (inTurn(key) || inTurnRepeat(key)))
    )
  }

  createEffect(() => {
    const open = running()
    const finished = lastRunning

    lastRunning = open?.turn

    if (finished === undefined || finished === open?.turn) return
    const key = foldKeys().get(finished)
    const root = props.viewport?.()

    if (!key || !root) return
    const row = findRow(root, key)

    if (!row) return

    if (!rowInView(root, row) && !readerOpenedTurn(finished)) return

    setFolded(key, false)
  })

  // A restore attempt belongs to one activation: it waits for the DOM insert, then places the remembered row once.
  let pendingRestore: { key: string; offset: number } | undefined
  // One scroll per attempt: it brings the remembered row into reach, and the retry after it places the row exactly.
  let restoreScrolled = false
  const [restoreState, setRestoreState] = createSignal<RestoreState>(createRestoreState())
  // How long a restore waits for the transcript to page in the remembered row before it gives up and lands at the
  // end. The first page of a session is smaller than the transcript, so a row the reader left is routinely absent on
  // the activation frame; treating that as a miss dropped them at the newest content and then left them there.
  const RESTORE_LOAD_MS = 1500
  let missTimer: ReturnType<typeof setTimeout> | undefined

  const cancelMiss = () => {
    if (missTimer !== undefined) clearTimeout(missTimer)
    missTimer = undefined
  }

  const dispatchRestore = (event: RestoreEvent) => {
    const current = restoreState()
    const next = transitionRestore(current, event)

    if (next !== current) setRestoreState(next)
    // A miss is final for this activation: the host lands on the newest content and holds the remembered row.
    if (next === "missed") props.onRestoreMiss?.()
  }

  // Where the remembered row would put the top edge, and whether the loaded height can scroll that far. A row can be
  // present while its offset is not: a folded process row, markdown still rendering, or a page that changed the height
  // above it. Writing such an offset only clamps, parking the reader at the top of a shorter transcript.
  const placement = (root: HTMLDivElement, target: { key: string; offset: number }) => {
    const row = findRow(root, target.key)

    if (!row) return undefined

    const wanted = root.scrollTop + row.getBoundingClientRect().top - root.getBoundingClientRect().top + target.offset
    const scrollTop = Math.min(Math.max(wanted, 0), Math.max(0, root.scrollHeight - root.clientHeight))

    // A target above the top edge is the closest the loaded height gets, not a shorter transcript; only a target past
    // the last offset means the content above or below the row is not there to scroll through.
    return { scrollTop, reachable: wanted <= 0 || Math.abs(wanted - scrollTop) <= 1 }
  }

  // Every loaded row is in the DOM, so the remembered row is placed from its own measured box in one write. Nothing
  // above it is an estimate that will later change, so the write is final and needs no pin.
  const attemptRestore = () => {
    const root = props.viewport?.()

    if (!root || keys().length === 0) return
    if (restoreState() !== "idle") return

    const target = pendingRestore

    if (!target) {
      dispatchRestore({ type: "activate" })

      // No remembered row: the view opens at the newest content, and the timeline's own landing keeps the end in view.
      // This page writes no position here.

      return
    }

    // An unmounted row stands in with its reserved height, and a row far from the viewport is out of reach of the
    // current offset. Both are resolved the same way: scroll to the row's box, mount it, and place again next frame,
    // when the real box exists and the offset is exact.
    const row = findRow(root, target.key)
    const placed = placement(root, target)

    if (row && (!placed?.reachable || row.childElementCount === 0) && !restoreScrolled) {
      const wanted = root.scrollTop + row.getBoundingClientRect().top - root.getBoundingClientRect().top + target.offset

      restoreScrolled = true
      forced.add(target.key)
      setForcedVersion((version) => version + 1)

      const next = Math.min(Math.max(wanted, 0), Math.max(0, root.scrollHeight - root.clientHeight))

      if (Math.abs(next - root.scrollTop) > 1) root.scrollTop = next
      requestAnimationFrame(() => {
        if (restoreState() === "idle") attemptRestore()
      })

      return
    }

    // A missing row (an older page) and an offset the current height cannot reach (a folded or still-rendering row)
    // both wait for the transcript to grow enough. Writing the clamped offset instead would record the top of the
    // shortened transcript as the reader's place, so every later activation opened at the first row.
    if (!placed?.reachable) {
      missTimer ??= setTimeout(() => {
        missTimer = undefined

        if (restoreState() !== "idle") return
        const current = props.viewport?.()

        if (current && placement(current, target)?.reachable) return attemptRestore()

        dispatchRestore({ type: "miss" })
      }, RESTORE_LOAD_MS)

      return
    }

    dispatchRestore({ type: "activate" })

    if (Math.abs(placed.scrollTop - root.scrollTop) > 1) root.scrollTop = placed.scrollTop

    // Record the row the reader was put back on, so the next activation restores the same place.
    props.onPositionChange?.(target)
  }

  createRenderEffect(
    on(
      () => props.active?.() !== false,
      (isActive) => {
        if (!isActive) return

        // A new activation invalidates the previous attempt: its decision and its remembered row.
        cancelMiss()
        dispatchRestore({ type: "reset" })
        pendingRestore = props.restore?.()
        restoreScrolled = false
        // Run after the DOM insert this activation triggers but before the browser paints and dispatches the scroll
        // event the reinsertion causes. That event reports the clamped offset as "arrived at the end", which would
        // otherwise pull a restored middle row back to the bottom.
        queueMicrotask(attemptRestore)
      },
      { defer: false },
    ),
  )

  // Only the reader's own movement is recorded here. Every write belongs to the timeline, so nothing in this page can
  // fight its landing or drag a reader who did not move.
  createEffect(() => {
    const root = props.viewport?.()

    if (!root) return

    let frame: number | undefined

    // Detaching zeroes scrollTop, which is not the reader scrolling to the top.
    const onScroll = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        if (!root.isConnected) return
        // A following view sits at the end, and that place is already remembered as the end. Measuring its top row on
        // every streamed frame would force a layout per frame for a position nothing reads.
        if (props.following?.() === true) return
        // An activation that still waits for its remembered row has not decided where the reader belongs. The
        // reinsertion clamps the view to the top, and saving that would replace the position the restore needs.
        if (pendingRestore && restoreState() === "idle") return
        reportPosition()
      })
    }

    root.addEventListener("scroll", onScroll, { passive: true })

    onCleanup(() => {
      root.removeEventListener("scroll", onScroll)
      if (frame !== undefined) cancelAnimationFrame(frame)
    })
  })

  // A page-in adds keys; the remembered row may be among them, so give the restore another chance once rows exist.
  createEffect(() => {
    keys()
    untrack(attemptRestore)
  })

  createEffect(() => {
    if (!running()) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)

    onCleanup(() => window.clearInterval(timer))
  })

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

      if (!owner || owner.status !== "closed" || !isFolded(foldKeys().get(owner.turn))) return value

      if (value.anchor === owner.answer) return value

      return undefined
    })

    const turn = createMemo(() => {
      const value = entry()

      return value?.kind === "fold" ? snapshot().turns.get(value.turn) : undefined
    })

    const mounted = () => {
      // Without a viewport this transcript is not a scrolling surface (a story, an embedded excerpt): render all of it.
      if (props.viewport === undefined) return true
      forcedVersion()

      if (forced.has(key) || near[key] === true) return true

      // The newest rows stay mounted, so a view opened at the end is exact before the observer has reported anything.
      return position() >= keys().length - ROW_TAIL
    }

    // A row that has not been measured yet reserves an estimate built from its kind and its text; the transcript
    // corrects it as soon as the reader scrolls the row into view and it mounts for real.
    const reserved = () => {
      measured()
      const known = heights.get(key)

      if (known !== undefined) return known
      const gap = rowGaps()[position()] ?? 0
      const value = entry()
      const payload = value?.kind === "node" ? snapshot().nodes.get(value.key)?.payload : undefined

      if (!payload) return gap + ROW_ESTIMATE.fold
      if (payload.kind === "input") return gap + textEstimate(ROW_ESTIMATE.input, payload.text)
      if (payload.kind === "assistant") return gap + textEstimate(ROW_ESTIMATE.answer, payload.text)

      return gap + ROW_ESTIMATE.row
    }

    const [row, setRow] = createSignal<HTMLDivElement>()

    // Observe the row's own box so its last height survives the content unmounting, and let the observer decide when
    // the content comes back. Both run per row because a row is created once and then only mounts or unmounts.
    createRenderEffect(() => {
      const element = row()

      if (!element) return
      const current = observer()

      resize.observe(element)
      current?.observe(element)
      onCleanup(() => {
        resize.unobserve(element)
        current?.unobserve(element)
      })
    })

    return (
      <div
        ref={setRow}
        data-answer-key={key}
        class="select-text"
        style={{
          "padding-top": `${rowGaps()[position()] ?? 0}px`,
          ...(mounted() ? {} : { height: `${reserved()}px`, "box-sizing": "border-box", overflow: "hidden" }),
        }}
      >
        <Show when={mounted()}>
          <Show when={visibleNode()}>
            {(value) => (
              <NodeRow node={value()} view={view()} live={snapshot().turns.get(value().turn)?.status === "open"} />
            )}
          </Show>
          <Show when={turn()}>
            {(value) => (
              <FoldRow
                turn={value()}
                open={!isFolded(key)}
                snapshot={snapshot()}
                view={view()}
                foldedReplies={props.foldedReplies ?? "final"}
                now={now()}
                groupOpen={(key) => openGroups[key]}
                toggleGroup={(key, next) => setOpenGroups(key, next)}
                onToggle={() => setFolded(key, !isFolded(key))}
              />
            )}
          </Show>
        </Show>
      </div>
    )
  }

  // A search hit or a jump to a prompt names a message, not a row, and that row's content may sit outside the mounted
  // window. Expand what hides it, mount the entry that owns it, and scroll to it once the mounting frame has laid out.
  const reveal = (id: string, partID?: string) => {
    const root = props.viewport?.()

    if (!root) return false
    const node = [...snapshot().nodes.values()].find((value) =>
      partID ? value.partID === partID : value.messageID === id,
    )

    if (!node) return false

    // A top-level row is its own entry; a step lives inside the fold entry of its turn.
    const entry = keys().find((key) => key === `node:${node.key}`) ?? foldKeys().get(node.turn)

    if (!entry) return false
    setFolded(entry, false)

    const group = [...snapshot().groups].find(([, value]) => value.members.includes(node.key))

    if (group) setOpenGroups(group[0], true)
    setOpenRows(node.key, true)
    forced.add(entry)
    setForcedVersion((version) => version + 1)

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const row = [...root.querySelectorAll<HTMLElement>("[data-timeline-part-id], [data-message-id]")].find(
          (element) => (partID ? element.dataset.timelinePartId === partID : element.dataset.messageId === id),
        )

        row?.scrollIntoView?.({ block: "center" })
        // The scroll leaves the row in view, so the observer keeps it mounted; hold the force until that report lands.
        setTimeout(() => {
          forced.delete(entry)
          setForcedVersion((version) => version + 1)
        }, 1000)
      }),
    )

    return true
  }

  onMount(() => props.setReveal?.(reveal))
  onCleanup(() => props.setReveal?.(undefined))

  return (
    <MessageActionsContext.Provider value={{ sessionID: props.sessionID, actions: props.actions }}>
      <RowDisclosureContext.Provider
        value={{
          open: (key) => openRows[key],
          toggle: (key, next) => setOpenRows(key, next),
        }}
      >
        <div class={`answer-scope flex flex-col ${props.class ?? ""}`} data-component="answer-page">
          <div class="mx-auto flex w-full max-w-[var(--container-session,840px)] flex-col px-4 pt-4 pb-10">
            <For each={keys()}>{(key) => renderEntry(key)}</For>
          </div>
        </div>
      </RowDisclosureContext.Provider>
    </MessageActionsContext.Provider>
  )
}

function RunningStatus(props: { elapsedMs?: number }) {
  const i18n = useI18n()

  const label = () => i18n.t("ui.answer.workingPrefix")

  return (
    <div
      role="status"
      data-slot="answer-running"
      class="relative flex min-h-[33px] min-w-0 w-full flex-col items-start justify-center border-b-[0.5px] border-v2-border-border-muted pb-2 text-[length:var(--content-font-size,14px)] leading-[24px]"
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

/** Turn spacing: process rows 4px, a user message 16px, an assistant response 16px, a process head 12px. */
/**
 * The leading gap of one row in pixels. It is padding inside the row box rather than a margin, so the
 * measured border box already covers it and the window offsets stay exact.
 */
function flowGapPx(snapshot: Snapshot, entries: readonly TimelineEntry[], index: number) {
  if (index <= 0) return 0

  const current = entries[index]
  const previous = entries[index - 1]

  if (!current || !previous) return 0

  // A prompt block ends a reader's own thought; the answer that follows starts a new one. The gap is a touch wider
  // than the 16px block rhythm because the prompt's action line already sits inside that space.
  if (previous.kind === "node" && snapshot.nodes.get(previous.key)?.payload.kind === "input") return 20

  if (current.kind === "fold") return 12

  if (isResponse(snapshot, current) || isResponse(snapshot, previous)) return 16

  return 4
}

// How many of the newest rows stay mounted regardless of where the reader is; a view opened at the end must be exact
// before the observer has reported anything.
const ROW_TAIL = 8

// Heights for a row whose content has never been mounted. They only need to be close: the row replaces its estimate the
// first time the reader reaches it, and the transcript's own anchoring keeps the reader's line while that happens.
const ROW_ESTIMATE = { row: 56, fold: 48, input: 44, answer: 40, lineHeight: 22, charsPerLine: 46 }

/** A rough height for a block of body text at the answer width, capped so one long answer cannot swamp the estimate. */
function textEstimate(base: number, text: string) {
  return base + Math.min(2400, Math.ceil(text.length / ROW_ESTIMATE.charsPerLine) * ROW_ESTIMATE.lineHeight)
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
  groupOpen: (key: string) => boolean | undefined
  toggleGroup: (key: string, next: boolean) => void
  onToggle: () => void
}) {
  const grouping = () => stepGrouping(props.view)
  const expandable = () => props.turn.status === "closed" && grouping() !== "none"
  const open = () => (expandable() ? props.open : true)

  // A fold hides the turn's rows; the reader's own disclosure state survives it, so reopening the
  // turn shows the same rows they had opened.

  // Only the verbose mode lays the process rows flat. Every other mode keeps each step's own
  // disclosure, so a step opens itself while it runs and closes when it settles.
  const flat = () => grouping() === "none"

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
                    // A group with one row has nothing to summarize: a heading around it would restate that row
                    // and opening it would show the same line twice. Lay the row itself down instead.
                    const solo = createMemo(() => {
                      const items = group()?.items

                      return items?.length === 1 && items[0].kind === "row" ? items[0] : undefined
                    })

                    return (
                      <Show when={group()}>
                        {(groupValue) => (
                          <Show
                            when={solo()}
                            fallback={
                              <GroupSeat
                                group={groupValue()}
                                snapshot={props.snapshot}
                                view={props.view}
                                flat={flat()}
                                open={props.groupOpen(key)}
                                onToggle={(next) => props.toggleGroup(key, next)}
                              />
                            }
                          >
                            {(item) => (
                              <GroupItemRow
                                item={item()}
                                snapshot={props.snapshot}
                                view={props.view}
                                live={!groupValue().closed}
                              />
                            )}
                          </Show>
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

/** Where each capped group's reader stopped. Virtualization unmounts remote rows, so the component cannot own this. */
const groupScrollTops = new Map<string, number>()

/** L1: one contiguous work run, its own disclosure and verb-phrase title. */
function GroupSeat(props: {
  group: TimelineGroup
  snapshot: Snapshot
  view: TranscriptView
  flat: boolean
  open?: boolean
  onToggle: (next: boolean) => void
}) {
  const i18n = useI18n()
  const rows = useContext(RowDisclosureContext)
  const live = () => !props.group.closed

  // A step opens itself while it runs and closes when it settles, unless the reader set it themselves. A row the
  // reader opened inside it counts too: settling the step must not fold away what they are reading.
  const readerOpened = () =>
    props.group.members.some((key) => rows?.open(key) === true) ||
    props.group.items.some((item) => item.kind === "repeat" && rows?.open(item.key) === true)

  const open = () => props.open ?? (live() || readerOpened())

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
  let body: HTMLDivElement | undefined
  let scrolled: HTMLDivElement | undefined
  let observer: ResizeObserver | undefined
  const [edges, setEdges] = createSignal({ up: false, down: false })
  const [overflowing, setOverflowing] = createSignal(false)

  // Every open group's body is the scrollport, running or settled; verbose lays rows out flat, so it keeps the cap
  // off. No size threshold: a short group simply does not overflow its cap, so it looks exactly as it did before.
  const capped = () => !props.flat && open()

  // Only a body that actually overflows becomes a keyboard-reachable region and reserves a scrollbar gutter.
  const panel = () => capped() && overflowing()

  // Follow intent, not an animation: a running group stays at its newest row while content grows, and the reader
  // takes it over simply by scrolling away from the bottom. A settled group never moves on its own.
  const [following, setFollowing] = createSignal(!props.group.closed)

  const stick = () => {
    const element = body

    if (!element || !following()) return
    element.scrollTop = element.scrollHeight
  }

  const reportEdges = () => {
    const element = body

    if (!element) return
    const floor = Math.max(0, element.scrollHeight - element.clientHeight)
    const next = { up: element.scrollTop > 1, down: element.scrollTop < floor - 1 }

    setOverflowing(floor > 0)

    setEdges((previous) => (previous.up === next.up && previous.down === next.down ? previous : next))

    if (props.group.closed && capped()) groupScrollTops.set(props.group.key, element.scrollTop)
  }

  // Intent follows the position: the same rule reads a programmatic stick and the reader's own scrolling, so no
  // source flag can be left stale by a wheel event that moved nothing.
  const onScroll = () => {
    const element = body

    if (!element) return
    const floor = Math.max(0, element.scrollHeight - element.clientHeight)

    setFollowing(element.scrollTop >= floor - 1)
    reportEdges()
  }

  const bind = (element: HTMLDivElement) => {
    if (scrolled === element && observer) return
    observer?.disconnect()
    scrolled = element

    if (typeof ResizeObserver === "undefined") return
    observer = new ResizeObserver(() => {
      // Settle at the bottom before reporting, so the edge fades describe the position the reader ends up at.
      stick()
      reportEdges()
    })
    observer.observe(element)
    // The body is the scrollport; growth happens in the uncapped content box inside it.

    if (element.firstElementChild) observer.observe(element.firstElementChild)
    reportEdges()
  }

  const attach = (element: HTMLDivElement) => {
    body = element
    // Read the stored offset before binding: the first measurement would otherwise report 0 and overwrite it.
    const saved = groupScrollTops.get(props.group.key)
    bind(element)

    // A running group opens at its newest row (the observer sticks it once laid out); a settled one resumes where
    // the reader left it, since its content no longer changes.
    if (!props.group.closed || saved === undefined) return
    requestAnimationFrame(() => {
      if (body !== element || !capped()) return
      element.scrollTop = Math.min(saved, Math.max(0, element.scrollHeight - element.clientHeight))
      reportEdges()
    })
  }

  createEffect(() => {
    // The body is already mounted when the cap first applies; rebind so the observer follows the current element.
    open()
    capped()

    if (body?.isConnected) bind(body)
  })

  onCleanup(() => observer?.disconnect())

  return (
    <section
      data-slot="answer-group"
      data-state={open() ? "open" : "closed"}
      data-process-activity={activity()}
      class="flex flex-col"
    >
      <button
        type="button"
        data-process-activity={activity()}
        aria-expanded={open()}
        aria-controls={bodyID}
        hidden={props.flat}
        class="group/heading flex min-w-0 w-full items-center gap-[6px] text-start text-[length:var(--content-font-size,14px)] leading-[24px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
        style={{ color: "var(--answer-ink-tertiary)" }}
        onClick={(event) => {
          event.currentTarget.focus()
          props.onToggle(!open())
        }}
      >
        <span class="flex min-w-0 items-center" data-slot="answer-group-leading">
          <LeadingSlot icon={<FlowIcon name={icon()} />} open={open()} scope="heading" />
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
      <Show when={props.flat || open()}>
        <div
          id={bodyID}
          data-slot="answer-group-body"
          data-capped={capped() ? "" : undefined}
          data-overflowing={panel() ? "" : undefined}
          data-can-scroll-up={edges().up ? "" : undefined}
          data-can-scroll-down={edges().down ? "" : undefined}
          tabIndex={panel() ? 0 : undefined}
          role={panel() ? "region" : undefined}
          aria-label={panel() ? i18n.t("ui.scrollView.ariaLabel") : undefined}
          ref={attach}
          onScroll={onScroll}
          class="answer-group-body"
        >
          <div class={props.flat ? "flex flex-col gap-1" : "answer-tree flex flex-col gap-1 pt-1"}>
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
        class="flex min-h-[33px] min-w-0 w-full items-center gap-1.5 border-b-[0.5px] border-v2-border-border-strong pb-2 text-start text-[length:var(--content-font-size,14px)] leading-[normal] disabled:cursor-default enabled:hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
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
        messageID={props.node.messageID ?? ""}
        cacheKey={key}
        view={props.view}
        live={props.live}
        rowOpen={rows?.open(key)}
        onToggleRow={rows ? (next) => rows.toggle(key, next) : undefined}
      />
    </div>
  )
}

// A prompt past 12 lines shows its first 8, matching the conversation surface's fold: a fold always hides at
// least 5 lines, so a prompt just past the limit never folds away a line or two.
const INPUT_FOLD = { over: 12, show: 8 }

/** The prompt bubble. A long prompt folds to its first lines and keeps the rest behind a Read more toggle. */
function InputBubble(props: { text: string; cacheKey: string; messageID: string; createdAt: number }) {
  const i18n = useI18n()
  const messageActions = useContext(MessageActionsContext)
  const rows = useContext(RowDisclosureContext)
  // The reader's disclosure lives in the page's store, so a streamed projection rebuild keeps it open.
  const expanded = () => rows?.open(props.cacheKey) === true
  // Hard line breaks are a floor on the laid-out lines, so most long prompts fold before the bubble is measured.
  const [lines, setLines] = createSignal(props.text.trimEnd().split("\n").length)
  const long = () => lines() > INPUT_FOLD.over
  const folded = () => long() && !expanded()

  let content: HTMLDivElement | undefined

  // The prompt is laid out whole and clipped, so its own height is the measure at any width.
  const measure = () => {
    if (!content?.isConnected || content.offsetHeight === 0) return
    const lineHeight = parseFloat(getComputedStyle(content).lineHeight) || 22
    setLines(Math.round(content.offsetHeight / lineHeight))
  }

  onMount(() => {
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content!)
    onCleanup(() => observer.disconnect())
  })

  return (
    <div data-slot="user-message-body" class="flex w-fit max-w-[min(82%,64ch)] flex-col items-end ms-auto">
      <div
        dir="auto"
        data-slot="user-message-text"
        class="inline-block max-w-full overflow-hidden whitespace-pre-wrap rounded-[14px] bg-v2-background-bg-layer-02 px-3 py-2 text-[length:var(--content-font-size,14px)] leading-[calc(var(--content-font-size,14px)+8px)] [overflow-wrap:anywhere] [unicode-bidi:plaintext]"
        style={{ color: "var(--answer-ink)" }}
      >
        <div
          data-slot="user-message-fold"
          data-folded={folded() ? "" : undefined}
          style={{ "max-height": folded() ? `${INPUT_FOLD.show}lh` : undefined }}
        >
          <div ref={content}>
            <Show when={hasMarkdownSyntax(props.text)} fallback={<>{props.text}</>}>
              <Markdown text={props.text} cacheKey={`${props.cacheKey}:input`} class="answer-input-markdown" />
            </Show>
          </div>
        </div>
        <Show when={long()}>
          <button
            type="button"
            data-slot="user-message-fold-toggle"
            aria-expanded={expanded()}
            onClick={() => rows?.toggle(props.cacheKey, !expanded())}
          >
            <span>{i18n.t(expanded() ? "ui.message.showLess" : "ui.message.readMore")}</span>
            <Icon name="chevron-down" size="small" />
          </button>
        </Show>
      </div>
      <UserMessageActions
        sessionID={messageActions.sessionID}
        messageID={props.messageID}
        createdAt={props.createdAt}
        actions={messageActions.actions}
        text={props.text}
      />
    </div>
  )
}

function Payload(props: {
  payload: NodePayload
  messageID: string
  cacheKey: string
  view: TranscriptView
  live: boolean
  rowOpen?: boolean
  onToggleRow?: (next: boolean) => void
}): JSX.Element {
  switch (props.payload.kind) {
    case "input":
      return (
        <InputBubble
          text={props.payload.text}
          cacheKey={props.cacheKey}
          messageID={props.messageID}
          createdAt={props.payload.created}
        />
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
      return <ErrorRow text={props.payload.text} />
    case "retry":
      return <RetryRow attempt={props.payload.attempt} text={props.payload.text} />
  }
}

/** A final step failure reads as one quiet block: a short danger title over the provider's reason. */
function ErrorRow(props: { text: string }) {
  const i18n = useI18n()

  return (
    <div
      role="alert"
      data-slot="answer-error"
      class="flex min-w-0 items-start gap-[8px] rounded-[12px] border-[0.5px] border-v2-border-border-muted bg-v2-background-bg-layer-01 px-[12px] py-[8px] text-[length:var(--content-font-size,14px)] leading-[calc(var(--content-font-size,14px)+8px)]"
    >
      <span class="mt-[2px] shrink-0 text-v2-state-fg-danger">
        <Icon name="outline-hexagonal-warning" />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span class="font-[530] text-v2-state-fg-danger">{i18n.t("ui.answer.error.title")}</span>
        <span class="min-w-0 break-words [overflow-wrap:anywhere]" style={{ color: "var(--answer-ink-secondary)" }}>
          {props.text}
        </span>
      </div>
    </div>
  )
}

/** A scheduled retry stays one line: the attempt it is on, shimmering while it waits. */
function RetryRow(props: { attempt: number; text: string }) {
  const i18n = useI18n()

  return (
    <div
      role="status"
      data-slot="answer-retry"
      class="flex min-w-0 items-center gap-[6px] text-[length:var(--content-font-size,14px)] leading-[calc(var(--content-font-size,14px)+6px)]"
      style={{ color: "var(--answer-ink-secondary)" }}
    >
      <Spinner width={18} height={18} class="size-[18px] shrink-0" />
      <span class="shrink-0 font-[530]">
        <TextShimmer text={i18n.t("ui.answer.retry", { attempt: props.attempt })} active />
      </span>
      <span class="min-w-0 truncate" style={{ color: "var(--answer-ink-tertiary)" }}>
        <bdi dir="auto">{props.text}</bdi>
      </span>
    </div>
  )
}

/** An injected context keeps its body behind a disclosure; a plain notice stays one truncated line. */
function NoticeRow(props: {
  text: string
  detail?: string
  notice?: "instructions-updated" | "system-reminder"
  cacheKey: string
  rowOpen?: boolean
  onToggleRow?: (next: boolean) => void
}) {
  const i18n = useI18n()
  const expanded = () => props.rowOpen ?? false
  const title = () =>
    props.notice === "instructions-updated"
      ? i18n.t("ui.answer.notice.instructionsUpdated")
      : props.notice === "system-reminder"
        ? i18n.t("ui.sessionTimeline.notice.systemReminder")
        : props.text

  if (!props.detail)
    return (
      <div class="flex min-w-0 items-center gap-1.5 text-[length:var(--content-font-size,14px)] leading-[24px]" style={{ color: "var(--answer-ink-tertiary)" }}>
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
                    class="flex min-w-0 items-center gap-1.5 text-[length:var(--content-font-size,14px)] leading-[calc(var(--content-font-size,14px)+6px)]"
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
        class="group/row flex min-w-0 cursor-pointer items-center gap-[6px] text-[length:var(--content-font-size,14px)] leading-[24px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
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
          <bdi dir="auto" data-slot="answer-row-title" class="min-w-0 shrink truncate">{props.title}</bdi>
          <Show when={props.summary}>
            {(value) => (
              <span
                data-slot="answer-row-summary"
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
  // Thinking never opens itself, not even while it streams; only the reader opens it, and once open it stays open.
  const expanded = () => props.rowOpen ?? false

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

/** Tools whose result is a file change, so their body reads as a diff instead of raw input and output. */
const EDIT_DIFF_TOOLS = new Set(["edit", "patch", "apply_patch"])

/**
 * The diffs a tool body shows. The recorded patch is the real file diff, with context and correct line numbers;
 * an edit that has not recorded one yet still diffs the text it was given, so a running edit reads the same way.
 */
function toolDiffs(tool: Extract<NodePayload, { kind: "tool" }>["tool"]) {
  if (!EDIT_DIFF_TOOLS.has(toolLabel(tool.name))) return []

  const metadata = "metadata" in tool.state ? tool.state.metadata : undefined
  const recorded = Array.isArray(metadata?.files) ? metadata.files.filter(changedFileDiff) : []

  if (recorded.length > 0) return recorded.map((diff) => ({ file: diff.file, fileDiff: resolveFileDiff(diff) }))

  const input = toolInput(tool)

  if (Predicate.isString(input)) return []
  const before = input.oldString
  const after = input.newString

  if (typeof before !== "string" || typeof after !== "string") return []
  const file = typeof input.path === "string" ? input.path : typeof input.filePath === "string" ? input.filePath : ""

  return [{ file, fileDiff: resolveFileDiff({ file, before, after }) }]
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

  const diffs = createMemo(() => toolDiffs(props.tool))
  const images = createMemo(() => toolImages(props.tool))

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
      <Show when={images().length > 0}>
        <div data-slot="answer-tool-images" class="mt-1 ms-[30px] flex min-w-0 flex-col gap-2">
          <For each={images()}>{(image) => <ToolImage image={image} />}</For>
        </div>
      </Show>
      <Show when={!failed() && diffs().length > 0}>
        <div
          data-slot="answer-diff"
          class="mt-1 ms-[30px] flex min-w-0 flex-col gap-2 overflow-hidden rounded-[12px] border-[0.5px] border-v2-border-border-muted"
          style={{
            "--diffs-code-font-size": "11px",
            "--diffs-code-line-height": "19px",
          }}
        >
          <For each={diffs()}>
            {(entry) => (
              <div data-slot="answer-diff-file" class="flex min-w-0 flex-col">
                <Show when={diffs().length > 1}>
                  <span
                    class="truncate px-3 pt-[6px] font-mono text-[11px] leading-[19px]"
                    style={{ color: "var(--answer-ink-tertiary)" }}
                  >
                    {entry.file}
                  </span>
                </Show>
                <File
                  mode="diff"
                  fileDiff={entry.fileDiff}
                  virtualize={false}
                  diffIndicators="classic"
                  overflow="scroll"
                  hunkSeparators={entry.fileDiff.isPartial ? "simple" : "line-info-basic"}
                />
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={failed() || (diffs().length === 0 && images().length === 0)}>
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
          <section data-slot="answer-io-output" class="flex flex-col gap-1" data-error={failed() ? "" : undefined}>
            <div data-slot="answer-io-output-head" class="flex min-w-0 items-center justify-between gap-2">
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
              data-slot="answer-io-output-text"
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
      </Show>
    </DisclosureRow>
  )
}

/**
 * One image a tool returned, shown under its open row. A server-local path is read through the markdown image
 * loader; data, http(s) and blob sources are already renderable. Only the open row mounts it, so collapsed
 * history loads no pixels.
 */
function ToolImage(props: { image: ReturnType<typeof toolImages>[number] }) {
  const i18n = useI18n()
  const markdown = useMarkdown()
  const preview = createImagePreview()
  const [url, setUrl] = createSignal<string>()
  const [broken, setBroken] = createSignal(false)
  let root!: HTMLDivElement
  let objectUrl: string | undefined

  const name = () => props.image.name ?? i18n.t("ui.message.attachment.alt")
  const kind = () => i18n.t("ui.fileMedia.kind.image")

  createEffect(() => {
    const uri = props.image.uri
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    setBroken(false)

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = undefined
    }

    // A read result points at its file with a `file:` URL, which the host's local image loader refuses as a scheme.
    const path = localImagePath(uri)

    if (!path || !markdown?.readImage) {
      if (/^(data|blob|https?):/i.test(uri)) {
        setUrl(uri)

        return
      }

      setBroken(true)

      return
    }

    setUrl(undefined)
    void markdown
      .readImage(path, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return

        if (!blob) {
          setBroken(true)

          return
        }

        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!controller.signal.aborted) setBroken(true)
      })
  })

  onCleanup(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  })

  createEffect(() => {
    if (url()) preview(root)
  })

  return (
    <div
      ref={root}
      data-slot="answer-tool-image"
      class="w-fit max-w-full overflow-hidden rounded-[12px] border-[0.5px] border-v2-border-border-muted"
      style={{ background: "var(--answer-surface)" }}
    >
      <Show
        when={broken() ? undefined : url()}
        fallback={
          <div
            data-slot="answer-tool-image-state"
            class="flex h-[180px] w-[320px] items-center justify-center text-[11px] leading-[19px]"
            style={{ color: "var(--answer-ink-tertiary)" }}
          >
            {broken()
              ? i18n.t("ui.fileMedia.state.unavailable", { kind: kind() })
              : i18n.t("ui.fileMedia.state.loading", { kind: kind() })}
          </div>
        }
      >
        {(src) => (
          <img
            data-slot="answer-tool-image-thumb"
            src={src()}
            alt={name()}
            class="block max-h-[360px] w-auto max-w-full cursor-zoom-in object-contain"
            onError={() => setBroken(true)}
          />
        )}
      </Show>
    </div>
  )
}


/** The one-line summary a reasoning row previews beside its title. */
function reasoningPreview(text: string, streaming: boolean) {
  const blocks = text.split(/\n\s*\n/).filter((block) => block.trim())

  if (streaming) return blocks.at(-1)?.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").trim()

  return blocks[0]?.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").trim()
}
