import type { PromptAttachment, SessionMessageInfo } from "@aicraft/client/promise"
import { Option, Schema } from "effect"
import { changedFileDiff } from "../components/apply-patch-file"
import { isInterruptedError } from "../timeline/turn-phase-machine"
import { toolActivity, toolDescription, toolLabel, toolMark, toolSummary } from "./tool"
import type {
  ActivityCount,
  ChangedFile,
  GroupItem,
  GroupTree,
  NodePayload,
  ProcessActivity,
  Snapshot,
  TimelineChild,
  TimelineEntry,
  TimelineGroup,
  TimelineNode,
  TimelineTurn,
  ToolContent,
} from "./types"

type TurnDraft = {
  readonly turn: number
  readonly nodes: TimelineNode[]
  startedAt?: number
  completedAt?: number
  failure?: "stopped" | "failed"
  streaming?: boolean
  /** Whether the turn's last settled word was the server's idle marker; work arriving after one reopens it. */
  idle?: boolean
  /** Kept so a later step can replace the failure or retry notice of the step it continues. */
  errorNode?: TimelineNode
  retryNode?: TimelineNode
}

const decodeNotice = Schema.decodeUnknownOption(
  Schema.Struct({
    text: Schema.optionalKey(Schema.String),
    description: Schema.optionalKey(Schema.String),
  }),
)

const contextItem = Schema.Struct({
  name: Schema.String,
  chars: Schema.Number,
  text: Schema.optionalKey(Schema.String),
})

const contextSource = Schema.Struct({
  key: Schema.String,
  chars: Schema.Number,
  text: Schema.optionalKey(Schema.String),
  items: Schema.optionalKey(Schema.Array(contextItem)),
})

type ContextSource = Schema.Schema.Type<typeof contextSource>
type ContextItem = Schema.Schema.Type<typeof contextItem>

const decodeContext = Schema.decodeUnknownOption(
  Schema.Struct({
    metadata: Schema.Struct({ context: Schema.Array(contextSource) }),
  }),
)

/** Context the Step injected ahead of the conversation, as its assistant message recorded it. */
function injectedContext(message: SessionMessageInfo) {
  const sources = Option.getOrUndefined(decodeContext(message))?.metadata.context

  return sources && sources.length > 0 ? sources : undefined
}

function sameContextSource(a: ContextSource | undefined, b: ContextSource) {
  if (!a) return false
  if (a.key !== b.key || a.chars !== b.chars || a.text !== b.text) return false
  const left = a.items ?? []
  const right = b.items ?? []

  return left.length === right.length && left.every((item, index) => sameContextItem(item, right[index]!))
}

function sameContextItem(a: ContextItem, b: ContextItem) {
  return a.name === b.name && a.chars === b.chars && a.text === b.text
}

/**
 * Notice copy, or undefined when the message carries none (so its type tag never reaches the reader).
 * An injected context carries a one-line description and the full body in `text`; the body is what the
 * reader expands, so the row keeps it instead of flattening it into the truncated summary.
 */
function noticeCopy(message: SessionMessageInfo) {
  const value = Option.getOrUndefined(decodeNotice(message))
  const body = value?.text?.trim()

  // Instruction updates carry an English description from the event; show localized copy instead.
  if (message.metadata?.notice === "instructions" || value?.description?.trim().startsWith("Instructions updated: "))
    return { text: "", detail: body, notice: "instructions-updated" as const }
  // A reminder is wrapped in an English tag that must never reach the reader; its body is already localized.
  const reminder = reminderBody(body)

  if (reminder) return { text: "", detail: reminder, notice: "system-reminder" as const }

  const text = value?.description?.trim() || firstLine(body) || undefined

  if (!text) return undefined

  return { text, detail: body && body !== text ? body : undefined }
}

function firstLine(text: string | undefined) {
  return text?.split("\n").find((line) => line.trim())?.trim()
}

type WakeReport = Extract<NodePayload, { kind: "notice" }>["wake"]

function sameWake(previous: WakeReport, next: WakeReport) {
  if (previous === next) return true
  if (!previous || !next) return false

  return (
    previous.source === next.source &&
    previous.outcome === next.outcome &&
    previous.agent === next.agent &&
    previous.command === next.command &&
    previous.output === next.output
  )
}

/**
 * A background completion is the only notice that spawns follow-up work: delivered on top of finished
 * work it opens a segment of its own, so the run it wakes cannot take the answer slot of the question
 * above. Undelivered wakes are queued input and keep riding until delivery splits them off.
 */
function backgroundWake(message: SessionMessageInfo, pendingInputIDs?: ReadonlySet<string>): WakeReport {
  if (message.type !== "synthetic" || pendingInputIDs?.has(message.id)) return undefined
  const source = message.metadata?.source

  if (source !== "shell" && source !== "subagent") return undefined

  const state = message.metadata?.state
  const agent = message.metadata?.agent
  // The report arrives wrapped in the tag core builds (see shell/result.ts). The command attribute can
  // embed `>` (as in `2>&1`), so the body is cut between the opening tag and its closing pair rather
  // than re-parsing attributes; the command text comes from the description, the attribute is the fallback.
  const raw = message.text.trim()
  const wrapped = /^<(shell|subagent)\b(?:\s+[\w-]+="[^"]*")*\s*>([\s\S]*)<\/\1>$/.exec(raw)

  return {
    source,
    outcome: state === "error" || state === "cancelled" ? state : "completed",
    ...(typeof agent === "string" && agent !== "" ? { agent } : {}),
    command: source === "shell" ? message.description?.trim() || /\bcommand="([^"]*)"/.exec(raw)?.[1] : undefined,
    output: (wrapped?.[2] ?? raw).trim(),
  }
}

// A wake that arrives before the turn has done any work still belongs to it: only a report interrupting
// finished work starts a segment, so batched wakes delivered together share the one the first opened.
// A bare prompt is not work yet, so notices queued behind it keep riding the question's turn.
function turnHasWork(turn: TurnDraft) {
  return turn.nodes.some((node) => node.payload.kind !== "notice" && node.payload.kind !== "input")
}

/** The localized body inside an English `<system-reminder>` tag, or undefined when the text is anything else. */
function reminderBody(text: string | undefined) {
  return text ? (/^<system-reminder>([\s\S]*?)<\/system-reminder>$/.exec(text)?.[1]?.trim() || undefined) : undefined
}

/**
 * Keeps the previous payload when this projection produced the same row content. Rendering reads
 * `node.payload`, so reusing it stops a streamed delta from invalidating every other row's props.
 * The comparisons are by value: a store may mutate a nested record in place, and an identity check
 * would then carry a stale payload forward.
 */
function reusePayload(previous: NodePayload | undefined, next: NodePayload): NodePayload {
  if (!previous) return next

  // Each case re-checks `previous.kind`: TypeScript cannot carry one variable's discriminant narrowing
  // over to the other, and an unchecked field read would be a lie.
  switch (next.kind) {
    case "input":
      return previous.kind === "input" && previous.text === next.text && sameFiles(previous.files, next.files)
        ? previous
        : next
    case "assistant":
    case "reasoning":
      return (previous.kind === "assistant" || previous.kind === "reasoning") &&
        previous.text === next.text &&
        previous.streaming === next.streaming
        ? previous
        : next
    case "tool":
      // The tool record is the row's state; a different record is a different row.
      return previous.kind === "tool" && previous.tool === next.tool ? previous : next
    case "notice":
      return previous.kind === "notice" &&
        previous.text === next.text &&
        previous.detail === next.detail &&
        previous.notice === next.notice &&
        sameWake(previous.wake, next.wake)
        ? previous
        : next
    case "context":
      // Sources come from one decoded metadata value: a new array means the step reported something new.
      return previous.kind === "context" && previous.change === next.change && previous.sources === next.sources
        ? previous
        : next
    case "error":
      return previous.kind === "error" && previous.text === next.text ? previous : next
    case "retry":
      return previous.kind === "retry" && previous.attempt === next.attempt && previous.text === next.text
        ? previous
        : next
  }
}

/**
 * A prompt's attachments are re-decoded on every refresh, so comparing them by value keeps the prompt row (and the
 * pictures it mounted) from remounting. Bytes are not compared: the source file a prompt carries never changes.
 */
function sameFiles(
  previous: readonly PromptAttachment[] | undefined,
  next: readonly PromptAttachment[] | undefined,
) {
  if (previous === next) return true

  if (!previous || !next || previous.length !== next.length) return false

  return previous.every((file, index) => {
    const other = next[index]!

    return file.mime === other.mime && file.name === other.name && sameFileSource(file.source, other.source)
  })
}

function sameFileSource(previous: PromptAttachment["source"], next: PromptAttachment["source"]) {
  if (previous.type === "uri") return next.type === "uri" && previous.uri === next.uri

  return next.type === "inline"
}

/**
 * Keeps the previous row when this projection produced the same row. Every field but the payload is an
 * identity the projection derives from the message, so an equal row is the same row: reusing it stops a
 * streamed delta from invalidating rows it did not touch.
 */
function reuseNode(previous: TimelineNode | undefined, next: TimelineNode): TimelineNode {
  return previous && sameNode(previous, next) ? previous : next
}

function sameNode(left: TimelineNode, right: TimelineNode) {
  return (
    left.key === right.key &&
    left.turn === right.turn &&
    left.messageID === right.messageID &&
    left.partID === right.partID &&
    left.groupTree === right.groupTree &&
    left.hidden === right.hidden &&
    left.payload === right.payload
  )
}

function reuseTurn(previous: TimelineTurn | undefined, next: TimelineTurn): TimelineTurn {
  if (!previous) return next

  return previous.turn === next.turn &&
    previous.status === next.status &&
    previous.answer === next.answer &&
    previous.hasProcess === next.hasProcess &&
    previous.processStart === next.processStart &&
    previous.foldable === next.foldable &&
    previous.interleaved === next.interleaved &&
    previous.startedAt === next.startedAt &&
    previous.completedAt === next.completedAt &&
    previous.elapsedMs === next.elapsedMs
    ? previous
    : next
}

function reuseEntries(previous: readonly TimelineEntry[] | undefined, next: TimelineEntry[]) {
  if (!previous || previous.length !== next.length) return next

  return previous.every((entry, index) => sameEntry(entry, next[index]!)) ? previous : next
}

function sameEntry(left: TimelineEntry, right: TimelineEntry) {
  if (left.kind !== right.kind || left.key !== right.key) return false

  if (left.kind === "node" || right.kind === "node") return true

  return left.turn === right.turn && sameChildren(left.children, right.children)
}

function sameChildren(previous: readonly TimelineChild[], next: readonly TimelineChild[]) {
  return previous.length === next.length && previous.every((child, index) => sameChild(child, next[index]!))
}

function sameChild(left: TimelineChild, right: TimelineChild) {
  return left.kind === right.kind && left.key === right.key
}

/**
 * Keeps the previous group when its rendering inputs did not change. Groups are rebuilt every projection,
 * so without this every mounted fold re-reads its heading and rows on each streamed delta.
 */
function reuseGroup(previous: TimelineGroup | undefined, next: TimelineGroup): TimelineGroup {
  return previous && sameGroup(previous, next) ? previous : next
}

function sameGroup(left: TimelineGroup, right: TimelineGroup) {
  return (
    left.key === right.key &&
    left.turn === right.turn &&
    left.closed === right.closed &&
    left.running === right.running &&
    left.icon === right.icon &&
    left.single === right.single &&
    left.runningDetail === right.runningDetail &&
    left.lead === right.lead &&
    sameStrings(left.members, right.members) &&
    sameItems(left.items, right.items) &&
    sameCounts(left.counts, right.counts) &&
    sameStrings(left.uncategorized, right.uncategorized)
  )
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sameItems(left: readonly GroupItem[], right: readonly GroupItem[]) {
  if (left.length !== right.length) return false

  return left.every((item, index) => {
    const other = right[index]

    if (!other || item.kind !== other.kind || item.key !== other.key) return false

    if (item.kind === "row" || other.kind === "row") return item.kind === other.kind

    return item.activity === other.activity && sameStrings(item.members, other.members)
  })
}

function sameCounts(left: readonly ActivityCount[], right: readonly ActivityCount[]) {
  if (left.length !== right.length) return false

  return left.every((count, index) => {
    const other = right[index]

    return other !== undefined && count.kind === other.kind && count.count === other.count
  })
}

/** Keeps a turn's changed-file entries when a step recorded the same file and counts again. */
function reuseChanges(previous: readonly ChangedFile[] | undefined, next: ChangedFile[]) {
  if (!previous || previous.length !== next.length) return next

  let same = true

  const files = next.map((file, index) => {
    const old = previous[index]

    if (!old || old.path !== file.path || old.additions !== file.additions || old.deletions !== file.deletions) {
      same = false

      return file
    }

    return old
  })

  return same ? previous : files
}

/**
 * The files a turn changed, summed per path, read from the tool results that recorded them. This runs once
 * per projection over the turn's own rows; a per-row component would rescan the whole transcript each time.
 */
function turnChanges(nodes: readonly TimelineNode[], turn: number): ChangedFile[] {
  const changed = new Map<string, ChangedFile>()

  for (const node of nodes) {
    if (node.turn !== turn || node.hidden || node.payload.kind !== "tool") continue
    const metadata = "metadata" in node.payload.tool.state ? node.payload.tool.state.metadata : undefined

    if (!Array.isArray(metadata?.files)) continue

    for (const diff of metadata.files) {
      if (!changedFileDiff(diff)) continue

      const file = changed.get(diff.file) ?? { path: diff.file, additions: 0, deletions: 0 }
      changed.set(diff.file, {
        path: file.path,
        additions: file.additions + diff.additions,
        deletions: file.deletions + diff.deletions,
      })
    }
  }

  return [...changed.values()]
}

/**
 * Project the loaded message window into ordered turns: one input, one process run, and the answer
 * per turn. Streaming parts keep their identity, so a delta updates a row instead of replacing it.
 * `previous` is the last projection: a row whose payload did not change keeps that payload object, so a
 * streamed delta only wakes the row it touched instead of every memo in the transcript.
 */
export function projectTimeline(
  messages: readonly SessionMessageInfo[],
  previous?: Snapshot,
  pendingInputIDs?: ReadonlySet<string>,
): Snapshot {
  const drafts: TurnDraft[] = []
  const turns = new Map<number, TimelineTurn>()
  const changes = new Map<number, readonly ChangedFile[]>()
  const nodes: TimelineNode[] = []
  let current: TurnDraft | undefined
  /** What the previous step injected, so an unchanged baseline is not reported as a new event. */
  let injected: Map<string, ContextSource> | undefined

  const openTurn = (startedAt?: number): TurnDraft => {
    if (current) return current
    current = { turn: drafts.length + 1, nodes: [], startedAt }
    drafts.push(current)

    return current
  }

  const push = (
    draft: TurnDraft,
    payload: TimelineNode["payload"],
    key: string,
    messageID: string,
    groupTree?: GroupTree,
    partID?: string,
    hidden?: boolean,
  ) => {
    const node = reuseNode(previous?.nodes.get(key), {
      key,
      turn: draft.turn,
      payload: reusePayload(previous?.nodes.get(key)?.payload, payload),
      messageID,
      partID,
      groupTree,
      hidden,
    })

    draft.nodes.push(node)
    nodes.push(node)

    return node
  }

  // A later step supersedes the one before it, so the turn's failure and retry notice belong to its last step.
  const drop = (draft: TurnDraft, node: TimelineNode) => {
    const local = draft.nodes.indexOf(node)

    if (local >= 0) draft.nodes.splice(local, 1)
    const global = nodes.indexOf(node)

    if (global >= 0) nodes.splice(global, 1)
  }

  const supersede = (draft: TurnDraft) => {
    if (draft.errorNode) drop(draft, draft.errorNode)

    if (draft.retryNode) drop(draft, draft.retryNode)
    draft.errorNode = undefined
    draft.retryNode = undefined
    draft.failure = undefined

    // The idle marker closes a busy period, not the turn: a doorbell successor (a background job, a
    // subagent report, a moved or compacted continuation) keeps working in the same turn with no input
    // row between. Its step reopens the turn, so the reader never watches a "completed" answer grow.
    draft.idle = false
  }

  for (const message of messages) {
    if (message.type === "user") {
      // A steer joins the run it interrupts: the execution ends at the idle marker, not at the next
      // input. Only an input that finds no live turn opens a turn of its own.
      if (!current || current.idle) {
        current = { turn: drafts.length + 1, nodes: [], startedAt: message.time.created }
        drafts.push(current)
      }

      push(
        current,
        {
          kind: "input",
          text: message.text,
          files: message.files,
          agents: message.agents,
          skills: message.skills,
          created: message.time.created,
        },
        `input:${message.id}`,
        message.id,
        "exchange",
        `${message.id}:text:0`,
      )

      continue
    }

    const draft = openTurn(message.time.created)

    if (message.type === "shell") {
      // A shell row after a marker is a successor's work (a background command settling), not a
      // settled turn's detail: the run is going again, so the marker no longer ends the turn.
      draft.idle = false
      push(draft, { kind: "notice", text: message.command }, `shell:${message.id}`, message.id, "turn")

      continue
    }

    if (message.type === "idle") {
      draft.idle = true

      // A settled turn cannot still be waiting to retry; a late label must not outlive the execution.
      if (draft.retryNode) drop(draft, draft.retryNode)
      draft.retryNode = undefined

      // An execution can also end failed or stopped with the reason recorded only on the marker: a turn
      // whose last step never wrote its own error would otherwise read as a plain completed answer.
      if (message.outcome !== "succeeded" && draft.failure === undefined)
        if (message.outcome === "failed") {
          draft.failure = "failed"

          if (message.error && !draft.errorNode)
            draft.errorNode = push(
              draft,
              { kind: "error", text: message.error.message },
              `error:${message.id}`,
              message.id,
              "turn",
            )
        } else draft.failure = "stopped"

      continue
    }

    if (message.type !== "assistant") {
      const copy = noticeCopy(message)
      const wake = backgroundWake(message, pendingInputIDs)

      // Interrupting finished work, the report opens its own segment; the run it wakes hangs off the
      // notice instead of off the question whose answer slot it would otherwise steal.
      if (copy && wake && turnHasWork(draft)) {
        const segment: TurnDraft = { turn: drafts.length + 1, nodes: [], startedAt: message.time.created }
        drafts.push(segment)
        current = segment
        push(segment, { kind: "notice", ...copy, wake }, `notice:${message.id}`, message.id, "turn")

        continue
      }

      if (copy) push(draft, { kind: "notice", ...copy }, `notice:${message.id}`, message.id, "turn")

      continue
    }

    const streaming = message.time.completed === undefined

    // Each message is a step of the turn; the reader sees only the last step's failure.
    supersede(draft)

    if (streaming) draft.streaming = true

    const context = injectedContext(message)

    if (context) {
      // Every step resends the same system prefix; only the sources that changed since the previous step are an event.
      // Field equality keeps the unchanged bodies from being serialized on every re-projection of the history.
      const incoming = new Map(context.map((source) => [source.key, source]))
      const changed = context.filter((source) => !sameContextSource(injected?.get(source.key), source))

      if (changed.length > 0) {
        push(
          draft,
          {
            kind: "context",
            // A change row lists only what differs; the first injection of a turn is the baseline itself.
            sources: injected === undefined ? context : changed,
            change: injected === undefined ? "inject" : "change",
          },
          `context:${message.id}`,
          message.id,
          "turn",
        )
        injected = incoming
      }
    }

    if (message.time.completed !== undefined) draft.completedAt = message.time.completed

    const ordinals = { text: 0, reasoning: 0 }

    for (const content of message.content) {
      if (content.type === "text") {
        const ordinal = ordinals.text++

        if (!content.text.trim()) continue
        push(draft, { kind: "assistant", text: content.text, streaming }, `assistant:${message.id}:${ordinal}`, message.id, undefined, `${message.id}:text:${ordinal}`)

        continue
      }

      if (content.type === "reasoning") {
        const ordinal = ordinals.reasoning++

        if (!content.text.trim()) continue
        push(
          draft,
          { kind: "reasoning", text: content.text, streaming },
          `reasoning:${message.id}:${ordinal}`,
          message.id,
          "process",
          `${message.id}:reasoning:${ordinal}`,
          false,
        )

        continue
      }

      push(draft, { kind: "tool", tool: content }, `tool:${message.id}:${content.id}`, message.id, "process", content.id)
    }

    // A retry schedule and the failure it retries describe the same step, so only one of them owns the
    // reason: a pending retry shows the retry row, and a final failure shows the error row. Messages
    // written before a retry cleared its error must not show the same reason twice.
    if (message.retry && !message.error)
      draft.retryNode = push(
        draft,
        { kind: "retry", attempt: message.retry.attempt, text: message.retry.error.message },
        `retry:${message.id}`,
        message.id,
        "turn",
      )

    if (message.error) {
      const interrupted = isInterruptedError(message.error)
      draft.failure = interrupted ? "stopped" : "failed"

      // A stopped turn already says it stopped; repeating "Step interrupted" under a failure title only
      // restates the state in worse words.
      if (!interrupted)
        draft.errorNode = push(
          draft,
          { kind: "error", text: message.error.message },
          `error:${message.id}`,
          message.id,
          "turn",
        )
    }
  }

  const groups = new Map<string, TimelineGroup>()
  const entries: TimelineEntry[] = []

  for (const draft of drafts) {
    // The answer is the turn's last reply that was not a step still doing work, like DSH's turn tail picks
    // its closing reply: a message that also called tools is process commentary, so the reply the reader
    // asked for stays outside the folded process even when more tool steps follow it.
    const toolMessages = new Set(
      draft.nodes.filter((node) => node.payload.kind === "tool").map((node) => node.messageID),
    )

    const answer =
      draft.nodes.findLast(
        (node) =>
          node.payload.kind === "assistant" &&
          node.payload.text.trim() !== "" &&
          !toolMessages.has(node.messageID),
      ) ?? tailReply(draft)

    // A turn closes only when a closing answer exists; a step reply followed by work never closes it.
    // The server marks the end of a turn with an idle message; without one, a closing answer ends it.
    const lastTurn = draft === drafts[drafts.length - 1]

    // Historical turns are always closed; only the tail turn can still be running.
    // The last turn closes only while the idle marker is its last settled word: a step finishing
    // mid-stream is not the end (closing it for one frame collapses the transcript and the next step
    // expands it again, which the reader sees as the content jumping), and neither is a marker the
    // run already worked past — a doorbell successor reopens the turn until its own marker settles.
    const status: TimelineTurn["status"] =
      draft.failure ?? (!lastTurn || draft.idle === true ? "closed" : "open")

    const process = draft.nodes.filter((node) => node.groupTree === "process")
    const foldable = status === "closed" && answer !== undefined && process.length > 0
    const inputs = draft.nodes.filter((node) => node.payload.kind === "input")
    const firstInput = inputs[0]
    // Where each steered prompt cuts the process: how many rows were already laid out above it.
    const splits = new Map<string, number>()
    const turnChildren: TimelineChild[] = []
    // A wake banner sits outside the fold: it is the headline of the whole segment, always visible.
    const wakeKeys: string[] = []
    const runs: { key: string; members: TimelineNode[]; notice: boolean }[] = []
    let run: TimelineNode[] = []

    const flush = () => {
      summarySeen = false

      if (run.length === 0) return

      // An injected context is a step of its own, so it keeps a group and its entries; a bare summary
      // row still lays flat.
      const injected = run.some((node) => node.payload.kind === "notice" || node.payload.kind === "context")

      if (!injected && !run.some((node) => node.groupTree === "process")) {
        for (const node of run) turnChildren.push({ kind: "node", key: node.key })
        run = []

        return
      }

      // The group key names its first row, not the turn's position in the loaded window: a page-in shifts every turn
      // number, and a disclosure keyed by that number would reopen the wrong step.
      const key = `group:${run[0]?.key ?? ""}`
      runs.push({ key, members: run, notice: false })
      turnChildren.push({ kind: "group", key })
      run = []
    }

    // One group per step: calls and context injections accumulate until a step summary closes the step.
    let summaryMessage: string | undefined
    let summarySeen = false

    for (const node of draft.nodes) {
      // The wake block is its segment's headline: it lays flat above the folded process so the reader
      // always sees what woke the work below without opening anything.
      if (node.payload.kind === "notice" && node.payload.wake) {
        flush()
        wakeKeys.push(node.key)
        continue
      }

      if (node.payload.kind === "input") {
        // A steered prompt cuts the process at this point: the work it set off belongs under the bubble, not above
        // it, or the reader sees the run still busy with the old task after their own words. A prompt delivered
        // into a wake-opened segment cuts too: it arrived after the work the report woke, above the reply it asked.
        if (node !== firstInput || draft.nodes[0] !== node) {
          flush()
          splits.set(node.key, turnChildren.length)
        }

        continue
      }

      // A step summary is a reply row of its own: everything before it is laid flat above it, and
      // everything after it opens a new group below it.
      if (node.payload.kind === "assistant") {
        if (run.length > 0) {
          flush()
          summaryMessage = undefined
        }

        run.push(node)
        flush()
        summaryMessage = node.messageID
        summarySeen = true

        continue
      }

      if (node.groupTree !== "process" && node.payload.kind !== "notice" && node.payload.kind !== "context") continue

      if (summaryMessage !== undefined && node.messageID !== summaryMessage) {
        flush()
        summaryMessage = undefined
      }

      if (node.payload.kind === "reasoning" && summarySeen) {
        flush()
        summaryMessage = undefined
      }

      if (summarySeen) {
        flush()
        summaryMessage = undefined
      }

      run.push(node)
    }

    flush()

    // A group is live while the running turn has nothing after it but replies: those replies are the same
    // step's text, not a later block that already closed the run.
    const liveIndex = turnChildren.findLastIndex((child) => child.kind === "group")

    const liveKey =
      status === "open" && liveIndex >= 0 && turnChildren.slice(liveIndex + 1).every((child) => child.kind === "node")
        ? turnChildren[liveIndex]!.key
        : undefined

    for (const item of runs) {
      const closed = item.notice || item.key !== liveKey

      groups.set(
        item.key,
        reuseGroup(
          previous?.groups.get(item.key),
          summarizeGroup(item.key, draft.turn, item.members, closed, item.notice),
        ),
      )
    }

    // A plain turn opens on its prompt; a wake-anchored segment opens on its banner, and a prompt delivered
    // into it joins the cut list at the spot delivery put it: under the woken work, above the reply it asked.
    const leading = draft.nodes[0]
    const opensWithPrompt = leading?.payload.kind === "input"

    if (leading && opensWithPrompt) entries.push({ kind: "node", key: leading.key })

    for (const key of wakeKeys) entries.push({ kind: "node", key })

    // One fold per stretch of work, each steered prompt dropped between the stretch it interrupted and the stretch
    // that answers it. A prompt the run has not taken up yet splits nothing: no work has come from it, so it stays
    // past the streaming reply, below everything the run has done so far.
    // The run takes a prompt up as soon as a row of its own follows it, reply text or not: waiting for the first
    // words would leave the work it set off reading as the task before the prompt.
    const steers = opensWithPrompt ? inputs.slice(1) : inputs
    const lastWork = draft.nodes.findLastIndex((node) => node.payload.kind !== "input")
    const taken = steers.filter((steer) => draft.nodes.indexOf(steer) < lastWork)
    const waiting = steers.filter((steer) => draft.nodes.indexOf(steer) >= lastWork)
    let laid = 0

    for (const steer of taken) {
      const at = splits.get(steer.key) ?? turnChildren.length

      pushFold(entries, draft.turn, turnChildren.slice(laid, at))
      entries.push({ kind: "node", key: steer.key })
      laid = at
    }

    pushFold(entries, draft.turn, turnChildren.slice(laid))

    if (answer) entries.push({ kind: "node", key: answer.key })

    for (const steer of waiting) entries.push({ kind: "node", key: steer.key })

    for (const node of draft.nodes)
      if (node.payload.kind === "error" || node.payload.kind === "retry")
        entries.push({ kind: "node", key: node.key })

    const elapsedMs =
      draft.startedAt === undefined || draft.completedAt === undefined
        ? undefined
        : Math.max(0, draft.completedAt - draft.startedAt)

    turns.set(
      draft.turn,
      reuseTurn(previous?.turns.get(draft.turn), {
        turn: draft.turn,
        status,
        answer: answer?.key ?? null,
        hasProcess: process.length > 0,
        processStart: process[0]?.key ?? null,
        foldable,
        interleaved: inputs.length > 1,
        startedAt: draft.startedAt,
        completedAt: draft.completedAt,
        elapsedMs,
      }),
    )
    changes.set(draft.turn, reuseChanges(previous?.changes.get(draft.turn), turnChanges(draft.nodes, draft.turn)))
  }

  return {
    entries: reuseEntries(previous?.entries, entries),
    nodes: new Map(nodes.map((node) => [node.key, node] as const)),
    groups,
    turns,
    changes,
  }
}

/**
 * The reply to fall back on when every text of the turn sat in a message that also called tools. A turn the
 * reader stopped or that failed only answers with the text that really ended it: when the interrupt cut into a
 * tool call, the last words were step commentary, and a footer there invites copying or forking from work that
 * never landed. A turn that closed on its own keeps its last text as the reply, tools beside it or not.
 */
function tailReply(draft: TurnDraft) {
  const tail = draft.nodes.findLast(
    (node) => node.payload.kind === "assistant" && node.payload.text.trim() !== "",
  )

  if (!tail || draft.failure === undefined) return tail

  return draft.nodes
    .slice(draft.nodes.indexOf(tail) + 1)
    .some((node) => node.payload.kind === "tool" || node.payload.kind === "reasoning" || node.payload.kind === "retry")
    ? undefined
    : tail
}

/** One stretch of a turn's process as its own fold. A steer leaves an empty stretch behind, which folds nothing. */
function pushFold(entries: TimelineEntry[], turn: number, children: readonly TimelineChild[]) {
  if (children.length === 0) return

  entries.push({ kind: "fold", turn, key: `fold:${children[0]!.key}`, children })
}

/** One contiguous run's ranked categories and live activity. Only tools count as categories. */
function summarizeGroup(
  key: string,
  turn: number,
  members: readonly TimelineNode[],
  closed: boolean,
  notice: boolean,
): TimelineGroup {
  if (notice)
    return {
      key,
      turn,
      members: members.map((member) => member.key),
      items: groupItems(key, members),
      closed,
      counts: [{ kind: "context", count: 1 }],
      uncategorized: [],
      runningDetail: "",
    }

  const counts = new Map<ProcessActivity, number>()
  const names: string[] = []
  // Tools with no category of their own are named in the summary instead of "Called tools".
  const uncategorized: string[] = []
  const order: ProcessActivity[] = []
  let running: ProcessActivity | undefined
  let runningDetail = ""
  let runningIndex = -1
  let reasoningStreaming = false
  let reasoningDetail = ""
  // The heading speaks for the running call, else the last one.
  let icon: string | undefined
  let runningIcon: string | undefined
  let lead: ToolContent | undefined
  let runningLead: ToolContent | undefined

  for (const [index, member] of members.entries()) {
    if (member.payload.kind === "reasoning") {
      if (member.payload.streaming) {
        reasoningStreaming = true
        reasoningDetail = reasoningTail(member.payload.text) ?? reasoningDetail
      }

      continue
    }

    if (member.payload.kind === "notice" || member.payload.kind === "context") {
      if (!counts.has("context")) order.push("context")
      counts.set("context", (counts.get("context") ?? 0) + 1)

      continue
    }

    if (member.payload.kind !== "tool") continue
    const kind = toolActivity(member.payload.tool)
    const memberIcon = toolMark(member.payload.tool)
    const name = toolLabel(member.payload.tool.name)

    icon = memberIcon
    lead = member.payload.tool

    if (!names.includes(name)) names.push(name)

    if (kind === "tools" && !uncategorized.includes(name)) uncategorized.push(name)

    if (!counts.has(kind)) order.push(kind)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)

    const state = member.payload.tool.state.status

    if ((state === "running" || state === "streaming") && index >= runningIndex) {
      running = kind
      runningDetail = toolDescription(member.payload.tool) ?? ""
      runningIndex = index
      runningIcon = memberIcon
      runningLead = member.payload.tool
    }
  }

  const ranked: ActivityCount[] = [...counts]
    .map(([kind, count]) => ({ kind, count }))
    .sort((left, right) => right.count - left.count || order.indexOf(left.kind) - order.indexOf(right.kind))

  const base = {
    key,
    turn,
    members: members.map((member) => member.key),
    items: groupItems(key, members),
    closed,
    counts: ranked,
    uncategorized,
    lead: runningLead ?? lead,
    single: names.length === 1 ? names[0] : undefined,
    icon: runningIcon ?? icon,
    runningDetail: closed ? "" : running ? runningDetail : reasoningDetail,
  }

  if (closed) return base

  if (running !== undefined) return { ...base, running }

  if (reasoningStreaming) return { ...base, running: "thinking" }

  return base
}

/**
 * Two steps fold together only when they repeat the same activity on the same target. This covers every
 * step kind, not only edits: a run of reads on one file, one command, one thought, or one notice folds too.
 */
function repeatSignature(node: TimelineNode) {
  if (node.payload.kind === "tool") return `${toolActivity(node.payload.tool)}|${toolSummary(node.payload.tool)}`

  if (node.payload.kind === "reasoning") return "thinking"

  if (node.payload.kind === "notice") return `context|${node.payload.text}`

  return undefined
}

function activityOf(node: TimelineNode): ProcessActivity {
  if (node.payload.kind === "tool") return toolActivity(node.payload.tool)

  if (node.payload.kind === "reasoning") return "thinking"

  return "context"
}

/**
 * The group body in order: consecutive steps with the same signature become one repeat item, so a burst
 * of reads or edits on one target reads as one row. A run of one stays a plain row, and a step with no
 * signature (or a different neighbour) never merges.
 */
function groupItems(groupKey: string, members: readonly TimelineNode[]): GroupItem[] {
  const runs: { key: string; activity: ProcessActivity; signature: string; members: string[] }[] = []

  for (const member of members) {
    // Step summaries sit outside the group body; only process rows fold.
    if (member.payload.kind === "assistant") continue

    const signature = repeatSignature(member)
    const last = runs.at(-1)

    if (signature !== undefined && last?.signature === signature) {
      last.members.push(member.key)

      continue
    }

    runs.push({
      // A solo member is keyed by its row; a repeat run needs its own identity across projections.
      key: `repeat:${groupKey}:${member.key}`,
      activity: activityOf(member),
      // Rows without a signature never merge, so each keeps its own run.
      signature: signature ?? member.key,
      members: [member.key],
    })
  }

  return runs.map((run) =>
    run.members.length === 1
      ? { kind: "row", key: run.members[0] }
      : { kind: "repeat", key: run.key, activity: run.activity, members: run.members },
  )
}

/** The first line of the newest reasoning paragraph, for the live activity detail. */
function reasoningTail(text: string) {
  const blocks = text.split(/\n\s*\n/).filter((block) => block.trim())

  return blocks.at(-1)?.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").trim()
}

/** The vertical space, in px, between entry `index` and the one above it in the answer flow. */
export function flowGapPx(snapshot: Snapshot, entries: readonly TimelineEntry[], index: number) {
  if (index <= 0) return 0

  const current = entries[index]
  const previous = entries[index - 1]

  if (!current || !previous) return 0

  // The answer sits 50px below the bubble. The prompt's action line is the row's own 24px tail (20px line plus a
  // 4px gap), so the answer contributes only the remaining 26px; making this gap 50 would double-count the time
  // line. The gap above the prompt stays wider than the rhythm because nothing sits in it.
  if (previous.kind === "node" && snapshot.nodes.get(previous.key)?.payload.kind === "input") return 26

  if (current.kind === "node" && snapshot.nodes.get(current.key)?.payload.kind === "input") return 24

  // A wake banner keeps clear air above it: only a settled reply's own 28px hover-action strip counts as
  // the margin (space added there would double-count it); under anything else — a change card, a fold, a
  // step row — the banner carries the full 24px itself.
  if (isWakeBanner(snapshot, current)) return isResponse(snapshot, previous) ? 0 : 24

  // Below the banner the row it introduces keeps the same breathing room the reply's hover-action strip
  // gives above it: 12px against the 28px strip reads as the bar hugging its follow-up, not centered.
  if (isWakeBanner(snapshot, previous)) return 24

  if (current.kind === "fold") return 12

  if (isResponse(snapshot, current) || isResponse(snapshot, previous)) return 16

  return 4
}

function isResponse(snapshot: Snapshot, entry: TimelineEntry) {
  return entry.kind === "node" && snapshot.nodes.get(entry.key)?.payload.kind === "assistant"
}

/** The flat segment-opening report row, as opposed to a notice riding inside a fold. */
export function isWakeBanner(snapshot: Snapshot, entry: TimelineEntry) {
  const payload = entry.kind === "node" ? snapshot.nodes.get(entry.key)?.payload : undefined

  return payload?.kind === "notice" && payload.wake !== undefined
}
