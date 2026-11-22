import { createSignal, For, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { uuid } from "@opencode/util/uuid"
import type { Question, QuestionType, Template } from "../src/contract.js"
import type { Definition } from "./definition.js"

const TYPES: readonly QuestionType[] = [
  "text",
  "textarea",
  "select",
  "multiselect",
  "person",
  "date",
  "time",
  "boolean",
]

export interface TemplatesProps {
  readonly templates: readonly Template[]
  readonly onCreate: () => Template
  readonly onSave: (template: Template) => Promise<void>
  readonly onDelete: (template: Template) => Promise<void>
  readonly onBack: () => void
}

/** 模板库：内置服务保留步骤，只允许调整名称与问题；自定义模板可以增删问题。 */
export function Templates(props: TemplatesProps) {
  const ctx = usePlugin<Definition>()
  const [editing, setEditing] = createSignal<Template | null>(null)

  const typeLabel = (type: QuestionType) => ctx.t(`type.${type}`)

  return (
    <Show
      keyed
      when={editing()}
      fallback={
        <div class="itsm-stack">
          <div class="itsm-head">
            <div class="itsm-head__text">
              <h2 class="itsm-head__title">{ctx.t("templates.title")}</h2>
              <p class="itsm-head__description">{ctx.t("templates.hint")}</p>
            </div>
            <div class="itsm-head__meta">
              <ctx.ui.Button variant="ghost" size="small" icon="outline-arrow-left" onClick={props.onBack}>
                {ctx.t("common.back")}
              </ctx.ui.Button>
              <ctx.ui.Button variant="neutral" size="small" icon="plus" onClick={() => setEditing(props.onCreate())}>
                {ctx.t("templates.new")}
              </ctx.ui.Button>
            </div>
          </div>

          <Show
            when={props.templates.length > 0}
            fallback={
              <div class="itsm-empty">
                <span class="itsm-empty__icon">
                  <ctx.ui.Icon name="file-document" size="large" />
                </span>
                <p class="itsm-empty__title">{ctx.t("templates.empty")}</p>
                <p class="itsm-empty__hint">{ctx.t("templates.empty.hint")}</p>
              </div>
            }
          >
            <div class="itsm-list">
              <For each={props.templates}>
                {(template) => (
                  <button type="button" class="itsm-row" onClick={() => setEditing(template)}>
                    <span class="itsm-row__main">
                      <span class="itsm-row__title">
                        <span class="itsm-row__name">{template.name}</span>
                        <span class="itsm-chip">
                          {template.source === "builtin" ? ctx.t("templates.builtin") : ctx.t("templates.custom")}
                        </span>
                      </span>
                    </span>
                    <span class="itsm-row__trail">
                      {ctx.plural("pages", template.pages)} · {template.questions.length} {ctx.t("templates.questions")}
                    </span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      }
    >
      {(template) => (
        <Editor
          template={template}
          typeLabel={typeLabel}
          onClose={() => setEditing(null)}
          onSave={async (next) => {
            await props.onSave(next)
            setEditing(null)
          }}
          onDelete={async () => {
            await props.onDelete(template)
            setEditing(null)
          }}
        />
      )}
    </Show>
  )
}

interface EditorProps {
  readonly template: Template
  readonly typeLabel: (type: QuestionType) => string
  readonly onClose: () => void
  readonly onSave: (template: Template) => Promise<void>
  readonly onDelete: () => Promise<void>
}

function Editor(props: EditorProps) {
  const ctx = usePlugin<Definition>()
  const [name, setName] = createSignal(props.template.name)
  const [serviceKey, setServiceKey] = createSignal(props.template.serviceKey)
  const [questions, setQuestions] = createSignal<Question[]>(props.template.questions.map((question) => ({ ...question })))
  const [busy, setBusy] = createSignal(false)

  const update = (index: number, patch: Partial<Question>) =>
    setQuestions(questions().map((question, at) => (at === index ? { ...question, ...patch } : question)))

  const add = () =>
    setQuestions([
      ...questions(),
      { id: `q_${uuid().slice(0, 8)}`, label: "", type: "text", required: false },
    ])

  const remove = (index: number) => setQuestions(questions().filter((_, at) => at !== index))

  const save = async () => {
    if (busy()) return
    setBusy(true)
    try {
      await props.onSave({
        ...props.template,
        name: name().trim(),
        serviceKey: serviceKey().trim(),
        questions: questions().map((question) => ({
          ...question,
          label: question.label.trim(),
          ...(question.hint === undefined ? {} : { hint: question.hint.trim() }),
        })),
      })
      ctx.toast.show({ title: ctx.t("templates.saved"), variant: "success" })
    } catch (cause) {
      ctx.toast.show({
        title: ctx.t("templates.failed"),
        description: cause instanceof Error ? cause.message : String(cause),
        variant: "error",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="itsm-stack itsm-wizard">
      <div class="itsm-head">
        <div class="itsm-head__text">
          <div class="itsm-head__title-row">
            <h2 class="itsm-head__title">{props.template.name}</h2>
            <span class="itsm-chip">
              {props.template.source === "builtin" ? ctx.t("templates.builtin") : ctx.t("templates.custom")}
            </span>
          </div>
        </div>
        <div class="itsm-head__meta">
          <ctx.ui.Button variant="ghost" size="small" onClick={props.onClose}>
            {ctx.t("common.cancel")}
          </ctx.ui.Button>
        </div>
      </div>

      <div>
        <span class="itsm-label">{ctx.t("templates.name")}</span>
        <ctx.ui.TextInput label={ctx.t("templates.name")} value={name()} onInput={setName} size="large" />
      </div>

      <div>
        <span class="itsm-label">{ctx.t("templates.service")}</span>
        <ctx.ui.TextInput label={ctx.t("templates.service")} value={serviceKey()} onInput={setServiceKey} size="large" />
      </div>

      <div>
        <span class="itsm-label">{ctx.t("templates.steps")}</span>
        <div class="itsm-steps-static">
          <For each={props.template.steps}>{(step) => <span class="itsm-chip">{step.name}</span>}</For>
        </div>
      </div>

      <div class="itsm-stack">
        <div class="itsm-card__head">
          <h3 class="itsm-card__title">{ctx.t("templates.questions")}</h3>
          <ctx.ui.Button variant="neutral" size="small" icon="plus" onClick={add}>
            {ctx.t("templates.question.add")}
          </ctx.ui.Button>
        </div>

        <For each={questions()}>
          {(question, index) => (
            <div class="itsm-question-editor">
              <div class="itsm-question-editor__head">
                <span class="itsm-question-editor__index">#{index() + 1}</span>
                <ctx.ui.IconButton
                  icon="trash"
                  variant="ghost-muted"
                  size="small"
                  label={ctx.t("templates.question.remove")}
                  onClick={() => remove(index())}
                />
              </div>
              <div class="itsm-field">
                <div>
                  <span class="itsm-label">{ctx.t("templates.question.label")}</span>
                  <ctx.ui.TextInput
                    label={ctx.t("templates.question.label")}
                    value={question.label}
                    onInput={(value) => update(index(), { label: value })}
                  />
                </div>
                <div>
                  <span class="itsm-label">{ctx.t("templates.question.type")}</span>
                  <ctx.ui.Select
                    label={ctx.t("templates.question.type")}
                    value={question.type}
                    options={TYPES.map((type) => ({ value: type, label: props.typeLabel(type) }))}
                    onChange={(value) => update(index(), { type: value })}
                  />
                </div>
              </div>
              <div>
                <span class="itsm-label">{ctx.t("templates.question.hint")}</span>
                <ctx.ui.TextInput
                  label={ctx.t("templates.question.hint")}
                  value={question.hint ?? ""}
                  onInput={(value) => update(index(), { hint: value })}
                />
              </div>
              <ctx.ui.Switch
                label={ctx.t("templates.question.required")}
                checked={question.required}
                onChange={(checked) => update(index(), { required: checked })}
              />
            </div>
          )}
        </For>
      </div>

      <div class="itsm-actions" data-align="end">
        <ctx.ui.Button variant="danger" onClick={() => void props.onDelete()}>
          {ctx.t("templates.delete")}
        </ctx.ui.Button>
        <div class="itsm-spacer" />
        <ctx.ui.Button variant="contrast" busy={busy()} onClick={() => void save()}>
          {ctx.t("templates.save")}
        </ctx.ui.Button>
      </div>
    </div>
  )
}
