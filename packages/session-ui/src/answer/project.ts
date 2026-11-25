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

const decodeContext = Schema.decodeUnknownOption(
  Schema.Struct({
    metadata: Schema.Struct({
      context: Schema.Array(
        Schema.Struct({
          key: Schema.String,
          chars: Schema.Number,
          text: Schema.optionalKey(Schema.String),
          items: Schema.optionalKey(
            Schema.Array(
              Schema.Struct({
                name: Schema.String,
                chars: Schema.Number,
                text: Schema.optionalKey(Schema.String),
              }),
            ),
          ),
        }),
      ),
    }),
  }),
)

/** Context the Step injected ahead of the conversation, as its assistant message recorded it. */
function injectedContext(message: SessionMessageInfo) {
  const sources = Option.getOrUndefined(decodeContext(message))?.metadata.context

  return sources && sources.length > 0 ? sources : undefined
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
        previous.notice === next.notice
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

  return left.kind === "node" || right.kind === "node" || left.turn === right.turn
}

function reuseChildren(
  previous: readonly TimelineChild[] | undefined,
  next: TimelineChild[],
): readonly TimelineChild[] {
  if (!previous || previous.length !== next.length) return next

  return previous.every((child, index) => sameChild(child, next[index]!)) ? previous : next
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
export function projectTimeline(messages: readonly SessionMessageInfo[], previous?: Snapshot): Snapshot {
  const drafts: TurnDraft[] = []
  const turns = new Map<number, TimelineTurn>()
  const changes = new Map<number, readonly ChangedFile[]>()
  const nodes: TimelineNode[] = []
  let current: TurnDraft | undefined
  /** What the previous step injected, so an unchanged baseline is not reported as a new event. */
  let injected: Map<string, string> | undefined

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
      push(draft, { kind: "notice", text: message.command }, `shell:${message.id}`, message.id, "turn")

      continue
    }

    if (message.type === "idle") {
      draft.idle = true

      // A settled turn cannot still be waiting to retry; a late label must not outlive the execution.
      if (draft.retryNode) drop(draft, draft.retryNode)
      draft.retryNode = undefined

      continue
    }

    if (message.type !== "assistant") {
      const copy = noticeCopy(message)

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
      const signatures = new Map(context.map((source) => [source.key, JSON.stringify(source)]))
      const changed = context.filter((source) => injected?.get(source.key) !== signatures.get(source.key))

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
        injected = signatures
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
  const children = new Map<number, readonly TimelineChild[]>()

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
      ) ??
      draft.nodes.findLast((node) => node.payload.kind === "assistant" && node.payload.text.trim() !== "")

    // A turn closes only when a closing answer exists; a step reply followed by work never closes it.
    // The server marks the end of a turn with an idle message; without one, a closing answer ends it.
    const lastTurn = draft === drafts[drafts.length - 1]

    // Historical turns are always closed; only the tail turn can still be running.
    // Only the server's idle message closes the last turn. A step finishing mid-stream is not the end
    // of the turn: closing it for one frame collapses the transcript and the next step expands it
    // again, which the reader sees as the content jumping. Historical turns are always closed.
    const status: TimelineTurn["status"] =
      draft.failure ?? (!lastTurn || draft.idle === true ? "closed" : "open")

    const process = draft.nodes.filter((node) => node.groupTree === "process")
    const foldable = status === "closed" && answer !== undefined && process.length > 0
    const turnChildren: TimelineChild[] = []
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
      if (node.payload.kind === "input") continue

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

    children.set(draft.turn, reuseChildren(previous?.children.get(draft.turn), turnChildren))

    const inputs = draft.nodes.filter((node) => node.payload.kind === "input")

    if (inputs[0]) entries.push({ kind: "node", key: inputs[0].key })

    if (turnChildren.length > 0) entries.push({ kind: "fold", turn: draft.turn, key: `fold:${draft.nodes[0]!.key}` })

    // A delivered steer sits between the work it interrupted and the reply that work went on to produce.
    // One still waiting for delivery stays below the streaming text: the run has not taken it up yet.
    const steers = inputs.slice(1)
    const atAnswer = answer ? draft.nodes.indexOf(answer) : -1
    const beforeAnswer = answer ? steers.filter((node) => draft.nodes.indexOf(node) < atAnswer) : steers
    const afterAnswer = answer ? steers.filter((node) => draft.nodes.indexOf(node) >= atAnswer) : []

    for (const node of beforeAnswer) entries.push({ kind: "node", key: node.key })

    if (answer) entries.push({ kind: "node", key: answer.key })

    for (const node of afterAnswer) entries.push({ kind: "node", key: node.key })

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
    children,
    changes,
  }
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
function reasoningTail(text: string) {  const blocks = text.split(/\n\s*\n/).filter((block) => block.trim())

  return blocks.at(-1)?.split("\n").find((line) => line.trim())?.replace(/^#+\s*/, "").trim()
}

/** The ordered children of one turn: its process groups and phase replies. */
export function childrenOf(snapshot: Snapshot, turn: number): readonly TimelineChild[] {
  return snapshot.children.get(turn) ?? []
}
