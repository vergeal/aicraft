import type { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { accountDirectory, readCredentials, resolveChfileRoot } from "./account.js"
import type { Credentials } from "./account.js"
import type { BridgeClient } from "./bridge/client.js"
import { sendMessage } from "./bridge/client.js"
import type { BridgeSupervisor, SupervisorStatus } from "./bridge/supervisor.js"
import { createSupervisor } from "./bridge/supervisor.js"
import { openReadonly, openWritable, appendOwnMessage } from "./chat/store.js"
import type { Settings } from "./settings.js"
import { readSettings } from "./settings.js"
import { markSent } from "./style/sent.js"

/**
 * 装配层：把设置、账号、库连接与 bridge 生命周期收在一处，工具只依赖这个窄接口。
 * 连接按路径缓存、在 cleanup 里关闭；不导出全局单例，避免热重载留下旧句柄。
 */

export interface RuntimeDeps {
  /** 插件自己的数据目录（ctx.paths.data）。 */
  readonly dataDir: string
  readonly config: { get(): Promise<Record<string, unknown>> }
  readonly options: Record<string, unknown>
  /** 便于测试替换 bridge 的创建方式。 */
  readonly createBridge?: (settings: Settings) => BridgeSupervisor
}

export interface Environment {
  readonly root: string
  readonly account: string
  readonly userName: string
  readonly displayName: string
  /** `<root>/<account>`，里面有 chatmsg.db、AddressBookDB.db、RecvFiles。 */
  readonly directory: string
}

export interface SendOutcome {
  readonly sessionId: string
  readonly msgId: string
  readonly createdAt: number
  /** 本地 chatmsg 是否写成功；写失败不影响已经发出的消息，但要如实告诉调用方。 */
  readonly recorded: boolean
  readonly recordError?: string
}

export interface Service {
  readonly dataDir: string
  settings(): Promise<Settings>
  environment(): Promise<Environment | undefined>
  credentials(): Promise<Credentials | undefined>
  chat(): Promise<Database>
  contacts(): Promise<Database>
  recvRoot(): Promise<string>
  sendText(input: { sessionId: string; text: string }): Promise<SendOutcome>
  bridgeStatus(): SupervisorStatus | undefined
  cleanup(): Promise<void>
}

export function createService(deps: RuntimeDeps): Service {
  let cachedSettings: Settings | undefined
  const readCached = async () => {
    cachedSettings ??= readSettings(await deps.config.get(), deps.options)
    return cachedSettings
  }
  const databases = new Map<string, Database>()
  let supervisor: BridgeSupervisor | undefined

  const cachedDatabase = (path: string, writable: boolean) => {
    const key = `${writable ? "rw" : "ro"}:${path}`
    const existing = databases.get(key)
    if (existing !== undefined) return existing
    const opened = writable ? openWritable(path) : openReadonly(path)
    databases.set(key, opened)
    return opened
  }

  const environment = async (): Promise<Environment | undefined> => {
    const settings = await readCached()
    const root = resolveChfileRoot(settings.chfileRoot)
    const credentials = readCredentials(root, settings.account)
    if (credentials === undefined) return undefined
    const directory = accountDirectory(root, credentials.account)
    if (!existsSync(join(directory, "chatmsg.db"))) return undefined
    return {
      root,
      account: credentials.account,
      userName: credentials.userName,
      displayName: credentials.displayName,
      directory,
    }
  }

  const requireEnvironment = async () => {
    const current = await environment()
    if (current === undefined)
      throw new Error("没有找到虹云通的本地数据：先打开虹云通客户端登录一次，或在插件设置里指定 chfileRoot 与 account。")
    return current
  }

  const chat = async () => cachedDatabase(join((await requireEnvironment()).directory, "chatmsg.db"), true)

  const contacts = async () => cachedDatabase(join((await requireEnvironment()).directory, "AddressBookDB.db"), false)

  const bridge = async () => {
    if (supervisor !== undefined) return supervisor
    const settings = await readCached()
    supervisor =
      deps.createBridge?.(settings) ??
      createSupervisor({
        chfileRoot: resolveChfileRoot(settings.chfileRoot),
        executable: settings.bridgePath,
        autoStart: settings.autoStartBridge,
      })
    return supervisor
  }

  const client = async (): Promise<BridgeClient> => (await bridge()).client()

  return {
    dataDir: deps.dataDir,
    settings: readCached,
    environment,
    credentials: async () => {
      const settings = await readCached()
      return readCredentials(resolveChfileRoot(settings.chfileRoot), settings.account)
    },
    chat,
    contacts,
    recvRoot: async () => join((await requireEnvironment()).directory, "RecvFiles"),
    sendText: async (input) => {
      const settings = await readCached()
      if (process.platform === "linux") throw new Error("当前平台是 Linux，桥接只支持读取，不能发消息。")
      if (settings.whitelist.length === 0)
        throw new Error("白名单为空，拒绝发送。先在插件设置里把允许自动发送的会话或账号加入 whitelist。")
      const sessionId = input.sessionId.trim()
      const text = input.text.trim()
      if (sessionId.length === 0) throw new Error("缺少会话 id。")
      if (text.length === 0) throw new Error("消息内容不能为空。")
      const environment = await requireEnvironment()
      if (!isAllowed(settings.whitelist, sessionId, environment.account))
        throw new Error(`会话 ${sessionId} 不在白名单里，拒绝发送。`)

      const result = await sendMessage(await client(), { sessionId, text })
      if (!result.ok) throw new Error("bridge 没有确认消息已发出。")
      const outcome = await recordOwnMessage({
        db: await chat(),
        dataDir: deps.dataDir,
        sessionId,
        text,
        sender: environment.account,
        senderNick: environment.displayName,
        msgId: result.msgId,
      })
      return outcome
    },
    bridgeStatus: () => supervisor?.status(),
    cleanup: async () => {
      await supervisor?.stop()
      supervisor = undefined
      for (const database of databases.values()) database.close()
      databases.clear()
    },
  }
}

async function recordOwnMessage(input: {
  db: Database
  dataDir: string
  sessionId: string
  text: string
  sender: string
  senderNick: string
  msgId?: string
}): Promise<SendOutcome> {
  const written = await appendOwnMessage(input.db, {
    sessionId: input.sessionId,
    text: input.text,
    sender: input.sender,
    senderNick: input.senderNick,
    msgId: input.msgId,
  }).catch((error: unknown) => ({
    msgId: input.msgId ?? "",
    createdAt: Date.now(),
    error: error instanceof Error ? error.message : String(error),
  }))
  await markSent(input.dataDir, "error" in written ? (input.msgId ?? "") : written.msgId, new Date().toISOString())
  // 写库失败时消息已经发出去了：如实返回，让调用方提示「已发送但未写入本地历史」。
  if ("error" in written)
    return { sessionId: input.sessionId, msgId: input.msgId ?? "", createdAt: Date.now(), recorded: false, recordError: written.error }
  return { sessionId: input.sessionId, msgId: written.msgId, createdAt: written.createdAt, recorded: true }
}

/** 白名单接受会话 id、账号，或 `*` 表示全部。 */
export function isAllowed(whitelist: readonly string[], sessionId: string, account: string) {
  return whitelist.some((entry) => entry === "*" || entry === sessionId || entry === account)
}
