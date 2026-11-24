import { lastAssistantWithUsage } from "@aicraft/client/solid"
import type { SessionMessageInfo } from "@aicraft/client/promise"
import { TokenUsage } from "@aicraft/schema/token-usage"
import { Icon } from "@aicraft/ui/icon"
import { Popover } from "@aicraft/ui/popover"
import { ProgressCircle } from "@aicraft/ui/progress-circle"
import { createMemo, For, on, Show, untrack, type JSX } from "solid-js"
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
type Split = { system: number; tools: number; history: number }

type Fold = { signature: string; summary?: Summary; split?: Split }

/**
 * The composer region is rebuilt for each session it routes to, so folding the whole transcript on mount would rerun
 * from the first message on every switch. One entry per session keeps the previous answer until that transcript's
 * shape or last recorded time changes, which is exactly what the signature reports.
 */
const folds = new Map<string, Fold>()

function fold(id: string, signature: string) {
  const cached = folds.get(id)

  if (cached?.signature === signature) return cached
  const next: Fold = { signature }

  folds.set(id, next)

  return next
}

/**
 * The quiet line under the composer: the session's turns and steps with its average output speed, its token usage and
 * cache hit rate, and the context window share. Each mark opens its own breakdown card.
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

  // The transcript is read on every streamed delta; the line must not rescan it each time. This signature changes only
  // when the transcript's shape or its last recorded time does, and the summaries below run from it alone.
  const signature = () => {
    const list = messages()
    const last = list.at(-1)
    const boundary = props.session.data.revertMessageID()

    return `${list.length}:${boundary ?? ""}:${last === undefined ? 0 : stamp(last)}`
  }

  const summary = createMemo(
    on(signature, (current) =>
      untrack(() => {
        const id = props.session.identity.sessionID()
        const list = messages()
        const end = endIndex(list, props.session.data.revertMessageID())

        if (!id || end === undefined) return
        const cached = fold(id, current)

        if (cached.summary) return cached.summary
        let turns = 0
        let steps = 0
        let output = 0
        let modelTime = 0
        let toolTime = 0

        for (let index = 0; index < end; index++) {
          const message = list[index]

          if (message.type === "user") turns++

          if (message.type !== "assistant") continue

          steps++

          if (message.tokens) output += message.tokens.output + message.tokens.reasoning

          if (message.time.streamed !== undefined)
            modelTime += Math.max(0, message.time.streamed - message.time.created)

          for (const part of message.content) {
            if (part.type !== "tool" || part.time.completed === undefined) continue
            toolTime += Math.max(0, part.time.completed - (part.time.ran ?? part.time.created))
          }
        }

        if (turns === 0 && steps === 0) return

        const value = {
          turns,
          steps,
          modelTime,
          toolTime,
          rate: modelTime > 0 ? (output / modelTime) * 1000 : undefined,
        }

        cached.summary = value

        return value
      }),
    ),
  )

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

  const context = createMemo(
    on(signature, (current) =>
      untrack(() => {
        const id = props.session.identity.sessionID()
        const list = messages()
        const info = props.session.data.info()

        if (!id || !info) return
        const end = endIndex(list, info.revert?.messageID)

        if (end === undefined) return
        const scoped = end === list.length ? list : list.slice(0, end)
        const last = lastAssistantWithUsage(scoped)

        if (!last) return
        const used = last.tokens.input + last.tokens.cache.read + last.tokens.cache.write

        const model = data.location.model
          .list(info.location)
          ?.findLast(
            (item) =>
              item.providerID === last.model.providerID &&
              item.id === last.model.id &&
              item.status !== "deprecated",
          )

        const limit = model?.limit.context

        if (!limit) return
        const cached = fold(id, current)
        const weight = cached.split ?? split(scoped, last)

        cached.split = weight

        return {
          used,
          limit,
          percent: Math.round((used / limit) * 100),
          parts: composition(weight, used),
        }
      }),
    ),
  )

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
            <div data-slot="session-status-card-body" aria-label={language.t("session.status.context.open")}>
              <Head
                title={language.t("session.status.context", { percent: String(value().percent) })}
                value={language.t("session.status.context.window", {
                  used: compact().format(value().used),
                  limit: compact().format(value().limit),
                })}
              />
              <div data-slot="session-status-track" aria-hidden="true">
                <div data-slot="session-status-fill">
                  <For each={value().parts}>
                    {(part) => <span data-part={part.key} style={{ width: `${part.share}%` }} />}
                  </For>
                </div>
              </div>
              <For each={value().parts}>
                {(part) => (
                  <div data-slot="session-status-row">
                    <span class="flex items-center gap-1.5 text-v2-text-text-muted">
                      <i data-part={part.key} />
                      {language.t(contextPartLabels[part.key])}
                    </span>
                    <span data-slot="session-status-value">
                      {language.t("session.status.tokens", { tokens: compact().format(part.tokens) })}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </StatusButton>
        )}
      </Show>
    </div>
  )
}

const contextPartLabels = {
  system: "session.status.context.system",
  tools: "session.status.context.tools",
  history: "session.status.context.history",
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

function stamp(message: SessionMessageInfo) {
  if (message.type === "assistant") return message.time.completed ?? message.time.streamed ?? message.time.created

  if (message.type === "shell") return message.time.completed ?? message.time.created

  return message.time.created
}

function endIndex(list: ReadonlyArray<SessionMessageInfo>, boundary: string | undefined) {
  if (!boundary) return list.length
  const index = list.findIndex((message) => message.id === boundary)

  return index === -1 ? undefined : index
}

/**
 * The provider reports only the number of prompt tokens, so the split by what produced them is estimated from each
 * message's character share of that total. Same accounting as the context panel's composition rows.
 */
function split(list: ReadonlyArray<SessionMessageInfo>, last: SessionMessageInfo) {
  const index = list.findIndex((message) => message.id === last.id)
  const upTo = index === -1 ? list : list.slice(0, index + 1)
  const weight: Split = { system: 0, tools: 0, history: 0 }

  for (const message of upTo) {
    if (message.type === "system") weight.system += message.text.length
    else if (message.type === "user" || message.type === "skill") weight.history += message.text.length
    else if (message.type === "shell")
      weight.tools += message.command.length + (message.output?.output.length ?? 0)
    else if (message.type === "assistant")
      for (const part of message.content) {
        if (part.type === "text" || part.type === "reasoning") weight.history += part.text.length
        else if (part.type === "tool") weight.tools += JSON.stringify(part.state).length
      }
  }

  return weight
}

function composition(weight: Split, used: number): Array<{ key: keyof typeof contextPartLabels; tokens: number; share: number }> {
  const total = weight.system + weight.tools + weight.history

  if (total <= 0) return []

  return [
    { key: "system" as const, tokens: Math.round((weight.system / total) * used), share: (weight.system / total) * 100 },
    { key: "tools" as const, tokens: Math.round((weight.tools / total) * used), share: (weight.tools / total) * 100 },
    { key: "history" as const, tokens: Math.round((weight.history / total) * used), share: (weight.history / total) * 100 },
  ].filter((part) => part.tokens > 0)
}
