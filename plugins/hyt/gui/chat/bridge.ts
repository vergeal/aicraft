import { connectBridge } from "../../src/bridge/client.js"
import { ensureLogin } from "../../src/bridge/native.js"
import type { BridgeCredentials } from "../../src/bridge/native.js"
import { METHODS, parseSendResult, readEndpoint } from "../../src/bridge/protocol.js"
import { createSupervisor } from "../../src/bridge/supervisor.js"
import type { BridgeSupervisor } from "../../src/bridge/supervisor.js"

/**
 * 窗口主进程侧的消息通道。
 *
 * 插件自带原生桥接：没有实例时按需拉起，拿到连接后用本地库里的凭据登录一次，之后一直复用同一个连接。
 * 虹云通客户端或服务端插件已经拉起过 bridge 时直接连它，不重复启动进程。
 */

export type SendOutcome = { ok: true; msgId?: string } | { ok: false; reason: string }

export interface SenderOptions {
  /** 当前的 CHFile 根目录；用户改设置后跟随变化。 */
  readonly root: () => string
  /** 桥接可执行文件；空串表示按打包布局推导。 */
  readonly executable: () => string
  /** 登录凭据；读不到时发送会给出明确原因。 */
  readonly credentials: () => BridgeCredentials | undefined
}

export interface MessageSender {
  send(sessionId: string, text: string): Promise<SendOutcome>
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
    })
    cached = { key, supervisor: created }
    return created
  }

  const channel = async () => {
    const credentials = options.credentials()
    if (credentials === undefined) throw new Error("没有找到虹云通的登录凭据：先打开虹云通客户端登录一次。")
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
        const result = parseSendResult(await client.request(METHODS.sendMessage, { sessionId, text }))
        return result.ok ? { ok: true, msgId: result.msgId } : { ok: false, reason: "消息通道没有确认已发出" }
      } catch (cause) {
        return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) }
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
