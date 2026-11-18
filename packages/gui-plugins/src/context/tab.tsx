import { Popover } from "@kobalte/core/popover"
import { createMemo, createSignal, on, onCleanup, onMount, For, Show } from "solid-js"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import type { JSX } from "solid-js"
import { checksum } from "@opencode/util/encode"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Button } from "@opencode/ui/button"
import { Tooltip } from "@opencode/ui/tooltip"
import { Accordion } from "@opencode/ui/accordion"
import { StickyAccordionHeader } from "@opencode/ui/sticky-accordion-header"
import { showToast } from "@opencode/ui/toast"
import { useI18n } from "@opencode/ui/context/i18n"
import { File } from "@opencode/session-ui/file"
import { Markdown } from "@opencode/session-ui/markdown"
import type { SessionMessageAssistant, SessionMessageInfo } from "@opencode/client/promise"
import { lastAssistantWithUsage } from "@opencode/client/solid"
import { createKeyed, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { catalogModel, syncCatalog } from "./catalog"
import { createCNY, createUSD, flashCostBreakdown, flashCostCNY, flashPrice } from "./cost"
import { fetchSessionExport, sessionExportFilename } from "./export"
import { createSessionContextFormatter } from "./format"

/** A finished step carries the usage the ledger prices; steps still streaming are left out. */
type Assistant = SessionMessageAssistant & { tokens: NonNullable<SessionMessageAssistant["tokens"]> }

function isAssistant(message: SessionMessageInfo): message is Assistant {
  return message.type === "assistant" && message.tokens !== undefined
}

type Step = {
  message: Assistant
  tokens: NonNullable<SessionMessageAssistant["tokens"]>
  started: number
  /** Wall-clock duration of the step, when it finished. */
  duration: number | undefined
  /** Time to the first streamed content, when the server reported it. */
  ttft: number | undefined
  /** Output tokens per second over the streaming window. */
  rate: number | undefined
  failed: boolean
  retried: boolean
  truncated: boolean
  /** The user message that opened this turn; the timeline row's `data-message-id`. */
  anchor: string | undefined
}

/** One assistant step as a ledger row. */
function stepOf(message: Assistant, anchor: string | undefined): Step {
  const tokens = message.tokens
  const started = message.time.created
  const completed = message.time.completed
  const streamed = message.time.streamed
  const duration = completed === undefined ? undefined : completed - started
  const ttft = streamed === undefined ? undefined : streamed - started
  const stream = completed !== undefined && streamed !== undefined ? completed - streamed : undefined

  return {
    message,
    tokens,
    started,
    duration,
    ttft,
    rate: stream !== undefined && stream > 0 ? (tokens.output / stream) * 1000 : undefined,
    failed: message.error !== undefined || message.finish === "error",
    retried: message.retry !== undefined,
    truncated: message.finish === "length",
    anchor,
  }
}

const sectionLabel = "text-[12px] font-[530] text-v2-text-text-muted"

const card = "rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-layer-01"

const callGrid = "54px minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1fr) 74px 44px 62px 44px"

const callColumns = {
  wide: {
    grid: callGrid,
    duration: true,
    cost: true,
    status: true,
  },
  medium: {
    grid: "54px minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1fr) 74px 44px 62px",
    duration: true,
    cost: true,
    status: false,
  },
  narrow: {
    grid: "54px minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1fr) 62px 58px",
    duration: false,
    cost: true,
    status: false,
  },
  tight: {
    grid: "54px minmax(0,1.4fr) minmax(0,1.4fr) minmax(0,1fr) 58px",
    duration: false,
    cost: false,
    status: false,
  },
}

const callColumnsAt = (width: number) => {
  if (width >= 470) return callColumns.wide

  if (width >= 420) return callColumns.medium

  if (width >= 340) return callColumns.narrow

  return callColumns.tight
}

function Tile(props: { label: string; value: JSX.Element; sub: JSX.Element }) {
  return (
    <div class="flex min-w-0 flex-col gap-1 bg-v2-background-bg-base px-2.5 py-2.5">
      <div class="text-[11px] leading-4 text-v2-text-text-faint">{props.label}</div>
      <div class="text-[16px] font-[590] leading-5 tabular-nums tracking-[-0.02em] text-v2-text-text-base">
        {props.value}
      </div>
      <div class="text-[10.5px] leading-4 text-v2-text-text-faint">{props.sub}</div>
    </div>
  )
}

function Field(props: { label: string; value: JSX.Element }) {
  return (
    <div class="flex flex-col gap-0.5">
      <span class="text-[10.5px] text-v2-text-text-faint">{props.label}</span>
      <span class="text-[12px] tabular-nums text-v2-text-text-base">{props.value}</span>
    </div>
  )
}

// The estimate behind a locally priced total, as the three lines a Flash invoice has.
function PriceDetails(props: {
  breakdown: () => ReturnType<typeof flashCostBreakdown> | undefined
  cost: () => string
}) {
  const ctx = usePlugin()
  const i18n = useI18n()
  const cny = createMemo(() => createCNY(i18n.locale()))
  const number = createMemo(() => new Intl.NumberFormat(i18n.locale()))

  const priceRow = (label: string, line: { tokens: number; amount: number }, price: number) => (
    <div class="flex flex-col gap-0.5">
      <div class="flex items-baseline justify-between gap-3">
        <span class="text-[12px] leading-4 text-v2-text-text-muted">{label}</span>
        <span class="text-[12px] leading-4 tabular-nums text-v2-text-text-base">{cny()(line.amount)}</span>
      </div>
      <span class="text-[11px] leading-4 tabular-nums text-v2-text-text-faint">
        {ctx.t("usage.breakdown.rate", { tokens: number().format(line.tokens), price: number().format(price) })}
      </span>
    </div>
  )

  return (
    <Popover placement="bottom-end" gutter={6}>
      <Tooltip value={ctx.t("usage.breakdown.open")} placement="top">
        <Popover.Trigger
          as={IconButton}
          variant="ghost-muted"
          size="small"
          icon={<Icon name="circle-exclamation" class="size-3.5" />}
          style={{ width: "16px", height: "16px", color: "var(--v2-text-text-faint)" }}
          aria-label={ctx.t("usage.breakdown.open")}
        />
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          class="z-50 w-[268px] max-w-[calc(100vw-16px)] rounded-[10px] p-3 outline-none"
          style={{
            background: "var(--v2-background-bg-layer-01)",
            "box-shadow": "var(--v2-elevation-floating)",
          }}
          aria-label={ctx.t("usage.breakdown")}
        >
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-0.5">
              <span class="text-[13px] font-[530] leading-[18px] text-v2-text-text-base">
                {ctx.t("usage.breakdown")}
              </span>
              <span class="text-[11px] leading-4 text-v2-text-text-faint">{ctx.t("usage.breakdown.source")}</span>
            </div>
            <div class="flex flex-col gap-2">
              <Show when={props.breakdown()}>
                {(breakdown) => (
                  <>
                    {priceRow(ctx.t("usage.breakdown.input"), breakdown().input, flashPrice.input)}
                    {priceRow(ctx.t("usage.breakdown.cacheRead"), breakdown().cacheRead, flashPrice.cacheRead)}
                    {priceRow(ctx.t("usage.breakdown.output"), breakdown().output, flashPrice.output)}
                  </>
                )}
              </Show>
            </div>
            <div class="h-px bg-v2-border-border-muted" />
            <div class="flex items-baseline justify-between gap-3">
              <span class="text-[13px] font-[530] text-v2-text-text-base">{ctx.t("usage.breakdown.total")}</span>
              <span class="text-[13px] font-[530] tabular-nums text-v2-text-text-base">{props.cost()}</span>
            </div>
            <p class="text-[11px] leading-4 text-v2-text-text-faint">{ctx.t("usage.breakdown.offPeak")}</p>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}

function RawMessageContent(props: { message: SessionMessageInfo; onRendered: () => void }) {
  const file = createMemo(() => {
    const contents = JSON.stringify(props.message, null, 2)

    return {
      name: `${props.message.type}-${props.message.id}.json`,
      contents,
      cacheKey: checksum(contents),
    }
  })

  return (
    <File
      mode="text"
      file={file()}
      overflow="wrap"
      class="select-text"
      onRendered={() => requestAnimationFrame(props.onRendered)}
    />
  )
}

function RawMessage(props: {
  message: SessionMessageInfo
  onRendered: () => void
  time: (value: number | undefined) => string
}) {
  return (
    <Accordion.Item value={props.message.id}>
      <StickyAccordionHeader>
        <Accordion.Trigger>
          <div class="flex items-center justify-between gap-2 w-full">
            <div class="min-w-0 truncate">
              {props.message.type} <span class="text-text-base">• {props.message.id}</span>
            </div>
            <div class="flex items-center gap-3">
              <div class="shrink-0 text-12-regular text-text-weak">{props.time(props.message.time.created)}</div>
              <Icon name="chevron-grabber-vertical" size="small" class="shrink-0 text-text-weak" />
            </div>
          </div>
        </Accordion.Trigger>
      </StickyAccordionHeader>
      <Accordion.Content class="bg-background-base">
        <div class="p-3">
          <RawMessageContent message={props.message} onRendered={props.onRendered} />
        </div>
      </Accordion.Content>
    </Accordion.Item>
  )
}

/** The recent calls' output rate, with the session average as a dashed baseline. */
function Sparkline(props: { rates: readonly number[]; baseline: number | undefined }) {
  const geometry = createMemo(() => {
    const rates = props.rates

    if (rates.length < 2) return
    const values = props.baseline === undefined ? rates : [...rates, props.baseline]
    const max = Math.max(...values)
    const min = Math.min(...values)
    const span = Math.max(max - min, 1)
    const width = 120
    const height = 26
    const y = (value: number) => height - ((value - min) / span) * (height - 4) - 2

    const points = rates
      .map((rate, index) => `${((index / (rates.length - 1)) * width).toFixed(1)},${y(rate).toFixed(1)}`)
      .join(" ")

    const low = Math.min(...rates)

    return {
      points,
      baselineY: props.baseline === undefined ? undefined : y(props.baseline),
      lowX: (rates.indexOf(low) / (rates.length - 1)) * width,
      lowY: y(low),
    }
  })

  return (
    <Show when={geometry()}>
      {(g) => (
        <svg width="120" height="26" viewBox="0 0 120 26" class="overflow-visible" aria-hidden="true">
          <Show when={g().baselineY}>
            {(baselineY) => (
              <line
                x1="0"
                y1={baselineY()}
                x2="120"
                y2={baselineY()}
                stroke="var(--v2-border-border-strong)"
                stroke-width="1"
                stroke-dasharray="2 2"
              />
            )}
          </Show>
          <polyline
            points={g().points}
            fill="none"
            stroke="var(--v2-text-text-muted)"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <circle cx={g().lowX} cy={g().lowY} r="2.5" fill="var(--v2-state-fg-danger)" />
        </svg>
      )}
    </Show>
  )
}

const emptyMessages: SessionMessageInfo[] = []

export default function SessionContextTab(props: { session: MountedSession }) {
  const ctx = usePlugin()
  const layout = ctx.layout
  const system = ctx.system
  const i18n = useI18n()
  const data = () => props.session.server.data
  syncCatalog(() => props.session)

  const info = createMemo(() => (props.session.id ? data().session.get(props.session.id) : undefined))

  const messages = createMemo(
    () => {
      const id = props.session.id

      if (!id) return emptyMessages

      return data().session.message.list(id)
    },
    emptyMessages,
    { equals: same },
  )

  const formatter = createMemo(() => createSessionContextFormatter(i18n.locale()))
  const cny = createMemo(() => createCNY(i18n.locale()))
  const usd = createMemo(() => createUSD(i18n.locale()))

  const sessionDuration = createMemo(() => {
    const current = info()

    if (!current) return undefined

    return current.time.updated - current.time.created
  })

  // One row per completed step, oldest first, cut at the undo boundary like the header's counter.
  const steps = createMemo<Step[]>(() => {
    const list = messages()
    const boundary = info()?.revert?.messageID
    const end = boundary ? list.findIndex((message) => message.id === boundary) : list.length

    if (end === -1) return []

    return list
      .slice(0, end)
      .reduce<{ anchor: string | undefined; rows: Step[] }>(
        (state, message) => {
          if (message.type === "user") state.anchor = message.id

          if (isAssistant(message)) state.rows.push(stepOf(message, state.anchor))

          return state
        },
        { anchor: undefined, rows: [] },
      )
      .rows
  })

  const calls = createMemo(() => [...steps()].reverse())

  const summary = createMemo(() => {
    const all = steps()
    const failed = all.filter((step) => step.failed).length
    const slow = all.filter((step) => (step.duration ?? 0) >= 10_000).length

    return {
      total: all.length,
      failed,
      slow,
      success: all.length ? Math.round(((all.length - failed) / all.length) * 100) : 100,
    }
  })

  const filter = createSignal<"all" | "failed" | "slow">("all")

  const shownCalls = createMemo(() => {
    const mode = filter[0]()

    if (mode === "failed") return calls().filter((step) => step.failed)

    if (mode === "slow") return calls().filter((step) => (step.duration ?? 0) >= 10_000)

    return calls()
  })

  const openCall = createSignal<string>()
  const toggleCall = (id: string) => openCall[1](openCall[0]() === id ? undefined : id)

  // The side panel is resizable, so the call table measures the row it actually has and
  // hides columns in order of how little they cost the reader, instead of trusting a
  // fixed template that clips every token count once the panel narrows.
  let callTable: HTMLDivElement | undefined
  const callWidth = createSignal(0)

  createResizeObserver(
    () => callTable,
    () => {
      if (callTable) callWidth[1](callTable.clientWidth)
    },
  )

  const callLayout = createMemo(() => callColumnsAt(callWidth[0]()))

  const callCost = (call: Step) =>
    call.message.cost ? usd()(call.message.cost) : cny()(flashCostCNY([call.tokens]))

  // Same step as the TUI and the header ring: after the last completed compaction and before an undo boundary.
  // Context occupancy is the prompt side only — output and reasoning are already spent, not resident.
  const context = createMemo(() => {
    const message = lastAssistantWithUsage(messages(), info()?.revert?.messageID)

    if (!message) return
    const entry = catalogModel(props.session, message.model)
    const used = message.tokens.input + message.tokens.cache.read + message.tokens.cache.write
    const limit = entry?.model?.limit.context

    return {
      message,
      tokens: message.tokens,
      used,
      input: message.tokens.input,
      cache: message.tokens.cache.read,
      cacheWrite: message.tokens.cache.write,
      limit,
      pct: limit ? Math.round((used / limit) * 100) : null,
      providerLabel: entry?.provider.name ?? message.model.providerID,
      modelLabel: entry?.model?.name ?? message.model.id,
    }
  })

  const perTurnTokens = createMemo(() => {
    const current = context()
    const count = steps().length

    if (!current?.used || !count) return

    return current.used / count
  })

  const remainingTurns = createMemo(() => {
    const current = context()
    const perTurn = perTurnTokens()

    if (!current?.limit || !perTurn) return

    return Math.max(0, Math.floor((current.limit - current.used) / Math.max(1, perTurn)))
  })

  const perTurnText = createMemo(() => {
    const perTurn = perTurnTokens()

    if (perTurn === undefined) return "—"

    return formatter().compact(Math.round(perTurn))
  })

  // Everything this session spent on the output side. Output and reasoning are not part of
  // the window's occupancy, so they are summed here instead of filling a bar segment.
  const spentTokens = createMemo(() =>
    steps().reduce(
      (total, step) => ({
        output: total.output + step.tokens.output,
        reasoning: total.reasoning + step.tokens.reasoning,
      }),
      { output: 0, reasoning: 0 },
    ),
  )

  const rateStats = createMemo(() => {
    const rates = steps().flatMap((step) => (step.rate === undefined ? [] : [step.rate]))

    if (rates.length === 0) return

    return {
      rates,
      avg: rates.reduce((total, rate) => total + rate, 0) / rates.length,
      last: rates[rates.length - 1]!,
      low: Math.min(...rates),
    }
  })

  // A root session's spend includes its subagent sessions; a subagent's is its own.
  const spend = createMemo(() => {
    const id = props.session.id

    if (!id) return

    const session = data().session.get(id)

    if (!session) return

    const family = data().session.family(id)
    const ids = session.parentID ? [id] : family.length ? family : [id]
    const members = ids.flatMap((member) => data().session.get(member) ?? [])
    const billed = members.reduce((total, member) => total + member.cost, 0)

    if (billed > 0) return { amount: billed, currency: "USD" as const, estimated: false }

    const tokens = members.flatMap((member) => member.tokens)

    return { amount: flashCostCNY(tokens), currency: "CNY" as const, estimated: true }
  })

  const costText = createMemo(() => {
    const value = spend()

    if (!value) return "—"

    return value.currency === "USD" ? usd()(value.amount) : cny()(value.amount)
  })

  const costSource = createMemo(() => {
    const value = spend()

    if (!value) return ctx.t("stats.costUnpriced")

    return ctx.t(value.estimated ? "stats.costEstimated" : "stats.costActual")
  })

  const breakdown = createMemo(() => {
    const id = props.session.id

    if (!id) return
    const session = data().session.get(id)

    if (!session) return

    if (session.parentID) return flashCostBreakdown([session.tokens])

    const family = data().session.family(id)

    return flashCostBreakdown(
      (family.length ? family : [id]).flatMap((member) => data().session.get(member)?.tokens ?? []),
    )
  })

  const counts = createMemo(() => {
    const all = messages()
    const user = all.reduce((count, message) => count + (message.type === "user" ? 1 : 0), 0)

    return { loaded: all.length, turns: user }
  })

  const systemPrompt = createMemo(() => {
    const system = messages().findLast((message) => message.type === "system")?.text

    if (!system) return
    const trimmed = system.trim()

    if (!trimmed) return

    return trimmed
  })

  const parent = createMemo(() => {
    const id = props.session.id

    if (!id) return
    const session = data().session.get(id)

    if (!session?.parentID) return

    return { id: session.parentID, title: data().session.get(session.parentID)?.title ?? session.parentID }
  })

  const children = createMemo(() => {
    const id = props.session.id

    if (!id) return []

    const session = data().session.get(id)

    if (!session || session.parentID) return []

    return data()
      .session.family(id)
      .flatMap((childID) => {
        if (childID === id) return []

        const child = data().session.get(childID)

        if (!child) return []

        return [
          {
            id: childID,
            title: child.title ?? childID,
            cost: child.cost,
            running: (child.time.busy ?? 0) > (child.time.idle ?? 0),
          },
        ]
      })
  })

  const childrenSpend = createMemo(() => {
    const total = children().reduce((sum, child) => sum + child.cost, 0)

    if (total > 0) return usd()(total)

    const tokens = children().flatMap((child) => data().session.get(child.id)?.tokens ?? [])

    return cny()(flashCostCNY(tokens))
  })

  const openSession = (id: string) => {
    ctx.tabs.open({ server: props.session.server.id, id }, { focus: true })
  }

  // The occupancy bar splits into the cache hits and the fresh input that make up the prompt side.
  const barSegments = createMemo(() => {
    const current = context()

    if (!current?.limit) return

    return {
      cache: (current.cache / current.limit) * 100,
      cacheWrite: (current.cacheWrite / current.limit) * 100,
      input: (current.input / current.limit) * 100,
      level: current.pct !== null && current.pct >= 90 ? "danger" : current.pct !== null && current.pct >= 70 ? "warn" : "normal",
    }
  })

  // The window's occupancy palette, chosen once per level instead of a chained ternary in each style prop.
  const levelPaint = createMemo(() => {
    const level = barSegments()?.level

    if (level === "danger")
      return {
        surface: "var(--v2-state-bg-danger)",
        tone: "var(--v2-state-fg-danger)",
        bar: "var(--v2-state-fg-danger)",
      }

    if (level === "warn")
      return {
        surface: "var(--v2-state-bg-warning)",
        tone: "var(--v2-state-fg-warning)",
        bar: "var(--v2-state-fg-warning)",
      }

    return {
      surface: "var(--v2-background-bg-layer-02)",
      tone: "var(--v2-text-text-base)",
      bar: "var(--v2-background-bg-accent)",
    }
  })

  const exportSession = async () => {
    const sessionID = props.session.id

    if (!sessionID) return

    try {
      const data = await fetchSessionExport({
        sessionID,
        api: props.session.server.client,
      })

      const filename = sessionExportFilename(data.info)

      if (!(await system.save({ name: filename, content: JSON.stringify(data, null, 2) }))) return
      showToast({
        variant: "success",
        // Solid resolves JSX accessors under the toast's render owner, not this imperative call site.
        icon: () => <Icon name="circle-check" />,
        title: ctx.t("export.success.title"),
        description: ctx.t("export.success.description", { filename }),
      })
    } catch (err) {
      showToast({
        variant: "error",
        title: ctx.t("export.failed.title"),
        description: err instanceof Error ? err.message : ctx.t("export.failed.description"),
      })
    }
  }

  let scroll: HTMLDivElement | undefined
  let frame: number | undefined
  let pending: { x: number; y: number } | undefined

  const restoreScroll = () => {
    const el = scroll

    if (!el) return

    const s = layout.scroll.get(props.session, "context")

    if (!s) return

    if (el.scrollTop !== s.y) el.scrollTop = s.y

    if (el.scrollLeft !== s.x) el.scrollLeft = s.x
  }

  const handleScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    pending = {
      x: event.currentTarget.scrollLeft,
      y: event.currentTarget.scrollTop,
    }

    if (frame !== undefined) return

    frame = requestAnimationFrame(() => {
      frame = undefined

      const next = pending
      pending = undefined

      if (!next) return

      layout.scroll.set(props.session, "context", next)
    })
  }

  // Restores the stored scroll a frame after the messages change; on mount the viewport ref restores it.
  createKeyed(
    createMemo(on(messages, (list) => list, { defer: true })),
    () => void requestAnimationFrame(restoreScroll),
  )

  onCleanup(() => {
    if (frame === undefined) return
    cancelAnimationFrame(frame)
  })

  return (
    <div
      class="@container h-full overflow-y-auto"
      data-scrollable
      ref={(el) => {
        scroll = el
        // The ref runs before the content renders into the element.
        onMount(restoreScroll)
      }}
      onScroll={handleScroll}
    >
      <div data-slot="session-usage-content" class="flex flex-col gap-7 px-4 pt-4 pb-6 md:px-6 md:pb-10">
        {/* Context window */}
        <section class="flex flex-col gap-2.5">
          <div class="flex items-baseline gap-2">
            <div class={sectionLabel}>{ctx.t("window.title")}</div>
            <div
              class="ms-auto rounded-md px-2 text-[15px] font-[590] tabular-nums tracking-[-0.02em]"
              style={{
                background: levelPaint().surface,
                color: levelPaint().tone,
              }}
            >
              {formatter().percent(context()?.pct)}
            </div>
          </div>

          <div class="flex h-2 overflow-hidden rounded bg-v2-background-bg-layer-02" aria-hidden="true">
            <div
              class="h-full"
              style={{ width: `${barSegments()?.cache ?? 0}%`, background: "var(--v2-icon-icon-faint)" }}
            />
            <div
              class="h-full"
              style={{ width: `${barSegments()?.cacheWrite ?? 0}%`, background: "var(--v2-icon-icon-muted)" }}
            />
            <div
              class="h-full"
              style={{
                width: `${barSegments()?.input ?? 0}%`,
                background: levelPaint().bar,
                "min-width": barSegments()?.input ? "2px" : undefined,
              }}
            />
          </div>

          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-v2-text-text-faint">
            <span class="inline-flex items-center gap-1.5">
              <i class="size-[7px] rounded-[2px] bg-v2-background-bg-accent" />
              {ctx.t("window.legendInput")} <span class="tabular-nums">{formatter().compact(context()?.input)}</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <i class="size-[7px] rounded-[2px]" style={{ background: "var(--v2-icon-icon-faint)" }} />
              {ctx.t("window.legendCache")} <span class="tabular-nums">{formatter().compact(context()?.cache)}</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <i class="size-[7px] rounded-[2px]" style={{ background: "var(--v2-icon-icon-muted)" }} />
              {ctx.t("window.legendCacheWrite")}{" "}
              <span class="tabular-nums">{formatter().compact(context()?.cacheWrite)}</span>
            </span>
            <span class="ms-auto text-v2-text-text-muted">
              {ctx.t("window.remaining", {
                limit: formatter().compact(context()?.limit),
                turns: remainingTurns() ?? "—",
              })}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-v2-text-text-faint">
            <span>
              {ctx.t("window.legendOutput")}{" "}
              <span class="tabular-nums text-v2-text-text-muted">{formatter().compact(spentTokens().output)}</span>
            </span>
            <span>
              {ctx.t("window.legendReasoning")}{" "}
              <span class="tabular-nums text-v2-text-text-muted">{formatter().compact(spentTokens().reasoning)}</span>
            </span>
            <span class="ms-auto">
              {ctx.t("window.perTurn", { tokens: perTurnText() })}
            </span>
          </div>

          <div class="grid grid-cols-2 overflow-hidden rounded-[10px] border border-v2-border-border-muted bg-v2-border-border-muted gap-px">
            <Tile
              label={ctx.t("stats.cost")}
              value={costText()}
              sub={
                <span class="inline-flex items-center gap-1">
                  {costSource()}
                  <Show when={spend()?.estimated}>
                    <PriceDetails breakdown={breakdown} cost={costText} />
                  </Show>
                </span>
              }
            />
            <Tile
              label={ctx.t("stats.messages")}
              value={counts().loaded.toLocaleString(i18n.locale())}
              sub={ctx.t("stats.messagesAll", { count: counts().turns })}
            />
            <Tile
              label={ctx.t("stats.rate")}
              value={
                <>
                  {formatter().rate(rateStats()?.avg)}
                  <span class="ms-1 text-[11px] font-[400] text-v2-text-text-faint">tok/s</span>
                </>
              }
              sub={ctx.t("stats.rateSub", {
                last: formatter().rate(rateStats()?.last),
                low: formatter().rate(rateStats()?.low),
              })}
            />
            <Tile
              label={ctx.t("stats.duration")}
              value={formatter().duration(sessionDuration())}
              sub={ctx.t("stats.lastActivity", { time: formatter().clock(info()?.time.updated) })}
            />
          </div>
        </section>

        {/* Model */}
        <section class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2">
            <div class={sectionLabel}>{ctx.t("model.title")}</div>
            <div class="ms-auto flex items-center gap-2">
              <span class="rounded-[5px] bg-v2-background-bg-layer-02 px-1.5 text-[11.5px] text-v2-text-text-muted">
                {ctx.t(spend()?.estimated ? "model.priceLocal" : "model.priceServer")}
              </span>
              <button
                type="button"
                class="text-[12px] text-v2-text-text-accent hover:underline"
                onClick={() => ctx.layout.settings()}
              >
                {ctx.t("model.configure")}
              </button>
            </div>
          </div>
          <div class={`${card} flex items-center gap-2.5 px-3 py-2.5`}>
            <Icon name="status" size="small" class="shrink-0 text-v2-text-text-muted" />
            <span class="text-[12.5px] font-[530] text-v2-text-text-base">{context()?.modelLabel ?? "—"}</span>
            <span class="text-v2-border-border-strong">·</span>
            <span class="text-[12px] text-v2-text-text-faint">
              {ctx.t("model.contextLimit", { limit: formatter().compact(context()?.limit) })}
            </span>
            <span class="text-v2-border-border-strong">·</span>
            <span class="text-[12px] text-v2-text-text-faint">{context()?.providerLabel ?? "—"}</span>
          </div>
        </section>

        {/* Calls */}
        <section class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2">
            <div class={sectionLabel}>{ctx.t("calls.title")}</div>
            <div class="ms-auto flex items-center gap-2 text-[11.5px] text-v2-text-text-faint">
              <span>
                {ctx.t("calls.summary", { count: summary().total, rate: summary().success })}
              </span>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              class="rounded-full border px-2 py-px text-[11.5px]"
              classList={{
                "border-transparent bg-v2-background-bg-accent text-v2-text-text-contrast": filter[0]() === "all",
                "border-v2-border-border-muted text-v2-text-text-muted": filter[0]() !== "all",
              }}
              onClick={() => filter[1]("all")}
            >
              {ctx.t("calls.filterAll")}
              <span class="ms-1 opacity-60">{summary().total}</span>
            </button>
            <button
              type="button"
              class="rounded-full border px-2 py-px text-[11.5px]"
              classList={{
                "border-transparent bg-v2-background-bg-accent text-v2-text-text-contrast": filter[0]() === "failed",
                "border-v2-border-border-muted text-v2-text-text-muted": filter[0]() !== "failed",
              }}
              onClick={() => filter[1]("failed")}
            >
              {ctx.t("calls.filterFailed")}
              <span class="ms-1 opacity-60">{summary().failed}</span>
            </button>
            <button
              type="button"
              class="rounded-full border px-2 py-px text-[11.5px]"
              classList={{
                "border-transparent bg-v2-background-bg-accent text-v2-text-text-contrast": filter[0]() === "slow",
                "border-v2-border-border-muted text-v2-text-text-muted": filter[0]() !== "slow",
              }}
              onClick={() => filter[1]("slow")}
            >
              {ctx.t("calls.filterSlow")}
              <span class="ms-1 opacity-60">{summary().slow}</span>
            </button>
          </div>

          <div
            ref={callTable}
            class="overflow-hidden rounded-[10px] border border-v2-border-border-muted bg-v2-background-bg-base"
          >
            <div
              class="grid h-7 items-center gap-x-1.5 bg-v2-background-bg-layer-01 px-2.5 text-[11px] text-v2-text-text-faint [&>*:nth-child(n+2)]:text-end"
              style={{ "grid-template-columns": callLayout().grid }}
            >
              <span>{ctx.t("calls.time")}</span>
              <span>{ctx.t("calls.input")}</span>
              <span>{ctx.t("calls.cache")}</span>
              <span>{ctx.t("calls.output")}</span>
              <span>{ctx.t("calls.rate")}</span>
              <Show when={callLayout().duration}>
                <span>{ctx.t("calls.duration")}</span>
              </Show>
              <span>{ctx.t("calls.cost")}</span>
              <Show when={callLayout().status}>
                <span />
              </Show>
            </div>

            <Show
              when={shownCalls().length > 0}
              fallback={
                <div class="flex items-center justify-center py-8 text-[12px] text-v2-text-text-faint">
                  {ctx.t("calls.empty")}
                </div>
              }
            >
              <For each={shownCalls()}>
                {(call) => {
                  const open = () => openCall[0]() === call.message.id

                  return (
                    <>
                      <button
                        type="button"
                        class="grid w-full items-center gap-x-1.5 border-b border-v2-border-border-muted px-2.5 text-start text-[12px] [&>*:nth-child(n+2)]:text-end last:border-b-0 hover:bg-v2-overlay-simple-overlay-hover"
                        classList={{
                          "h-[34px]": true,
                        }}
                        style={{
                          "grid-template-columns": callLayout().grid,
                          "box-shadow": call.failed
                            ? "inset 2px 0 0 var(--v2-state-fg-danger)"
                            : call.retried
                              ? "inset 2px 0 0 var(--v2-state-fg-warning)"
                              : undefined,
                        }}
                        onClick={() => toggleCall(call.message.id)}
                        aria-expanded={open()}
                      >
                        <span class="font-mono text-[11px] tabular-nums text-v2-text-text-faint">
                          {formatter().clock(call.started)}
                        </span>
                        <span class="tabular-nums text-v2-text-text-base">
                          {formatter().number(call.tokens.input)}
                        </span>
                        <span
                          class="tabular-nums"
                          classList={{ "text-v2-text-text-faint": call.tokens.cache.read === 0, "text-v2-text-text-base": call.tokens.cache.read > 0 }}
                        >
                          {formatter().number(call.tokens.cache.read)}
                        </span>
                        <span class="tabular-nums text-v2-text-text-base">
                          {formatter().number(call.tokens.output)}
                        </span>
                        <span class="flex items-center justify-end gap-1.5">
                          <i class="h-[3px] w-[30px] shrink-0 overflow-hidden rounded-full bg-v2-background-bg-layer-02">
                            <i
                              class="block h-full rounded-full"
                              style={{
                                width: `${Math.min(100, ((call.rate ?? 0) / Math.max(rateStats()?.avg ?? 200, 1)) * 60)}%`,
                                background:
                                  (call.duration ?? 0) >= 10_000
                                    ? "var(--v2-state-fg-warning)"
                                    : "var(--v2-text-text-muted)",
                              }}
                            />
                          </i>
                          <span
                            class="tabular-nums"
                            classList={{
                              "text-v2-state-fg-warning": (call.duration ?? 0) >= 10_000,
                              "text-v2-text-text-base": (call.duration ?? 0) < 10_000,
                            }}
                          >
                            {formatter().rate(call.rate)}
                          </span>
                        </span>
                        <Show when={callLayout().duration}>
                          <span
                            class="tabular-nums"
                            classList={{
                              "text-v2-state-fg-warning": (call.duration ?? 0) >= 10_000,
                              "text-v2-text-text-muted": (call.duration ?? 0) < 10_000,
                            }}
                          >
                            {formatter().duration(call.duration)}
                          </span>
                        </Show>
                        <Show when={callLayout().cost}>
                          <span class="tabular-nums text-v2-text-text-muted">{callCost(call)}</span>
                        </Show>
                        <Show when={callLayout().status}>
                          <span class="flex justify-end">
                            <Show
                              when={call.failed}
                              fallback={
                                <Show
                                  when={call.retried}
                                  fallback={
                                    <Show
                                      when={call.truncated}
                                      fallback={<i class="size-1.5 rounded-full bg-v2-state-fg-success" />}
                                    >
                                      <span class="rounded bg-v2-state-bg-warning px-1 text-[10.5px] text-v2-state-fg-warning">
                                        {ctx.t("calls.truncated")}
                                      </span>
                                    </Show>
                                  }
                                >
                                  <span class="whitespace-nowrap rounded bg-v2-state-bg-warning px-1 text-[10.5px] text-v2-state-fg-warning">
                                    {ctx.t("calls.retry", { count: call.message.retry?.attempt ?? 1 })}
                                  </span>
                                </Show>
                              }
                            >
                              <span class="rounded bg-v2-state-bg-danger px-1 text-[10.5px] text-v2-state-fg-danger">
                                {ctx.t("calls.failed")}
                              </span>
                            </Show>
                          </span>
                        </Show>
                      </button>

                      <Show when={open()}>
                        <div class="flex flex-col gap-2.5 border-b border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-2.5 text-[11.5px] text-v2-text-text-muted">
                          <div class="grid grid-cols-2 gap-x-4 gap-y-2.5">
                            <Field label={ctx.t("calls.ttft")} value={formatter().duration(call.ttft)} />
                            <Field label={ctx.t("calls.reasoning")} value={formatter().number(call.tokens.reasoning)} />
                            <Field label={ctx.t("calls.cacheWrite")} value={formatter().number(call.tokens.cache.write)} />
                            <Field
                              label={ctx.t("calls.tools")}
                              value={call.message.content.filter((item) => item.type === "tool").length}
                            />
                            <Show when={!callLayout().duration}>
                              <Field label={ctx.t("calls.duration")} value={formatter().duration(call.duration)} />
                            </Show>
                            <Show when={!callLayout().cost}>
                              <Field label={ctx.t("calls.cost")} value={callCost(call)} />
                            </Show>
                          </div>
                          <Show when={call.message.error}>
                            {(error) => (
                              <div class="flex items-start gap-2 rounded-md bg-v2-state-bg-danger px-2.5 py-2 text-v2-state-fg-danger">
                                <Icon name="circle-exclamation" size="small" class="mt-px shrink-0" />
                                <span>
                                  {error().message}
                                  <Show when={error().status}>
                                    {(status) => <span class="opacity-70"> ({status()})</span>}
                                  </Show>
                                </span>
                              </div>
                            )}
                          </Show>
                          <div class="flex items-center gap-3">
                            <button
                              type="button"
                              class="text-[12px] text-v2-text-text-accent hover:underline"
                              onClick={() => {
                                if (!call.anchor) return

                                document
                                  .querySelector(`[data-message-id="${call.anchor}"]`)
                                  ?.scrollIntoView({ block: "center", behavior: "smooth" })
                              }}
                              disabled={!call.anchor}
                            >
                              {ctx.t("calls.locate")}
                            </button>
                            <span class="text-[10.5px] text-v2-text-text-faint">{ctx.t("calls.rateHint")}</span>
                          </div>
                        </div>
                      </Show>
                    </>
                  )
                }}
              </For>
            </Show>
          </div>

          <Show when={rateStats()}>
            {(rates) => (
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-2">
                  <div class="text-[11.5px] font-[530] text-v2-text-text-muted">{ctx.t("calls.trend")}</div>
                  <div class="ms-auto text-[11px] text-v2-text-text-faint">
                    {ctx.t("calls.baseline", { rate: formatter().rate(rates().avg) })}
                  </div>
                </div>
                <div class="flex items-center gap-2.5">
                  <Sparkline rates={rates().rates.slice(-8)} baseline={rates().avg} />
                  <span class="text-[11px] text-v2-text-text-faint">
                    {ctx.t("stats.rateSub", {
                      last: formatter().rate(rates().last),
                      low: formatter().rate(rates().low),
                    })}
                  </span>
                </div>
              </div>
            )}
          </Show>
        </section>

        {/* Session context */}
        <section class="flex flex-col gap-2.5">
          <div class={sectionLabel}>{ctx.t("session.title")}</div>
          <div class={`${card} overflow-hidden`}>
            <div class="flex items-center gap-2.5 border-b border-v2-border-border-muted px-3 py-2 text-[12px]">
              <span class="w-[72px] shrink-0 text-v2-text-text-faint">{ctx.t("session.project")}</span>
              <span class="truncate text-v2-text-text-base">
                {props.session.listedProject?.name ?? props.session.project?.name ?? "—"}
              </span>
            </div>
            <div class="flex items-center gap-2.5 border-b border-v2-border-border-muted px-3 py-2 text-[12px]">
              <span class="w-[72px] shrink-0 text-v2-text-text-faint">{ctx.t("session.directory")}</span>
              <span class="truncate font-mono text-[11.5px] text-v2-text-text-base">{props.session.directory}</span>
            </div>
            <div class="flex items-center gap-2.5 px-3 py-2 text-[12px]">
              <span class="w-[72px] shrink-0 text-v2-text-text-faint">{ctx.t("session.parent")}</span>
              <Show
                when={parent()}
                fallback={<span class="text-v2-text-text-faint">{ctx.t("session.root")}</span>}
              >
                {(item) => (
                  <button
                    type="button"
                    class="truncate text-start text-v2-text-text-base hover:underline"
                    onClick={() => openSession(item().id)}
                  >
                    {item().title}
                  </button>
                )}
              </Show>
            </div>
          </div>

          <Show when={children().length > 0}>
            <div class="flex items-center gap-2">
              <div class="text-[11.5px] font-[530] text-v2-text-text-muted">{ctx.t("session.children")}</div>
              <div class="ms-auto text-[11px] text-v2-text-text-faint">
                {ctx.t("session.childrenMeta", {
                  count: children().length,
                  cost: childrenSpend(),
                })}
              </div>
            </div>
            <div class="flex flex-col gap-px overflow-hidden rounded-[10px] border border-v2-border-border-muted bg-v2-border-border-muted">
              <For each={children()}>
                {(child) => (
                  <button
                    type="button"
                    class="flex items-center gap-2 bg-v2-background-bg-base px-3 py-2 text-start text-[12px] hover:bg-v2-overlay-simple-overlay-hover"
                    onClick={() => openSession(child.id)}
                  >
                    <span class="truncate text-v2-text-text-base">{child.title}</span>
                    <span
                      class="shrink-0 rounded px-1 text-[10.5px]"
                      classList={{
                        "text-v2-text-text-muted": !child.running,
                        "text-v2-text-text-accent": child.running,
                      }}
                      style={{
                        background: child.running
                          ? "color-mix(in srgb, var(--v2-background-bg-accent) 15%, transparent)"
                          : "var(--v2-background-bg-layer-02)",
                      }}
                    >
                      {ctx.t(child.running ? "session.running" : "session.done")}
                    </span>
                    <span class="ms-auto shrink-0 tabular-nums text-[11.5px] text-v2-text-text-faint">
                      {usd()(child.cost)}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </section>

        {/* Diagnostics */}
        <details class={`${card} overflow-hidden`}>
          <summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[12px] text-v2-text-text-muted">
            <Icon name="chevron-right" size="small" class="shrink-0 text-v2-text-text-faint" />
            <span>{ctx.t("diag.title")}</span>
            <span class="text-[11.5px] text-v2-text-text-faint">{ctx.t("diag.subtitle")}</span>
            <span class="ms-auto shrink-0 rounded bg-v2-state-bg-warning px-1.5 text-[10.5px] text-v2-state-fg-warning">
              {ctx.t("diag.permission")}
            </span>
          </summary>
          <div class="flex flex-col gap-2 border-t border-v2-border-border-muted px-3 pb-3">
            <div class="flex items-center gap-2 pt-2.5 text-[12px] text-v2-text-text-muted">
              <span>{ctx.t("diag.systemPrompt")}</span>
              <span class="text-[11.5px] text-v2-text-text-faint">
                {ctx.t("diag.chars", { count: formatter().number(systemPrompt()?.length ?? 0) })}
              </span>
              <span class="rounded bg-v2-state-bg-warning px-1 text-[10.5px] text-v2-state-fg-warning">
                {ctx.t("diag.sensitive")}
              </span>
            </div>
            <Show when={systemPrompt()}>
              {(prompt) => (
                <div class="max-h-[240px] overflow-y-auto rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-2.5 py-2">
                  <Markdown text={prompt()} class="text-[11.5px]" />
                </div>
              )}
            </Show>

            <div class="flex items-center gap-2 pt-1 text-[12px] text-v2-text-text-muted">
              <span>{ctx.t("diag.rawMessages")}</span>
              <span class="text-[11.5px] text-v2-text-text-faint">
                {ctx.t("diag.loaded", { loaded: counts().loaded })}
              </span>
            </div>
            <Accordion multiple class="max-h-[320px] overflow-y-auto rounded-md border border-v2-border-border-muted">
              <For each={messages()}>
                {(message) => (
                  <RawMessage message={message} onRendered={restoreScroll} time={formatter().time} />
                )}
              </For>
            </Accordion>

            <div class="flex items-center gap-2 pt-1 text-[12px] text-v2-text-text-muted">
              <span>{ctx.t("diag.export")}</span>
              <span class="text-[11.5px] text-v2-text-text-faint">{ctx.t("diag.redacted")}</span>
              <Button
                size="small"
                variant="ghost"
                class="ms-auto gap-1.5 px-2 text-text-weak hover:text-text-base"
                onClick={exportSession}
              >
                <Icon name="download" size="small" />
                <span>{ctx.t("export.session")}</span>
              </Button>
            </div>
          </div>
        </details>
      </div>
    </div>
  )
}

function same<T>(a: readonly T[] | undefined, b: readonly T[] | undefined) {
  if (a === b) return true

  if (!a || !b) return false

  if (a.length !== b.length) return false

  return a.every((x, i) => x === b[i])
}
