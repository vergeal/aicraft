import type { ScheduleInfo } from "@opencode/client/promise"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { createSignal, For, Match, Show, Switch } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { createModuleSearch, ModuleGroup, ModuleHeader, ModulePage, ModuleSearch } from "@/shell/module-page"
import { useScheduled } from "./context"
import { describeOutcome, describeStatus, describeWhen, formatTime, taskName } from "./describe"
import { outputPreview, promptOf, toneOf } from "./model"
import "./scheduled.css"

/**
 * The scheduled-task workspace: one fused page. Tasks are grouped by state, and a task card opens its facts,
 * prompt, execution log and actions in place.
 */
export function ScheduledScreen() {
  const language = useLanguage()
  const scheduled = useScheduled()
  const search = createModuleSearch()
  const [expanded, setExpanded] = createSignal<string>()

  const needle = () => search.query().trim().toLocaleLowerCase()

  const matches = (task: ScheduleInfo) => {
    if (!needle()) return true

    return `${task.name ?? ""}\n${promptOf(task)}`.toLocaleLowerCase().includes(needle())
  }

  const tasks = () => scheduled.tasks().filter(matches)
  const active = () => tasks().filter((task) => task.status === "active")
  const paused = () => tasks().filter((task) => task.status === "paused")
  const finished = () => tasks().filter((task) => task.status === "done")

  const toggle = (task: ScheduleInfo) => {
    const next = expanded() === task.id ? undefined : task.id

    setExpanded(next)
    if (next) scheduled.setSelected(next)
  }

  const card = (task: ScheduleInfo) => (
    <article class="module-card" data-open={expanded() === task.id ? "" : undefined}>
      <button
        type="button"
        class="module-card-head"
        aria-expanded={expanded() === task.id}
        onClick={() => toggle(task)}
      >
        <span class="module-card-glyph" data-tone={task.lastOutcome === "failed" ? "failed" : task.status}>
          <Icon name="refresh" size="small" />
        </span>
        <span class="module-card-title">
          <strong class="truncate">{taskName(task, language)}</strong>
          <span class="module-card-meta">
            <span>{describeWhen(task, language)}</span>
            <span class="sep" aria-hidden="true" />
            <span>{describeStatus(task.status, language)}</span>
            <Show when={task.lastOutcome === "failed"}>
              <span class="sep" aria-hidden="true" />
              <span class="text-v2-state-fg-danger">{describeOutcome("failed", language)}</span>
            </Show>
            <Show when={task.nextDueAt}>
              <span class="sep" aria-hidden="true" />
              <span>{formatTime(task.nextDueAt)}</span>
            </Show>
          </span>
        </span>
        <Icon name="chevron-down" size="small" class="module-card-trail" />
      </button>
      <Show when={expanded() === task.id}>
        <div class="module-card-body">
          <TaskBody task={task} />
        </div>
      </Show>
    </article>
  )

  return (
    <ModulePage label={language.t("scheduled.title")}>
      <ModuleHeader
        title={language.t("scheduled.title")}
        description={language.t("scheduled.description")}
        actions={
          <>
            <Button
              size="small"
              variant="ghost-muted"
              icon="magnifying-glass"
              aria-label={language.t("replica.nav.search")}
              onClick={search.show}
            />
            <Button size="small" variant="contrast" icon="plus" onClick={scheduled.openNew}>
              {language.t("scheduled.new")}
            </Button>
          </>
        }
      />

      <Show when={scheduled.error()}>
        {(message) => (
          <div class="scheduled-error" role="alert">
            <span class="scheduled-error-message">
              {language.t("scheduled.error.title")} · {message()}
            </span>
            <Button size="small" variant="neutral" onClick={() => void scheduled.load()}>
              {language.t("scheduled.retry")}
            </Button>
          </div>
        )}
      </Show>

      <Show
        when={scheduled.state().status === "loading" && scheduled.tasks().length === 0}
        fallback={
          <Show
            when={scheduled.tasks().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <span class="flex size-10 items-center justify-center rounded-[var(--radius-card)] bg-v2-background-bg-layer-02 text-v2-text-text-faint">
                  <Icon name="refresh" />
                </span>
                <p class="text-[13px] leading-5 font-medium">{language.t("scheduled.empty")}</p>
                <Button size="small" variant="neutral" icon="plus" onClick={scheduled.openNew}>
                  {language.t("scheduled.new")}
                </Button>
              </div>
            }
          >
            <Show when={tasks().length === 0}>
              <p class="py-8 text-center text-[13px] leading-5 text-v2-text-text-muted">
                {language.t("scheduled.empty.noMatch")}
              </p>
            </Show>

            <Show when={active().length > 0}>
              <ModuleGroup title={language.t("scheduled.status.active")} count={active().length}>
                <For each={active()}>{card}</For>
              </ModuleGroup>
            </Show>

            <Show when={paused().length > 0}>
              <ModuleGroup title={language.t("scheduled.status.paused")} count={paused().length}>
                <For each={paused()}>{card}</For>
              </ModuleGroup>
            </Show>

            <Show when={finished().length > 0}>
              <ModuleGroup title={language.t("scheduled.status.done")} count={finished().length}>
                <For each={finished()}>{card}</For>
              </ModuleGroup>
            </Show>
          </Show>
        }
      >
        <div class="flex justify-center py-16">
          <Loader />
        </div>
      </Show>

      <ModuleSearch
        state={search}
        label={language.t("replica.nav.search")}
        placeholder={language.t("scheduled.search.placeholder")}
        hint={
          needle()
            ? tasks().length
              ? language.plural("scheduled.search.results", tasks().length, { count: tasks().length })
              : undefined
            : undefined
        }
      >
        <Show
          when={tasks().length > 0}
          fallback={<p class="module-search-empty">{language.t("scheduled.empty.noMatch")}</p>}
        >
          <For each={tasks()}>
            {(task) => (
              <button
                type="button"
                class="module-search-hit"
                onClick={() => {
                  setExpanded(task.id)
                  scheduled.setSelected(task.id)
                  search.close()
                }}
              >
                <Icon name="refresh" size="small" />
                <span class="module-search-hit-label">{taskName(task, language)}</span>
                <span class="text-[12px] text-v2-text-text-faint">{describeStatus(task.status, language)}</span>
              </button>
            )}
          </For>
        </Show>
      </ModuleSearch>
    </ModulePage>
  )
}

/** One task's facts and log, rendered inside its card. */
function TaskBody(props: { task: ScheduleInfo }) {
  const language = useLanguage()
  const scheduled = useScheduled()

  return (
    <>
      <div class="scheduled-stats">
        <div class="scheduled-stat">
          <div class="scheduled-stat-key">{language.t("scheduled.detail.next")}</div>
          <div class="scheduled-stat-value">{formatTime(props.task.nextDueAt)}</div>
        </div>
        <div class="scheduled-stat">
          <div class="scheduled-stat-key">{language.t("scheduled.detail.directory")}</div>
          <div class="scheduled-stat-value scheduled-stat-path">{scheduled.projectOf(props.task) ?? "—"}</div>
        </div>
        <div class="scheduled-stat">
          <div class="scheduled-stat-key">{language.t("scheduled.detail.runs")}</div>
          <div class="scheduled-stat-value">{props.task.runCount}</div>
        </div>
        <div class="scheduled-stat">
          <div class="scheduled-stat-key">{language.t("scheduled.detail.last")}</div>
          <div class="scheduled-stat-value scheduled-stat-path">
            {props.task.lastOutcome ? describeOutcome(props.task.lastOutcome, language) : "—"}
          </div>
        </div>
      </div>

      <div class="scheduled-section">
        <span class="scheduled-section-label">{language.t("scheduled.detail.recent")}</span>
        <Show
          when={props.task.lastFiredAt}
          fallback={
            <div class="scheduled-run">
              <span class="scheduled-run-out">{language.t("scheduled.detail.recent.empty")}</span>
            </div>
          }
        >
          {(firedAt) => (
            <div class="scheduled-run">
              <span class="scheduled-dot" data-status={props.task.status} data-outcome={props.task.lastOutcome} />
              <span class="scheduled-run-when">{formatTime(firedAt())}</span>
              <span class="scheduled-run-out">
                {outputPreview(props.task) ??
                  (props.task.lastOutcome ? describeOutcome(props.task.lastOutcome, language) : "—")}
              </span>
              <span class="scheduled-run-right">
                <Show when={props.task.lastOutcome}>
                  {(outcome) => (
                    <span class="scheduled-badge" data-tone={toneOf(props.task)}>
                      {describeOutcome(outcome(), language)}
                    </span>
                  )}
                </Show>
              </span>
            </div>
          )}
        </Show>
      </div>

      <div class="scheduled-section">
        <span class="scheduled-section-label">{language.t("scheduled.detail.prompt")}</span>
        <pre class="scheduled-prompt">{promptOf(props.task)}</pre>
      </div>

      <div class="scheduled-section">
        <span class="scheduled-section-label">{language.t("scheduled.detail.logs")}</span>
        <Switch>
          <Match when={scheduled.logs().status === "loading"}>
            <p class="scheduled-log-status" role="status">
              <Loader class="size-3.5" />
              {language.t("scheduled.detail.logs.loading")}
            </p>
          </Match>
          <Match when={scheduled.logs().status === "failed"}>
            <div class="scheduled-log-status">
              <span>{language.t("scheduled.detail.logs.failed")}</span>
              <Button size="small" variant="neutral" onClick={() => void scheduled.loadLogs(props.task)}>
                {language.t("scheduled.retry")}
              </Button>
            </div>
          </Match>
          <Match when={scheduled.logs().status === "ready"}>
            <Show
              when={scheduled.logEntries()?.length}
              fallback={<p class="scheduled-log-status">{language.t("scheduled.detail.logs.empty")}</p>}
            >
              <div class="scheduled-logs">
                <For each={scheduled.logEntries()}>
                  {(entry) => (
                    <article class="scheduled-log">
                      <time class="scheduled-log-time">{formatTime(entry.at)}</time>
                      <pre class="scheduled-log-text">{entry.text}</pre>
                    </article>
                  )}
                </For>
              </div>
            </Show>
          </Match>
        </Switch>
      </div>

      <Show when={props.task.lastOutput?.trim()}>
        {(output) => (
          <div class="scheduled-section">
            <span class="scheduled-section-label">{language.t("scheduled.detail.output")}</span>
            <pre class="scheduled-output">{output()}</pre>
          </div>
        )}
      </Show>

      <div class="flex flex-wrap items-center gap-2 pt-1">
        <Show when={props.task.status !== "done"}>
          <Button
            size="small"
            variant="neutral"
            disabled={scheduled.busy() === props.task.id}
            onClick={() => void scheduled.setStatus(props.task, props.task.status === "paused" ? "resume" : "pause")}
          >
            {language.t(props.task.status === "paused" ? "scheduled.detail.resume" : "scheduled.detail.pause")}
          </Button>
        </Show>
        <Button
          size="small"
          variant="ghost-danger"
          icon="outline-trash"
          disabled={scheduled.busy() === props.task.id}
          onClick={() => void scheduled.confirmRemove(props.task)}
        >
          {language.t("scheduled.detail.delete")}
        </Button>
      </div>
    </>
  )
}
