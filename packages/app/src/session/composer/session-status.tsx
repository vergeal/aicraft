import { Option, Schema } from "effect"
import { lastAssistantWithUsage } from "@aicraft/client/solid"
import type { SessionMessageInfo } from "@aicraft/client/promise"
import { TokenUsage } from "@aicraft/schema/token-usage"
import { Icon } from "@aicraft/ui/icon"
import { Popover } from "@aicraft/ui/popover"
import { ProgressCircle } from "@aicraft/ui/progress-circle"
import { createMemo, For, Show, type JSX } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useData } from "@/runtime/server/current"
import type { SessionModel } from "../model"
import "./session-status.css"

type Summary = {
  turns: number
  steps: number
  modelTime: number
  toolTime: number
  rate: number | undefined
}

/** Character weight per part of the prompt; the share is applied to the prompt token count when a card asks for it. */
type Split = { system: number; history: number; toolResults: number }

/**
 * The quiet line under the composer: the session's turns and steps with its average output speed, its token usage and
 * cache hit rate, and the context window share. Each mark opens its own breakdown card. Every number arrives with the
 * Session record, recorded as the run writes its events, so the line never folds the transcript to render.
 */
export function SessionComposerStatus(props: { session: SessionModel }) {
  const data = useData()
  const language = useLanguage()

  const number = createMemo(
    () =>
      new Intl.NumberFormat(language.intl(), {
        maximumFractionDigits: 1,
      }),
  )

  const compact = createMemo(
    () =>
      new Intl.NumberFormat(language.intl(), {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
  )

  const messages = () => props.session.history.messages()

  const summary = createMemo((): Summary | undefined => {
    const stats = props.session.data.info()?.stats

    if (!stats || (stats.turns === 0 && stats.steps === 0)) return

    return {
      turns: stats.turns,
      steps: stats.steps,
      modelTime: stats.modelTime,
      toolTime: stats.toolTime,
      rate: stats.modelTime > 0 ? (stats.outputTokens / stats.modelTime) * 1000 : undefined,
    }
  })

  const usage = createMemo(() => {
    const tokens = props.session.data.info()?.tokens

    if (!tokens) return
    const total = TokenUsage.total(tokens)

    if (total <= 0) return
    const prompt = tokens.input + tokens.cache.read + tokens.cache.write

    return {
      total,
      input: tokens.input,
      cacheRead: tokens.cache.read,
      cacheWrite: tokens.cache.write,
      output: tokens.output + tokens.reasoning,
      cacheHit: prompt > 0 ? Math.round((tokens.cache.read / prompt) * 100) : 0,
    }
  })

  const context = createMemo(() => {
    const info = props.session.data.info()
    const stats = info?.stats

    if (!info || !stats || stats.contextTokens === 0) return

    const model = info.model
      ? data.location.model
          .list(info.location)
          ?.findLast(
            (item) =>
              item.providerID === info.model!.providerID && item.id === info.model!.id && item.status !== "deprecated",
          )
      : undefined

    const limit = model?.limit.context

    if (!limit) return
    // The window is a budget, not just the used share: the prompt takes what it takes, the reply keeps room for
    // the model's output, and everything left is the buffer the request stays under.
    const prompt = Math.min(stats.contextTokens, limit)
    const output = Math.min(model?.limit.output ?? 0, limit - prompt)

    return { limit, percent: Math.round((stats.contextTokens / limit) * 100), prompt, output, safety: limit - prompt - output }
  })

  const formatDuration = (milliseconds: number) => {
    const seconds = Math.round(milliseconds / 100) / 10

    if (seconds < 60) return language.t("session.status.duration.seconds", { seconds: String(seconds) })

    const whole = Math.round(milliseconds / 1000)
    const minutes = Math.floor(whole / 60)

    if (minutes < 60)
      return language.t("session.status.duration.minutes", {
        minutes: String(minutes),
        seconds: String(whole % 60),
      })

    return language.t("session.status.duration.hours", {
      hours: String(Math.floor(minutes / 60)),
      minutes: String(minutes % 60),
    })
  }

  return (
    <div
      data-component="session-composer-status"
      class="pointer-events-none mt-0.5 flex h-6 min-w-0 items-center justify-center gap-1 overflow-hidden text-[12px] leading-[18px] text-v2-text-text-faint min-[560px]:gap-2"
    >
      <Show when={summary()}>
        {(value) => (
          <StatusButton
            icon={<Icon name="gauge" size="small" class="shrink-0" aria-hidden="true" />}
            openLabel={language.t("session.status.open.stats")}
            label={
              <>
                {language.t("session.status.turnsSteps", {
                  turns: String(value().turns),
                  steps: String(value().steps),
                })}
                <Show when={value().rate}>
                  {(rate) => <> · {language.t("session.status.speed", { value: number().format(rate()) })}</>}
                </Show>
              </>
            }
          >
            <div data-slot="session-status-card-body" aria-label={language.t("session.status.stats.title")}>
              <Head
                title={language.t("session.status.stats.title")}
                value={language.t("session.status.turnsSteps", {
                  turns: String(value().turns),
                  steps: String(value().steps),
                })}
              />
              <div data-slot="session-status-separator" />
              <Row label={language.t("session.status.stats.modelTime")} value={formatDuration(value().modelTime)} />
              <Row label={language.t("session.status.stats.toolTime")} value={formatDuration(value().toolTime)} />
              <Row
                label={language.t("session.status.stats.tps")}
                value={
                  <Show when={value().rate} fallback="—">
                    {(rate) => language.t("session.status.speed", { value: number().format(rate()) })}
                  </Show>
                }
              />
            </div>
          </StatusButton>
        )}
      </Show>
      <Show when={usage()}>
        {(value) => (
          <StatusButton
            icon={<Icon name="database" size="small" class="shrink-0" aria-hidden="true" />}
            openLabel={language.t("session.status.usage.open")}
            label={language.t("session.status.usage", {
              tokens: compact().format(value().total),
              percent: String(value().cacheHit),
            })}
          >
            <div data-slot="session-status-card-body" aria-label={language.t("session.status.usage.title")}>
              <Head
                title={language.t("session.status.usage.title")}
                value={language.t("session.status.tokens", { tokens: number().format(value().total) })}
              />
              <div data-slot="session-status-separator" />
              <Row label={language.t("session.status.usage.cacheHit")} value={`${value().cacheHit}%`} />
              <Row
                label={language.t("session.status.usage.input")}
                value={language.t("session.status.tokens", { tokens: number().format(value().input) })}
              />
              <Row
                label={language.t("session.status.usage.cacheRead")}
                value={language.t("session.status.tokens", { tokens: number().format(value().cacheRead) })}
              />
              <Show when={value().cacheWrite > 0}>
                <Row
                  label={language.t("session.status.usage.cacheWrite")}
                  value={language.t("session.status.tokens", { tokens: number().format(value().cacheWrite) })}
                />
              </Show>
              <Row
                label={language.t("session.status.usage.output")}
                value={language.t("session.status.tokens", { tokens: number().format(value().output) })}
              />
            </div>
          </StatusButton>
        )}
      </Show>
      <Show when={context()}>
        {(value) => (
          <StatusButton
            icon={
              <ProgressCircle
                appearance="compact"
                size={14}
                percentage={value().percent}
                aria-hidden="true"
                class="shrink-0"
              />
            }
            openLabel={language.t("session.status.context.open")}
            label={`${value().percent}%`}
          >
            {/* The card body mounts only while the popover is open, so the character split stays off the rendered line. */}
            <ContextBreakdown limit={value().limit} prompt={value().prompt} output={value().output} safety={value().safety} messages={messages} />
          </StatusButton>
        )}
      </Show>
    </div>
  )
}

/** The context card's budget rows: the recorded shares plus the prompt split estimated from the loaded transcript. */
function ContextBreakdown(props: {
  limit: number
  prompt: number
  output: number
  safety: number
  messages: () => SessionMessageInfo[]
}) {
  const language = useLanguage()

  const number = createMemo(
    () =>
      new Intl.NumberFormat(language.intl(), {
        maximumFractionDigits: 1,
      }),
  )

  const parts = createMemo(() => {
    const list = props.messages()
    const last = lastAssistantWithUsage(list)
    const weight: Split = { system: 0, history: 0, toolResults: 0 }

    if (last) {
      const split = splitPrompt(list, last)
      const tokens = composition(split, props.prompt)
      weight.system = tokens.system
      weight.history = tokens.history
      weight.toolResults = tokens.toolResults
    }

    const entries = [
      { key: "system" as const, tokens: weight.system },
      { key: "history" as const, tokens: weight.history },
      { key: "toolResults" as const, tokens: weight.toolResults },
      { key: "output" as const, tokens: props.output },
      { key: "safety" as const, tokens: props.safety },
    ]

    const percents = percentages(entries, props.limit)

    return entries.map((part, index) => ({
      ...part,
      share: (part.tokens / props.limit) * 100,
      percent: percents[index],
    }))
  })

  return (
    <div data-slot="session-status-card-body" aria-label={language.t("session.status.context.windowLabel")}>
      <div data-slot="session-status-budget">
        <div data-slot="session-status-budget-head">
          <span>{language.t("session.status.context.windowLabel")}</span>
          <span data-slot="session-status-budget-total">
            {language.t("session.status.windowTokens", { tokens: number().format(props.limit) })}
          </span>
        </div>
        <div data-slot="session-status-budget-track" aria-hidden="true">
          <For each={parts()}>{(part) => <span data-part={part.key} style={{ width: `${part.share}%` }} />}</For>
        </div>
        <For each={parts()}>
          {(part) => (
            <div data-slot="session-status-budget-row">
              <span data-slot="session-status-budget-label">
                <i data-part={part.key} />
                {language.t(contextPartLabels[part.key])}
              </span>
              <span data-slot="session-status-budget-percent">{part.percent}%</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

const contextPartLabels = {
  system: "session.status.context.system",
  history: "session.status.context.history",
  toolResults: "session.status.context.toolResults",
  output: "session.status.context.output",
  safety: "session.status.context.safety",
} as const

/** The composer line's trigger: the mark and its value, opening a card shaped like the other composer popovers. */
function StatusButton(props: {
  icon: JSX.Element
  openLabel: string
  label: JSX.Element
  children: JSX.Element
}) {
  return (
    <Popover
      placement="top"
      gutter={8}
      class="session-status-card"
      triggerAs="button"
      triggerProps={{
        type: "button",
        "aria-label": props.openLabel,
        class:
          "pointer-events-auto flex h-6 min-w-0 items-center gap-1.5 rounded-full px-1.5 tabular-nums text-[12px] leading-[18px] text-v2-text-text-faint transition-colors hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-muted focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none data-[expanded]:bg-v2-overlay-simple-overlay-hover data-[expanded]:text-v2-text-text-base",
      }}
      trigger={
        <>
          {props.icon}
          <span class="truncate">{props.label}</span>
        </>
      }
    >
      {props.children}
    </Popover>
  )
}

function Head(props: { title: string; value: JSX.Element }) {
  return (
    <div data-slot="session-status-head">
      <span>{props.title}</span>
      <span data-slot="session-status-value">{props.value}</span>
    </div>
  )
}

function Row(props: { label: string; value: JSX.Element }) {
  return (
    <div data-slot="session-status-row">
      <span class="text-v2-text-text-muted">{props.label}</span>
      <span data-slot="session-status-value">{props.value}</span>
    </div>
  )
}

/**
 * The provider reports only the number of prompt tokens, so the split by what produced them is estimated from each
 * message's character share of that total. Same accounting as the context panel's composition rows.
 */
function splitPrompt(list: ReadonlyArray<SessionMessageInfo>, last: SessionMessageInfo): Split {
  const index = list.findIndex((message) => message.id === last.id)
  const upTo = index === -1 ? list : list.slice(0, index + 1)
  const weight: Split = { system: 0, history: 0, toolResults: 0 }

  for (const message of upTo) {
    if (message.type === "system") weight.system += message.text.length
    else if (message.type === "user" || message.type === "skill") weight.history += message.text.length
    else if (message.type === "shell")
      weight.toolResults += message.command.length + (message.output?.output.length ?? 0)
    else if (message.type === "assistant")
      for (const part of message.content) {
        if (part.type === "text" || part.type === "reasoning") weight.history += part.text.length
        else if (part.type === "tool") weight.toolResults += JSON.stringify(part.state).length
      }
  }

  // The loaded transcript page often starts after the system messages, so their text is missing here. Every
  // assistant step echoes the system prompt it sent, and that size is what the window actually holds.
  const sent = systemChars(last)

  if (sent > 0) weight.system = sent

  return weight
}

/** The system prompt size the provider saw on this step, from the sources the step echoed. */
function systemChars(message: SessionMessageInfo) {
  const sources = Option.getOrUndefined(decodeContextSources(message.metadata?.context))

  return sources?.reduce((sum, source) => sum + source.chars, 0) ?? 0
}

const decodeContextSources = Schema.decodeUnknownOption(Schema.Array(Schema.Struct({ chars: Schema.Number })))

/** Split the measured prompt by each part's character share; the last part takes the rounding remainder. */
function composition(weight: Split, prompt: number) {
  const total = weight.system + weight.history + weight.toolResults

  if (total <= 0) return { system: prompt, history: 0, toolResults: 0 }
  const system = Math.round((weight.system / total) * prompt)
  const history = Math.round((weight.history / total) * prompt)

  return { system, history, toolResults: Math.max(0, prompt - system - history) }
}

/** Round shares that add up to `total` to whole percents without drifting away from 100. */
function percentages(parts: ReadonlyArray<{ tokens: number }>, total: number) {
  const values = parts.map((part) => Math.round((part.tokens / total) * 100))
  const drift = 100 - values.reduce((sum, value) => sum + value, 0)

  if (drift !== 0) values[values.indexOf(Math.max(...values))] += drift

  return values
}
