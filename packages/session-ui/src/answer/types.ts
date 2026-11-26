import type {
  PromptAgentAttachment,
  PromptAttachment,
  PromptSkillAttachment,
  SessionMessageAssistant,
} from "@aicraft/client/promise"

/** Where a node stands in the group tree, outermost first. Ported from the DSH conversation model. */
export type GroupTree = "exchange" | "input" | "turn" | "process"

export type NodeKind = "input" | "assistant" | "reasoning" | "tool" | "notice" | "context" | "error" | "retry"

/** One entry inside an injected source, such as a single instruction file. */
export type ContextItem = {
  readonly name: string
  readonly chars: number
  /** Absent on steps recorded before the transcript captured injected text. */
  readonly text?: string
}

/** One source a Step injected ahead of the conversation, as the server reported it. */
export type ContextSource = {
  readonly key: string
  readonly chars: number
  /** Absent on steps recorded before the transcript captured injected text. */
  readonly text?: string
  readonly items?: readonly ContextItem[]
}

export type ToolContent = Extract<SessionMessageAssistant["content"][number], { type: "tool" }>

/** What one row renders. Rendering dispatches on the payload's kind, never on a raw message type. */
export type NodePayload =
  /** `files` is what the prompt carried besides its text: pictures to show, other files to link. `agents` and
   * `skills` carry the mention offsets that keep their @ references styled. */
  | {
      readonly kind: "input"
      readonly text: string
      readonly files?: readonly PromptAttachment[]
      readonly agents?: readonly PromptAgentAttachment[]
      readonly skills?: readonly PromptSkillAttachment[]
      readonly created: number
    }
  | { readonly kind: "assistant"; readonly text: string; readonly streaming: boolean }
  | { readonly kind: "reasoning"; readonly text: string; readonly streaming: boolean }
  | { readonly kind: "tool"; readonly tool: ToolContent }
  /** `detail` is the injected body, shown when the reader expands the notice. */
  | {
      readonly kind: "notice"
      readonly text: string
      readonly detail?: string
      readonly notice?: "instructions-updated" | "system-reminder"
      /**
       * A background completion that opened a segment of its own. The row reads as an expandable
       * completion block — the call it reports plus the captured output — so the run it wakes cannot
       * take the answer slot of the question above.
       */
      readonly wake?: {
        readonly source: "shell" | "subagent"
        readonly outcome: "completed" | "error" | "cancelled"
        readonly agent?: string
        readonly command?: string
        readonly output?: string
      }
    }
  /** Context the Step injected ahead of the conversation, listed by source. */
  | {
      readonly kind: "context"
      readonly sources: readonly ContextSource[]
      /** The first injection of a turn's baseline, or a later change to what was injected. */
      readonly change: "inject" | "change"
    }
  | { readonly kind: "error"; readonly text: string }
  | { readonly kind: "retry"; readonly attempt: number; readonly text: string }

/** One rendered row with a stable identity. */
export interface TimelineNode {
  readonly key: string
  readonly turn: number
  /** Durable message this row belongs to, for reveal and anchors. */
  readonly messageID?: string
  /** The content part this row renders, using the timeline's `messageID:kind:ordinal` identity. */
  readonly partID?: string
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
  /** The names of the group's tools that have no activity category of their own. */
  readonly uncategorized: readonly string[]
  /** The category of the newest still-running call, when the group has one. */
  readonly running?: ProcessActivity
  /** The declared mark of the group's tools when every tool in it agrees on one. */
  readonly icon?: string
  /** The tool the heading speaks for: the running call, else the last call of the run. */
  readonly lead?: ToolContent
  /** Every tool in the group advertises this one name, so the heading can use its own phrasing. */
  readonly single?: string
  /** One line of the newest running call's arguments, for the live title. */
  readonly runningDetail: string
}

export type TimelineEntry =
  | { readonly kind: "node"; readonly key: string }
  // The key is derived from the turn's first row, not its position: paging older messages in shifts every turn number,
  // which made a remembered fold key point at a different turn after activation and lost the reader's place.
  // A prompt steered into a running turn splits its process, so one turn can hold several folds: each carries the rows
  // it lays out, and the bubble between them names where the run took the prompt up.
  | {
      readonly kind: "fold"
      readonly turn: number
      readonly key: string
      readonly children: readonly TimelineChild[]
    }

/** What a turn renders, in order, between its input and its final answer. */
export type TimelineChild = { readonly kind: "group"; readonly key: string } | { readonly kind: "node"; readonly key: string }

export interface TimelineTurn {
  readonly turn: number
  readonly status: "open" | "closed" | "stopped" | "failed"
  /** The row key of the turn's closing answer. */
  readonly answer: string | null
  readonly hasProcess: boolean
  /** The row key of the turn's first process row, when the turn has any. */
  readonly processStart: string | null
  /** A closed turn with an answer can fold its process. */
  readonly foldable: boolean
  /** A prompt arrived while this turn was still working, splitting its process; such a turn never folds as a whole. */
  readonly interleaved: boolean
  /** When the turn's prompt was created. */
  readonly startedAt?: number
  /** When its last step completed, once it has. */
  readonly completedAt?: number
  /** Wall-clock duration of the turn, when both ends are known. */
  readonly elapsedMs?: number
}

/** One file a turn changed, summed across every step that recorded it. */
export interface ChangedFile {
  readonly path: string
  readonly additions: number
  readonly deletions: number
}

export interface Snapshot {
  readonly entries: readonly TimelineEntry[]
  readonly nodes: ReadonlyMap<string, TimelineNode>
  readonly groups: ReadonlyMap<string, TimelineGroup>
  readonly turns: ReadonlyMap<number, TimelineTurn>
  /** The files each turn changed, keyed by turn number. */
  readonly changes: ReadonlyMap<number, readonly ChangedFile[]>
}
