import { Socket } from "node:net"
import type {
  BridgeInfo,
  Endpoint,
  LoginParams,
  LoginResult,
  PingResult,
  SendParams,
  SendResult,
} from "./protocol.js"
import { METHODS, isNotification, isRecord, parseInbound, parseSendResult } from "./protocol.js"

/**
 * 一个 bridge 连接：TCP + 换行分隔 JSON-RPC 2.0。
 * request 返回 unknown，由 protocol 里的解析函数校验成具体类型，避免在协议边界做类型断言。
 */

export type ConnectionState = "connecting" | "open" | "closed"

export interface BridgeClient {
  readonly endpoint: Endpoint
  state(): ConnectionState
  request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>
  /** 订阅 bridge 推送的事件，返回取消订阅函数。 */
  onEvent(handler: (method: string, params: unknown) => void): () => void
  onClose(handler: () => void): () => void
  close(): void
}

export interface ConnectOptions {
  /** 单条请求的超时，默认 8 秒。 */
  readonly requestTimeoutMs?: number
  /** TCP 建连超时，默认 3 秒。 */
  readonly connectTimeoutMs?: number
}

const DEFAULT_REQUEST_TIMEOUT = 8_000
const DEFAULT_CONNECT_TIMEOUT = 3_000

export function connectBridge(endpoint: Endpoint, options: ConnectOptions = {}): Promise<BridgeClient> {
  const requestTimeout = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    socket.setEncoding("utf8")
    socket.setNoDelay(true)
    let state: ConnectionState = "connecting"
    let buffer = ""
    let sequence = 0
    const pending = new Map<
      number,
      { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
    >()
    const events = new Set<(method: string, params: unknown) => void>()
    const closes = new Set<() => void>()

    const fail = (error: Error) => {
      for (const item of pending.values()) {
        clearTimeout(item.timer)
        item.reject(error)
      }
      pending.clear()
    }

    const client: BridgeClient = {
      endpoint,
      state: () => state,
      request: (method, params, timeoutMs = requestTimeout) => {
        if (state !== "open") return Promise.reject(new Error("bridge 未连接，先确认 bridge 进程在运行。"))
        const id = ++sequence
        return new Promise<unknown>((accept, refuse) => {
          const timer = setTimeout(() => {
            pending.delete(id)
            refuse(new Error(`bridge 请求超时：${method}`))
          }, timeoutMs)
          pending.set(id, { resolve: accept, reject: refuse, timer })
          socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
        })
      },
      onEvent: (handler) => {
        events.add(handler)
        return () => events.delete(handler)
      },
      onClose: (handler) => {
        closes.add(handler)
        return () => closes.delete(handler)
      },
      close: () => {
        state = "closed"
        socket.destroy()
      },
    }

    const connectTimer = setTimeout(() => {
      if (state === "connecting") {
        socket.destroy()
        reject(new Error(`连接 bridge 超时：${endpoint.host}:${endpoint.port}`))
      }
    }, options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT)

    socket.once("connect", () => {
      clearTimeout(connectTimer)
      state = "open"
      resolve(client)
    })

    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8")
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const message = parseInbound(line)
        if (message === undefined) continue
        if (isNotification(message)) {
          for (const handler of events) handler(message.method, message.params)
          continue
        }
        const item = pending.get(message.id)
        if (item === undefined) continue
        pending.delete(message.id)
        clearTimeout(item.timer)
        if (message.error !== undefined) item.reject(new Error(message.error.message))
        else item.resolve(message.result)
      }
    })

    socket.on("error", (error) => {
      if (state === "connecting") {
        clearTimeout(connectTimer)
        reject(new Error(`连接 bridge 失败：${error.message}`))
      }
    })

    socket.on("close", () => {
      clearTimeout(connectTimer)
      state = "closed"
      fail(new Error("bridge 连接已断开。"))
      for (const handler of closes) handler()
      closes.clear()
      events.clear()
    })

    socket.connect(endpoint.port, endpoint.host)
  })
}

export async function pingBridge(client: BridgeClient): Promise<PingResult> {
  const result = await client.request(METHODS.ping)
  if (!isRecord(result) || typeof result.pong !== "boolean") throw new Error("bridge 没有返回合法的 ping 结果。")
  return { pong: result.pong, ts: typeof result.ts === "number" ? result.ts : 0 }
}

export async function bridgeInfo(client: BridgeClient): Promise<BridgeInfo> {
  const result = await client.request(METHODS.info)
  if (!isRecord(result)) throw new Error("bridge 没有返回合法的 bridge.info。")
  return {
    name: text(result.name),
    version: text(result.version),
    runtime: text(result.runtime),
    platform: text(result.platform),
    pid: typeof result.pid === "number" ? result.pid : 0,
    uptimeMs: typeof result.uptimeMs === "number" ? result.uptimeMs : 0,
    chRoot: text(result.chRoot),
  }
}

export async function loginBridge(client: BridgeClient, params: LoginParams): Promise<LoginResult> {
  const result = await client.request(METHODS.login, params)
  if (!isRecord(result)) throw new Error("bridge 没有返回合法的登录结果。")
  return { ok: result.ok === true, account: text(result.account) }
}

export async function sendMessage(client: BridgeClient, params: SendParams): Promise<SendResult> {
  return parseSendResult(await client.request(METHODS.sendMessage, params))
}

function text(value: unknown) {
  return typeof value === "string" ? value : ""
}
