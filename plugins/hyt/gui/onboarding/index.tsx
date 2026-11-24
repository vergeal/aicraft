import { Slot, Style } from "@aicraft/plugin/gui"
import type { Context } from "@aicraft/plugin/gui"
import { optional } from "@aicraft/schema/schema"
import { Schema } from "effect"
import { For, Show, createSignal } from "solid-js"
import { applyPreset } from "../../src/profile/presets.js"
import type { PresetName } from "../../src/profile/schema.js"
import { PRESET_NAMES, ROLES, SCENES } from "../../src/profile/schema.js"
import { ChoiceCard, Field, useHyt } from "../shared/components.js"
import type { Hyt } from "../shared/components.js"
import { text } from "../shared/i18n.js"
import { css } from "../shared/styles.js"

type Role = (typeof ROLES)[number]
type Scene = (typeof SCENES)[number]
type Scope = "off" | "whitelist" | "all"

const STEPS = ["about", "scenes", "bounds", "preview"] as const
const TOTAL = STEPS.length

/** 引导草稿：存在窗口自己的 storage 里，退出或刷新都不会丢。 */
const Draft = Schema.Struct({
  step: Schema.Number,
  account: Schema.String,
  role: Schema.Literals(ROLES),
  scenes: Schema.Array(Schema.Literals(SCENES)),
  preset: optional(Schema.Literals(PRESET_NAMES)),
  autopilotScope: Schema.Literals(["off", "whitelist", "all"]),
  digestEveryHours: Schema.Number,
  analysisIntervalMinutes: Schema.Number,
  batchSize: Schema.Number,
  model: Schema.String,
  knowledgeBuiltin: Schema.Boolean,
  paths: Schema.Array(Schema.String),
})

type DraftValue = typeof Draft.Type

function initialDraft(): DraftValue {
  return {
    step: 0,
    account: "",
    role: "it-ops",
    scenes: [],
    autopilotScope: "off",
    digestEveryHours: 24,
    analysisIntervalMinutes: 30,
    batchSize: 50,
    model: "",
    knowledgeBuiltin: true,
    paths: [],
  }
}

/**
 * 首次安装引导：`profile.onboarding.completed` 为 false 时自动出现。
 * 它是一个独立的覆盖层，不阻塞聊天页；关闭后本窗口不再打扰，下次打开窗口会重新询问。
 */
export function registerOnboarding(ctx: Context) {
  ctx.add(Style, css)
  ctx.add(Slot, { at: "window.bottom", render: () => <Onboarding ctx={ctx} /> })
}

function Onboarding(props: { ctx: Context }) {
  const hyt = useHyt(props.ctx)
  const store = props.ctx.storage.store("onboarding", { schema: Draft, initial: initialDraft() })
  const [dismissed, setDismissed] = createSignal(false)

  const draft = (): DraftValue => store.value ?? initialDraft()
  const write = (next: Partial<DraftValue>) => store.set({ ...draft(), ...next })

  const profile = () => hyt.state()?.profile
  const ready = () => profile() !== undefined && profile() !== null
  const visible = () => !dismissed() && ready() && profile()?.onboarding.completed !== true
  const step = () => Math.min(Math.max(draft().step, 0), TOTAL - 1)

  const account = () => draft().account || hyt.state()?.account?.account || profile()?.account || ""
  const department = () => hyt.state()?.department ?? ""
  const displayName = () => hyt.state()?.account?.displayName ?? ""

  const go = (next: number) => write({ step: Math.min(Math.max(next, 0), TOTAL - 1) })

  /** 预设只写进草稿；真正套用发生在完成时，这样用户后续的微调不会被预设覆盖。 */
  const pickPreset = (name: PresetName) => {
    const preset = applyPreset(name, account(), Date.now())
    write({
      preset: name,
      role: preset.role,
      scenes: [...preset.scenes],
      autopilotScope: preset.capabilities.autopilot.scope,
      digestEveryHours: preset.capabilities.digest.everyHours,
      analysisIntervalMinutes: preset.cost.analysisIntervalMinutes,
      batchSize: preset.cost.batchSize,
      model: preset.cost.model,
    })
  }

  const toggleScene = (scene: Scene) => {
    const current = draft().scenes
    write({
      scenes: current.includes(scene) ? current.filter((item) => item !== scene) : [...current, scene],
    })
  }

  const payload = (): Parameters<typeof hyt.client.patch>[0] => {
    return {
      account: account(),
      role: draft().role,
      scenes: draft().scenes,
      capabilities: {
        digest: { enabled: true, everyHours: draft().digestEveryHours },
        tasks: { enabled: true },
        reminders: { enabled: true },
        knowledge: { enabled: true },
        drafts: { enabled: true },
        autopilot: { enabled: draft().autopilotScope !== "off", scope: draft().autopilotScope },
        style: { enabled: true },
      },
      cost: {
        model: draft().model,
        analysisIntervalMinutes: draft().analysisIntervalMinutes,
        batchSize: draft().batchSize,
      },
      knowledge: { builtin: draft().knowledgeBuiltin, paths: draft().paths },
      onboarding: { completed: true, completedAt: Date.now(), preset: draft().preset },
    }
  }

  const finish = async () => {
    const saved = await hyt.patch(payload())
    if (saved !== undefined) setDismissed(true)
  }

  const skip = async () => {
    const saved = await hyt.patch({
      account: account(),
      role: draft().role,
      scenes: draft().scenes,
      capabilities: {
        digest: { enabled: true, everyHours: 24 },
        tasks: { enabled: true },
        reminders: { enabled: false },
        knowledge: { enabled: false },
        drafts: { enabled: true },
        autopilot: { enabled: false, scope: "off" },
        style: { enabled: true },
      },
      cost: { model: "" },
      knowledge: { builtin: true, paths: draft().paths },
      onboarding: { completed: true, completedAt: Date.now() },
    })
    if (saved !== undefined) setDismissed(true)
  }

  return (
    <Show when={visible()}>
      <div class="hyt-onboarding" role="dialog" aria-modal="true" aria-label={text(props.ctx, "hyt.onboarding.title")}>
        <div class="hyt-onboarding-panel">
          <header class="hyt-onboarding-head">
            <div>
              <div class="hyt-onboarding-eyebrow">{text(props.ctx, "hyt.onboarding.step", { current: step() + 1, total: TOTAL })}</div>
              <h2 class="hyt-onboarding-title">{text(props.ctx, `hyt.onboarding.${STEPS[step()]}.title`)}</h2>
              <p class="hyt-onboarding-lede">{text(props.ctx, `hyt.onboarding.${STEPS[step()]}.description`)}</p>
            </div>
            <props.ctx.ui.IconButton
              icon="close"
              label={text(props.ctx, "hyt.onboarding.exit")}
              onClick={() => setDismissed(true)}
            />
          </header>

          <div class="hyt-onboarding-steps" aria-hidden="true">
            <For each={STEPS}>
              {(_, index) => <span class="hyt-onboarding-step" data-active={index() <= step()} />}
            </For>
          </div>

          <div class="hyt-onboarding-body">
            <Show when={step() === 0}>
              <AboutStep ctx={props.ctx} role={draft().role} onRole={(role) => write({ role })} name={displayName()} account={account()} department={department()} />
            </Show>
            <Show when={step() === 1}>
              <ScenesStep
                ctx={props.ctx}
                scenes={draft().scenes}
                preset={draft().preset}
                onScene={toggleScene}
                onPreset={pickPreset}
              />
            </Show>
            <Show when={step() === 2}>
              <BoundsStep
                ctx={props.ctx}
                scope={draft().autopilotScope}
                everyHours={draft().digestEveryHours}
                model={draft().model}
                builtin={draft().knowledgeBuiltin}
                paths={draft().paths}
                onScope={(scope) => write({ autopilotScope: scope })}
                onEveryHours={(digestEveryHours) => write({ digestEveryHours })}
                onModel={(model) => write({ model })}
                onBuiltin={(knowledgeBuiltin) => write({ knowledgeBuiltin })}
                onPaths={(paths) => write({ paths })}
              />
            </Show>
            <Show when={step() === 3}>
              <PreviewStep ctx={props.ctx} hyt={hyt} draft={draft()} account={account()} department={department()} />
            </Show>
          </div>

          <footer class="hyt-onboarding-foot">
            <button type="button" class="hyt-onboarding-link" onClick={() => void skip()}>
              {text(props.ctx, "hyt.onboarding.skip")}
            </button>
            <div class="hyt-onboarding-foot-group">
              <Show when={step() > 0}>
                <props.ctx.ui.Button variant="ghost" onClick={() => go(step() - 1)}>
                  {text(props.ctx, "hyt.onboarding.back")}
                </props.ctx.ui.Button>
              </Show>
              <Show
                when={step() < TOTAL - 1}
                fallback={
                  <props.ctx.ui.Button variant="contrast" busy={hyt.busy() === "save"} onClick={() => void finish()}>
                    {text(props.ctx, "hyt.onboarding.finish")}
                  </props.ctx.ui.Button>
                }
              >
                <props.ctx.ui.Button variant="contrast" onClick={() => go(step() + 1)}>
                  {text(props.ctx, "hyt.onboarding.next")}
                </props.ctx.ui.Button>
              </Show>
            </div>
          </footer>
        </div>
      </div>
    </Show>
  )
}

function AboutStep(props: {
  ctx: Context
  name: string
  account: string
  department: string
  role: Role
  onRole: (role: Role) => void
}) {
  return (
    <>
      <div class="hyt-identity">
        <div>
          <div class="hyt-identity-label">{text(props.ctx, "hyt.onboarding.about.name")}</div>
          <div class="hyt-identity-value">{props.name.length > 0 ? props.name : text(props.ctx, "hyt.common.unknown")}</div>
        </div>
        <div>
          <div class="hyt-identity-label">{text(props.ctx, "hyt.onboarding.about.account")}</div>
          <div class="hyt-identity-value">{props.account.length > 0 ? props.account : text(props.ctx, "hyt.account.none")}</div>
        </div>
        <div>
          <div class="hyt-identity-label">{text(props.ctx, "hyt.onboarding.about.department")}</div>
          <div class="hyt-identity-value">
            {props.department.length > 0 ? props.department : text(props.ctx, "hyt.account.department.unknown")}
          </div>
        </div>
      </div>

      <Field label={text(props.ctx, "hyt.onboarding.about.role")} help={text(props.ctx, "hyt.onboarding.about.role.description")}>
        <props.ctx.ui.Select
          label={text(props.ctx, "hyt.onboarding.about.role")}
          value={props.role}
          options={ROLES.map((role) => ({ value: role, label: text(props.ctx, `hyt.role.${role}`) }))}
          onChange={props.onRole}
        />
      </Field>
    </>
  )
}

function ScenesStep(props: {
  ctx: Context
  scenes: readonly Scene[]
  preset: PresetName | undefined
  onScene: (scene: Scene) => void
  onPreset: (name: PresetName) => void
}) {
  return (
    <>
      <div class="hyt-cards">
        <For each={SCENES}>
          {(scene) => (
            <ChoiceCard
              pressed={props.scenes.includes(scene)}
              title={text(props.ctx, `hyt.scene.${scene}`)}
              body={text(props.ctx, `hyt.scene.${scene}.description`)}
              onClick={() => props.onScene(scene)}
            />
          )}
        </For>
      </div>

      <Field label={text(props.ctx, "hyt.onboarding.scenes.preset")}>
        <div class="hyt-cards">
          <For each={PRESET_NAMES}>
            {(name) => (
              <ChoiceCard
                pressed={props.preset === name}
                title={text(props.ctx, `hyt.onboarding.preset.${name}`)}
                body={text(props.ctx, `hyt.onboarding.preset.${name}.description`)}
                onClick={() => props.onPreset(name)}
              />
            )}
          </For>
        </div>
      </Field>
    </>
  )
}

function BoundsStep(props: {
  ctx: Context
  scope: Scope
  everyHours: number
  model: string
  builtin: boolean
  paths: readonly string[]
  onScope: (scope: Scope) => void
  onEveryHours: (hours: number) => void
  onModel: (model: string) => void
  onBuiltin: (builtin: boolean) => void
  onPaths: (paths: string[]) => void
}) {
  const addPath = async () => {
    const picked = (await props.ctx.desktop?.pick({ directory: true, title: text(props.ctx, "hyt.knowledge.paths.add") }))?.[0]
    const value = picked?.trim() ?? ""
    if (value.length === 0 || props.paths.includes(value)) return
    props.onPaths([...props.paths, value])
  }

  return (
    <>
      <Field label={text(props.ctx, "hyt.onboarding.bounds.autopilot")} help={text(props.ctx, "hyt.capability.autopilot.description")}>
        <props.ctx.ui.Select
          label={text(props.ctx, "hyt.onboarding.bounds.autopilot")}
          value={props.scope}
          options={[
            { value: "off", label: text(props.ctx, "hyt.autopilot.off") },
            { value: "whitelist", label: text(props.ctx, "hyt.autopilot.whitelist") },
            { value: "all", label: text(props.ctx, "hyt.autopilot.all") },
          ]}
          onChange={props.onScope}
        />
      </Field>

      <Field label={text(props.ctx, "hyt.onboarding.bounds.frequency")}>
        <props.ctx.ui.Select
          label={text(props.ctx, "hyt.onboarding.bounds.frequency")}
          value={String(props.everyHours)}
          options={[
            { value: "4", label: text(props.ctx, "hyt.onboarding.bounds.frequency.4") },
            { value: "8", label: text(props.ctx, "hyt.onboarding.bounds.frequency.8") },
            { value: "24", label: text(props.ctx, "hyt.onboarding.bounds.frequency.24") },
          ]}
          onChange={(value) => props.onEveryHours(Number(value))}
        />
      </Field>

      <Field label={text(props.ctx, "hyt.onboarding.bounds.model")} help={text(props.ctx, "hyt.cost.model.description")}>
        <props.ctx.ui.TextInput
          label={text(props.ctx, "hyt.onboarding.bounds.model")}
          placeholder={text(props.ctx, "hyt.cost.model.placeholder")}
          value={props.model}
          onInput={props.onModel}
        />
      </Field>

      <Field label={text(props.ctx, "hyt.onboarding.bounds.knowledge")}>
        <div class="hyt-list">
          <Show when={props.paths.length > 0}>
            <For each={props.paths}>
              {(path) => (
                <div class="hyt-list-row">
                  <div class="hyt-list-text">
                    <span class="hyt-list-title">{path}</span>
                  </div>
                  <props.ctx.ui.Button
                    size="small"
                    variant="ghost-muted"
                    onClick={() => props.onPaths(props.paths.filter((item) => item !== path))}
                  >
                    {text(props.ctx, "hyt.knowledge.remove")}
                  </props.ctx.ui.Button>
                </div>
              )}
            </For>
          </Show>
          <div class="hyt-list-row">
            <div class="hyt-list-text">
              <span class="hyt-list-title">{text(props.ctx, "hyt.knowledge.builtin")}</span>
              <span class="hyt-list-detail">{text(props.ctx, "hyt.knowledge.builtin.description")}</span>
            </div>
            <props.ctx.ui.Switch
              label={text(props.ctx, "hyt.knowledge.builtin")}
              hideLabel
              checked={props.builtin}
              onChange={props.onBuiltin}
            />
          </div>
          <div class="hyt-list-row">
            <div class="hyt-list-text">
              <span class="hyt-list-title">{text(props.ctx, "hyt.knowledge.paths")}</span>
              <span class="hyt-list-detail">{text(props.ctx, "hyt.knowledge.paths.description")}</span>
            </div>
            <props.ctx.ui.Button size="small" onClick={() => void addPath()}>
              {text(props.ctx, "hyt.knowledge.paths.add")}
            </props.ctx.ui.Button>
          </div>
        </div>
      </Field>

      <span class="hyt-inline-note">{text(props.ctx, "hyt.onboarding.bounds.privacy")}</span>
    </>
  )
}

function PreviewStep(props: { ctx: Context; hyt: Hyt; draft: DraftValue; account: string; department: string }) {
  const [trial, setTrial] = createSignal<{ messages: number; sessions: number; lines: readonly { sender: string; text: string; at: number }[] } | undefined>()
  const [loading, setLoading] = createSignal(false)

  const runTrial = async () => {
    setLoading(true)
    const result = await props.hyt.run("trial", () => props.hyt.client.trial())
    setLoading(false)
    if (result !== undefined) setTrial(result)
  }

  const current = () => trial()

  return (
    <>
      <div class="hyt-preview">
        <span class="hyt-preview-key">{text(props.ctx, "hyt.onboarding.preview.role")}</span>
        <span class="hyt-preview-value">
          {text(props.ctx, `hyt.role.${props.draft.role}`)}
          {props.account.length > 0 ? ` · ${props.account}` : ""}
          {props.department.length > 0 ? ` · ${props.department}` : ""}
        </span>

        <span class="hyt-preview-key">{text(props.ctx, "hyt.onboarding.preview.scenes")}</span>
        <span class="hyt-preview-value">
          {props.draft.scenes.length === 0
            ? text(props.ctx, "hyt.common.none")
            : props.draft.scenes.map((scene) => text(props.ctx, `hyt.scene.${scene}`)).join("、")}
        </span>

        <span class="hyt-preview-key">{text(props.ctx, "hyt.onboarding.preview.digest")}</span>
        <span class="hyt-preview-value">
          {text(props.ctx, "hyt.onboarding.preview.on")} ·{" "}
          {text(props.ctx, props.draft.digestEveryHours >= 24 ? "hyt.onboarding.bounds.frequency.24" : `hyt.onboarding.bounds.frequency.${props.draft.digestEveryHours}`)}
        </span>

        <span class="hyt-preview-key">{text(props.ctx, "hyt.onboarding.preview.autopilot")}</span>
        <span class="hyt-preview-value">{text(props.ctx, `hyt.autopilot.${props.draft.autopilotScope}`)}</span>

        <span class="hyt-preview-key">{text(props.ctx, "hyt.onboarding.preview.knowledge")}</span>
        <span class="hyt-preview-value">
          {props.draft.knowledgeBuiltin ? text(props.ctx, "hyt.knowledge.builtin") : text(props.ctx, "hyt.onboarding.preview.off")}
        </span>

        <span class="hyt-preview-key">{text(props.ctx, "hyt.onboarding.preview.style")}</span>
        <span class="hyt-preview-value">{text(props.ctx, "hyt.onboarding.preview.on")}</span>
      </div>

      <Field label={text(props.ctx, "hyt.onboarding.trial")} help={text(props.ctx, "hyt.onboarding.trial.description")}>
        <props.ctx.ui.Button size="small" busy={loading()} onClick={() => void runTrial()}>
          {current() === undefined ? text(props.ctx, "hyt.onboarding.trial") : text(props.ctx, "hyt.onboarding.trial.retry")}
        </props.ctx.ui.Button>

        <Show when={current()}>
          {(result) => (
            <div class="hyt-trial">
              <span class="hyt-list-detail">
                {text(props.ctx, "hyt.onboarding.trial.summary", { messages: result().messages, sessions: result().sessions })}
              </span>
              <Show when={result().lines.length === 0}>
                <span class="hyt-list-detail">{text(props.ctx, "hyt.onboarding.trial.empty")}</span>
              </Show>
              <For each={result().lines}>
                {(line) => (
                  <div class="hyt-trial-line">
                    <span class="hyt-trial-sender">{line.sender}</span>
                    <span>{line.text}</span>
                  </div>
                )}
              </For>
            </div>
          )}
        </Show>
      </Field>
    </>
  )
}
