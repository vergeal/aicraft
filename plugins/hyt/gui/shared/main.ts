import type { IpcProvider } from "@aicraft/plugin/gui"
import type { MainContext } from "@aicraft/plugin/gui/main"
import { Schema } from "effect"
import { mergeProfile } from "../../src/profile/merge.js"
import type { ProfilePatch } from "../../src/profile/merge.js"
import { defaultProfile } from "../../src/profile/schema.js"
import type { HytProfile } from "../../src/profile/schema.js"
import { describeProfile } from "../../src/style/profile.js"
import { HytIpc } from "./contract.js"
import type { HytState } from "./contract.js"
import * as Data from "./data.js"

type Snapshot = HytState

export interface HytIpcOptions {
  /** 宿主若能把 plugin data 路径交给 GUI 主进程，从这里传；否则按默认规则推导。 */
  readonly dataDir?: string
}

/**
 * 主进程侧的唯一读盘入口。
 *
 * 窗口通过 `ctx.main(HytIpc)` 订阅 state，写操作调用方法；每次写入后由这里 `changed()` 推送，
 * 因此设置页与引导不需要重启插件就能看到结果。
 */
export function provideHytIpc(ctx: MainContext, options: HytIpcOptions = {}): IpcProvider<typeof HytIpc.spec> {
  const dataDir = Data.resolveDataDir(options.dataDir)
  const settings = ctx.storage.store("gui", {
    schema: Schema.Struct({ chfileRoot: Schema.String, bridgePath: Schema.String }),
    initial: { chfileRoot: "", bridgePath: "" },
  })

  let current: Snapshot = {
    dataDir,
    profile: null,
    chfileRoot: "",
    bridgePath: "",
    account: null,
    department: "",
    logins: [],
    bridge: Data.stoppedBridge(),
    knowledge: { entries: 0, updatedAt: "" },
    style: { summary: "", updatedAt: "" },
  }
  let runtime: { readonly root: string; readonly bridge: ReturnType<typeof Data.createBridge> } | undefined
  let provider: IpcProvider<typeof HytIpc.spec> | undefined

  const report = () => provider?.changed()

  const bridgeFor = (root: string) => {
    if (runtime?.root === root) return runtime.bridge
    runtime?.bridge.dispose()
    runtime = { root, bridge: Data.createBridge(root) }
    return runtime.bridge
  }

  /** 读一遍全部本地状态；这是唯一会读盘的地方，其余方法都从它拿结果。 */
  const load = async (): Promise<Snapshot> => {
    const chfileRoot = Data.resolveChfileRoot(settings.value.chfileRoot)
    const logins = Data.readLogins(chfileRoot)
    const lastUser = Data.readLastUser(chfileRoot)
    const fallback = Data.pickLogin(logins, "", lastUser)
    const profile = await Data.readProfile(dataDir, fallback?.account ?? "")
    const login = Data.pickLogin(logins, profile.account, lastUser) ?? null
    const account = login?.account ?? profile.account
    const knowledge = account.length === 0 ? { entries: 0, updatedAt: "" } : await Data.readKnowledge(dataDir)
    const style =
      account.length === 0
        ? { summary: "", updatedAt: "" }
        : await Data.readStyle(dataDir, account).then((value) => ({
            summary: describeProfile(value),
            updatedAt: value.updatedAt,
          }))
    current = {
      dataDir,
      profile,
      chfileRoot,
      bridgePath: settings.value.bridgePath,
      account: login,
      department: login === null ? "" : Data.readDepartment(chfileRoot, login.account, login.userName),
      logins,
      bridge: bridgeFor(chfileRoot).status(),
      knowledge,
      style,
    }
    return current
  }

  /** 方法里统一用这个：先确保 state 已读盘，再返回它。 */
  const ready = async () => (current.profile === null ? load() : current)

  const save = async (patch: ProfilePatch): Promise<Snapshot> => {
    const base: HytProfile = (await ready()).profile ?? defaultProfile(current.account?.account ?? "")
    const saved = await Data.writeProfile(dataDir, mergeProfile(base, patch))
    current = { ...current, profile: saved }
    // 账号或知识路径可能改动，重读一次把派生字段（部门、计数、风格摘要）一起刷新。
    return load()
  }

  provider = ctx.provide(HytIpc, {
    state: () => current,

    async patch(input) {
      const next = await save(input)
      report()
      return next
    },

    async refresh() {
      const next = await load()
      report()
      return next
    },

    async setLocation(input) {
      settings.set({
        chfileRoot: input.chfileRoot ?? settings.value.chfileRoot,
        bridgePath: input.bridgePath ?? settings.value.bridgePath,
      })
      const next = await load()
      report()
      return next
    },

    async selectAccount(input) {
      const next = await save({ account: input.account })
      report()
      return next
    },

    async bridge(input) {
      const snapshot = await ready()
      const bridge = bridgeFor(snapshot.chfileRoot)
      const status = input.action === "start" ? await bridge.start(snapshot.bridgePath) : await bridge.stop()
      current = { ...current, bridge: status }
      report()
      return status
    },

    async people(input) {
      const snapshot = await ready()
      const account = snapshot.account?.account ?? snapshot.profile?.account ?? ""
      if (account.length === 0) return []
      return Data.searchPeople(snapshot.chfileRoot, account, input.query, input.limit)
    },

    async restyle() {
      const snapshot = await ready()
      const login = snapshot.account
      if (login === null) return { summary: snapshot.style.summary, updatedAt: snapshot.style.updatedAt }
      const result = await Data.restyle(dataDir, snapshot.chfileRoot, login.account, login.userName)
      current = { ...current, style: result }
      report()
      return result
    },

    async clearLearning() {
      const snapshot = await ready()
      const account = snapshot.account?.account ?? snapshot.profile?.account ?? ""
      const result = await Data.clearLearning(dataDir, account)
      current = {
        ...current,
        knowledge: { entries: 0, updatedAt: "" },
        style: { summary: "", updatedAt: "" },
      }
      report()
      return result
    },

    async trial() {
      const snapshot = await ready()
      const account = snapshot.account?.account ?? snapshot.profile?.account ?? ""
      if (account.length === 0) return { messages: 0, sessions: 0, lines: [] }
      return Data.readTrial(snapshot.chfileRoot, account)
    },
  })

  // 首次订阅前把真实状态读出来；窗口先拿到 profile 为 null 的快照，随后被这次推送替换。
  void load()
    .then(report)
    .catch((cause: unknown) => {
      current = { ...current, error: cause instanceof Error ? cause.message : String(cause) }
      report()
    })

  ctx.onCleanup(() => runtime?.bridge.dispose())

  return provider
}

export { HytIpc }
