/**
 * 与 C++ bridge 的协议：127.0.0.1 上的 TCP，换行分隔的 JSON-RPC 2.0。
 * bridge 启动后把端口写进 `<CHFile>/Config/bridge.json`：{ host, port, pid, startedAt }。
 * 方法名以 bridge 会话实现的契约为准，这里只固定当前已知的几个，其余走 request(method, params)。
 */

import { readFile } from "node:fs/promises"

export const METHODS = {
  ping: "ping",
  info: "bridge.info",
  login: "auth.login",
  logout: "auth.logout",
  state: "auth.state",
  sendMessage: "im.sendMessage",
  sessions: "im.sessions",
  members: "im.members",
  markRead: "im.markRead",
  download: "im.download",
  call: "sdk.call",
} as const

export const EVENTS = {
  message: "event.onMessage",
  receiveMessage: "event.onReceiveMessage",
  groups: "event.onGroups",
  connectState: "event.onConnectState",
  logOut: "event.onLogOut",
  userState: "event.onUserState",
  readReceipt: "event.onReadReceipt",
} as const

/** 群成员，对应 `im.members` 的 `members` 一项。 */
export interface BridgeMember {
  readonly account: string
  readonly name: string
  readonly role?: number
  readonly sex?: number
}

export interface MembersResult {
  readonly ok: boolean
  readonly members: readonly BridgeMember[]
  readonly error: string
}

export interface MarkReadResult {
  readonly ok: boolean
  readonly msgId: string
  readonly error: string
}

/** `im.members` 的回包：字段缺失时当作失败，避免把半截名单算成「没有未读」。 */
export function parseMembers(value: unknown): MembersResult {
  if (!isRecord(value)) return { ok: false, members: [], error: "bridge 没有返回群成员" }
  const list = Array.isArray(value.members) ? value.members : []
  return {
    ok: value.ok === true,
    members: list.flatMap((item) => {
      if (!isRecord(item)) return []
      const account = typeof item.account === "string" ? item.account : ""
      if (account.length === 0) return []
      return [{ account, name: typeof item.name === "string" ? item.name : "", role: number(item.role), sex: number(item.sex) }]
    }),
    error: typeof value.error === "string" ? value.error : "",
  }
}

/** `im.markRead` 的回包。 */
export function parseMarkRead(value: unknown, msgId: string): MarkReadResult {
  if (!isRecord(value)) return { ok: false, msgId, error: "bridge 没有返回已读上报结果" }
  return { ok: value.ok === true, msgId, error: typeof value.error === "string" ? value.error : "" }
}

/** 服务端文件下载结果。`pending` 表示下载已提交、回调还没回来，`path` 可能仍为空。 */
export interface DownloadResult {
  readonly ok: boolean
  readonly pending: boolean
  readonly msgId: string
  readonly path: string
  readonly error: string
}

export function parseDownload(value: unknown, msgId: string): DownloadResult {
  if (!isRecord(value)) return { ok: false, pending: false, msgId, path: "", error: "bridge 没有返回下载结果" }
  return {
    ok: value.ok === true,
    pending: value.pending === true,
    msgId: typeof value.msgId === "string" && value.msgId.length > 0 ? value.msgId : msgId,
    path: typeof value.path === "string" ? value.path : "",
    error: typeof value.error === "string" ? value.error : "",
  }
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export interface Endpoint {
  readonly host: string
  readonly port: number
  readonly pid?: number
  readonly startedAt?: number
}

export interface RpcRequest {
  readonly jsonrpc: "2.0"
  readonly id: number
  readonly method: string
  readonly params?: unknown
}

export interface RpcError {
  readonly code: number
  readonly message: string
  readonly data?: unknown
}

export interface RpcNotification {
  readonly jsonrpc: "2.0"
  readonly method: string
  readonly params?: unknown
}

export interface PingResult {
  readonly pong: boolean
  readonly ts: number
}

export interface BridgeInfo {
  readonly name: string
  readonly version: string
  readonly runtime: string
  readonly platform: string
  readonly pid: number
  readonly uptimeMs: number
  readonly chRoot: string
}

export interface LoginParams {
  readonly userName: string
  readonly password: string
  readonly loginType?: string
}

export interface LoginResult {
  readonly ok: boolean
  readonly account: string
}

export interface SendParams {
  readonly sessionId: string
  readonly text: string
}

export interface SendResult {
  readonly ok: boolean
  readonly msgId?: string
  /** 原生层给出的失败原因；成功时为空串。 */
  readonly error: string
}

export interface SessionListResult {
  readonly sessions: readonly BridgeSession[]
}

export interface BridgeSession {
  readonly sessionId: string
  readonly title?: string
  readonly type?: number
  readonly unread?: number
  readonly lastAt?: number
}

/** bridge.json 读取；文件缺失或字段不合法时返回 undefined。同时接受端口是字符串的写法。 */
export async function readEndpoint(chfileRoot: string): Promise<Endpoint | undefined> {
  // 用 node:fs 而不是 Bun.file：GUI 主进程是 Electron 的 Node 运行时，没有 Bun 全局。
  const file = `${chfileRoot}/Config/bridge.json`
  const text = await readFile(file, "utf8").catch(() => undefined)
  if (text === undefined) return undefined
  try {
    return parseEndpoint(JSON.parse(text) as unknown)
  } catch {
    return undefined
  }
}

export function parseEndpoint(value: unknown): Endpoint | undefined {
  if (!isRecord(value)) return undefined
  const port = typeof value.port === "number" ? value.port : Number.parseInt(String(value.port ?? ""), 10)
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) return undefined
  const host = typeof value.host === "string" && value.host.length > 0 ? value.host : "127.0.0.1"
  return {
    host,
    port,
    pid: typeof value.pid === "number" ? value.pid : undefined,
    startedAt: typeof value.startedAt === "number" ? value.startedAt : undefined,
  }
}

/** im.sendMessage 的返回值在校验前是 unknown：只认 ok=true，msgId 有就用，失败原因原样带出。 */
export function parseSendResult(value: unknown): SendResult {
  if (!isRecord(value)) return { ok: false, error: "bridge 没有返回发送结果" }
  const msgId = typeof value.msgId === "string" ? value.msgId : undefined
  const error = typeof value.error === "string" ? value.error : ""
  return { ok: value.ok === true, ...(msgId === undefined ? {} : { msgId }), error }
}

/** 一行收进来的 JSON 要么是响应（有 id），要么是事件（有 method）。解析失败的行直接丢弃。 */
export function parseInbound(line: string): { id: number; result?: unknown; error?: RpcError } | RpcNotification | undefined {
  const text = line.trim()
  if (text.length === 0) return undefined
  const value = parseJson(text)
  if (!isRecord(value)) return undefined
  if (typeof value.method === "string") return { jsonrpc: "2.0", method: value.method, params: value.params }
  if (typeof value.id !== "number") return undefined
  if (isRpcError(value.error)) return { id: value.id, error: value.error }
  return { id: value.id, result: value.result }
}

export function isNotification(
  value: { readonly id: number } | RpcNotification,
): value is RpcNotification {
  return "method" in value
}

function isRpcError(value: unknown): value is RpcError {
  return isRecord(value) && typeof value.message === "string"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 校验 bridge 返回值时用；导出给 client 复用同一套判定。 */
export { isRecord }

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
