import { createSignal, For, Show } from "solid-js"
import { usePlugin } from "@aicraft/aix/gui"
import { uuid } from "@aicraft/util/uuid"
import type { Account, AnswerValue, Run, RunStatus, StepRun, Template } from "../src/contract.js"
import type { IpcClient } from "@aicraft/aix/gui/main"
import type { ItsmBrowser } from "../src/ipc.js"
import { formatDuration, nextSteps } from "../src/logic.js"
import type { Definition } from "./definition.js"

const STEP_TIMEOUT = 15_000

type Phase = "idle" | "running" | "await-submit" | "failed" | "stopped" | "submitted" | "done"

export interface ExecuteProps {
  readonly template: Template
  readonly values: Readonly<Record<string, AnswerValue>>
  readonly account: Account | null
  readonly portalUrl: string
  readonly client: IpcClient<(typeof ItsmBrowser)["spec"]> | null
  readonly onRecord: (run: Run) => Promise<void>
  readonly onOpenSettings: () => void
}

/**
 * 执行器：逐步驱动内嵌浏览器。只有 `submit` 步骤需要用户再确认一次，其余步骤自动推进；
 * 任何一步失败都停下来，等用户修好页面后重试这一步。
 */
export function Execute(props: ExecuteProps) {
  const ctx = usePlugin<Definition>()
  const [steps, setSteps] = createSignal<StepRun[]>(
    props.template.steps.map((step) => ({ id: step.id, name: step.name, status: "waiting" })),
  )
  const [phase, setPhase] = createSignal<Phase>("idle")
  const [embed, setEmbed] = createSignal<string | null>(null)
  const [address, setAddress] = createSignal(props.portalUrl)
  const [orderNo, setOrderNo] = createSignal<string | null>(null)
  const [failure, setFailure] = createSignal<string | null>(null)
  const [browserOpen, setBrowserOpen] = createSignal(true)

  const runID = uuid()
  const startedAt = new Date().toISOString()

  const client = () => props.client

  const ensureEmbed = async () => {
    const active = client()
    if (!active) return null
    if (!props.account) {
      ctx.toast.show({ title: ctx.t("account.none"), description: ctx.t("account.none.hint"), variant: "error" })
      return null
    }
    const existing = embed()
    if (existing) {
      await active.show({ embed: existing, visible: true }, { signal: ctx.signal })
      return existing
    }
    const created = await active.ensure(
      { accountId: props.account.id, partition: props.account.profileDir },
      { signal: ctx.signal },
    )
    setEmbed(created.embed)
    await active.show({ embed: created.embed, visible: true }, { signal: ctx.signal })
    return created.embed
  }

  const openPortal = async () => {
    const active = client()
    if (!active) return
    try {
      const id = await ensureEmbed()
      if (!id) return
      await active.navigate({ embed: id, url: address().trim(), timeoutMs: STEP_TIMEOUT }, { signal: ctx.signal })
      setPhase("idle")
      setFailure(null)
    } catch (cause) {
      setFailure(reasonOf(cause))
    }
  }

  const perform = async (stepId: string, back: boolean) => {
    const active = client()
    const id = embed()
    if (!active || !id) return false
    setSteps(nextSteps(steps(), { type: "start", id: stepId, at: new Date().toISOString() }))
    try {
      const outcome = await active.runStep(
        {
          embed: id,
          template: props.template,
          values: props.values,
          stepId,
          timeoutMs: STEP_TIMEOUT,
          back,
        },
        { signal: ctx.signal },
      )
      const at = new Date().toISOString()
      setSteps(
        nextSteps(
          steps(),
          outcome.status === "done"
            ? { type: "finish", id: stepId, at, ...(outcome.summary ? { summary: outcome.summary } : {}) }
            : outcome.status === "skipped"
              ? { type: "skip", id: stepId, at, ...(outcome.summary ? { summary: outcome.summary } : {}) }
              : { type: "fail", id: stepId, at, error: outcome.error ?? ctx.t("run.failed") },
        ),
      )
      if (outcome.orderNo) setOrderNo(outcome.orderNo)
      if (outcome.status === "failed") {
        setFailure(outcome.error ?? ctx.t("run.failed"))
        setPhase("failed")
        return false
      }
      return true
    } catch (cause) {
      const at = new Date().toISOString()
      setSteps(nextSteps(steps(), { type: "fail", id: stepId, at, error: reasonOf(cause) }))
      setFailure(reasonOf(cause))
      setPhase("failed")
      return false
    }
  }

  const answerRows = () =>
    props.template.questions.flatMap((question) => {
      const value = props.values[question.rememberKey ?? question.id]
      if (value === undefined) return []
      return [{ label: question.label, value: typeof value === "string" ? value : value.join("，") }]
    })

  const fields = () => {
    const result: Record<string, string> = {}
    for (const row of answerRows()) result[row.label] = row.value
    for (const step of steps()) if (step.summary) result[step.name] = step.summary
    return result
  }

  /** 关联资源那一步的摘要，例如「关联资源 3 条」；模板没有这一步时为空。 */
  const resourceSummary = () => {
    const relate = props.template.steps.find((step) => step.kind === "relate-resources")
    if (!relate) return null
    return steps().find((step) => step.id === relate.id)?.summary ?? null
  }

  const record = async (status: RunStatus) => {
    const run: Run = {
      id: runID,
      templateId: props.template.id,
      accountId: props.account?.id ?? "",
      serviceName: props.template.serviceKey,
      title: String(props.values["title"] ?? props.template.name),
      status,
      steps: steps(),
      startedAt,
      finishedAt: new Date().toISOString(),
      fields: fields(),
      ...(orderNo() ? { orderNo: orderNo()! } : {}),
    }
    try {
      await props.onRecord(run)
    } catch (cause) {
      ctx.toast.show({ title: ctx.t("templates.failed"), description: reasonOf(cause), variant: "error" })
    }
  }

  const finish = async (status: RunStatus) => {
    setPhase(status === "submitted" ? "submitted" : status === "failed" ? "failed" : status === "stopped" ? "stopped" : "done")
    await record(status)
  }

  /** 把还在等的步骤标记为跳过，用在「停在提交前」与失败收尾。 */
  const closeWaiting = (summary?: string) =>
    setSteps(
      steps().map((step) =>
        step.status === "waiting"
          ? { ...step, status: "skipped" as const, ...(summary ? { summary } : {}) }
          : step,
      ),
    )

  const advance = async () => {
    if (phase() === "running") return
    setFailure(null)
    setPhase("running")
    try {
      const id = await ensureEmbed()
      if (!id) {
        setPhase("idle")
        return
      }
      if (address().trim().length > 0)
        await client()!.navigate({ embed: id, url: address().trim(), timeoutMs: STEP_TIMEOUT }, { signal: ctx.signal })
      while (true) {
        const next = steps().find((step) => step.status === "waiting")
        if (!next) {
          await finish("stopped")
          return
        }
        if (next.id === "submit") {
          setPhase("await-submit")
          return
        }
        const ok = await perform(next.id, false)
        if (!ok) return
        if (next.id === "stop") {
          await finish("stopped")
          return
        }
      }
    } catch (cause) {
      setFailure(reasonOf(cause))
      setPhase("failed")
    }
  }

  const retry = async (stepId: string) => {
    setSteps(nextSteps(steps(), { type: "retry", id: stepId }))
    setFailure(null)
    if (!(await perform(stepId, true))) return
    await advance()
  }

  const submit = async () => {
    setPhase("running")
    if (!(await perform("submit", false))) return
    const rest = steps().filter((step) => step.status === "waiting")
    for (const step of rest) {
      const ok = await perform(step.id, false)
      if (!ok) return
    }
    await finish("submitted")
  }

  const stopBeforeSubmit = async () => {
    closeWaiting(ctx.t("run.stopped"))
    await finish("stopped")
  }

  const statusLabel = (status: StepRun["status"]) =>
    status === "waiting"
      ? ctx.t("run.waiting")
      : status === "running"
        ? ctx.t("run.running")
        : status === "done"
          ? ctx.t("run.done")
          : status === "failed"
            ? ctx.t("run.failed")
            : ctx.t("run.skipped")

  return (
    <div class="itsm-stack">
      <div class="itsm-head">
        <div class="itsm-head__text">
          <h2 class="itsm-head__title">{props.template.name}</h2>
          <p class="itsm-head__description">{props.template.serviceKey}</p>
        </div>
        <div class="itsm-head__meta">
          <Show when={orderNo()}>
            <span class="itsm-chip" data-tone="success">
              {ctx.t("run.order", { number: orderNo() ?? "" })}
            </span>
          </Show>
        </div>
      </div>

      <Show when={!props.account}>
        <div class="itsm-notice" data-tone="warning">
          <p class="itsm-notice__title">{ctx.t("account.none")}</p>
          <p class="itsm-notice__hint">{ctx.t("account.none.hint")}</p>
          <div class="itsm-actions">
            <ctx.ui.Button variant="neutral" size="small" onClick={props.onOpenSettings}>
              {ctx.t("account.add")}
            </ctx.ui.Button>
          </div>
        </div>
      </Show>

      <Show when={!props.client}>
        <div class="itsm-notice" data-tone="danger">
          <p class="itsm-notice__title">{ctx.t("run.failed.title")}</p>
          <p class="itsm-notice__hint">{ctx.t("run.failed.hint")}</p>
        </div>
      </Show>

      <div class="itsm-card">
        <div class="itsm-card__head">
          <h3 class="itsm-card__title">{ctx.t("run.browser")}</h3>
          <ctx.ui.Button variant="ghost" size="small" onClick={() => setBrowserOpen(!browserOpen())}>
            {browserOpen() ? ctx.t("run.browser.hide") : ctx.t("run.browser.show")}
          </ctx.ui.Button>
        </div>
        <Show when={browserOpen()}>
          <div class="itsm-address">
            <ctx.ui.TextInput
              class="itsm-address__field"
              label={ctx.t("run.address")}
              placeholder={ctx.t("settings.portal.placeholder")}
              value={address()}
              onInput={setAddress}
              onSubmit={() => void openPortal()}
              type="url"
            />
            <ctx.ui.Button variant="neutral" size="small" icon="globe" onClick={() => void openPortal()}>
              {ctx.t("run.open")}
            </ctx.ui.Button>
          </div>
          <div class="itsm-browser__frame">
            <ctx.embeds.View id={embed() ?? undefined} visible={browserOpen() && Boolean(embed())} class="itsm-browser__view" />
          </div>
          <p class="itsm-card__hint">{ctx.t("run.address.hint")}</p>
        </Show>
      </div>

      <div class="itsm-card">
        <div class="itsm-card__head">
          <h3 class="itsm-card__title">{ctx.t("run.steps")}</h3>
          <Show when={phase() === "running"}>
            <span class="itsm-hint-line">
              <ctx.ui.Loader size="small" />
              {ctx.t("run.busy")}
            </span>
          </Show>
        </div>
        <div class="itsm-steps">
          <For each={steps()}>
            {(step) => (
              <div class="itsm-step" data-status={step.status}>
                <span class="itsm-step__dot" aria-hidden="true">
                  <Show when={step.status === "running"}>
                    <ctx.ui.Loader size="small" />
                  </Show>
                  <Show when={step.status === "done"}>
                    <ctx.ui.Icon name="check" size="small" />
                  </Show>
                  <Show when={step.status === "failed"}>
                    <ctx.ui.Icon name="close" size="small" />
                  </Show>
                  <Show when={step.status === "skipped"}>
                    <ctx.ui.Icon name="minus" size="small" />
                  </Show>
                </span>
                <div class="itsm-step__body">
                  <span class="itsm-step__name">
                    {step.name}
                    <Show when={step.startedAt && step.finishedAt}>
                      <span class="itsm-step__meta">
                        {" "}
                        {formatDuration(new Date(step.finishedAt!).getTime() - new Date(step.startedAt!).getTime())}
                      </span>
                    </Show>
                  </span>
                  <span class="itsm-step__meta" data-tone={step.status === "failed" ? "danger" : undefined}>
                    {step.error ?? step.summary ?? statusLabel(step.status)}
                  </span>
                  <Show when={step.status === "failed"}>
                    <div class="itsm-actions">
                      <ctx.ui.Button variant="neutral" size="small" onClick={() => void retry(step.id)}>
                        {ctx.t("run.retry")}
                      </ctx.ui.Button>
                    </div>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>

        <Show when={failure() && phase() !== "await-submit"}>
          <div class="itsm-notice" data-tone="danger">
            <p class="itsm-notice__title">{ctx.t("run.failed.title")}</p>
            <p class="itsm-notice__hint">{failure()}</p>
          </div>
        </Show>

        <Show when={phase() === "await-submit"}>
          <div class="itsm-notice" data-tone="warning">
            <p class="itsm-notice__title">{ctx.t("run.submit.title")}</p>
            <p class="itsm-notice__hint">{ctx.t("run.submit.hint")}</p>
            <div class="itsm-summary itsm-confirm" role="list">
              <For each={answerRows()}>
                {(row) => (
                  <div class="itsm-summary__row" role="listitem">
                    <span class="itsm-summary__label">{row.label}</span>
                    <span class="itsm-summary__value">{row.value}</span>
                  </div>
                )}
              </For>
              <Show when={resourceSummary()}>
                {(summary) => (
                  <div class="itsm-summary__row" role="listitem">
                    <span class="itsm-summary__label">{ctx.t("run.submit.resources")}</span>
                    <span class="itsm-summary__value">{summary()}</span>
                  </div>
                )}
              </Show>
            </div>
            <div class="itsm-actions">
              <ctx.ui.Button variant="ghost-muted" size="small" onClick={() => void stopBeforeSubmit()}>
                {ctx.t("run.submit.cancel")}
              </ctx.ui.Button>
              <ctx.ui.Button variant="contrast" size="small" onClick={() => void submit()}>
                {ctx.t("run.submit.confirm")}
              </ctx.ui.Button>
            </div>
          </div>
        </Show>

        <Show when={phase() === "stopped"}>
          <div class="itsm-notice" data-tone="success">
            <p class="itsm-notice__title">{ctx.t("run.stopped")}</p>
            <p class="itsm-notice__hint">{ctx.t("run.stopped.hint")}</p>
          </div>
        </Show>

        <Show when={phase() === "done" || phase() === "submitted"}>
          <div class="itsm-notice" data-tone="success">
            <p class="itsm-notice__title">{ctx.t("run.completed")}</p>
            <p class="itsm-notice__hint">{ctx.t("run.completed.hint")}</p>
          </div>
        </Show>

        <div class="itsm-actions" data-align="end">
          <ctx.ui.Button
            variant="contrast"
            icon="fill-triangle-down"
            busy={phase() === "running"}
            disabled={!props.client || !props.account}
            onClick={() => void advance()}
          >
            {phase() === "idle" ? ctx.t("run.start") : ctx.t("run.next")}
          </ctx.ui.Button>
        </div>
      </div>

      <div class="itsm-card">
        <div class="itsm-card__head">
          <h3 class="itsm-card__title">{ctx.t("run.values")}</h3>
        </div>
        <div class="itsm-summary" role="list">
          <For each={Object.entries(fields())}>
            {([label, value]) => (
              <div class="itsm-summary__row" role="listitem">
                <span class="itsm-summary__label">{label}</span>
                <span class="itsm-summary__value">{value}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}

function reasonOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}
