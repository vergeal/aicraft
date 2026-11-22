import { For, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import type { Run, Template } from "../src/contract.js"
import type { Definition } from "./definition.js"

export interface HistoryProps {
  readonly runs: readonly Run[]
  readonly templates: readonly Template[]
  readonly onClear: () => void
  readonly onBack: () => void
}

/** 历史：倒序列出走过的工单，点开看当时填的值。 */
export function History(props: HistoryProps) {
  const ctx = usePlugin<Definition>()

  const templateName = (id: string) => props.templates.find((template) => template.id === id)?.name ?? id

  const statusCopy = (status: Run["status"]) =>
    status === "draft"
      ? ctx.t("history.status.draft")
      : status === "running"
        ? ctx.t("history.status.running")
        : status === "stopped"
          ? ctx.t("history.status.stopped")
          : status === "submitted"
            ? ctx.t("history.status.submitted")
            : ctx.t("history.status.failed")

  const tone = (status: Run["status"]) =>
    status === "submitted" ? "success" : status === "failed" ? "danger" : undefined

  const formatDate = (iso: string) => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ""
    return new Intl.DateTimeFormat(ctx.locale.locale(), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  return (
    <div class="itsm-stack">
      <div class="itsm-head">
        <div class="itsm-head__text">
          <h2 class="itsm-head__title">{ctx.t("history.title")}</h2>
          <p class="itsm-head__description">{ctx.t("history.hint")}</p>
        </div>
        <div class="itsm-head__meta">
          <Show when={props.runs.length > 0}>
            <span class="itsm-chip">{ctx.t("history.count", { count: String(props.runs.length) })}</span>
            <ctx.ui.Button variant="ghost-muted" size="small" icon="trash" onClick={props.onClear}>
              {ctx.t("history.clear")}
            </ctx.ui.Button>
          </Show>
          <ctx.ui.Button variant="ghost" size="small" icon="outline-arrow-left" onClick={props.onBack}>
            {ctx.t("common.back")}
          </ctx.ui.Button>
        </div>
      </div>

      <Show
        when={props.runs.length > 0}
        fallback={
          <div class="itsm-empty">
            <span class="itsm-empty__icon">
              <ctx.ui.Icon name="library" size="large" />
            </span>
            <p class="itsm-empty__title">{ctx.t("empty.history")}</p>
            <p class="itsm-empty__hint">{ctx.t("empty.history.hint")}</p>
          </div>
        }
      >
        <div class="itsm-history">
          <For each={props.runs}>
            {(run) => (
              <article class="itsm-history__item">
                <div class="itsm-history__top">
                  <span class="itsm-history__title" title={run.title}>
                    {run.title}
                  </span>
                  <span class="itsm-chip" data-tone={tone(run.status)}>
                    {statusCopy(run.status)}
                  </span>
                </div>
                <span class="itsm-history__meta">
                  {templateName(run.templateId)} · {formatDate(run.startedAt)}
                </span>
                <Show when={run.orderNo}>
                  <span class="itsm-history__meta">{ctx.t("run.order", { number: run.orderNo ?? "" })}</span>
                </Show>
                <div class="itsm-steps-static">
                  <For each={Object.entries(run.fields).slice(0, 4)}>
                    {([label, value]) => (
                      <span class="itsm-chip">
                        {label}: {value.length > 28 ? `${value.slice(0, 28)}…` : value}
                      </span>
                    )}
                  </For>
                </div>
              </article>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
