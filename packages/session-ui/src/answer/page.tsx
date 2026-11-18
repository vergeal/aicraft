import { For, Show, createEffect, createMemo, createSignal, createUniqueId, on, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Predicate } from "effect"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import type { IconName } from "@opencode/ui/icons/catalog"
import { TextShimmer } from "@opencode/ui/text-shimmer"
import { Spinner } from "@opencode/ui/spinner"
import { useI18n } from "@opencode/ui/context/i18n"
import { Markdown } from "../components/markdown"
import { writeClipboard } from "../components/markdown-clipboard"
import { childrenOf, projectTimeline } from "./project"
import { toolActivity, toolDescription, toolError, toolInput, toolOutput } from "./tool"
import type {
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

export interface AnswerPageProps {
  readonly messages: () => readonly SessionMessageInfo[]
  readonly view?: TranscriptView
  readonly collapseTiming?: CollapseTiming
  readonly foldedReplies?: FoldedReplies
  readonly class?: string
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

/** DSH's closed-group title: the top categories as one past-tense phrase. */
function processTitle(i18n: ReturnType<typeof useI18n>, group: TimelineGroup) {
  const labels = group.counts.slice(0, 3).map((item) => i18n.t(STEP_DONE[item.kind]))
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
  return i18n.t(STEP_LIVE[group.running ?? group.counts[0]?.kind ?? "thinking"])
}

/** The answer column: one column of turns, each with its process run and answer. */
export function AnswerPage(props: AnswerPageProps) {
  const snapshot = createMemo(() => projectTimeline(props.messages()))
  const [folded, setFolded] = createStore<Record<number, boolean | undefined>>({})
  const [openGroups, setOpenGroups] = createStore<Record<string, boolean | undefined>>({})
  const [now, setNow] = createSignal(Date.now())

  const view = () => props.view ?? "standard"

  // A mode change resets the transcript layout, including the groups the reader opened.
  createEffect(
    on(
      () => props.view,
      () => setOpenGroups({}),
    ),
  )

  const clearGroups = (turn: number) => {
    for (const key of Object.keys(openGroups))
      if (key.startsWith(`group:${turn}:`)) setOpenGroups(key, undefined)
  }

  const entryKey = (entry: TimelineEntry) => (entry.kind === "fold" ? `fold:${entry.turn}` : `node:${entry.key}`)

  const entries = createMemo(() => snapshot().entries)
  const keys = createMemo(() => entries().map(entryKey))
  const index = createMemo(() => new Map(entries().map((entry) => [entryKey(entry), entry] as const)))
  const running = createMemo(() => [...snapshot().turns.values()].findLast((turn) => turn.status === "open"))

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

  return (
    <div class={`answer-scope flex flex-col ${props.class ?? ""}`} data-component="answer-page">
      <div class="mx-auto flex w-full max-w-[952px] flex-col px-4 pt-4 pb-10">
        <For each={keys()}>
          {(key, position) => {
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
              <div class={flowGap(snapshot(), entries(), position())}>
                <Show when={visibleNode()}>{(value) => <NodeRow node={value()} view={view()} live={snapshot().turns.get(value().turn)?.status === "open"} />}</Show>
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
                      clearGroups={clearGroups}
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
          }}
        </For>
      </div>
    </div>
  )
}

function RunningStatus(props: { elapsedMs?: number }) {
  const i18n = useI18n()

  const label = () => i18n.t("ui.answer.workingPrefix")

  return (
    <div
      role="status"
      data-slot="answer-running"
      class="relative flex min-h-[33px] min-w-0 w-full flex-col items-start justify-center border-b-[0.5px] border-v2-border-border-muted pb-2 text-[12px] leading-text-base"
    >
      <div class="flex min-w-0 items-center gap-2" style={{ color: "var(--answer-ink-secondary)" }}>
        <span class="grid size-[14px] shrink-0 place-items-center overflow-hidden [&_svg]:size-[14px]">
          <Spinner width={14} height={14} class="size-[14px]" />
        </span>
        <span class="min-w-0 shrink-0 overflow-hidden">
          <TextShimmer text={label()} active />
        </span>
        <Show when={props.elapsedMs !== undefined && props.elapsedMs >= 1000 ? props.elapsedMs : undefined}>
          {(ms) => <span class="shrink-0 font-mono tabular-nums">{durationText(i18n, ms())}</span>}
        </Show>
        <span class="shrink-0 font-mono">{i18n.t("ui.answer.deepDivingEllipsis")}</span>
      </div>
    </div>
  )
}

function runningElapsed(turn: TimelineTurn | undefined, now: number) {
  return turn?.startedAt === undefined ? undefined : Math.max(0, now - turn.startedAt)
}

/** Turn spacing: process rows 4px, an assistant response 16px, a process head 12px. */
function flowGap(snapshot: Snapshot, entries: readonly TimelineEntry[], index: number) {
  if (index <= 0) return ""
  const current = entries[index]
  const previous = entries[index - 1]

  if (!current || !previous) return ""

  if (previous.kind === "node" && snapshot.nodes.get(previous.key)?.payload.kind === "input") return "mt-2"

  if (current.kind === "fold") return "mt-3"

  if (isResponse(snapshot, current) || isResponse(snapshot, previous)) return "mt-4"

  return "mt-1"
}

function isResponse(snapshot: Snapshot, entry: TimelineEntry) {
  return entry.kind === "node" && snapshot.nodes.get(entry.key)?.payload.kind === "assistant"
}

/** Process rows of a group; step summaries render outside it, after the group header. */
function processKeys(snapshot: Snapshot, group: TimelineGroup) {
  return group.members.filter((key) => snapshot.nodes.get(key)?.payload.kind !== "assistant")
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
  clearGroups: (turn: number) => void
  onToggle: () => void
}) {
  const grouping = () => stepGrouping(props.view)
  const expandable = () => props.turn.status === "closed" && grouping() !== "none"
  const open = () => (expandable() ? props.open : true)

  // Folding a turn drops its inner open state, as DSH resets the disclosure layout it hides.
  createEffect(
    on(
      () => open(),
      (value) => {
        if (!value) props.clearGroups(props.turn.turn)
      },
      { defer: true },
    ),
  )

  // A running Turn keeps its process expanded; detailed only groups process rows once they are history.
  const flat = () =>
    grouping() === "none" || (grouping() === "history" && (props.turn.status === "open" || props.deferred))

  const elapsedMs = () =>
    props.turn.status === "open" ? runningElapsed(props.turn, props.now) : props.turn.elapsedMs

  const children = () => childrenOf(props.snapshot, props.turn.turn)

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
          <For each={children()}>
            {(child) => {
              if (child.kind === "node") {
                const node = createMemo(() => props.snapshot.nodes.get(child.key))

                return (
                  <Show when={node()}>
                    {(value) => <NodeRow node={value()} view={props.view} live={props.turn.status === "open"} />}
                  </Show>
                )
              }

              const group = () => props.snapshot.groups.get(child.key)

              return (
                <Show when={group()}>
                  {(value) => (
                    <GroupSeat
                      group={value()}
                      snapshot={props.snapshot}
                      view={props.view}
                      flat={flat()}
                      open={props.groupOpen(child.key)}
                      onToggle={() => props.toggleGroup(child.key)}
                    />
                  )}
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

  // Standard appends the live task detail to the category summary while the group is still running.
  const detail = () => (props.view === "standard" && live() ? props.group.runningDetail : "")

  const title = () => (live() ? liveTitle(i18n, props.group) : processTitle(i18n, props.group))
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
        class="group/heading flex min-w-0 w-full items-center gap-1.5 text-start text-[14px] leading-[24px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
        style={{ color: "var(--answer-ink-tertiary)" }}
        onClick={(event) => {
          event.currentTarget.focus()
          props.onToggle()
        }}
      >
        <span class="flex min-w-0 items-center" data-slot="answer-group-leading">
          <LeadingSlot icon={<FlowIcon name={ACTIVITY_ICONS[activity()]} />} open={props.open} scope="heading" />
        </span>
        <span class="flex h-[24px] min-w-0 items-center overflow-hidden" data-slot="answer-group-content">
          <span class="shrink-0">
            <TextShimmer text={title()} active={live()} />
          </span>
          <Show when={detail()}>
            {(value) => <span class="min-w-0 flex-1 truncate opacity-70">{` · ${value()}`}</span>}
          </Show>
        </span>
      </button>
      <Show when={props.flat || props.open}>
        <div id={bodyID} class={props.flat ? "flex flex-col gap-1" : "flex flex-col gap-1 pt-1"}>
          <For each={processKeys(props.snapshot, props.group)}>
            {(key) => {
              const node = createMemo(() => props.snapshot.nodes.get(key))

              return (
                <Show when={node()}>{(value) => <NodeRow node={value()} view={props.view} live={!props.group.closed} />}</Show>
              )
            }}
          </For>
        </div>
      </Show>
    </section>
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

  return (
    <div
      data-slot="answer-row"
      data-kind={props.node.payload.kind}
      data-message-id={props.node.messageID}
      data-timeline-part-id={props.node.partID}
    >
      <Payload payload={props.node.payload} cacheKey={props.node.key} view={props.view} live={props.live} />
    </div>
  )
}

function Payload(props: { payload: NodePayload; cacheKey: string; view: TranscriptView; live: boolean }): JSX.Element {
  switch (props.payload.kind) {
    case "input":
      return (
        <div data-slot="user-message-body" class="flex w-fit max-w-[min(82%,64ch)] flex-col items-end ms-auto">
          <div
            dir="auto"
            data-slot="user-message-text"
            class="inline-block overflow-hidden whitespace-pre-wrap break-words rounded-[14px] bg-v2-background-bg-layer-02 px-3 py-2 text-[14px] leading-[22px] [overflow-wrap:anywhere] [unicode-bidi:plaintext]"
            style={{ color: "var(--answer-ink)" }}
          >
            {props.payload.text}
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
        />
      )
    case "tool":
      return <ToolRow tool={props.payload.tool} />
    case "notice":
      return (
        <div class="flex min-w-0 items-center gap-1.5 text-[13px] leading-[24px]" style={{ color: "var(--answer-ink-tertiary)" }}>
          <FlowIcon name="answer-context" />
          <bdi dir="auto" class="min-w-0 truncate">
            {props.payload.text}
          </bdi>
        </div>
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

function FlowIcon(props: { name: IconName }) {
  return (
    <span class="flex h-[24px] shrink-0 items-center">
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
    return <span class="flex size-6 shrink-0 items-center justify-center">{props.icon}</span>

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
    <span class="relative grid size-6 shrink-0 place-items-center">
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
        class="group/row flex min-w-0 cursor-pointer items-center gap-1.5 text-[13px] leading-[24px] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-border-border-focus"
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
          <span class="shrink-0">{props.title}</span>
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

function ReasoningRow(props: { text: string; streaming?: boolean; live: boolean; preview?: boolean }) {
  const i18n = useI18n()
  // Only this reasoning part, inside a running turn, is live; a finished step stops spinning at once.
  const streaming = () => props.live === true && props.streaming === true
  const [expanded, setExpanded] = createSignal(streaming())

  createEffect(
    on(streaming, (live) => setExpanded(live)),
  )

  const preview = () => (props.preview === false ? undefined : reasoningPreview(props.text, streaming()))

  return (
    <DisclosureRow
      title={i18n.t("ui.answer.thinking")}
      summary={expanded() ? undefined : preview()}
      state={streaming() ? "running" : "ok"}
      expanded={expanded()}
      leading={
        <Show when={streaming()} fallback={<FlowIcon name="answer-thinking" />}>
          <span data-slot="answer-reasoning-spinner" class="grid size-[14px] shrink-0 place-items-center overflow-hidden [&_svg]:size-[14px]">
            <Spinner width={14} height={14} class="size-[14px]" />
          </span>
        </Show>
      }
      onToggle={() => setExpanded((value) => !value)}
    >
      <Markdown
        text={props.text}
        cacheKey={props.text.length.toString()}
        class="answer-markdown ps-[30px] py-1 [overflow-wrap:anywhere]"
      />
    </DisclosureRow>
  )
}

function ToolRow(props: { tool: Extract<NodePayload, { kind: "tool" }>["tool"] }) {
  const i18n = useI18n()
  const failed = () => props.tool.state.status === "error"
  const running = () => props.tool.state.status === "running" || props.tool.state.status === "streaming"
  const [expanded, setExpanded] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  let copyTimer: number | undefined

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
      title={i18n.t(TOOL_ACTIONS[actionKey(props.tool.name)])}
      summary={summary()}
      summaryDanger={failed()}
      state={failed() ? "error" : running() ? "running" : "ok"}
      expanded={expanded()}
      leading={
        <Show when={running()} fallback={<FlowIcon name={ACTIVITY_ICONS[toolActivity(props.tool.name)]} />}>
          <span data-slot="answer-tool-spinner" class="grid size-[14px] shrink-0 place-items-center overflow-hidden [&_svg]:size-[14px]">
            <Spinner width={14} height={14} class="size-[14px]" />
          </span>
        </Show>
      }
      onToggle={() => setExpanded((value) => !value)}
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
