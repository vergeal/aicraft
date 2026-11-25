import { createSignal, For, Show } from "solid-js"
import { usePlugin } from "@aicraft/aix/gui"
import type { AnswerValue, Question, Template } from "../src/contract.js"
import { answerKey, isEmpty, mergeAnswers } from "../src/logic.js"
import type { Definition } from "./definition.js"

/** 选项为空的下拉由页面决定默认值，向导不强制作答。 */
function pageDriven(question: Question) {
  return (question.type === "select" || question.type === "multiselect") && (question.options ?? []).length === 0
}

function textOf(value: AnswerValue | undefined) {
  if (value === undefined) return ""
  return typeof value === "string" ? value : value.join("，")
}

function listOf(value: AnswerValue | undefined) {
  if (value === undefined) return [] as string[]
  return typeof value === "string" ? [value] : [...value]
}

export interface WizardProps {
  readonly template: Template
  readonly remembered: Readonly<Record<string, AnswerValue>>
  readonly askSaveDefaults: boolean
  readonly onStart: (values: Readonly<Record<string, AnswerValue>>, save: boolean) => void
  readonly onStopAsking: () => void
  readonly onCancel: () => void
  readonly generateRelease: (input: {
    readonly change: string
    readonly context: Readonly<Record<string, string>>
  }) => Promise<{ readonly title: string; readonly plan: string; readonly rollback: string }>
}

/**
 * 向导一问一答：逐题作答，答完给出摘要，再决定是否把这套答案存成默认值。答案以字段 id 为键，
 * 提交给执行器前统一经过 `mergeAnswers` 清洗。
 */
export function Wizard(props: WizardProps) {
  const ctx = usePlugin<Definition>()
  const [values, setValues] = createSignal<Record<string, AnswerValue | undefined>>(initialValues(props))
  const [index, setIndex] = createSignal(0)
  const [stage, setStage] = createSignal<"ask" | "summary">("ask")
  const [change, setChange] = createSignal("")
  const [drafting, setDrafting] = createSignal(false)
  const [draftError, setDraftError] = createSignal<string | null>(null)

  const questions = () => props.template.questions
  const current = () => questions()[index()] ?? questions()[0]!
  const total = () => questions().length
  const hasRemembered = () => Object.keys(props.remembered).length > 0

  const set = (id: string, value: AnswerValue | undefined) => {
    setValues((previous) => ({ ...previous, [id]: value }))
  }

  const toggle = (question: Question, value: string) => {
    const list = listOf(values()[question.id])
    set(
      question.id,
      list.includes(value) ? list.filter((item) => item !== value) : [...list, value],
    )
  }

  const missing = () =>
    questions().filter((question) => {
      if (!question.required || pageDriven(question)) return false
      return isEmpty(values()[question.id] ?? question.defaultValue)
    })

  const complete = () => missing().length === 0

  const next = () => {
    if (index() < total() - 1) return setIndex(index() + 1)
    setStage("summary")
  }

  /** 发版模板才有「AI 起草」：读当前答案作为背景，生成后回填三项，用户仍可在摘要里核对。 */
  const releaseDraft = () =>
    props.template.questions.some((question) => question.id === "plan") &&
    props.template.questions.some((question) => question.id === "rollback")

  const draftRelease = async () => {
    if (drafting() || change().trim().length === 0) return
    setDrafting(true)
    setDraftError(null)
    try {
      const context: Record<string, string> = {}
      for (const question of props.template.questions) {
        const value = values()[question.id] ?? props.remembered[answerKey(question)]
        if (value !== undefined && textOf(value).trim().length > 0) context[question.label] = textOf(value)
      }
      const draft = await props.generateRelease({ change: change().trim(), context })
      setValues((previous) => ({ ...previous, title: draft.title, plan: draft.plan, rollback: draft.rollback }))
      ctx.toast.show({ title: ctx.t("release.ai.done"), variant: "success" })
    } catch (cause) {
      setDraftError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setDrafting(false)
    }
  }

  const start = (save: boolean) => {
    const merged = mergeAnswers(props.template, props.remembered, values())
    props.onStart(merged.values, save)
  }

  const summaryRows = () => {
    const merged = mergeAnswers(props.template, props.remembered, values())
    return questions().map((question) => ({
      question,
      value: merged.values[answerKey(question)],
      source: merged.sources[answerKey(question)],
    }))
  }

  const QuestionInput = () => {
    const question = current()
    const value = () => values()[question.id]
    if (question.type === "textarea") {
      return (
        <textarea
          class="itsm-textarea"
          aria-label={question.label}
          placeholder={question.hint ?? ""}
          value={textOf(value())}
          onInput={(event) => set(question.id, event.currentTarget.value)}
        />
      )
    }
    if (question.type === "select" && (question.options ?? []).length > 0) {
      return (
        <div class="itsm-choices" role="group" aria-label={question.label}>
          <For each={question.options ?? []}>
            {(option) => (
              <button
                type="button"
                class="itsm-choice"
                aria-pressed={value() === option.value}
                onClick={() => set(question.id, option.value)}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      )
    }
    if (question.type === "multiselect" && (question.options ?? []).length > 0) {
      return (
        <div class="itsm-choices" role="group" aria-label={question.label}>
          <For each={question.options ?? []}>
            {(option) => (
              <button
                type="button"
                class="itsm-choice"
                aria-pressed={listOf(value()).includes(option.value)}
                onClick={() => toggle(question, option.value)}
              >
                {option.label}
              </button>
            )}
          </For>
        </div>
      )
    }
    if (question.type === "boolean") {
      return (
        <div class="itsm-choices" role="group" aria-label={question.label}>
          <button type="button" class="itsm-choice" aria-pressed={value() === "true"} onClick={() => set(question.id, "true")}>
            {ctx.t("bool.yes")}
          </button>
          <button type="button" class="itsm-choice" aria-pressed={value() === "false"} onClick={() => set(question.id, "false")}>
            {ctx.t("bool.no")}
          </button>
        </div>
      )
    }
    return (
      <ctx.ui.TextInput
        label={question.label}
        placeholder={question.type === "person" ? ctx.t("wizard.personHint") : ctx.t("wizard.placeholder")}
        value={textOf(value())}
        onInput={(next) => set(question.id, next)}
        onSubmit={next}
        size="large"
      />
    )
  }

  return (
    <div class="itsm-wizard">
      <Show
        when={stage() === "ask"}
        fallback={
          <>
            <div class="itsm-head__text">
              <h2 class="itsm-head__title">{ctx.t("wizard.summary")}</h2>
              <p class="itsm-head__description">{ctx.t("wizard.summary.hint")}</p>
            </div>
            <div class="itsm-summary" role="list">
              <For each={summaryRows()}>
                {(row) => (
                  <div class="itsm-summary__row" role="listitem">
                    <span class="itsm-summary__label">{row.question.label}</span>
                    <span class="itsm-summary__value" data-empty={row.value === undefined}>
                      {row.value === undefined ? ctx.t("wizard.empty") : textOf(row.value)}
                    </span>
                    <span class="itsm-summary__source">
                      <Show when={row.source === "previous"}>{ctx.t("wizard.source.previous")}</Show>
                      <Show when={row.source === "default"}>{ctx.t("wizard.source.default")}</Show>
                      <Show when={row.source === "edited"}>{ctx.t("wizard.source.edited")}</Show>
                    </span>
                  </div>
                )}
              </For>
            </div>
            <Show when={missing().length > 0}>
              <div class="itsm-missing" role="status">
                <ctx.ui.Icon name="circle-exclamation" size="small" />
                <span>
                  {ctx.t("wizard.missing", { count: String(missing().length) })} · {ctx.t("wizard.missing.hint")}
                </span>
              </div>
            </Show>
            <Show when={releaseDraft()}>
              <div class="itsm-card">
                <div class="itsm-card__head">
                  <div>
                    <h3 class="itsm-card__title">{ctx.t("release.ai.title")}</h3>
                    <p class="itsm-card__hint">{ctx.t("release.ai.hint")}</p>
                  </div>
                </div>
                <textarea
                  class="itsm-textarea"
                  aria-label={ctx.t("release.ai.change")}
                  placeholder={ctx.t("release.ai.placeholder")}
                  value={change()}
                  onInput={(event) => setChange(event.currentTarget.value)}
                />
                <Show when={draftError()}>
                  <p class="itsm-card__hint" data-tone="danger">
                    {draftError()}
                  </p>
                </Show>
                <div class="itsm-actions" data-align="end">
                  <ctx.ui.Button
                    variant="neutral"
                    size="small"
                    busy={drafting()}
                    disabled={change().trim().length === 0}
                    onClick={() => void draftRelease()}
                  >
                    {drafting() ? ctx.t("release.ai.busy") : ctx.t("release.ai.action")}
                  </ctx.ui.Button>
                </div>
              </div>
            </Show>

            <div class="itsm-card">
              <div class="itsm-card__head">
                <div>
                  <h3 class="itsm-card__title">
                    {props.askSaveDefaults ? ctx.t("save.title") : ctx.t("wizard.start")}
                  </h3>
                  <p class="itsm-card__hint">
                    {props.askSaveDefaults ? ctx.t("save.hint") : ctx.t("wizard.summary.hint")}
                  </p>
                </div>
              </div>
              <div class="itsm-actions" data-align="end">
                <ctx.ui.Button variant="ghost" onClick={() => setStage("ask")}>
                  {ctx.t("wizard.previous")}
                </ctx.ui.Button>
                <div class="itsm-spacer" />
                <Show when={props.askSaveDefaults}>
                  <ctx.ui.Button variant="ghost-muted" onClick={props.onStopAsking}>
                    {ctx.t("save.never")}
                  </ctx.ui.Button>
                  <ctx.ui.Button variant="neutral" disabled={!complete()} onClick={() => start(false)}>
                    {ctx.t("save.no")}
                  </ctx.ui.Button>
                  <ctx.ui.Button variant="contrast" disabled={!complete()} onClick={() => start(true)}>
                    {ctx.t("save.yes")}
                  </ctx.ui.Button>
                </Show>
                <Show when={!props.askSaveDefaults}>
                  <ctx.ui.Button variant="contrast" disabled={!complete()} onClick={() => start(false)}>
                    {ctx.t("wizard.start")}
                  </ctx.ui.Button>
                </Show>
              </div>
            </div>
          </>
        }
      >
        <div class="itsm-progress">
          <span>{ctx.t("wizard.progress", { current: String(index() + 1), total: String(total()) })}</span>
          <div class="itsm-progress__track">
            <div class="itsm-progress__bar" style={{ width: `${((index() + 1) / Math.max(1, total())) * 100}%` }} />
          </div>
          <span>{Math.round(((index() + 1) / Math.max(1, total())) * 100)}%</span>
        </div>

        <Show when={hasRemembered()}>
          <div class="itsm-hint-line">
            <ctx.ui.Icon name="library" size="small" />
            <span>{ctx.t("wizard.remembered")}</span>
            <button
              type="button"
              class="itsm-link"
              onClick={() => setValues({})}
            >
              {ctx.t("wizard.clear")}
            </button>
          </div>
        </Show>

        <div class="itsm-question">
          <div class="itsm-question__tag">
            <span>{current().required ? ctx.t("wizard.required") : ctx.t("wizard.optional")}</span>
            <Show when={current().type === "multiselect"}>
              <span aria-hidden="true">·</span>
              <span>{ctx.t("wizard.chooseAny")}</span>
            </Show>
          </div>
          <h2 class="itsm-question__label">{current().label}</h2>
          <Show when={current().hint}>
            <p class="itsm-question__hint">{current().hint}</p>
          </Show>
          <div class="itsm-question__answer">{QuestionInput()}</div>
        </div>

        <div class="itsm-actions">
          <Show when={index() > 0}>
            <ctx.ui.Button variant="ghost" onClick={() => setIndex(Math.max(0, index() - 1))}>
              {ctx.t("wizard.previous")}
            </ctx.ui.Button>
          </Show>
          <div class="itsm-spacer" />
          <ctx.ui.Button variant="ghost-muted" onClick={props.onCancel}>
            {ctx.t("common.cancel")}
          </ctx.ui.Button>
          <ctx.ui.Button variant="contrast" onClick={next}>
            {index() < total() - 1 ? ctx.t("wizard.next") : ctx.t("wizard.finish")}
          </ctx.ui.Button>
        </div>
      </Show>
    </div>
  )
}

function initialValues(props: { template: Template; remembered: Readonly<Record<string, AnswerValue>> }) {
  const values: Record<string, AnswerValue | undefined> = {}
  for (const question of props.template.questions) {
    const remembered = props.remembered[answerKey(question)]
    if (remembered !== undefined) values[question.id] = remembered
    else if (question.defaultValue !== undefined) values[question.id] = question.defaultValue
  }
  return values
}
