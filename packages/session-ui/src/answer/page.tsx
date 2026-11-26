import { For, Show, createContext, createEffect, createMemo, createRenderEffect, createSignal, createUniqueId, on, onCleanup, onMount, untrack, useContext, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Predicate } from "effect"
import { mediaHashFromUri, type PromptAgentAttachment, type PromptAttachment, type PromptSkillAttachment, type SessionMessageAssistant, type SessionMessageInfo } from "@aicraft/client/promise"
import { DiffChanges } from "@aicraft/ui/diff-changes"
import { FileIcon } from "@aicraft/ui/file-icon"
import { getDirectory, getFilename } from "@aicraft/util/path"
import { Icon } from "@aicraft/ui/icon"
import { isIconName, type IconName } from "@aicraft/ui/icons/catalog"
import { IconButton } from "@aicraft/ui/icon-button"
import { Tooltip } from "@aicraft/ui/tooltip"
import { TextShimmer } from "@aicraft/ui/text-shimmer"
import { Spinner } from "@aicraft/ui/spinner"
import { useI18n, type UiI18nOrdinaryKey } from "@aicraft/ui/context/i18n"
import { hasMarkdownSyntax, Markdown } from "../components/markdown"
import { HighlightedText } from "../components/highlighted-text"
import { writeClipboard } from "../components/markdown-clipboard"
import { UserMessageActions } from "../message/user-message-actions"
import { agentLabel } from "../message/agent-label"
import type { SessionUserActions } from "../actions"
import { File } from "../components/file"
import { changedFileDiff } from "../components/apply-patch-file"
import { resolveFileDiff } from "../components/session-diff"
import { createImagePreview } from "../components/image-preview"
import { localImagePath } from "../components/markdown-image"
import { DataContext } from "../context/data"
import { useMarkdown } from "../context/markdown"
import { flowGapPx, projectTimeline } from "./project"
import { toolActivity, toolDescription, toolError, toolImagePath, toolImages, toolInput, toolLabel, toolMark, toolOutput } from "./tool"
import {
  createRestoreState,
  transitionRestore,
  type RestoreEvent,
  type RestoreState,
} from "./restore-machine"
import type {
  ChangedFile,
  ContextSource,
  GroupItem,
  NodePayload,
  ProcessActivity,
  Snapshot,
  TimelineChild,
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

/**
 * What the reply footer needs from the page's projection: the durable assistant message that carries the model and
 * agent, and the reply that closes each settled turn.
 */
type ReplyMeta = {
  assistant: (messageID: string) => SessionMessageAssistant | undefined
  closingReply: (turn: number) => string | undefined
}

const ReplyMetaContext = createContext<ReplyMeta>({
  assistant: () => undefined,
  closingReply: () => undefined,
})

export interface AnswerPageProps {
  readonly messages: () => readonly SessionMessageInfo[]
  /**
   * Inputs still waiting behind the active turn. A background wake that has not been delivered yet
   * keeps riding the turn above instead of opening its block, as the row path does.
   */
  readonly pendingInputIDs?: () => ReadonlySet<string> | undefined
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
  /**
   * The host's restore gate is up and owns the visible offset. While a gate may still be opening, a page-in must
   * not place the remembered row: that write would paint before the activation hides it and read as a jump.
   */
  readonly restorePending?: () => boolean
  /**
   * The host is fetching the page that holds the remembered row: the miss watchdog waits for that result instead of
   * judging the row lost while an anchor request is still in flight.
   */
  readonly restoreSeeking?: () => boolean
  /**
   * Bumped by the host on every content-height change while this activation still owes its placement: the offset
   * the transcript cannot reach is a not-yet, and the attempt re-measures with the growth under the host's gate.
   */
  readonly restoreTick?: () => number
  /**
   * The host has already decided this activation's landing (miss settled, first row, or a placement that revealed).
   * The page must not place the remembered row anymore, so a late-arriving row cannot move a revealed view.
   */
  readonly restoreSettled?: () => boolean
  /** The remembered row was placed and measured; the host lifts the restore gate once heights stop moving. */
  readonly onRestorePlaced?: (target: { readonly key: string; readonly offset: number }) => void
  /** Reports the row under the top edge, so the host can remember where the reader stopped. */
  readonly onPositionChange?: (position: { readonly key: string; readonly offset: number }) => void
  /**
   * Registers this page's own reveal. A row's content may sit outside the mounted window, where the host's DOM search
   * finds only a reserved box; this reveal expands what hides the row, mounts it, and scrolls it into view.
   */
  readonly setReveal?: (reveal: ((id: string, partID?: string) => boolean) | undefined) => void
  /** Opens a file the turn changed, so the change list under an answer leads to what it names. */
  readonly onOpenFile?: (path: string) => void
}

const STEP_LIVE = {
  thinking: "ui.answer.step.thinking",
  read: "ui.answer.step.read",
  readImage: "ui.answer.step.readImage",
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

  if (["edit", "write", "patch", "apply_patch"].includes(name)) return "edit"

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
  const snapshot = createMemo<Snapshot>((previous) =>
    projectTimeline(messages(), previous, props.pendingInputIDs?.()),
  )

  // The footer reports facts the projection leaves out: the model and agent that produced a reply, and when it
  // finished. Keep them keyed by message so each row reads only its own.
  const assistantByID = createMemo(() => {
    const index = new Map<string, SessionMessageAssistant>()

    for (const message of messages()) if (message.type === "assistant") index.set(message.id, message)

    return index
  })

  // Only a settled turn's closing reply carries the footer: while the model still works, its text is progress, not an
  // answer with a model to name.
  const closingReplyKey = createMemo(() => {
    const index = new Map<number, string>()

    for (const turn of snapshot().turns.values())
      if (turn.status !== "open" && turn.answer) index.set(turn.turn, turn.answer)

    return index
  })

  const replyMeta = createMemo<ReplyMeta>(() => ({
    assistant: (messageID) => assistantByID().get(messageID),
    closingReply: (turn) => closingReplyKey().get(turn),
  }))
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

  // Gaps depend on the entry kinds, not on their text, so a streamed delta keeps the previous array and every
  // row keeps its `padding-top` without re-running.
  const rowGaps = createMemo<readonly number[]>((previous) => {
    const next = entries().map((_, position) => flowGapPx(snapshot(), entries(), position))

    return previous && previous.length === next.length && previous.every((gap, index) => gap === next[index])
      ? previous
      : next
  })

  // Every loaded row renders its content. A row that scrolled in therefore never swapped a guessed height for its real
  // one, so the transcript holds its final height from the first frame and switching sessions cannot shift it.

  const lastTurn = () => Math.max(...[...snapshot().turns.keys()])

  // Turns are numbered by their position in the loaded window, so paging an older page in shifts every existing
  // number. The disclosure state has to be keyed by the row's own key, which survives that shift.
  // The stretch a run is still working in is its turn's last fold: only that one carries the live status and the
  // elapsed time. Earlier stretches were cut off by a steered prompt, so their work is already done.
  const foldKeys = createMemo(() => {
    const map = new Map<number, string>()

    for (const entry of entries()) if (entry.kind === "fold") map.set(entry.turn, entry.key)

    return map
  })

  // A steered turn holds one fold per stretch of work, so which stretch a row belongs to, and what has to open to
  // reveal it, comes from the stretches themselves rather than from the turn.
  const foldOfChild = createMemo(() => {
    const map = new Map<string, string>()

    for (const entry of entries()) if (entry.kind === "fold") for (const child of entry.children) map.set(child.key, entry.key)

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

  // A settle folds everything the turn did: no row in view and no step the reader opened keeps it open past the answer
  // they were waiting for. The next input still opens the newest turn when the reader chose "on next message".

  // A restore attempt belongs to one activation: it waits for the DOM insert, then places the remembered row once.
  let pendingRestore: { key: string; offset: number } | undefined
  const [restoreState, setRestoreState] = createSignal<RestoreState>(createRestoreState())
  // How long a restore waits for the remembered row to appear before it gives up and lands at the end. A row already
  // in the DOM never comes here: it lands at once, clamped or not, and the host holds its screen position through
  // every later height change. The watchdog only bounds a hung anchor fetch or a row that never arrived.
  const RESTORE_LOAD_MS = 1500
  // The poll the miss check uses while the host's anchor request is still in flight.
  const RESTORE_SEEK_POLL_MS = 250
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

  // Where the remembered row's box puts the top edge, clamped into the range the loaded height can scroll. A clamp
  // is accepted only when it is final: a box that cannot scroll at all (an attaching view, a spacer still to come)
  // has not been measured yet, and placing from it would park the reader above content that is about to arrive.
  // Once the box scrolls, the closest position is the real landing and the host's anchor correction holds it.
  const placement = (root: HTMLDivElement, target: { key: string; offset: number }) => {
    const row = findRow(root, target.key)

    if (!row) return undefined

    const wanted = root.scrollTop + row.getBoundingClientRect().top - root.getBoundingClientRect().top + target.offset
    const max = Math.max(0, root.scrollHeight - root.clientHeight)

    if (wanted > max && max === 0) return undefined

    return Math.min(Math.max(wanted, 0), max)
  }

  // One write per activation, the moment the remembered row is in the DOM. Whether the loaded height can reach the
  // remembered offset is not the page's question: the row is placed at its closest position and the host's anchor
  // correction holds that screen position while anything above it keeps settling. Waiting for quiet height is what
  // made a short transcript idle on the watchdog and a folding one on the settle window.
  const attemptRestore = () => {
    const root = props.viewport?.()

    // A cached view reinserted for activation is not attached while the first attempt runs, and detached rows
    // measure zero: any placement decided from that geometry is a lie. The observer frame that attaches the view
    // bumps the tick and retries; the host deadline bounds the wait and still reveals.
    if (!root || !root.isConnected || root.scrollHeight === 0) return

    if (keys().length === 0) return

    if (restoreState() !== "idle") return

    // The host settled this activation's landing without a row placement; writing now would jump a revealed view.
    if (props.restoreSettled?.()) return

    const target = pendingRestore

    if (!target) {
      dispatchRestore({ type: "activate" })

      // No remembered row: the view opens at the newest content, and the timeline's own landing keeps the end in view.
      // This page writes no position here.

      return
    }

    // Gate ownership: until the host raises its gate this activation's landing has no cover, so writing the row's
    // offset here would be a visible jump the placement then moves again. The pending effect retries on gate-up.
    if (props.restorePending && !props.restorePending()) return

    const placed = placement(root, target)

    // The row is on an older page the host is fetching (or will page in by hand), or the box has not been laid out
    // yet and any placement would be a guess: only here does the miss get a chance to decide, bounded by the watchdog
    // and closed by `decideMiss` when the row is in view but nothing can scroll.
    if (placed === undefined) {
      // A row that is not in the document can only still arrive from a page the host is fetching; every loaded row
      // renders its content, so with no fetch in flight the remembered anchor is gone for good (a re-fold rewrote
      // its key, or the message was replaced). Deciding now skips the watchdog the landing would only repeat.
      if (!findRow(root, target.key) && !props.restoreSeeking?.()) {
        decideMiss(target)

        return
      }

      missTimer ??= setTimeout(() => {
        missTimer = undefined
        decideMiss(target)
      }, RESTORE_LOAD_MS)

      return
    }

    dispatchRestore({ type: "activate" })

    if (Math.abs(placed - root.scrollTop) > 1) root.scrollTop = placed

    // Record the row the reader was put back on, so the next activation restores the same place.
    props.onPositionChange?.(target)
    props.onRestorePlaced?.(target)
  }

  // The deadline only judges while nobody is fetching: the host's anchor request can still land the row, so the
  // check defers by one poll until it clears. Reaching the end of a fetch without a row is the real miss.
  function decideMiss(target: { key: string; offset: number }) {
    if (restoreState() !== "idle" || props.restoreSettled?.()) return

    if (props.restoreSeeking?.()) {
      missTimer = setTimeout(() => {
        missTimer = undefined
        decideMiss(target)
      }, RESTORE_SEEK_POLL_MS)

      return
    }

    const current = props.viewport?.()

    if (current && findRow(current, target.key)) {
      // The row is here but its box still cannot scroll: a transcript that fits its window holds every row in view,
      // so the closest position to the reader's memory is what the screen already shows. Land on it without a write
      // (the re-check through `attemptRestore` still prefers a real placement if one became possible).
      if (placement(current, target) !== undefined) return attemptRestore()

      dispatchRestore({ type: "activate" })
      props.onPositionChange?.(target)
      props.onRestorePlaced?.(target)

      return
    }

    dispatchRestore({ type: "miss" })
  }

  // The host bumps the tick on every content resize while its gate hides the transcript: a remembered row that only
  // just made it into the DOM lands on this activation instead of idling on the watchdog. A placed row needs no
  // re-judgement; the host corrects its screen position, and the attempt is over.
  createEffect(
    on(
      () => props.restoreTick?.() ?? 0,
      (tick) => {
        if (tick === 0) return

        if (restoreState() !== "idle" || !pendingRestore || props.restoreSettled?.()) return
        untrack(attemptRestore)
      },
    ),
  )

  createRenderEffect(
    on(
      () => props.active?.() !== false,
      (isActive) => {
        if (!isActive) return

        // A new activation invalidates the previous attempt: its decision and its remembered row.
        cancelMiss()
        dispatchRestore({ type: "reset" })
        pendingRestore = props.restore?.()
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

  // The host raising its gate is another reason to retry: the activation pass may have run before the gate existed
  // and been skipped by the ownership guard in `attemptRestore`.
  createEffect(() => {
    if (props.restorePending?.()) untrack(attemptRestore)
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

    // The answer row closes the turn, so the files this turn changed belong under it: one entry per file,
    // summed across every step that touched it. A running turn still shows its steps, so the list waits for
    // the answer that closes them.
    const answerTurn = createMemo(() => {
      const value = node()

      if (!value || value.payload.kind !== "assistant") return undefined
      const owner = snapshot().turns.get(value.turn)

      if (!owner || owner.status !== "closed") return undefined

      return owner.answer === value.key ? owner : undefined
    })

    const visibleNode = createMemo(() => {
      const value = node()

      if (!value) return undefined

      if (value.payload.kind !== "assistant") return value

      const owner = snapshot().turns.get(value.turn)
      const folded = owner !== undefined && isFolded(foldOfChild().get(value.key))

      // The stretch lays its rows out in message order, so this standalone entry is needed only while a closed
      // folded stretch hides them; otherwise the stretch renders the reply at its own position.
      if (!folded || owner.status !== "closed") return undefined

      if ((props.foldedReplies ?? "final") !== "final" || value.key === owner.answer) return value

      return undefined
    })

    const turn = createMemo(() => {
      const value = entry()

      return value?.kind === "fold" ? snapshot().turns.get(value.turn) : undefined
    })

    // The stretch this fold lays out, and whether it is the one the run is still working in: a steered turn splits
    // into several, and only the last still carries the turn's status and elapsed time.
    const stretch = createMemo(() => {
      const value = entry()

      return value?.kind === "fold" ? value.children : []
    })

    const closing = createMemo(() => {
      const value = entry()

      return value?.kind === "fold" && foldKeys().get(value.turn) === value.key
    })

    // The gap is the row's own memos so a streamed row that grows re-runs only the row it belongs to. There is no
    // placeholder height: the row's box is its content, so nothing on this page is an estimate.
    const gap = createMemo(() => `${rowGaps()[position()] ?? 0}px`)

    const rowStyle = createMemo<JSX.CSSProperties>(() => ({ "padding-top": gap() }))

    return (
      <div data-answer-key={key} class="select-text" style={rowStyle()}>
        <Show when={visibleNode()}>
          {(value) => (
            <NodeRow node={value()} view={view()} live={snapshot().turns.get(value().turn)?.status === "open"} />
          )}
        </Show>
        <Show when={answerTurn()}>
          {(value) => <TurnChanges snapshot={snapshot()} turn={value()} onOpenFile={props.onOpenFile} />}
        </Show>
        <Show when={turn()}>
          {(value) => (
            <FoldRow
              turn={value()}
              stretch={stretch()}
              closing={closing()}
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
      </div>
    )
  }

  // A search hit or a jump to a prompt names a message. The row is already in the document, so expand whatever hides it
  // and scroll to it once the opening frame has laid out.
  const reveal = (id: string, partID?: string) => {
    const root = props.viewport?.()

    if (!root) return false

    const node = [...snapshot().nodes.values()].find((value) =>
      partID ? value.partID === partID : value.messageID === id,
    )

    if (!node) return false

    const group = [...snapshot().groups].find(([, value]) => value.members.includes(node.key))

    // A top-level row is its own entry; a step lives in the fold that lays its stretch of the turn out, which a
    // steered turn splits into several.
    const entry =
      keys().find((key) => key === `node:${node.key}`) ?? foldOfChild().get(group?.[0] ?? node.key) ?? foldKeys().get(node.turn)

    if (!entry) return false
    setFolded(entry, false)

    if (group) setOpenGroups(group[0], true)
    setOpenRows(node.key, true)

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const row = [...root.querySelectorAll<HTMLElement>("[data-timeline-part-id], [data-message-id]")].find(
          (element) => (partID ? element.dataset.timelinePartId === partID : element.dataset.messageId === id),
        )

        row?.scrollIntoView?.({ block: "center" })
      }),
    )

    return true
  }

  onMount(() => props.setReveal?.(reveal))
  onCleanup(() => props.setReveal?.(undefined))

  return (
    <ReplyMetaContext.Provider value={replyMeta()}>
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
    </ReplyMetaContext.Provider>
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

/** Turn spacing: process rows 4px, a user message 24px, an assistant response 16px, a process head 12px. */
/**
 * The leading gap of one row in pixels. It is padding inside the row box rather than a margin, so the
 * measured border box already covers it and the window offsets stay exact.
 */
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
  /** The rows of this stretch of the turn's process. A steered prompt splits a turn into several stretches. */
  stretch: readonly TimelineChild[]
  /** Whether this is the stretch the run works in: only it shows the turn's live status and its elapsed time. */
  closing: boolean
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

  // A stretch a steered prompt interrupted already did its work; what the run is doing now lives in the stretch below
  // the bubble, so only that one speaks for the turn.
  const state = (): "working" | "worked" | "stopped" | "failed" => (props.closing ? foldState(props.turn.status) : "worked")

  // Only the verbose mode lays the process rows flat. Every other mode keeps each step's own
  // disclosure, so a step opens itself while it runs and closes when it settles.
  const flat = () => grouping() === "none"

  const elapsedMs = () =>
    props.closing && props.turn.status === "open" ? runningElapsed(props.turn, props.now) : props.turn.elapsedMs

  // `childKeys` reads the stretch by id so streamed updates reuse the group and row components instead of
  // rebuilding them under the pointer: the projection hands out a fresh array on every run.
  const childKeys = createMemo(() => props.stretch.map((child) => child.key))
  const childIndex = createMemo(() => new Map(props.stretch.map((child) => [child.key, child] as const)))

  return (
    <section
      data-slot="answer-fold"
      data-turn={props.turn.turn}
      data-state={state()}
      class="flex flex-col"
    >
      <Show when={props.closing && props.turn.status === "open"}>
        <RunningStatus elapsedMs={elapsedMs()} />
      </Show>
      <Show when={!props.closing || props.turn.status !== "open"}>
        <RunHeader
          state={state()}
          elapsedMs={props.closing ? elapsedMs() : undefined}
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

/** The files a turn changed come from the projection, which sums them in one pass over the turn's rows. */
const NO_FILES: readonly ChangedFile[] = []

function TurnChanges(props: { snapshot: Snapshot; turn: TimelineTurn; onOpenFile?: (path: string) => void }) {
  const i18n = useI18n()
  const files = () => props.snapshot.changes.get(props.turn.turn) ?? NO_FILES

  return (
    <Show when={files().length > 0}>
      <div data-slot="answer-changes">
        <div data-slot="answer-changes-heading">{i18n.plural("ui.sessionTurn.diffs.changed", files().length)}</div>
        <div data-slot="answer-changes-list">
          <For each={files()}>
            {(file) => (
              <button
                type="button"
                data-slot="answer-change"
                title={file.path}
                aria-label={file.path}
                onClick={() => props.onOpenFile?.(file.path)}
              >
                <FileIcon node={{ path: file.path, type: "file" }} />
                <span data-slot="answer-change-name">
                  <Show when={getDirectory(file.path)}>
                    {(directory) => (
                      <span data-slot="answer-change-directory">
                        <span data-slot="answer-change-directory-inner">{directory()}</span>
                      </span>
                    )}
                  </Show>
                  <span data-slot="answer-change-filename">{getFilename(file.path)}</span>
                </span>
                <span data-slot="answer-change-stats">
                  <DiffChanges changes={{ additions: file.additions, deletions: file.deletions }} />
                </span>
              </button>
            )}
          </For>
        </div>
      </div>
    </Show>
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

  // Standard appends the live task detail to the category summary while the group is still running. An open body
  // already shows that same line, so only the collapsed heading spells it out.
  const detail = () => (props.view === "standard" && live() && !open() ? props.group.runningDetail : "")

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
      // Writing the scroll position and the edge state straight from the callback re-lays-out the box that was
      // just measured and re-arms the observer (`ResizeObserver loop completed`). Defer a frame so the callback
      // only reads, and skip it if the body was rebound meanwhile.
      requestAnimationFrame(() => {
        if (body !== element) return
        // Settle at the bottom before reporting, so the edge fades describe the position the reader ends up at.
        stick()
        reportEdges()
      })
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
            class={`shrink-0 transition-transform motion-reduce:transition-none ${props.open ? "" : "-rotate-90"}`}
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
        node={props.node}
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

/**
 * The closing reply's own facts: copy, the agent and model that produced it, and when it finished. They sit under
 * the answer and appear on hover, so a short exchange stays quiet until the reader points at the reply.
 */
function ReplyFooter(props: { node: TimelineNode; text: string }) {
  const i18n = useI18n()
  const data = useContext(DataContext)
  const meta = useContext(ReplyMetaContext)
  const actions = useContext(MessageActionsContext)
  const message = createMemo(() => (props.node.messageID ? meta.assistant(props.node.messageID) : undefined))
  const closing = () => meta.closingReply(props.node.turn) === props.node.key
  const [copied, setCopied] = createSignal(false)
  const copy = async () => {
    if (!(await writeClipboard(props.text))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const fork = () => {
    const value = message()

    if (!value || !actions.sessionID) return

    actions.actions?.forkAfter?.({ sessionID: actions.sessionID, messageID: value.id })
  }

  const labels = createMemo(() => {
    const value = message()

    if (!value) return []

    const agent = agentLabel(value.agent, true)
    const name = data?.store.provider?.all?.get(value.model.providerID)?.models?.[value.model.id]?.name ?? value.model.id
    const variant =
      value.model.variant && value.model.variant !== "default"
        ? value.model.variant[0]?.toUpperCase() + value.model.variant.slice(1)
        : ""

    return [agent, name, variant].filter((label) => label)
  })

  return (
    <Show when={closing() && props.text.trim().length > 0 && message()}>
      <div data-slot="answer-reply-footer">
        <Tooltip
          appearance="compact"
          value={copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyResponse")}
          placement="top"
          gutter={4}
        >
          <IconButton
            icon={<Icon name={copied() ? "check" : "outline-copy"} size="small" />}
            size="small"
            variant="ghost-muted"
            onMouseDown={(event) => event.preventDefault()}
            onClick={copy}
            aria-label={copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyResponse")}
          />
        </Tooltip>
        <Show when={actions.actions?.forkAfter && actions.sessionID}>
          <Tooltip appearance="compact" value={i18n.t("ui.message.forkResponse")} placement="top" gutter={4}>
            <IconButton
              icon={<Icon name="fork" size="small" />}
              size="small"
              variant="ghost-muted"
              disabled={message()?.time.completed === undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={fork}
              aria-label={i18n.t("ui.message.forkResponse")}
            />
          </Tooltip>
        </Show>
        <Show when={labels().length > 0}>
          <span data-slot="answer-reply-meta">
            <For each={labels()}>
              {(label, index) => (
                <>
                  <Show when={index() > 0}>
                    <span data-slot="answer-reply-meta-separator" aria-hidden="true">
                      {"\u00B7"}
                    </span>
                  </Show>
                  <span data-slot="answer-reply-meta-item" dir="auto">
                    {label}
                  </span>
                </>
              )}
            </For>
          </span>
        </Show>
      </div>
    </Show>
  )
}

// A prompt past 12 lines shows its first 8, matching the conversation surface's fold: a fold always hides at
// least 5 lines, so a prompt just past the limit never folds away a line or two.
const INPUT_FOLD = { over: 12, show: 8 }

const NO_ATTACHMENTS: readonly PromptAttachment[] = []

const NO_AGENTS: readonly PromptAgentAttachment[] = []

const NO_SKILLS: readonly PromptSkillAttachment[] = []

/**
 * The prompt bubble. A long prompt folds to its first lines and keeps the rest behind a Read more toggle.
 *
 * Pictures the prompt carried sit above the bubble as thumbnails. Any other file is a reference the writer pasted,
 * so it reads as a link at the end of the prompt text instead of a second block; a file the writer already named in
 * the text keeps its mention there and gets no second link.
 */
function InputBubble(props: {
  text: string
  attachments?: readonly PromptAttachment[]
  agents?: readonly PromptAgentAttachment[]
  skills?: readonly PromptSkillAttachment[]
  cacheKey: string
  messageID: string
  createdAt: number
}) {
  const i18n = useI18n()
  const messageActions = useContext(MessageActionsContext)
  const rows = useContext(RowDisclosureContext)
  // The reader's disclosure lives in the page's store, so a streamed projection rebuild keeps it open.
  const expanded = () => rows?.open(props.cacheKey) === true
  // Hard line breaks are a floor on the laid-out lines, so most long prompts fold before the bubble is measured.
  const [lines, setLines] = createSignal(props.text.trimEnd().split("\n").length)
  const long = () => lines() > INPUT_FOLD.over
  const folded = () => long() && !expanded()

  const attachments = () => props.attachments ?? NO_ATTACHMENTS
  const pictures = () => attachments().filter((file) => file.mime.startsWith("image/"))
  const links = () => attachments().filter((file) => !file.mime.startsWith("image/") && file.mention === undefined)
  // A file the writer already named in the text keeps its mention there and gets no second link.
  const inlineFiles = () => attachments().filter((file) => !!file.mention)
  const agents = () => props.agents ?? NO_AGENTS
  const skills = () => props.skills ?? NO_SKILLS
  const hasText = () => props.text.trim().length > 0 || links().length > 0

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
      <Show when={pictures().length > 0}>
        <div data-slot="user-message-attachments" data-pictures={pictures().length}>
          <For each={pictures()}>{(file) => <PromptPicture file={file} />}</For>
        </div>
      </Show>
      {/* An @skill mention is resolved on the server, which injects the full content before the prompt text. Without
          this row the load leaves no trace in the timeline and reads as if the mention did nothing. */}
      <Show when={skills().length > 0}>
        <div data-slot="user-message-skills">
          <Icon name="post-skill" size="small" />
          <span>
            {i18n.plural("ui.tool.loadedSkills", skills().length, {
              name: skills()
                .map((skill) => skill.name)
                .join(", "),
            })}
          </span>
        </div>
      </Show>
      <Show when={hasText()}>
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
              <Show when={props.text.length > 0}>
                <Show
                  when={hasMarkdownSyntax(props.text)}
                  fallback={
                    <HighlightedText
                      text={props.text}
                      files={inlineFiles()}
                      agents={agents()}
                      skills={skills()}
                    />
                  }
                >
                  <Markdown text={props.text} cacheKey={`${props.cacheKey}:input`} class="answer-input-markdown" />
                </Show>
              </Show>
              <Show when={links().length > 0}>
                <div data-slot="user-message-files">
                  <For each={links()}>{(file) => <PromptFileLink file={file} />}</For>
                </div>
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
      </Show>
      <UserMessageActions
        sessionID={messageActions.sessionID}
        messageID={props.messageID}
        createdAt={props.createdAt}
        actions={messageActions.actions}
        text={props.text}
        fork={false}
      />
    </div>
  )
}

/** One picture the prompt carried: a thumbnail above the bubble that opens full size when clicked. */
function PromptPicture(props: { file: PromptAttachment }) {
  const i18n = useI18n()
  const preview = createImagePreview()
  const image = useImageUrl(() => ({ uri: attachmentUri(props.file), mime: props.file.mime }))
  const name = () => props.file.name ?? i18n.t("ui.message.attachment.alt")

  return (
    <div
      data-slot="user-message-attachment"
      data-state={image.broken() ? "broken" : image.url() ? "ready" : "loading"}
      class="relative shrink-0 overflow-hidden border-[0.5px] border-v2-border-border-base"
      style={{ background: "var(--v2-background-bg-layer-02)" }}
    >
      <Show when={image.broken() ? undefined : image.url()}>
        {(src) => (
          <img
            // Wired as it mounts: the url arrives after this wrapper rendered, so scanning the wrapper would miss an
            // image the <Show> had not created yet and the thumbnail would never open.
            ref={preview}
            data-slot="user-message-attachment-image"
            src={src()}
            alt={name()}
            class="size-full cursor-zoom-in object-cover"
            onError={() => image.setBroken(true)}
          />
        )}
      </Show>
    </div>
  )
}

/** A file the prompt carried reads as a link in its text; clicking it opens the attachment. */
function PromptFileLink(props: { file: PromptAttachment }) {
  const i18n = useI18n()
  const messageActions = useContext(MessageActionsContext)
  const name = () => props.file.name || i18n.t("ui.message.attachment.alt")

  return (
    <button
      type="button"
      data-slot="user-message-file-link"
      title={props.file.description || name()}
      onClick={() => messageActions.actions?.openAttachment?.(props.file)}
    >
      <FileIcon node={{ path: name(), type: "file" }} />
      <span>{name()}</span>
    </button>
  )
}

/** The URI a prompt attachment's bytes live at: its source URI, a stored `media:` ref, or an inline data URL. */
function attachmentUri(file: PromptAttachment) {
  if (file.source.type === "uri") return file.source.uri

  if ("uri" in file) return file.uri

  return `data:${file.mime};base64,${file.data}`
}

function Payload(props: {
  node: TimelineNode
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
          attachments={props.payload.files}
          agents={props.payload.agents}
          skills={props.payload.skills}
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
          <ReplyFooter node={props.node} text={props.payload.text} />
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
          wake={props.payload.wake}
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

/** A scheduled retry stays one line: the attempt it is on, shimmering while it waits, with the provider's reason behind a button. */
function RetryRow(props: { attempt: number; text: string }) {
  const i18n = useI18n()
  const [copied, setCopied] = createSignal(false)
  let copyTimer: number | undefined

  onCleanup(() => {
    if (copyTimer !== undefined) window.clearTimeout(copyTimer)
  })

  const copy = async () => {
    if (!(await writeClipboard(props.text))) return
    setCopied(true)

    if (copyTimer !== undefined) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => setCopied(false), 1200)
  }

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
      <Show when={props.text}>
        <button
          type="button"
          data-slot="answer-retry-view"
          class="flex h-[20px] w-fit shrink-0 items-center gap-1 rounded-full border-[0.5px] border-v2-border-border-base px-2 text-[11px] leading-[16px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
          style={{ color: "var(--answer-ink-secondary)", background: "var(--v2-background-bg-base)" }}
          onClick={(event) => {
            const next = event.currentTarget.nextElementSibling

            if (next instanceof HTMLDialogElement) next.showModal()
          }}
        >
          {i18n.t("ui.answer.retry.view")}
        </button>
        <dialog
          data-slot="answer-retry-dialog"
          aria-label={i18n.t("ui.answer.retry.errorDetails")}
          class="max-h-[70vh] max-w-[min(680px,90vw)] rounded-[12px] border-[0.5px] border-v2-border-border-base p-4"
          style={{ color: "var(--answer-ink)" }}
          onClick={(event) => {
            if (event.target === event.currentTarget) event.currentTarget.close()
          }}
        >
          <div class="flex flex-col gap-2">
            <span class="text-[13px] leading-[20px]">{i18n.t("ui.answer.retry.errorDetails")}</span>
            <pre class="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-[19px] [overflow-wrap:anywhere]">
              {props.text}
            </pre>
            <form method="dialog" class="flex items-center justify-end gap-3">
              <button
                type="button"
                data-slot="answer-copy"
                class="text-[12px] leading-[20px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
                style={{ color: "var(--answer-ink-secondary)" }}
                onClick={() => void copy()}
              >
                {copied() ? i18n.t("ui.answer.copied") : i18n.t("ui.answer.copy")}
              </button>
              <button
                type="submit"
                class="text-[12px] leading-[20px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
                style={{ color: "var(--answer-ink-secondary)" }}
              >
                {i18n.t("ui.answer.inspect.close")}
              </button>
            </form>
          </div>
        </dialog>
      </Show>
    </div>
  )
}

/** An injected context keeps its body behind a disclosure; a plain notice stays one truncated line. */
function NoticeRow(props: {
  text: string
  detail?: string
  notice?: "instructions-updated" | "system-reminder"
  wake?: NonNullable<Extract<NodePayload, { kind: "notice" }>["wake"]>
  cacheKey: string
  rowOpen?: boolean
  onToggleRow?: (next: boolean) => void
}) {
  const i18n = useI18n()
  const expanded = () => props.rowOpen ?? false

  // A background wake that opened its own segment reads as an expandable completion block: the call
  // it reports sits far above (often folded), so the row carries the command and the output itself.
  if (props.wake) return <WakeNoticeRow wake={props.wake} text={props.text} rowOpen={props.rowOpen} onToggleRow={props.onToggleRow} />

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

/**
 * A background completion that opened its own segment: an expandable block naming the finished call,
 * opening onto the command and the captured output, so the report reads like the tool row that
 * started the job instead of one truncated line under the question it woke past.
 */
function WakeNoticeRow(props: {
  wake: NonNullable<Extract<NodePayload, { kind: "notice" }>["wake"]>
  text: string
  rowOpen?: boolean
  onToggleRow?: (next: boolean) => void
}) {
  const i18n = useI18n()
  const expanded = () => props.rowOpen ?? false
  const titleClass = () => {
    if (props.wake.outcome === "error") return "text-v2-state-fg-danger"
    if (props.wake.outcome === "cancelled") return "text-[var(--v2-yellow-900)] [[data-color-scheme=dark]_&]:text-v2-state-fg-warning"

    return ""
  }
  // The banner names what happened, not who: the reader is asking why this segment exists at all.
  const title = () => {
    if (props.wake.source === "shell")
      return props.wake.outcome === "error"
        ? i18n.t("ui.answer.notice.wakeShellFailed")
        : props.wake.outcome === "cancelled"
          ? i18n.t("ui.answer.notice.wakeShellCancelled")
          : i18n.t("ui.answer.notice.wakeShell")

    return props.wake.outcome === "error"
      ? i18n.t("ui.answer.notice.wakeSubagentFailed")
      : props.wake.outcome === "cancelled"
        ? i18n.t("ui.answer.notice.wakeSubagentCancelled")
        : i18n.t("ui.answer.notice.wakeSubagent")
  }

  return (
    <div
      data-slot="answer-wake"
      data-outcome={props.wake.outcome}
      class="w-full min-w-0 rounded-[16px] border-[0.5px] border-v2-border-border-base px-5 py-3"
      style={{ background: "var(--answer-surface)" }}
    >
      <DisclosureRow
        title={title()}
        titleClass={titleClass()}
        summary={props.text}
        summaryDanger={props.wake.outcome === "error"}
        state={props.wake.outcome === "error" ? "error" : "ok"}
        expanded={expanded()}
        leading={<FlowIcon name={props.wake.source === "shell" ? "answer-console" : "answer-subagent"} />}
        onToggle={() => props.onToggleRow?.(!expanded())}
      >
        <div data-slot="answer-wake-body" class="ms-[24px] mt-1 flex flex-col gap-2 border-t-[0.5px] border-v2-border-border-muted pt-2">
          <Show when={props.wake.command}>
            {(command) => (
              <>
                <section class="flex flex-col gap-1">
                  <span class="font-mono text-[11px] leading-[19px]" style={{ color: "var(--answer-ink-tertiary)" }}>
                    {i18n.t("ui.answer.io.input")}
                  </span>
                  <pre
                    data-slot="answer-wake-command"
                    class="whitespace-pre-wrap break-words font-mono text-[11px] leading-[19px] [overflow-wrap:anywhere]"
                    style={{ color: "var(--answer-ink-secondary)" }}
                  >
                    {command()}
                  </pre>
                </section>
                <div class="h-[0.5px] w-full bg-v2-border-border-muted" />
              </>
            )}
          </Show>
          <section class="flex flex-col gap-1">
            <span class="font-mono text-[11px] leading-[19px]" style={{ color: "var(--answer-ink-tertiary)" }}>
              {i18n.t("ui.answer.io.output")}
            </span>
            <pre
              data-slot="answer-wake-output"
              class="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-[19px] [overflow-wrap:anywhere]"
              style={{ color: props.wake.outcome === "error" ? "var(--v2-state-fg-danger)" : "var(--answer-ink-secondary)" }}
            >
              {props.wake.output}
            </pre>
          </section>
        </div>
      </DisclosureRow>
    </div>
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
      ? `absolute opacity-0 transition-[opacity,transform] group-hover/row:opacity-100 group-focus-visible/row:opacity-100 motion-reduce:transition-none ${props.open ? "" : "-rotate-90"}`
      : `absolute opacity-0 transition-[opacity,transform] group-hover/heading:opacity-100 group-focus-visible/heading:opacity-100 motion-reduce:transition-none ${props.open ? "" : "-rotate-90"}`

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
  titleClass?: string
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
          <bdi dir="auto" data-slot="answer-row-title" class={`min-w-0 shrink truncate ${props.titleClass ?? ""}`}>{props.title}</bdi>
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

  // An expanded thought caps at ten lines and scrolls in place, so a long one cannot stretch the turn. A finished
  // thought opens at its first line; while it streams the box keeps its newest paragraph in view and yields as soon
  // as the reader scrolls away from the bottom, the same intent rule a step panel uses.
  let reasoningBody: HTMLDivElement | undefined
  let reasoningObserver: ResizeObserver | undefined
  const [reasoningFollowing, setReasoningFollowing] = createSignal(streaming())
  const [reasoningEdges, setReasoningEdges] = createSignal({ up: false, down: false })

  const reportReasoningEdges = () => {
    const element = reasoningBody

    if (!element) return
    const floor = Math.max(0, element.scrollHeight - element.clientHeight)

    setReasoningEdges({ up: element.scrollTop > 1, down: element.scrollTop < floor - 1 })
  }

  const stickReasoning = () => {
    const element = reasoningBody

    if (!element || !reasoningFollowing()) return
    element.scrollTop = element.scrollHeight
  }

  const bindReasoning = (element: HTMLDivElement) => {
    reasoningBody = element
    reasoningObserver?.disconnect()

    if (typeof ResizeObserver === "undefined") return
    reasoningObserver = new ResizeObserver(() => {
      // Same reasoning as the step body: defer so the callback does not re-lay-out what it just measured.
      requestAnimationFrame(() => {
        if (reasoningBody !== element) return
        stickReasoning()
        reportReasoningEdges()
      })
    })
    reasoningObserver.observe(element)

    if (element.firstElementChild) reasoningObserver.observe(element.firstElementChild)
    reportReasoningEdges()
  }

  const onReasoningScroll = () => {
    const element = reasoningBody

    if (!element) return
    const floor = Math.max(0, element.scrollHeight - element.clientHeight)

    setReasoningFollowing(element.scrollTop >= floor - 1)
    reportReasoningEdges()
  }

  onCleanup(() => reasoningObserver?.disconnect())

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
      <div
        data-slot="answer-reasoning-body"
        data-can-scroll-up={reasoningEdges().up ? "" : undefined}
        data-can-scroll-down={reasoningEdges().down ? "" : undefined}
        ref={bindReasoning}
        onScroll={onReasoningScroll}
      >
        <Markdown
          text={props.text}
          cacheKey={props.text.length.toString()}
          streaming={streaming()}
          deferUntilReady
          class="answer-markdown ps-[30px] py-1 [overflow-wrap:anywhere]"
        />
      </div>
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
          <For each={images()}>{(image) => <ToolImage image={image} fallbackPath={toolImagePath(props.tool)} />}</For>
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
            class="max-h-[70vh] max-w-[min(680px,90vw)] rounded-[12px] border-[0.5px] border-v2-border-border-base p-4"
            style={{ color: "var(--answer-ink)" }}
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
 * One image a tool returned, shown under its open row. Only the open row mounts it, so collapsed history loads no
 * pixels.
 */
function ToolImage(props: { image: ReturnType<typeof toolImages>[number]; fallbackPath?: string }) {
  const i18n = useI18n()
  const preview = createImagePreview()
  const image = useImageUrl(() => ({ uri: props.image.uri, mime: props.image.mime, fallbackPath: props.fallbackPath }))

  const name = () => props.image.name ?? i18n.t("ui.message.attachment.alt")
  const kind = () => i18n.t("ui.fileMedia.kind.image")

  return (
    <div
      data-slot="answer-tool-image"
      class="w-fit max-w-full overflow-hidden rounded-[12px] border-[0.5px] border-v2-border-border-muted"
      style={{ background: "var(--answer-surface)" }}
    >
      <Show
        when={image.broken() ? undefined : image.url()}
        fallback={
          <div
            data-slot="answer-tool-image-state"
            class="flex h-[180px] w-[320px] items-center justify-center text-[11px] leading-[19px]"
            style={{ color: "var(--answer-ink-tertiary)" }}
          >
            {image.broken()
              ? i18n.t("ui.fileMedia.state.unavailable", { kind: kind() })
              : i18n.t("ui.fileMedia.state.loading", { kind: kind() })}
          </div>
        }
      >
        {(src) => (
          <img
            // Wired as it mounts: the url arrives after this row rendered, so scanning the row would miss an image the
            // <Show> had not created yet and the screenshot would never open.
            ref={preview}
            data-slot="answer-tool-image-thumb"
            src={src()}
            alt={name()}
            class="block max-h-[360px] w-auto max-w-full cursor-zoom-in object-contain"
            onError={() => image.setBroken(true)}
          />
        )}
      </Show>
    </div>
  )
}

/**
 * Resolves an image source to something an `<img>` can show. A server-local path is read through the markdown image
 * loader; data, http(s) and blob sources are already renderable. Content the client stripped of its stored payload
 * falls back to the file the caller names. `media:` refs read their bytes from the server.
 */
function useImageUrl(source: () => { uri: string; mime: string; fallbackPath?: string }) {
  const markdown = useMarkdown()
  const data = useContext(DataContext)
  const [url, setUrl] = createSignal<string>()
  const [broken, setBroken] = createSignal(false)
  let objectUrl: string | undefined

  createEffect(() => {
    const current = source()
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    setBroken(false)

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = undefined
    }

    // With `experimental.media_blob`, a stored image arrives as a `media:<hash>` ref whose bytes live on the server,
    // not at a local path or in a data URL.
    if (mediaHashFromUri(current.uri)) {
      const cached = data?.peekMedia?.(current.uri, current.mime)

      if (cached) {
        setUrl(cached)

        return
      }

      if (!data?.readMedia) {
        setBroken(true)

        return
      }

      setUrl(undefined)
      void data.readMedia(current.uri, current.mime, controller.signal).then(
        (loaded) => {
          if (controller.signal.aborted) return

          if (loaded) setUrl(loaded)
          else setBroken(true)
        },
        () => {
          if (!controller.signal.aborted) setBroken(true)
        },
      )

      return
    }

    // The client drops stored image payloads from message content, leaving only `data:<mime>;base64,` behind. The
    // tool's own input still names the file it read, so draw that file instead of the emptied URL.
    const stripped = /^data:[^,]*;base64,$/i.test(current.uri)
    const resolved = stripped ? current.fallbackPath : current.uri

    if (!resolved) {
      setBroken(true)

      return
    }

    // A read result points at its file with a `file:` URL, which the host's local image loader refuses as a scheme.
    const path = localImagePath(resolved)

    if (!path || !markdown?.readImage) {
      if (/^(data|blob|https?):/i.test(resolved)) {
        setUrl(resolved)

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

  return { url, broken, setBroken }
}


/** The one-line summary a reasoning row previews beside its title. */
function reasoningPreview(text: string, streaming: boolean) {
  const blocks = text.split(/\n\s*\n/).filter((block) => block.trim())

  if (streaming) return blocks.at(-1)?.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").trim()

  return blocks[0]?.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").trim()
}
