import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import type { BridgeClient } from "./client.js"
import { connectBridge } from "./client.js"
import type { Endpoint } from "./protocol.js"
import { readEndpoint } from "./protocol.js"

/**
 * bridge 进程的生命周期：先看 Config/bridge.json 是否已有实例；没有就按配置的可执行文件拉起，
 * 等到发现文件更新后再连。连接断开或子进程退出时按指数退避重连，次数有上限。
 * 只清理自己拉起的进程，不碰用户在别处启动的 bridge。
 */

export type SupervisorState = "stopped" | "connecting" | "ready" | "restarting" | "failed"

export interface SupervisorStatus {
  readonly state: SupervisorState
  readonly endpoint?: Endpoint
  readonly restarts: number
  readonly lastError?: string
  /** true 表示进程是插件自己拉起的，插件卸载时会结束它。 */
  readonly ownProcess: boolean
}

export interface SupervisorOptions {
  readonly chfileRoot: string
  readonly executable?: string
  readonly autoStart: boolean
  readonly requestTimeoutMs?: number
  readonly onEvent?: (method: string, params: unknown) => void
  readonly onStatus?: (status: SupervisorStatus) => void
  /** 测试里替换掉真实的子进程。 */
  readonly spawnProcess?: (executable: string) => ChildProcess | undefined
}

export interface BridgeSupervisor {
  status(): SupervisorStatus
  /** 拿到可用的连接；失败时抛出带原因的错误。 */
  client(): Promise<BridgeClient>
  stop(): Promise<void>
}

const MAX_RESTARTS = 5
const ENDPOINT_WAIT_MS = 8_000
const ENDPOINT_POLL_MS = 250

export function createSupervisor(options: SupervisorOptions): BridgeSupervisor {
  let state: SupervisorState = "stopped"
  let connection: BridgeClient | undefined
  let child: ChildProcess | undefined
  let restarts = 0
  let lastError: string | undefined
  let inflight: Promise<BridgeClient> | undefined
  let restartTimer: ReturnType<typeof setTimeout> | undefined
  let stopping = false

  const report = () => options.onStatus?.(status())

  const status = (): SupervisorStatus => ({
    state,
    endpoint: connection?.endpoint,
    restarts,
    lastError,
    ownProcess: child !== undefined,
  })

  const ensure = (): Promise<BridgeClient> => {
    if (connection !== undefined && connection.state() === "open") return Promise.resolve(connection)
    if (inflight !== undefined) return inflight
    inflight = start().finally(() => {
      inflight = undefined
    })
    return inflight
  }

  const start = async (): Promise<BridgeClient> => {
    state = "connecting"
    report()
    const before = await readEndpoint(options.chfileRoot)
    if (before !== undefined) {
      const existing = await open(before)
      if (existing !== undefined) return existing
    }
    if (!options.autoStart) throw new Error("已关闭自动拉起 bridge，且没有发现运行中的实例。")
    const executable = options.executable?.trim() ?? ""
    if (executable.length === 0) throw new Error("没有配置 bridge 可执行文件路径，也没有发现运行中的实例。")
    if (!existsSync(executable)) throw new Error(`bridge 可执行文件不存在：${executable}`)

    child = options.spawnProcess?.(executable) ?? spawn(executable, [], { stdio: "ignore", detached: false })
    const spawnedPid = child.pid
    child.once("exit", () => {
      child = undefined
      if (stopping) return
      // 抢占端口时，后启动的桥发现已有实例会自己退出。此时我们连上的可能是先启动的那个实例，
      // 不能因为自己的子进程退出就关掉它——否则登录请求会以「连接已断开」失败。
      if (connection !== undefined && spawnedPid !== undefined && connection.endpoint.pid !== spawnedPid) return
      // 自己拉起的进程退出：断开当前连接并按退避重连。
      connection?.close()
      connection = undefined
      schedule()
    })

    const endpoint = await waitForEndpoint(options.chfileRoot, before)
    if (endpoint === undefined) {
      // 另一个进程可能抢先启动并占用了端口：再读一次发现文件，连上就复用，避免把竞争当失败。
      const raced = await readEndpoint(options.chfileRoot)
      const existing = raced === undefined ? undefined : await open(raced)
      if (existing !== undefined) return existing
      // 旧实例可能活着但发现文件已丢失：桥默认只听 127.0.0.1:37210，直连一次兜底。
      if (raced === undefined) {
        const fallback = await open({ host: "127.0.0.1", port: 37210 })
        if (fallback !== undefined) return fallback
      }
      throw new Error("bridge 已启动，但等待 Config/bridge.json 超时。")
    }
    const opened = await open(endpoint)
    if (opened === undefined) throw new Error(`无法连接 bridge：${endpoint.host}:${endpoint.port}`)
    return opened
  }

  const open = async (endpoint: Endpoint): Promise<BridgeClient | undefined> => {
    const client = await connectBridge(endpoint, {
      requestTimeoutMs: options.requestTimeoutMs,
    }).catch(() => undefined)
    if (client === undefined) return undefined
    connection = client
    restarts = 0
    lastError = undefined
    state = "ready"
    if (options.onEvent !== undefined) {
      client.onEvent((method, params) => options.onEvent?.(method, params))
    }
    client.onClose(() => {
      if (stopping) return
      connection = undefined
      schedule()
    })
    report()
    return client
  }

  const schedule = () => {
    if (stopping || restartTimer !== undefined) return
    if (restarts >= MAX_RESTARTS) {
      state = "failed"
      lastError = `bridge 连续断开 ${restarts} 次，已停止自动重连。`
      report()
      return
    }
    const delay = Math.min(8_000, 500 * 2 ** restarts)
    restarts += 1
    state = "restarting"
    report()
    restartTimer = setTimeout(() => {
      restartTimer = undefined
      ensure().catch((error: unknown) => {
        lastError = error instanceof Error ? error.message : String(error)
        state = "failed"
        report()
      })
    }, delay)
  }

  const stop = async () => {
    // 多宿主共用同一个 bridge：任何一处误调用都会杀掉别人的登录态，出问题时要能追到调用点。
    console.error(`[hyt] supervisor.stop child=${child !== undefined}`, new Error().stack)
    stopping = true
    if (restartTimer !== undefined) clearTimeout(restartTimer)
    restartTimer = undefined
    connection?.close()
    connection = undefined
    // 只结束自己拉起的进程；用户自己开着的 bridge 保持运行。
    if (child !== undefined) {
      child.kill()
      child = undefined
    }
    state = "stopped"
    report()
  }

  return {
    status,
    client: ensure,
    stop,
  }
}

/** 等 bridge 写出新的发现文件：pid 或 startedAt 与上次不同才算新实例。 */
async function waitForEndpoint(chfileRoot: string, before: Endpoint | undefined) {
  const deadline = Date.now() + ENDPOINT_WAIT_MS
  while (Date.now() < deadline) {
    const endpoint = await readEndpoint(chfileRoot)
    if (endpoint !== undefined && (before === undefined || endpoint.pid !== before.pid || endpoint.startedAt !== before.startedAt))
      return endpoint
    await sleep(ENDPOINT_POLL_MS)
  }
  return undefined
}

/** GUI 主进程是 Electron 的 Node 运行时，没有 Bun.sleep。 */
function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
