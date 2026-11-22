import { createSignal, For, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import type { IpcClient } from "@opencode/plugin/gui/main"
import { uuid } from "@opencode/util/uuid"
import type {
  Account,
  AnswerValue,
  Run,
  ServiceCatalog,
  ServiceItem,
  Settings,
  Snapshot,
  Template,
} from "../src/contract.js"
import type { ItsmBrowser } from "../src/ipc.js"
import { builtinKeyFor, inferEnvironment, matchesService } from "../src/logic.js"
import type { Definition } from "./definition.js"
import { Execute } from "./execute.js"
import { History } from "./history.js"
import { AccountSettings } from "./settings.js"
import { Templates } from "./templates.js"
import { Wizard } from "./wizard.js"

type View =
  | { readonly kind: "services" }
  | { readonly kind: "wizard"; readonly template: Template }
  | { readonly kind: "run"; readonly template: Template; readonly values: Readonly<Record<string, AnswerValue>> }
  | { readonly kind: "history" }
  | { readonly kind: "templates" }
  | { readonly kind: "settings" }

export interface WorkbenchProps {
  readonly snapshot: () => Snapshot | null
  readonly loading: () => boolean
  readonly failed: () => boolean
  readonly client: IpcClient<(typeof ItsmBrowser)["spec"]>
  readonly onRefresh: () => Promise<void>
  readonly openSettings: () => void
  readonly saveAnswers: (templateId: string, accountId: string, values: Readonly<Record<string, AnswerValue>>) => Promise<void>
  readonly recordRun: (run: Run) => Promise<void>
  readonly saveTemplate: (template: Template) => Promise<void>
  readonly removeTemplate: (template: Template) => Promise<void>
  readonly clearHistory: () => Promise<void>
  readonly addAccount: (label: string) => Promise<Account>
  readonly removeAccount: (account: Account) => Promise<void>
  readonly importCookies: (account: Account) => Promise<string>
  readonly saveSettings: (settings: Settings) => Promise<void>
  readonly saveCatalog: (catalog: ServiceCatalog) => Promise<void>
  readonly generateRelease: (input: {
    readonly change: string
    readonly context: Readonly<Record<string, string>>
  }) => Promise<{ readonly title: string; readonly plan: string; readonly rollback: string }>
}

/** 工作台：左侧是服务项与入口，右侧是向导、执行、历史、模板与设置。 */
export function Workbench(props: WorkbenchProps) {
  const ctx = usePlugin<Definition>()
  const [view, setView] = createSignal<View>({ kind: "services" })
  const [accountId, setAccountId] = createSignal<string | null>(null)
  const [query, setQuery] = createSignal("")
  const [importing, setImporting] = createSignal<string | null>(null)
  const [syncing, setSyncing] = createSignal(false)

  const templates = () => props.snapshot()?.templates ?? []
  const accounts = () => props.snapshot()?.accounts ?? []
  const runs = () => props.snapshot()?.runs ?? []
  const settings = () => props.snapshot()?.settings ?? { askSaveDefaults: true, portalUrl: "" }

  const visibleTemplates = () =>
    templates().filter((template) =>
      matchesService(
        { name: template.name, category: template.env, description: template.serviceKey },
        query(),
      ),
    )

  const currentAccount = () => accounts().find((account) => account.id === accountId()) ?? accounts()[0] ?? null

  const rememberedFor = (template: Template) => {
    const answers = props.snapshot()?.answers.find((entry) => entry.templateId === template.id)
    return answers?.values ?? {}
  }

  const startWizard = (template: Template) => setView({ kind: "wizard", template })

  const begin = async (template: Template, values: Readonly<Record<string, AnswerValue>>, save: boolean) => {
    const account = currentAccount()
    if (save && account) await props.saveAnswers(template.id, account.id, values)
    setView({ kind: "run", template, values })
  }

  const stopAsking = () => {
    void props.saveSettings({ ...settings(), askSaveDefaults: false })
  }

  const clearHistory = async () => {
    const confirmed = await ctx.dialogs.confirm({
      title: ctx.t("history.clear.title"),
      description: ctx.t("history.clear.hint"),
      confirm: ctx.t("history.clear"),
      cancel: ctx.t("common.cancel"),
      danger: true,
    })
    if (!confirmed) return
    try {
      await props.clearHistory()
      ctx.toast.show({ title: ctx.t("history.clear"), variant: "success" })
    } catch (cause) {
      failure(cause)
    }
  }

  const removeTemplate = async (template: Template) => {
    const confirmed = await ctx.dialogs.confirm({
      title: ctx.t("templates.delete.title"),
      description: ctx.t("templates.delete.hint"),
      confirm: ctx.t("templates.delete"),
      cancel: ctx.t("common.cancel"),
      danger: true,
    })
    if (!confirmed) return
    await props.removeTemplate(template)
    ctx.toast.show({ title: ctx.t("templates.saved"), variant: "success" })
  }

  const createTemplate = (): Template => ({
    id: `tpl_${uuid()}`,
    serviceKey: "",
    name: ctx.t("templates.new"),
    env: "unknown",
    source: "manual",
    pages: 1,
    boundary: "stop-before-submit",
    questions: [{ id: `q_${uuid().slice(0, 8)}`, label: ctx.t("title"), type: "text", required: true }],
    steps: [
      { id: "navigate", name: ctx.t("run.start"), kind: "navigate" },
      { id: "search", name: ctx.t("nav.services"), kind: "search-service" },
      { id: "open", name: ctx.t("run.open"), kind: "open-service" },
      { id: "fill", name: ctx.t("templates.questions"), kind: "fill-fields" },
      { id: "stop", name: ctx.t("run.stop"), kind: "stop" },
    ],
  })

  const importCookies = async (account: Account) => {
    if (importing()) return
    setImporting(account.id)
    try {
      const message = await props.importCookies(account)
      ctx.toast.show({ title: message, variant: "success" })
    } catch (cause) {
      failure(cause)
    } finally {
      setImporting(null)
    }
  }

  const failure = (cause: unknown) =>
    ctx.toast.show({
      title: ctx.t("settings.failed"),
      description: cause instanceof Error ? cause.message : String(cause),
      variant: "error",
    })

  /** 登录后在门户里拉一次服务目录并缓存；页面读不到时给出登录提示，不猜页面结构。 */
  const syncCatalog = async () => {
    const account = currentAccount()
    if (!account) {
      ctx.toast.show({ title: ctx.t("account.none"), description: ctx.t("account.none.hint"), variant: "error" })
      return
    }
    if (syncing()) return
    setSyncing(true)
    try {
      const created = await props.client.ensure(
        { accountId: account.id, partition: account.profileDir },
        { signal: ctx.signal },
      )
      const url = settings().portalUrl.trim()
      if (url.length > 0)
        await props.client.navigate({ embed: created.embed, url, timeoutMs: 15_000 }, { signal: ctx.signal })
      const state = await props.client.loginState({ embed: created.embed }, { signal: ctx.signal })
      if (!state.loggedIn) {
        ctx.toast.show({
          title: ctx.t("catalog.login"),
          description: ctx.t("catalog.login.hint"),
          variant: "error",
        })
        return
      }
      const result = await props.client.catalog({ embed: created.embed, timeoutMs: 15_000 }, { signal: ctx.signal })
      if (result.items.length === 0) {
        ctx.toast.show({ title: ctx.t("catalog.empty"), variant: "error" })
        return
      }
      const items: ServiceItem[] = result.items.map((item) => {
        const template = templates().find((entry) => entry.serviceKey === item.name)
        const builtinKey = builtinKeyFor(item.name)
        return {
          id: item.name,
          name: item.name,
          category: item.category,
          description: item.description,
          env: inferEnvironment(item.name),
          ...(builtinKey === undefined ? {} : { builtinKey }),
          ...(template === undefined ? {} : { templateId: template.id }),
        }
      })
      await props.saveCatalog({ syncedAt: result.syncedAt, items })
      await props.onRefresh()
      ctx.toast.show({ title: ctx.t("catalog.synced", { count: String(items.length) }), variant: "success" })
    } catch (cause) {
      failure(cause)
    } finally {
      setSyncing(false)
    }
  }

  const profileOf = (account: Account) =>
    account.chromeProfile.length > 0
      ? ctx.t("settings.profile", { profile: account.chromeProfile })
      : ctx.t("settings.profile.manual")

  const wizardView = () => {
    const value = view()
    return value.kind === "wizard" ? value.template : null
  }
  const runView = () => {
    const value = view()
    return value.kind === "run" ? value : null
  }

  return (
    <div class="itsm-page" data-narrow={ctx.layout.narrow()}>
      <header class="itsm-topbar">
        <span class="itsm-topbar__title">{ctx.t("title")}</span>

        <div class="itsm-topbar__meta">
          <button
            type="button"
            class="itsm-account"
            title={ctx.t("nav.account.hint")}
            onClick={() => setView({ kind: "settings" })}
          >
            <span class="itsm-account__icon">
              <ctx.ui.Icon name="outline-cookie" size="small" />
            </span>
            <span class="itsm-account__label">{currentAccount()?.label ?? ctx.t("nav.noAccount")}</span>
          </button>
          <span class="itsm-topbar__sep" aria-hidden="true" />
          <ctx.ui.IconButton
            icon="outline-list-changelog"
            label={ctx.t("nav.library")}
            onClick={() => setView({ kind: "history" })}
          />
          <ctx.ui.IconButton
            icon="settings-gear"
            label={ctx.t("nav.settings")}
            onClick={() => setView({ kind: "settings" })}
          />
          <ctx.ui.IconButton
            icon="refresh"
            label={ctx.t("catalog.sync")}
            disabled={syncing()}
            onClick={() => void syncCatalog()}
          />
        </div>
      </header>

      <main class="itsm-main">
        <div class="itsm-main__inner">
          <Show when={!props.snapshot() && !props.loading() && props.failed()}>
            <div class="itsm-empty">
              <span class="itsm-empty__icon">
                <ctx.ui.Icon name="circle-exclamation" size="large" />
              </span>
              <p class="itsm-empty__title">{ctx.t("run.failed.title")}</p>
              <p class="itsm-empty__hint">{ctx.t("settings.failed")}</p>
              <ctx.ui.Button variant="neutral" icon="refresh" onClick={() => void props.onRefresh()}>
                {ctx.t("common.retry")}
              </ctx.ui.Button>
            </div>
          </Show>

          <Show when={props.snapshot() || props.loading()}>
            <Show
              when={view().kind === "wizard" && wizardView()}
              fallback={
                <Show
                  when={view().kind === "run" && runView()}
                  fallback={
                    <Show
                      when={view().kind === "history"}
                      fallback={
                        <Show
                          when={view().kind === "templates"}
                          fallback={
                            <Show
                              when={view().kind === "settings"}
                              fallback={
                                <Home
                                  templates={visibleTemplates()}
                                  query={query()}
                                  onQuery={setQuery}
                                  onPick={startWizard}
                                />
                              }
                            >
                              <AccountSettings
                                accounts={accounts()}
                                settings={settings()}
                                profileOf={profileOf}
                                onAddAccount={async (label) => {
                                  const account = await props.addAccount(label)
                                  setAccountId(account.id)
                                  await props.onRefresh()
                                }}
                                onRemoveAccount={async (account) => {
                                  await props.removeAccount(account)
                                  if (accountId() === account.id) setAccountId(null)
                                  await props.onRefresh()
                                }}
                                onImport={async (account) => {
                                  await importCookies(account)
                                }}
                                onSaveSettings={async (next) => {
                                  await props.saveSettings(next)
                                  await props.onRefresh()
                                }}
                                onOpenWorkbench={() => setView({ kind: "services" })}
                                onOpenTemplates={() => setView({ kind: "templates" })}
                              />
                            </Show>
                          }
                        >
                          <Templates
                            templates={templates()}
                            onCreate={createTemplate}
                            onSave={async (template) => {
                              await props.saveTemplate(template)
                              await props.onRefresh()
                            }}
                            onDelete={removeTemplate}
                            onBack={() => setView({ kind: "settings" })}
                          />
                        </Show>
                      }
                    >
                      <History
                        runs={runs()}
                        templates={templates()}
                        onClear={() => void clearHistory()}
                        onBack={() => setView({ kind: "services" })}
                      />
                    </Show>
                  }
                >
                  {(run) => (
                    <Execute
                      template={run().template}
                      values={run().values}
                      account={currentAccount()}
                      portalUrl={settings().portalUrl}
                      client={props.client}
                      onRecord={async (record) => {
                        await props.recordRun(record)
                        await props.onRefresh()
                      }}
                      onOpenSettings={() => setView({ kind: "settings" })}
                    />
                  )}
                </Show>
              }
            >
              {(template) => (
                <Wizard
                  template={template()}
                  remembered={rememberedFor(template())}
                  askSaveDefaults={settings().askSaveDefaults}
                  onStart={(values, save) => void begin(template(), values, save)}
                  onStopAsking={stopAsking}
                  onCancel={() => setView({ kind: "services" })}
                  generateRelease={props.generateRelease}
                />
              )}
            </Show>
          </Show>
        </div>
      </main>
    </div>
  )
}

interface HomeProps {
  readonly templates: readonly Template[]
  readonly query: string
  readonly onQuery: (value: string) => void
  readonly onPick: (template: Template) => void
}

function Home(props: HomeProps) {
  const ctx = usePlugin<Definition>()
  const envLabel = (template: Template) =>
    template.env === "prod" ? ctx.t("env.prod") : template.env === "test" ? ctx.t("env.test") : ctx.t("env.unknown")

  return (
    <div class="itsm-home">
      <header class="itsm-head">
        <div class="itsm-head__text">
          <p class="itsm-head__description">{ctx.t("subtitle")}</p>
        </div>
        <div class="itsm-head__meta">
          <input
            class="itsm-search"
            type="search"
            value={props.query}
            placeholder={ctx.t("search")}
            aria-label={ctx.t("search")}
            onInput={(event) => props.onQuery(event.currentTarget.value)}
          />
        </div>
      </header>

      <Show
        when={props.templates.length > 0}
        fallback={
          <div class="itsm-empty">
            <span class="itsm-empty__icon">
              <ctx.ui.Icon name="file-document" />
            </span>
            <p class="itsm-empty__title">{ctx.t("empty.title")}</p>
            <p class="itsm-empty__hint">{ctx.t("empty.hint")}</p>
          </div>
        }
      >
        <section class="itsm-group">
          <header class="itsm-group__head">
            <span>{ctx.t("nav.services")}</span>
            <span class="itsm-group__count">{props.templates.length}</span>
            <span class="itsm-group__rule" aria-hidden="true" />
          </header>
          <div class="itsm-services">
            <For each={props.templates}>
              {(template) => (
                <button type="button" class="itsm-service" onClick={() => props.onPick(template)}>
                  <span class="itsm-service__head">
                    <span class="itsm-service__name">{template.name}</span>
                    <span class="itsm-tag">{envLabel(template)}</span>
                  </span>
                  <span class="itsm-service__meta">
                    {ctx.plural("pages", template.pages)} · {template.questions.length} {ctx.t("templates.questions")}
                  </span>
                </button>
              )}
            </For>
          </div>
        </section>
      </Show>
    </div>
  )
}
