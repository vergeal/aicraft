import type { SessionMessageInfo } from "@opencode/client/promise"
import { Option, Schema } from "effect"
import { isInterruptedError } from "../timeline/turn-phase-machine"
import { toolActivity, toolDescription, toolSummary } from "./tool"
import type {
  ActivityCount,
  GroupItem,
  GroupTree,
  ProcessActivity,
  Snapshot,
  TimelineChild,
  TimelineEntry,
  TimelineGroup,
  TimelineNode,
  TimelineTurn,
} from "./types"

type TurnDraft = {
  readonly turn: number
  readonly nodes: TimelineNode[]
  startedAt?: number
  completedAt?: number
  failure?: "stopped" | "failed"
  streaming?: boolean
  idle?: boolean
}

const decodeNotice = Schema.decodeUnknownOption(
  Schema.Struct({
    text: Schema.optionalKey(Schema.String),
    description: Schema.optionalKey(Schema.String),
  }),
)

/**
 * Notice copy, or undefined when the message carries none (so its type tag never reaches the reader).
 * An injected context carries a one-line description and the full body in `text`; the body is what the
 * reader expands, so the row keeps it instead of flattening it into the truncated summary.
 */
function noticeCopy(message: SessionMessageInfo) {
  const value = Option.getOrUndefined(decodeNotice(message))
  const body = value?.text?.trim()
  const text = value?.description?.trim() || firstLine(body) || undefined

  if (!text) return undefined

  return { text, detail: body && body !== text ? body : undefined }
}

function firstLine(text: string | undefined) {
  return text?.split("\n").find((line) => line.trim())?.trim()
}

/**
 * Project the loaded message window into ordered turns: one input, one process run, and the answer
 * per turn. Streaming parts keep their identity, so a delta updates a row instead of replacing it.
 */
export function projectTimeline(messages: readonly SessionMessageInfo[]): Snapshot {
  const drafts: TurnDraft[] = []
  const turns = new Map<number, TimelineTurn>()
  const nodes: TimelineNode[] = []
  let anchor = 0
  let current: TurnDraft | undefined

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
    const node: TimelineNode = { key, turn: draft.turn, anchor: anchor++, payload, messageID, partID, groupTree, hidden }
    draft.nodes.push(node)
    nodes.push(node)

    return node
  }

  for (const message of messages) {
    if (message.type === "user") {
      current = { turn: drafts.length + 1, nodes: [], startedAt: message.time.created }
      drafts.push(current)
      push(current, { kind: "input", text: message.text }, `input:${message.id}`, message.id, "exchange", `${message.id}:text:0`)

      continue
    }

    const draft = openTurn(message.time.created)

    if (message.type === "shell") {
      push(draft, { kind: "notice", text: message.command }, `shell:${message.id}`, message.id, "turn")

      continue
    }

    if (message.type === "idle") {
      draft.idle = true

      continue
    }

    if (message.type !== "assistant") {
      const copy = noticeCopy(message)

      if (copy) push(draft, { kind: "notice", ...copy }, `notice:${message.id}`, message.id, "turn")

      continue
    }

    const streaming = message.time.completed === undefined

    if (streaming) draft.streaming = true

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

    if (message.retry)
      push(
        draft,
        { kind: "retry", attempt: message.retry.attempt, text: message.retry.error.message },
        `retry:${message.id}`,
        message.id,
        "turn",
      )

    if (message.error) {
      draft.failure = isInterruptedError(message.error) ? "stopped" : "failed"
      push(draft, { kind: "error", text: message.error.message }, `error:${message.id}`, message.id, "turn")
    }
  }

  const groups = new Map<string, TimelineGroup>()
  const entries: TimelineEntry[] = []
  const children = new Map<number, readonly TimelineChild[]>()

  for (const draft of drafts) {
    // The answer is the last assistant output: the final node of the turn and the last block of its
    // assistant message. Anything after it means the text was a step summary, not the answer.
    const tail = draft.nodes.at(-1)
    const answer = tail?.payload.kind === "assistant" ? tail : undefined

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
      const injected = run.some((node) => node.payload.kind === "notice")

      if (!injected && !run.some((node) => node.groupTree === "process")) {
        for (const node of run) turnChildren.push({ kind: "node", key: node.key })
        run = []

        return
      }

      const key = `group:${draft.turn}:${run[0]?.key ?? ""}`
      runs.push({ key, members: run, notice: false })
      turnChildren.push({ kind: "group", key })
      run = []
    }

    // One group per step: calls and context injections accumulate until a step summary closes the step.
    let summaryMessage: string | undefined
    let summarySeen = false

    for (const node of draft.nodes) {
      if (node.payload.kind === "input" || node === answer) continue

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

      if (node.groupTree !== "process" && node.payload.kind !== "notice") continue

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

    // Only a group that is still the last thing in a running turn is live; anything followed by a
    // reply or another block already closed.
    const lastChild = turnChildren.at(-1)
    const liveKey = status === "open" && lastChild?.kind === "group" ? lastChild.key : undefined

    for (const item of runs) {
      const closed = item.notice || item.key !== liveKey

      groups.set(item.key, summarizeGroup(item.key, draft.turn, item.members, closed, item.notice))
    }

    children.set(draft.turn, turnChildren)

    const input = draft.nodes.find((node) => node.payload.kind === "input")

    if (input) entries.push({ kind: "node", key: input.key })

    if (turnChildren.length > 0) entries.push({ kind: "fold", turn: draft.turn })

    if (answer) entries.push({ kind: "node", key: answer.key })

    for (const node of draft.nodes)
      if (node.payload.kind === "error" || node.payload.kind === "retry")
        entries.push({ kind: "node", key: node.key })

    const elapsedMs =
      draft.startedAt === undefined || draft.completedAt === undefined
        ? undefined
        : Math.max(0, draft.completedAt - draft.startedAt)

    turns.set(draft.turn, {
      turn: draft.turn,
      status,
      answer: answer?.anchor ?? null,
      hasProcess: process.length > 0,
      processStart: process[0]?.anchor ?? null,
      foldable,
      startedAt: draft.startedAt,
      completedAt: draft.completedAt,
      elapsedMs,
    })
  }

  return {
    entries,
    nodes: new Map(nodes.map((node) => [node.key, node] as const)),
    groups,
    turns,
    children,
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
      runningDetail: "",
    }

  const counts = new Map<ProcessActivity, number>()
  const order: ProcessActivity[] = []
  let running: ProcessActivity | undefined
  let runningDetail = ""
  let runningAnchor = -1
  let reasoningStreaming = false
  let reasoningDetail = ""

  for (const member of members) {
    if (member.payload.kind === "reasoning") {
      if (member.payload.streaming) {
        reasoningStreaming = true
        reasoningDetail = reasoningTail(member.payload.text) ?? reasoningDetail
      }

      continue
    }

    if (member.payload.kind === "notice") {
      if (!counts.has("context")) order.push("context")
      counts.set("context", (counts.get("context") ?? 0) + 1)

      continue
    }

    if (member.payload.kind !== "tool") continue
    const kind = toolActivity(member.payload.tool.name)

    if (!counts.has(kind)) order.push(kind)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)

    const state = member.payload.tool.state.status

    if ((state === "running" || state === "streaming") && member.anchor >= runningAnchor) {
      running = kind
      runningDetail = toolDescription(member.payload.tool) ?? ""
      runningAnchor = member.anchor
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
    runningDetail: closed ? "" : running ? runningDetail : reasoningDetail,
  }

  if (closed) return base

  if (running !== undefined) return { ...base, running }

  if (reasoningStreaming) return { ...base, running: "thinking" }

  return base
}

/** Two steps fold together only when they repeat the same activity on the same target. */
function repeatSignature(node: TimelineNode) {
  if (node.payload.kind === "tool") return `${toolActivity(node.payload.tool.name)}|${toolSummary(node.payload.tool)}`

  if (node.payload.kind === "reasoning") return "thinking"

  if (node.payload.kind === "notice") return `context|${node.payload.text}`

  return undefined
}

function activityOf(node: TimelineNode): ProcessActivity {
  if (node.payload.kind === "tool") return toolActivity(node.payload.tool.name)

  if (node.payload.kind === "reasoning") return "thinking"

  return "context"
}

/**
 * The group body in order: consecutive steps with the same signature become one repeat item, so a burst
 * of edits to one file reads as one row. A run of one stays a plain row, and a step with no signature
 * (or a different neighbour) never merges.
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
