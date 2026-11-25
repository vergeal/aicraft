import { createEffect, createSignal, Show } from "solid-js"
import { Command, MainSurface, Plugin, SettingsPage, Style } from "@aicraft/aix/gui"
import { uuid } from "@aicraft/util/uuid"
import { ItsmContract } from "../src/contract.js"
import type { Account, AnswerValue, Run, ServiceCatalog, Settings, Snapshot, Template } from "../src/contract.js"
import { ItsmBrowser } from "../src/ipc.js"
import { definition } from "./definition.js"
import { AccountSettings } from "./settings.js"
import styles from "./ui.css" with { type: "text" }
import { Workbench } from "./workbench.js"

/** 一级导航的路由；命令与设置页都跳到这一页。 */
const route = (id: string) => `/plugins/${id}/new`

/**
 * 窗口侧：把工作台挂到一级导航，并给命令与设置页提供同一份数据。
 * 数据只走插件服务的 Rpc；内嵌浏览器走 main 进程的 Ipc。
 */
export const setup: Plugin.Setup<typeof definition> = (ctx) => {
  if (!ctx.desktop) return

  /** 本机服务端带着插件和它的存储；远端服务端有自己的数据。 */
  const server = () =>
    ctx.servers
      .list()
      .map((id) => ctx.servers.get(id))
      .find((item) => item?.builtin || item?.local)
  const rpc = () => server()?.client.rpc(ItsmContract.Definition)
  const browser = () => ctx.main(ItsmBrowser)

  const [snapshot, setSnapshot] = createSignal<Snapshot | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [failed, setFailed] = createSignal(false)

  let generation = 0
  const refresh = async () => {
    const client = rpc()
    if (!client) {
      setLoading(false)
      return
    }
    const ticket = ++generation
    setLoading(true)
    setFailed(false)
    try {
      const next = await client.snapshot({})
      if (ticket !== generation) return
      setSnapshot(next)
    } catch {
      if (ticket !== generation) return
      setFailed(true)
      setSnapshot(null)
    } finally {
      if (ticket === generation) setLoading(false)
    }
  }

  createEffect(() => {
    server()?.id
    void refresh()
  })

  const now = () => new Date().toISOString()

  const requireRpc = () => {
    const client = rpc()
    if (!client) throw new Error(ctx.t("settings.failed"))
    return client
  }

  const addAccount = async (label: string) => {
    const client = requireRpc()
    const id = `acc_${uuid()}`
    const account: Account = {
      id,
      label,
      profileDir: `persist:itsm-${id}`,
      chromeProfile: "",
      createdAt: now(),
      lastUsedAt: now(),
    }
    const saved = await client.saveAccount(account)
    await refresh()
    return saved.account
  }

  const removeAccount = async (account: Account) => {
    await requireRpc().removeAccount({ id: account.id })
    await refresh()
  }

  const importCookies = async (account: Account) => {
    const result = await browser().importCookies(
      {
        accountId: account.id,
        partition: account.profileDir,
        ...(account.chromeProfile.length > 0 ? { chromeProfile: account.chromeProfile } : {}),
      },
      { signal: ctx.signal },
    )
    if (!result.ok) throw new Error(result.reason ?? ctx.t("settings.account.import.failed"))
    const profile =
      account.chromeProfile.length > 0 && result.profiles.includes(account.chromeProfile)
        ? account.chromeProfile
        : result.profiles[0]
    if (profile) {
      await requireRpc().saveAccount({ ...account, chromeProfile: profile, lastUsedAt: now() })
      await refresh()
    }
    return ctx.t("settings.account.import.ok", { count: result.imported })
  }

  const saveSettings = async (settings: Settings) => {
    await requireRpc().saveSettings(settings)
    await refresh()
  }

  const saveTemplate = async (template: Template) => {
    await requireRpc().saveTemplate(template)
    await refresh()
  }

  const removeTemplate = async (template: Template) => {
    await requireRpc().removeTemplate({ id: template.id })
    await refresh()
  }

  const saveCatalog = async (catalog: ServiceCatalog) => {
    await requireRpc().saveCatalog(catalog)
    await refresh()
  }

  /** 发版起草走服务端的一次性生成；模型只提供草稿，三项都回到向导里由用户核对。 */
  const generateRelease = async (input: {
    readonly change: string
    readonly context: Readonly<Record<string, string>>
  }) => {
    const client = server()?.client
    if (!client) throw new Error(ctx.t("release.ai.failed"))
    const generated = await client.experimental.generate.text(
      { prompt: releasePrompt(input.change, input.context) },
      { signal: ctx.signal },
    )
    return parseReleaseDraft(generated.text)
  }

  const saveAnswers = async (
    templateId: string,
    accountId: string,
    values: Readonly<Record<string, AnswerValue>>,
  ) => {
    await requireRpc().saveAnswers({ templateId, accountId, values, updatedAt: now() })
    await refresh()
  }

  const recordRun = async (run: Run) => {
    await requireRpc().recordRun(run)
    await refresh()
  }

  const clearHistory = async () => {
    await requireRpc().clearHistory({})
    await refresh()
  }

  const openWorkbench = () => {
    window.history.pushState({}, "", route(ctx.id))
    window.dispatchEvent(new PopStateEvent("popstate"))
  }

  const profileOf = (account: Account) =>
    account.chromeProfile.length > 0
      ? ctx.t("settings.profile", { profile: account.chromeProfile })
      : ctx.t("settings.profile.manual")

  const Page = () => (
    <Show
      when={snapshot()}
      fallback={
        <Show when={!loading() && failed()}>
          <ctx.ui.SettingsLayout title={ctx.t("settings.title")} description={ctx.t("settings.description")}>
            <ctx.ui.SettingsSection title={ctx.t("settings.failed")}>
              <ctx.ui.SettingsRow
                id="itsm-settings-failed"
                title={ctx.t("settings.failed")}
                description={ctx.t("settings.failed.hint")}
              >
                <ctx.ui.Button variant="neutral" icon="refresh" onClick={() => void refresh()}>
                  {ctx.t("common.retry")}
                </ctx.ui.Button>
              </ctx.ui.SettingsRow>
            </ctx.ui.SettingsSection>
          </ctx.ui.SettingsLayout>
        </Show>
      }
    >
      {(value) => (
        <AccountSettings
          accounts={value().accounts}
          settings={value().settings}
          profileOf={profileOf}
          onAddAccount={async (label) => {
            await addAccount(label)
          }}
          onRemoveAccount={async (account) => {
            await removeAccount(account)
          }}
          onImport={async (account) => {
            ctx.toast.show({ title: await importCookies(account), variant: "success" })
          }}
          onSaveSettings={saveSettings}
          onOpenWorkbench={openWorkbench}
        />
      )}
    </Show>
  )

  ctx.add(Style, styles)

  ctx.add(MainSurface, {
    id: "new",
    icon: "file-document",
    get title() {
      return ctx.t("nav.new")
    },
    render: () => (
      <Workbench
        snapshot={snapshot}
        loading={loading}
        failed={failed}
        client={browser()}
        onRefresh={refresh}
        openSettings={() => ctx.layout.settings("itsm")}
        saveAnswers={saveAnswers}
        recordRun={recordRun}
        saveTemplate={saveTemplate}
        removeTemplate={removeTemplate}
        clearHistory={clearHistory}
        saveCatalog={saveCatalog}
        generateRelease={generateRelease}
        addAccount={addAccount}
        removeAccount={removeAccount}
        importCookies={importCookies}
        saveSettings={saveSettings}
      />
    ),
  })

  ctx.add(Command, {
    id: "new",
    keywords: "itsm ticket 工单 长虹 堡垒机 发版",
    get title() {
      return ctx.t("nav.new")
    },
    get description() {
      return ctx.t("subtitle")
    },
    run: openWorkbench,
  })

  ctx.add(SettingsPage, {
    id: "itsm",
    icon: "file-document",
    get title() {
      return ctx.t("settings.title")
    },
    get entries() {
      return [
        {
          id: "itsm",
          title: ctx.t("settings.title"),
          description: ctx.t("settings.description"),
          keywords: "itsm ticket 工单 堡垒机 发版 账号",
        },
        { id: "itsm-account-add", title: ctx.t("settings.account.add"), description: ctx.t("settings.accounts.hint") },
        { id: "itsm-portal", title: ctx.t("settings.portal"), description: ctx.t("settings.portal.hint") },
        {
          id: "itsm-ask-defaults",
          title: ctx.t("settings.answers.ask"),
          description: ctx.t("settings.answers.ask.hint"),
        },
      ]
    },
    render: () => <Page />,
  })
}

/** 一次发版起草的提示词：只取用户给的变更说明与当前答案，要求模型返回可直接回填的 JSON。 */
function releasePrompt(change: string, context: Readonly<Record<string, string>>) {
  return [
    "你是企业 IT 运维的发版助手。根据下面的变更信息，只输出一个 JSON 对象，",
    "恰好包含 title、plan、rollback 三个字符串字段：",
    "title 是一句话的发版标题；plan 是可分步执行的发布方案；rollback 是可分步执行的回退方案。",
    "不要输出 Markdown 代码栏或任何解释。",
    `变更说明：${change}`,
    ...Object.entries(context).map(([label, value]) => `${label}：${value}`),
  ].join("\n")
}

/**
 * 模型的输出不完全可信：可能带代码栏、前后说明，或字段缺失。只取第一个 JSON 对象，缺的字段回填空串，
 * 解析失败也回填空串，让向导照常显示三项可编辑的输入框。
 */
function parseReleaseDraft(text: string) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1] ?? text
  const start = fenced.indexOf("{")
  const end = fenced.lastIndexOf("}")
  if (start < 0 || end <= start) return { title: "", plan: "", rollback: "" }
  try {
    const parsed: unknown = JSON.parse(fenced.slice(start, end + 1))
    const field = (key: string) =>
      typeof parsed === "object" && parsed !== null && key in parsed && typeof parsed[key as keyof typeof parsed] === "string"
        ? (parsed[key as keyof typeof parsed] as string)
        : ""
    return { title: field("title"), plan: field("plan"), rollback: field("rollback") }
  } catch {
    return { title: "", plan: "", rollback: "" }
  }
}
