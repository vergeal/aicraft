import { SettingsPage, Style } from "@aicraft/aix/gui"
import type { Context } from "@aicraft/aix/gui"
import { For, Show, createSignal } from "solid-js"
import { Status, useHyt } from "../shared/components.js"
import type { Hyt } from "../shared/components.js"
import type { HytState } from "../shared/contract.js"
import { text } from "../shared/i18n.js"
import { css } from "../shared/styles.js"

const ROLES = ["it-ops", "tech-support", "engineering", "management", "business", "other"] as const
const SCENES = ["troubleshoot", "task-intake", "duty-alerts", "ticket-close", "meeting", "no-miss"] as const
const SCOPES = ["off", "whitelist", "all"] as const

type Scene = (typeof SCENES)[number]

/**
 * 设置页：一个页面、六组。数据全部来自主进程推送的 state，写操作走 Ipc 并即时生效。
 */
export function registerSettings(ctx: Context) {
  ctx.add(Style, css)
  ctx.add(SettingsPage, {
    id: "hyt",
    get title() {
      return text(ctx, "hyt.settings.title")
    },
    icon: "speech-bubble",
    entries: [
      { id: "hyt-account", title: text(ctx, "hyt.account.identity"), keywords: "账号 登录 bridge 连接" },
      { id: "hyt-bridge", title: text(ctx, "hyt.account.bridge"), keywords: "bridge 消息 连接" },
      { id: "hyt-role", title: text(ctx, "hyt.role.title"), keywords: "角色 场景" },
      { id: "hyt-autopilot", title: text(ctx, "hyt.capability.autopilot"), keywords: "自动回复 白名单" },
      { id: "hyt-cost", title: text(ctx, "hyt.section.cost"), keywords: "间隔 批量 模型 成本" },
      { id: "hyt-knowledge", title: text(ctx, "hyt.section.knowledge"), keywords: "知识库 目录 mcp" },
      { id: "hyt-style", title: text(ctx, "hyt.section.style"), keywords: "风格 说话" },
      { id: "hyt-privacy", title: text(ctx, "hyt.section.privacy"), keywords: "数据 密码 清空" },
    ],
    render: () => <Settings ctx={ctx} />,
  })
}

function Settings(props: { ctx: Context }) {
  const hyt = useHyt(props.ctx)

  return (
    <props.ctx.ui.SettingsLayout title={text(props.ctx, "hyt.settings.title")} description={text(props.ctx, "hyt.settings.description")}>
      <Show when={hyt.error()}>{(message) => <div class="hyt-error">{message()}</div>}</Show>
      <Show
        when={hyt.state()?.profile !== undefined && hyt.state()?.profile !== null}
        fallback={<props.ctx.ui.SettingsSection>{hyt.state() === undefined ? <LoadingRow hyt={hyt} /> : <ErrorRow hyt={hyt} />}</props.ctx.ui.SettingsSection>}
      >
        <AccountSection hyt={hyt} />
        <BehaviorSection hyt={hyt} />
        <CostSection hyt={hyt} />
        <KnowledgeSection hyt={hyt} />
        <StyleSection hyt={hyt} />
        <PrivacySection hyt={hyt} />
      </Show>
    </props.ctx.ui.SettingsLayout>
  )
}

function LoadingRow(props: { hyt: Hyt }) {
  return (
    <props.hyt.ctx.ui.SettingsRow title={text(props.hyt.ctx, "hyt.settings.state.loading")}>
      <props.hyt.ctx.ui.Loader size="small" />
    </props.hyt.ctx.ui.SettingsRow>
  )
}

function ErrorRow(props: { hyt: Hyt }) {
  return (
    <props.hyt.ctx.ui.SettingsRow
      title={text(props.hyt.ctx, "hyt.settings.state.error", { message: props.hyt.error() ?? props.hyt.state()?.error ?? "" })}
    >
      <props.hyt.ctx.ui.Button variant="neutral" onClick={() => void props.hyt.run("refresh", () => props.hyt.client.refresh())}>
        {text(props.hyt.ctx, "hyt.common.retry")}
      </props.hyt.ctx.ui.Button>
    </props.hyt.ctx.ui.SettingsRow>
  )
}

function snapshotOf(hyt: Hyt): HytState | undefined {
  return hyt.state()
}

function AccountSection(props: { hyt: Hyt }) {
  const hyt = props.hyt
  const ui = hyt.ctx.ui
  const [pathDraft, setPathDraft] = createSignal<string | undefined>()
  const bridge = () => snapshotOf(hyt)?.bridge
  const login = () => snapshotOf(hyt)?.account
  const logins = () => snapshotOf(hyt)?.logins ?? []
  const bridgeState = () => bridge()?.state ?? "stopped"
  const running = () => bridgeState() === "ready"
  const moving = () => bridgeState() === "connecting" || bridgeState() === "restarting"

  const bridgeLabel = () => {
    const state = bridgeState()
    if (state === "ready") return text(hyt.ctx, "hyt.account.bridge.ready")
    if (state === "connecting") return text(hyt.ctx, "hyt.account.bridge.connecting")
    if (state === "restarting") return text(hyt.ctx, "hyt.account.bridge.restarting")
    if (state === "failed") return text(hyt.ctx, "hyt.account.bridge.failed")
    return text(hyt.ctx, "hyt.account.bridge.stopped")
  }

  return (
    <ui.SettingsSection title={text(hyt.ctx, "hyt.section.account")}>
      <ui.SettingsRow
        id="hyt-account"
        title={login()?.displayName ?? text(hyt.ctx, "hyt.account.identity.unbound")}
        description={login() === null ? text(hyt.ctx, "hyt.account.identity.description") : `${login()?.account ?? ""} · ${departmentOf(hyt)}`}
      >
        <Show
          when={logins().length > 1}
          fallback={<span class="hyt-inline-note">{login()?.compId ?? ""}</span>}
        >
          <ui.Select
            label={text(hyt.ctx, "hyt.account.pick")}
            value={login()?.account}
            options={logins().map((item) => ({ value: item.account, label: `${item.displayName} · ${item.account}` }))}
            onChange={(account) => void hyt.run("account", () => hyt.client.selectAccount({ account }))}
          />
        </Show>
      </ui.SettingsRow>

      <ui.SettingsRow id="hyt-bridge" title={text(hyt.ctx, "hyt.account.bridge")} description={text(hyt.ctx, "hyt.account.bridge.description")}>
        <div style={{ display: "flex", "align-items": "center", gap: "calc(var(--spacing) * 2)" }}>
          <Status state={bridgeState()} label={bridgeLabel()} />
          <ui.Button
            size="small"
            variant={running() ? "neutral" : "contrast"}
            busy={moving() || hyt.busy() === "bridge"}
            onClick={() => void hyt.run("bridge", () => hyt.client.bridge({ action: running() ? "stop" : "start" }))}
          >
            {running()
              ? text(hyt.ctx, "hyt.account.bridge.stop")
              : bridgeState() === "failed"
                ? text(hyt.ctx, "hyt.account.bridge.reconnect")
                : text(hyt.ctx, "hyt.account.bridge.start")}
          </ui.Button>
        </div>
      </ui.SettingsRow>

      <Show when={bridge()?.lastError}>
        {(error) => <ui.SettingsRow title={text(hyt.ctx, "hyt.account.bridge.error")} description={error()} />}
      </Show>

      <ui.SettingsRow title={text(hyt.ctx, "hyt.account.bridge.path")} description={text(hyt.ctx, "hyt.account.bridge.path.description")}>
        <ui.TextInput
          label={text(hyt.ctx, "hyt.account.bridge.path")}
          placeholder={text(hyt.ctx, "hyt.account.bridge.path.placeholder")}
          value={pathDraft() ?? snapshotOf(hyt)?.bridgePath ?? ""}
          onInput={setPathDraft}
          onSubmit={(value) => {
            setPathDraft(undefined)
            void hyt.run("bridge-path", () => hyt.client.setLocation({ bridgePath: value.trim() }))
          }}
        />
      </ui.SettingsRow>

      <ui.SettingsRow title={text(hyt.ctx, "hyt.account.root")} description={text(hyt.ctx, "hyt.account.root.description")}>
        <span class="hyt-inline-note">{snapshotOf(hyt)?.chfileRoot ?? ""}</span>
      </ui.SettingsRow>
    </ui.SettingsSection>
  )
}

function departmentOf(hyt: Hyt) {
  const department = snapshotOf(hyt)?.department ?? ""
  return department.length > 0 ? department : text(hyt.ctx, "hyt.account.department.unknown")
}

function CapabilityRow(props: {
  hyt: Hyt
  title: string
  description: string
  checked: boolean
  onChange: (enabled: boolean) => void
}) {
  const ui = props.hyt.ctx.ui
  return (
    <ui.SettingsRow title={props.title} description={props.description}>
      <ui.Switch label={props.title} hideLabel checked={props.checked} onChange={props.onChange} />
    </ui.SettingsRow>
  )
}

function BehaviorSection(props: { hyt: Hyt }) {
  const hyt = props.hyt
  const ui = hyt.ctx.ui
  const profile = () => snapshotOf(hyt)?.profile
  const [peopleQuery, setPeopleQuery] = createSignal("")
  const [people, setPeople] = createSignal<readonly { account: string; name: string; department: string; remark: string }[]>([])
  const [searching, setSearching] = createSignal(false)
  const scope = () => profile()?.capabilities.autopilot.scope ?? "off"
  const whitelist = () => profile()?.capabilities.autopilot.whitelist ?? []

  const search = async () => {
    setSearching(true)
    const result = await hyt.run("people", () => hyt.client.people({ query: peopleQuery(), limit: 12 }))
    setSearching(false)
    if (result !== undefined) setPeople(result)
  }

  const addPerson = (account: string) => {
    if (whitelist().includes(account)) return
    void hyt.patch({ capabilities: { autopilot: { whitelist: [...whitelist(), account] } } })
  }

  const removePerson = (account: string) => {
    void hyt.patch({ capabilities: { autopilot: { whitelist: whitelist().filter((item) => item !== account) } } })
  }

  return (
    <ui.SettingsSection title={text(hyt.ctx, "hyt.section.behavior")}>
      <ui.SettingsRow id="hyt-role" title={text(hyt.ctx, "hyt.role.title")} description={text(hyt.ctx, "hyt.role.description")}>
        <ui.Select
          label={text(hyt.ctx, "hyt.role.title")}
          value={profile()?.role}
          options={ROLES.map((role) => ({ value: role, label: text(hyt.ctx, `hyt.role.${role}`) }))}
          onChange={(role) => void hyt.patch({ role })}
        />
      </ui.SettingsRow>

      <For each={SCENES}>
        {(scene) => (
          <ui.SettingsRow title={text(hyt.ctx, `hyt.scene.${scene}`)} description={text(hyt.ctx, `hyt.scene.${scene}.description`)}>
            <ui.Switch
              label={text(hyt.ctx, `hyt.scene.${scene}`)}
              hideLabel
              checked={profile()?.scenes.includes(scene) === true}
              onChange={(checked) => void hyt.patch({ scenes: toggleScene(profile()?.scenes ?? [], scene, checked) })}
            />
          </ui.SettingsRow>
        )}
      </For>

      <ui.SettingsRow
        title={text(hyt.ctx, "hyt.capability.digest")}
        description={text(hyt.ctx, "hyt.capability.digest.description")}
      >
        <ui.Switch
          label={text(hyt.ctx, "hyt.capability.digest")}
          hideLabel
          checked={profile()?.capabilities.digest.enabled === true}
          onChange={(enabled) => void hyt.patch({ capabilities: { digest: { enabled } } })}
        />
      </ui.SettingsRow>

      <CapabilityRow
        hyt={hyt}
        title={text(hyt.ctx, "hyt.capability.tasks")}
        description={text(hyt.ctx, "hyt.capability.tasks.description")}
        checked={profile()?.capabilities.tasks.enabled === true}
        onChange={(enabled) => void hyt.patch({ capabilities: { tasks: { enabled } } })}
      />
      <CapabilityRow
        hyt={hyt}
        title={text(hyt.ctx, "hyt.capability.reminders")}
        description={text(hyt.ctx, "hyt.capability.reminders.description")}
        checked={profile()?.capabilities.reminders.enabled === true}
        onChange={(enabled) => void hyt.patch({ capabilities: { reminders: { enabled } } })}
      />
      <CapabilityRow
        hyt={hyt}
        title={text(hyt.ctx, "hyt.capability.knowledge")}
        description={text(hyt.ctx, "hyt.capability.knowledge.description")}
        checked={profile()?.capabilities.knowledge.enabled === true}
        onChange={(enabled) => void hyt.patch({ capabilities: { knowledge: { enabled } } })}
      />
      <CapabilityRow
        hyt={hyt}
        title={text(hyt.ctx, "hyt.capability.drafts")}
        description={text(hyt.ctx, "hyt.capability.drafts.description")}
        checked={profile()?.capabilities.drafts.enabled === true}
        onChange={(enabled) => void hyt.patch({ capabilities: { drafts: { enabled } } })}
      />
      <CapabilityRow
        hyt={hyt}
        title={text(hyt.ctx, "hyt.capability.style")}
        description={text(hyt.ctx, "hyt.capability.style.description")}
        checked={profile()?.capabilities.style.enabled === true}
        onChange={(enabled) => void hyt.patch({ capabilities: { style: { enabled } } })}
      />

      <ui.SettingsRow
        id="hyt-autopilot"
        title={text(hyt.ctx, "hyt.capability.autopilot")}
        description={text(hyt.ctx, "hyt.capability.autopilot.description")}
      >
        <ui.Switch
          label={text(hyt.ctx, "hyt.capability.autopilot")}
          hideLabel
          checked={profile()?.capabilities.autopilot.enabled === true}
          onChange={(enabled) => void hyt.patch({ capabilities: { autopilot: { enabled } } })}
        />
      </ui.SettingsRow>

      <ui.SettingsRow title={text(hyt.ctx, "hyt.autopilot.scope")} description={text(hyt.ctx, "hyt.autopilot.scope.description")}>
        <ui.Select
          label={text(hyt.ctx, "hyt.autopilot.scope")}
          value={scope()}
          options={SCOPES.map((value) => ({ value, label: text(hyt.ctx, `hyt.autopilot.${value}`) }))}
          onChange={(value) =>
            void hyt.patch({ capabilities: { autopilot: { scope: value, enabled: value !== "off" } } })
          }
        />
      </ui.SettingsRow>

      <Show when={(profile()?.capabilities.autopilot.enabled ?? false) && scope() !== "off"}>
        <ui.SettingsRow title={text(hyt.ctx, "hyt.autopilot.whitelist.title")} description={text(hyt.ctx, "hyt.autopilot.whitelist.description")}>
          <div style={{ display: "flex", "align-items": "center", gap: "calc(var(--spacing) * 2)" }}>
            <ui.TextInput
              label={text(hyt.ctx, "hyt.autopilot.whitelist.search")}
              placeholder={text(hyt.ctx, "hyt.autopilot.whitelist.search")}
              value={peopleQuery()}
              onInput={setPeopleQuery}
              onSubmit={() => void search()}
            />
            <ui.Button size="small" busy={searching()} onClick={() => void search()}>
              {text(hyt.ctx, "hyt.autopilot.whitelist.search")}
            </ui.Button>
          </div>
        </ui.SettingsRow>

        <Show when={people().length > 0}>
          <For each={people()}>
            {(person) => (
              <ui.SettingsRow
                title={person.name}
                description={[person.account, person.department, person.remark].filter(Boolean).join(" · ")}
              >
                <ui.Button
                  size="small"
                  variant="ghost"
                  disabled={whitelist().includes(person.account)}
                  onClick={() => addPerson(person.account)}
                >
                  {text(hyt.ctx, "hyt.autopilot.whitelist.add")}
                </ui.Button>
              </ui.SettingsRow>
            )}
          </For>
        </Show>

        <Show
          when={whitelist().length > 0}
          fallback={<ui.SettingsRow title={text(hyt.ctx, "hyt.autopilot.whitelist.empty")} />}
        >
          <For each={whitelist()}>
            {(account) => (
              <ui.SettingsRow title={account}>
                <ui.Button size="small" variant="ghost-muted" onClick={() => removePerson(account)}>
                  {text(hyt.ctx, "hyt.autopilot.whitelist.remove")}
                </ui.Button>
              </ui.SettingsRow>
            )}
          </For>
        </Show>
      </Show>
    </ui.SettingsSection>
  )
}

function CostSection(props: { hyt: Hyt }) {
  const hyt = props.hyt
  const ui = hyt.ctx.ui
  const profile = () => snapshotOf(hyt)?.profile
  const [interval, setInterval] = createSignal<string | undefined>()
  const [batch, setBatch] = createSignal<string | undefined>()
  const [model, setModel] = createSignal<string | undefined>()
  const intervalValue = () => profile()?.cost.analysisIntervalMinutes ?? 30
  const batchValue = () => profile()?.cost.batchSize ?? 50
  const runs = () => Math.max(1, Math.round((24 * 60) / intervalValue()))
  const total = () => runs() * batchValue()

  return (
    <ui.SettingsSection title={text(hyt.ctx, "hyt.section.cost")}>
      <ui.SettingsRow id="hyt-cost" title={text(hyt.ctx, "hyt.cost.interval")} description={text(hyt.ctx, "hyt.cost.interval.description")}>
        <ui.TextInput
          label={text(hyt.ctx, "hyt.cost.interval")}
          value={interval() ?? String(intervalValue())}
          onInput={setInterval}
          onSubmit={(value) => {
            setInterval(undefined)
            const parsed = Number.parseInt(value, 10)
            if (Number.isFinite(parsed)) void hyt.patch({ cost: { analysisIntervalMinutes: clamp(parsed, 1, 1440) } })
          }}
        />
      </ui.SettingsRow>

      <ui.SettingsRow title={text(hyt.ctx, "hyt.cost.batch")} description={text(hyt.ctx, "hyt.cost.batch.description")}>
        <ui.TextInput
          label={text(hyt.ctx, "hyt.cost.batch")}
          value={batch() ?? String(batchValue())}
          onInput={setBatch}
          onSubmit={(value) => {
            setBatch(undefined)
            const parsed = Number.parseInt(value, 10)
            if (Number.isFinite(parsed)) void hyt.patch({ cost: { batchSize: clamp(parsed, 5, 500) } })
          }}
        />
      </ui.SettingsRow>

      <ui.SettingsRow title={text(hyt.ctx, "hyt.cost.model")} description={text(hyt.ctx, "hyt.cost.model.description")}>
        <ui.TextInput
          label={text(hyt.ctx, "hyt.cost.model")}
          placeholder={text(hyt.ctx, "hyt.cost.model.placeholder")}
          value={model() ?? profile()?.cost.model ?? ""}
          onInput={setModel}
          onSubmit={(value) => {
            setModel(undefined)
            void hyt.patch({ cost: { model: value.trim() } })
          }}
        />
      </ui.SettingsRow>

      <ui.SettingsRow
        title={text(hyt.ctx, "hyt.cost.estimate")}
        description={text(hyt.ctx, "hyt.cost.estimate.description", { runs: runs(), batch: batchValue(), total: total() })}
      />

      <ui.SettingsRow
        title={text(hyt.ctx, "hyt.cost.model.usage")}
        description={text(hyt.ctx, "hyt.cost.model.usage.description")}
      />
    </ui.SettingsSection>
  )
}

function KnowledgeSection(props: { hyt: Hyt }) {
  const hyt = props.hyt
  const ui = hyt.ctx.ui
  const profile = () => snapshotOf(hyt)?.profile
  const paths = () => profile()?.knowledge.paths ?? []
  const tools = () => profile()?.knowledge.mcpTools ?? []
  const knowledge = () => snapshotOf(hyt)?.knowledge

  const addPath = async () => {
    const picked = (await hyt.ctx.desktop?.pick({ directory: true, title: text(hyt.ctx, "hyt.knowledge.paths.add") }))?.[0]
    const value = picked?.trim() ?? ""
    if (value.length === 0 || paths().includes(value)) return
    void hyt.patch({ knowledge: { paths: [...paths(), value] } })
  }

  const addTool = async () => {
    const value = (
      await hyt.ctx.dialogs.prompt({
        title: text(hyt.ctx, "hyt.knowledge.mcp.add"),
        placeholder: text(hyt.ctx, "hyt.knowledge.mcp.placeholder"),
      })
    )?.trim()
    if (value === undefined || value.length === 0 || tools().includes(value)) return
    void hyt.patch({ knowledge: { mcpTools: [...tools(), value] } })
  }

  return (
    <ui.SettingsSection title={text(hyt.ctx, "hyt.section.knowledge")}>
      <ui.SettingsRow id="hyt-knowledge" title={text(hyt.ctx, "hyt.knowledge.builtin")} description={text(hyt.ctx, "hyt.knowledge.builtin.description")}>
        <ui.Switch
          label={text(hyt.ctx, "hyt.knowledge.builtin")}
          hideLabel
          checked={profile()?.knowledge.builtin === true}
          onChange={(builtin) => void hyt.patch({ knowledge: { builtin } })}
        />
      </ui.SettingsRow>

      <ui.SettingsRow
        title={text(hyt.ctx, "hyt.knowledge.paths")}
        description={text(hyt.ctx, "hyt.knowledge.paths.description")}
      >
        <ui.Button size="small" onClick={() => void addPath()}>
          {text(hyt.ctx, "hyt.knowledge.paths.add")}
        </ui.Button>
      </ui.SettingsRow>

      <Show when={paths().length === 0}>
        <ui.SettingsRow title={text(hyt.ctx, "hyt.knowledge.paths.empty")} />
      </Show>

      <For each={paths()}>
        {(path) => (
          <ui.SettingsRow title={path}>
            <ui.Button
              size="small"
              variant="ghost-muted"
              onClick={() => void hyt.patch({ knowledge: { paths: paths().filter((item) => item !== path) } })}
            >
              {text(hyt.ctx, "hyt.knowledge.remove")}
            </ui.Button>
          </ui.SettingsRow>
        )}
      </For>

      <ui.SettingsRow title={text(hyt.ctx, "hyt.knowledge.mcp")} description={text(hyt.ctx, "hyt.knowledge.mcp.description")}>
        <ui.Button size="small" onClick={() => void addTool()}>
          {text(hyt.ctx, "hyt.knowledge.mcp.add")}
        </ui.Button>
      </ui.SettingsRow>

      <Show when={tools().length === 0}>
        <ui.SettingsRow title={text(hyt.ctx, "hyt.knowledge.mcp.empty")} />
      </Show>

      <For each={tools()}>
        {(tool) => (
          <ui.SettingsRow title={tool}>
            <ui.Button
              size="small"
              variant="ghost-muted"
              onClick={() => void hyt.patch({ knowledge: { mcpTools: tools().filter((item) => item !== tool) } })}
            >
              {text(hyt.ctx, "hyt.knowledge.remove")}
            </ui.Button>
          </ui.SettingsRow>
        )}
      </For>

      <ui.SettingsRow
        title={text(hyt.ctx, "hyt.knowledge.count")}
        description={
          (knowledge()?.entries ?? 0) === 0
            ? text(hyt.ctx, "hyt.knowledge.count.none")
            : text(hyt.ctx, "hyt.knowledge.count.description", { time: formatTime(hyt, knowledge()?.updatedAt ?? "") })
        }
      >
        <span class="hyt-inline-note">{knowledge()?.entries ?? 0}</span>
      </ui.SettingsRow>
    </ui.SettingsSection>
  )
}

function StyleSection(props: { hyt: Hyt }) {
  const hyt = props.hyt
  const ui = hyt.ctx.ui
  const style = () => snapshotOf(hyt)?.style
  const summary = () => style()?.summary ?? ""
  const [refreshed, setRefreshed] = createSignal(false)

  return (
    <ui.SettingsSection title={text(hyt.ctx, "hyt.section.style")}>
      <ui.SettingsRow
        id="hyt-style"
        title={text(hyt.ctx, "hyt.style.summary")}
        description={
          <div class="hyt-summary">
            <span>{summary().length > 0 ? summary() : text(hyt.ctx, "hyt.style.empty")}</span>
            <Show when={refreshed()}>
              <span class="hyt-inline-note">{text(hyt.ctx, "hyt.style.refreshed")}</span>
            </Show>
          </div>
        }
      >
        <ui.Button
          size="small"
          busy={hyt.busy() === "restyle"}
          onClick={() => {
            setRefreshed(false)
            void hyt.run("restyle", () => hyt.client.restyle()).then((result) => {
              if (result !== undefined) setRefreshed(true)
            })
          }}
        >
          {text(hyt.ctx, "hyt.style.refresh")}
        </ui.Button>
      </ui.SettingsRow>

      <ui.SettingsRow
        title={text(hyt.ctx, "hyt.style.updated")}
        description={text(hyt.ctx, "hyt.style.summary.description")}
      >
        <span class="hyt-inline-note">{formatTime(hyt, style()?.updatedAt ?? "")}</span>
      </ui.SettingsRow>
    </ui.SettingsSection>
  )
}

function PrivacySection(props: { hyt: Hyt }) {
  const hyt = props.hyt
  const ui = hyt.ctx.ui

  const clear = async () => {
    const confirmed = await hyt.ctx.dialogs.confirm({
      title: text(hyt.ctx, "hyt.privacy.clear"),
      description: text(hyt.ctx, "hyt.privacy.clear.confirm"),
      confirm: text(hyt.ctx, "hyt.privacy.clear"),
      cancel: text(hyt.ctx, "hyt.privacy.clear.cancel"),
      danger: true,
    })
    if (!confirmed) return
    await hyt.run("clear", () => hyt.client.clearLearning())
  }

  return (
    <ui.SettingsSection title={text(hyt.ctx, "hyt.section.privacy")}>
      <ui.SettingsRow id="hyt-privacy" title={text(hyt.ctx, "hyt.privacy.dataDir")} description={text(hyt.ctx, "hyt.privacy.dataDir.description")}>
        <div style={{ display: "flex", "align-items": "center", gap: "calc(var(--spacing) * 2)" }}>
          <span class="hyt-inline-note">{snapshotOf(hyt)?.dataDir ?? ""}</span>
          <ui.Button
            size="small"
            variant="ghost"
            disabled={(snapshotOf(hyt)?.dataDir ?? "").length === 0}
            onClick={() => {
              const path = snapshotOf(hyt)?.dataDir ?? ""
              if (path.length > 0) void hyt.ctx.desktop?.reveal(path)
            }}
          >
            {text(hyt.ctx, "hyt.privacy.open")}
          </ui.Button>
        </div>
      </ui.SettingsRow>

      <ui.SettingsRow title={text(hyt.ctx, "hyt.privacy.password")} description={text(hyt.ctx, "hyt.privacy.password.description")} />

      <ui.SettingsRow title={text(hyt.ctx, "hyt.privacy.clear")} description={text(hyt.ctx, "hyt.privacy.clear.description")}>
        <ui.Button variant="danger" size="small" busy={hyt.busy() === "clear"} onClick={() => void clear()}>
          {text(hyt.ctx, "hyt.privacy.clear")}
        </ui.Button>
      </ui.SettingsRow>
    </ui.SettingsSection>
  )
}

function toggleScene(scenes: readonly Scene[], scene: Scene, checked: boolean): Scene[] {
  return checked ? (scenes.includes(scene) ? [...scenes] : [...scenes, scene]) : scenes.filter((item) => item !== scene)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function formatTime(hyt: Hyt, value: string) {
  if (value.length === 0) return text(hyt.ctx, "hyt.common.none")
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(hyt.ctx.locale.locale(), { dateStyle: "medium", timeStyle: "short" }).format(date)
}

