import type { SessionMessageAssistant } from "@opencode/client/promise"

/** Where a node stands in the group tree, outermost first. Ported from the DSH conversation model. */
export type GroupTree = "exchange" | "input" | "turn" | "process"

export type NodeKind = "input" | "assistant" | "reasoning" | "tool" | "notice" | "error" | "retry"

export type ToolContent = Extract<SessionMessageAssistant["content"][number], { type: "tool" }>

/** What one row renders. Rendering dispatches on the payload's kind, never on a raw message type. */
export type NodePayload =
  | { readonly kind: "input"; readonly text: string }
  | { readonly kind: "assistant"; readonly text: string; readonly streaming: boolean }
  | { readonly kind: "reasoning"; readonly text: string; readonly streaming: boolean }
  | { readonly kind: "tool"; readonly tool: ToolContent }
  /** `detail` is the injected body, shown when the reader expands the notice. */
  | { readonly kind: "notice"; readonly text: string; readonly detail?: string }
  | { readonly kind: "error"; readonly text: string }
  | { readonly kind: "retry"; readonly attempt: number; readonly text: string }

/** One rendered row with a stable identity and an ordering anchor. */
export interface TimelineNode {
  readonly key: string
  readonly turn: number
  /** Durable message this row belongs to, for reveal and anchors. */
  readonly messageID?: string
  /** The content part this row renders, using the timeline's `messageID:kind:ordinal` identity. */
  readonly partID?: string
  /** Monotonic position in the loaded window. */
  readonly anchor: number
  readonly groupTree?: GroupTree
  /** A leading thought stays in the model but is not drawn. */
  readonly hidden?: boolean
  readonly payload: NodePayload
}

/** The work category a process row reports, using the DSH activity vocabulary. */
export type ProcessActivity =
  | "thinking"
  | "read"
  | "readImage"
  | "write"
  | "search"
  | "edit"
  | "commands"
  | "code"
  | "webSearch"
  | "webFetch"
  | "subagents"
  | "plan"
  | "questions"
  | "context"
  | "tools"

export interface ActivityCount {
  readonly kind: ProcessActivity
  readonly count: number
}

/** One entry of a group body: a single row, or a run of identical consecutive steps folded into one. */
export type GroupItem =
  | { readonly kind: "row"; readonly key: string }
  | { readonly kind: "repeat"; readonly key: string; readonly activity: ProcessActivity; readonly members: readonly string[] }

/** One contiguous run of process rows inside a turn. */
export interface TimelineGroup {
  readonly key: string
  readonly turn: number
  readonly members: readonly string[]
  /** The group body in order: identical consecutive steps share one repeat item. */
  readonly items: readonly GroupItem[]
  readonly closed: boolean
  /** Categories ranked by call count, ties by first appearance. */
  readonly counts: readonly ActivityCount[]
  /** The category of the newest still-running call, when the group has one. */
  readonly running?: ProcessActivity
  /** One line of the newest running call's arguments, for the live title. */
  readonly runningDetail: string
}

export type TimelineEntry =
  | { readonly kind: "node"; readonly key: string }
  | { readonly kind: "fold"; readonly turn: number }

/** What a turn renders, in order, between its input and its final answer. */
export type TimelineChild = { readonly kind: "group"; readonly key: string } | { readonly kind: "node"; readonly key: string }

export interface TimelineTurn {
  readonly turn: number
  readonly status: "open" | "closed" | "stopped" | "failed"
  readonly answer: number | null
  readonly hasProcess: boolean
  /** Anchor of the first process row, when the turn has any. */
  readonly processStart: number | null
  /** A closed turn with an answer can fold its process. */
  readonly foldable: boolean
  /** When the turn's prompt was created. */
  readonly startedAt?: number
  /** When its last step completed, once it has. */
  readonly completedAt?: number
  /** Wall-clock duration of the turn, when both ends are known. */
  readonly elapsedMs?: number
}

export interface Snapshot {
  readonly entries: readonly TimelineEntry[]
  readonly nodes: ReadonlyMap<string, TimelineNode>
  readonly groups: ReadonlyMap<string, TimelineGroup>
  readonly turns: ReadonlyMap<number, TimelineTurn>
  readonly children: ReadonlyMap<number, readonly TimelineChild[]>
}
