import { basename } from "node:path"
import { connectBridge } from "../../src/bridge/client.js"
import { ensureLogin, sendTextEnsuringLogin } from "../../src/bridge/native.js"
import type { BridgeCredentials } from "../../src/bridge/native.js"
import { METHODS, isRecord, parseDownload, parseMarkRead, parseMembers, parseRecall, parseSendResult, readEndpoint } from "../../src/bridge/protocol.js"
import type { DownloadResult, MarkReadResult, MembersResult, RecallResult, SendResult } from "../../src/bridge/protocol.js"
import { createSupervisor } from "../../src/bridge/supervisor.js"
import type { BridgeSupervisor } from "../../src/bridge/supervisor.js"

/**
 * 窗口主进程侧的消息通道。
 *
 * 插件自带原生桥接：没有实例时按需拉起，拿到连接后用本地库里的凭据登录一次，之后一直复用同一个连接。
 * 虹云通客户端或服务端插件已经拉起过 bridge 时直接连它，不重复启动进程。
 */

export type SendOutcome = { ok: true; msgId?: string } | { ok: false; reason: string }

export interface LoginOutcome {
  readonly ok: boolean
  /** 账号密码已被服务端接受，但连接回调没在等待时间内到达；凭据仍应保存。 */
  readonly pending: boolean
  readonly account: string
  /** 登录后 `auth.state` 报告的公司 id；拿不到时为空串。 */
  readonly comId: string
  /** `prod` 或 `test`；拿不到时为空串。 */
  readonly env: string
  readonly message: string
}

const LOGIN_TIMEOUT_MS = 45_000

export interface SenderOptions {
  /** 当前的 CHFile 根目录；用户改设置后跟随变化。 */
  readonly root: () => string
  /** 桥接可执行文件；空串表示按打包布局推导。 */
  readonly executable: () => string
  /** 登录凭据；读不到时发送会给出明确原因。 */
  readonly credentials: () => BridgeCredentials | undefined
  /**
   * 桥接推送的事件。`event.onReadReceipt` 也走这里：回执是实时推送，
   * 离线期间补不回来，所以必须一建连就订阅，不能等打开弹窗才接。
   */
  readonly onEvent?: (method: string, params: unknown) => void
}

export interface MessageSender {
  send(sessionId: string, text: string): Promise<SendOutcome>
  /** 发送图片/文件/文档：桥接按扩展名推断消息类型（图片 4、音视频 2/3、其他 6）。 */
  sendMedia(sessionId: string, filePath: string): Promise<SendResult>
  /** 拉群成员，用来算「未读」；单聊不需要。 */
  members(groupId: string): Promise<MembersResult>
  /** 把「我已经读过这条」上报给服务端。 */
  markRead(msgId: string, group: boolean): Promise<MarkReadResult>
  /** 撤回自己发出的一条消息；时间窗由服务端判定，拒绝原因在 `error` 里。 */
  recall(msgId: string): Promise<RecallResult>
  /**
   * 按消息 id 让服务端把文件下载到本地收件目录。
   * 客户端离线时收到的图片/文件没有本地副本，打开时靠它补下载。
   */
  download(msgId: string): Promise<DownloadResult>
  /** 用账号密码登录消息通道；成功后桥接会打开该账号的本地库。 */
  login(userName: string, password: string): Promise<LoginOutcome>
  /** 退出登录：断开消息通道，但保留本地库与历史。 */
  logout(): Promise<{ ok: boolean; error: string }>
  /** 后台预热：拉起桥接并登录，失败只记录状态，不抛给界面。 */
  warm(): Promise<void>
  /** 当前是否已有可用的连接；只读发现文件探测，不主动拉起进程。 */
  ready(): Promise<boolean>
  stop(): Promise<void>
}

export function createSender(options: SenderOptions): MessageSender {
  let cached: { key: string; supervisor: BridgeSupervisor } | undefined
  let warming: Promise<void> | undefined
  let probedAt = 0
  let probed = false

  const supervisor = () => {
    const root = options.root()
    const executable = options.executable()
    const key = `${root}\u0000${executable}`
    if (cached?.key === key) return cached.supervisor
    if (cached !== undefined) void cached.supervisor.stop()
    const created = createSupervisor({
      chfileRoot: root,
      executable,
      autoStart: true,
      requestTimeoutMs: 20_000,
      ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
    })
    cached = { key, supervisor: created }
    return created
  }

  const channel = async () => {
    const credentials = options.credentials()
    if (credentials === undefined) throw new Error("还没有登录：先在虹云通助手里输入账号密码登录。")
    const client = await supervisor().client()
    await ensureLogin(client, credentials)
    return client
  }

  const warm = async () => {
    // 失败向上抛：调用方决定记录到哪里，界面不必等一个永远不会成功的连接。
    await (warming ??= channel()
      .catch(async () => {
        // 桥接被另一进程抢占或正在重启时，第一次会连到将退出的实例；等它稳定再来一次。
        await new Promise((resolve) => setTimeout(resolve, 3_000))
        await channel()
      })
      .then(() => undefined)
      .finally(() => {
        warming = undefined
      }))
  }

  return {
    async send(sessionId, text) {
      try {
        const client = await channel()
        const credentials = options.credentials()
        if (credentials === undefined) throw new Error("还没有登录：先在虹云通助手里输入账号密码登录。")
        // 通道掉线或登录失效时 sendTextEnsuringLogin 会用保存的凭据静默重登一次再重试。
        const result = await sendTextEnsuringLogin(client, credentials, { sessionId, text })
        return result.ok
          ? { ok: true, ...(result.msgId === undefined ? {} : { msgId: result.msgId }) }
          : { ok: false, reason: result.error.length > 0 ? result.error : "消息通道没有确认已发出" }
      } catch (cause) {
        return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) }
      }
    },

    async sendMedia(sessionId, filePath) {
      try {
        const client = await channel()
        // displayName 必须传文件名：留空时 SDK 会把整个绝对路径写进本地库的 FileName，
        // 之后 im.download 拿它拼收件目录会得到坏路径，补下载全失败。
        return parseSendResult(
          await client.request(METHODS.sendMedia, { sessionId, filePath, fileName: basename(filePath) }),
        )
      } catch (cause) {
        return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }
      }
    },

    async members(groupId) {
      try {
        const client = await channel()
        return parseMembers(await client.request(METHODS.members, { groupId }))
      } catch (cause) {
        return { ok: false, members: [], error: cause instanceof Error ? cause.message : String(cause) }
      }
    },

    async markRead(msgId, group) {
      try {
        const client = await channel()
        return parseMarkRead(await client.request(METHODS.markRead, { msgId, group }), msgId)
      } catch (cause) {
        return { ok: false, msgId, error: cause instanceof Error ? cause.message : String(cause) }
      }
    },

    async recall(msgId) {
      try {
        const client = await channel()
        return parseRecall(await client.request(METHODS.recall, { msgId, waitMs: 8_000 }), msgId)
      } catch (cause) {
        return { ok: false, msgId, error: cause instanceof Error ? cause.message : String(cause) }
      }
    },

    async download(msgId) {
      try {
        const client = await channel()
        // 服务端下载回调通常几百毫秒内回来；等不到就标成 pending，界面下次刷新会带上本地路径。
        return parseDownload(await client.request(METHODS.download, { msgId, waitMs: 8_000 }), msgId)
      } catch (cause) {
        return { ok: false, pending: false, msgId, path: "", error: cause instanceof Error ? cause.message : String(cause) }
      }
    },

    async login(userName, password) {
      const name = userName.trim()
      const rejected = (message: string) => ({ ok: false, pending: false, account: "", comId: "", env: "", message })
      if (name.length === 0) return rejected("请输入账号。")
      if (password.length === 0) return rejected("请输入密码。")
      try {
        const client = await supervisor().client()
        // 桥接里已有会话时必须先登出：原生 SdkHost::login 在已登录时直接返回旧会话，
        // 不重新做 PBS 认证，否则用户输入的新密码根本不会生效（旧账号已失效时会一直登录不上）。
        const current = await client.request(METHODS.state).catch(() => undefined)
        if (isRecord(current) && current.loggedIn === true) {
          await client.request(METHODS.logout).catch(() => undefined)
        }
        // 与 ensureLogin 同一套语义：mode=1 是用户输入密码登录，waitMs 内等一次连接状态回调。
        const value = await client.request(
          METHODS.login,
          { userName: name, password, mode: 1, waitMs: 15_000 },
          LOGIN_TIMEOUT_MS,
        )
        if (!isRecord(value)) return rejected("bridge 没有返回登录结果。")
        const ok = value.ok === true
        const pending = value.pending === true
        // 公司 id 与环境下发给桥接时可选；登录成功或已提交时补读一次，供设置页显示与后续登录复用。
        const state = ok || pending ? await client.request(METHODS.state).catch(() => undefined) : undefined
        return {
          ok,
          pending,
          account: typeof value.account === "string" ? value.account : "",
          comId: isRecord(state) && typeof state.comId === "string" ? state.comId : "",
          env: isRecord(state) && typeof state.env === "string" ? state.env : "",
          message: typeof value.message === "string" ? value.message : "",
        }
      } catch (cause) {
        return rejected(cause instanceof Error ? cause.message : String(cause))
      }
    },

    async logout() {
      try {
        const client = await supervisor().client()
        const value = await client.request(METHODS.logout)
        if (!isRecord(value)) return { ok: false, error: "bridge 没有返回退出结果。" }
        return { ok: value.ok === true, error: typeof value.error === "string" ? value.error : "" }
      } catch (cause) {
        return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }
      }
    },

    warm,

    async ready() {
      const key = `${options.root()}\u0000${options.executable()}`
      if (cached?.key === key && cached.supervisor.status().state === "ready") return true
      // 探测只读发现文件并建一次很短的连接；两秒内复用结果，避免 4 秒轮询反复连。
      if (Date.now() - probedAt < 2_000) return probed
      const endpoint = await readEndpoint(options.root())
      const client =
        endpoint === undefined ? undefined : await connectBridge(endpoint, { connectTimeoutMs: 500 }).catch(() => undefined)
      if (client !== undefined) client.close()
      probed = client !== undefined
      probedAt = Date.now()
      return probed
    },

    async stop() {
      await cached?.supervisor.stop()
      cached = undefined
    },
  }
}
