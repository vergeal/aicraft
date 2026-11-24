import { chmodSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"
import type { BridgeClient } from "./client.js"
import { sendMessage } from "./client.js"
import { METHODS, isRecord } from "./protocol.js"
import type { SendParams, SendResult } from "./protocol.js"

/**
 * 插件自带的原生桥接：有了它就不必先启动虹云通客户端。
 *
 * 二进制随插件打包在 `native/<platform>-<arch>/` 下，跟客户端共用同一个 CHFile 数据目录。
 * 桥接进程是单实例的：已经有一个在跑（另一处插件或客户端桥）时，新拉起的会自己退出，
 * 所以这里先读发现文件连上已有实例，连不上才拉起，再由 `ensureLogin` 用本地凭据登录一次。
 */

export interface BridgeCredentials {
  /** login.db 里的 UserName，不带 `cs` 前缀。 */
  readonly userName: string
  /** base64 解码后的明文密码，只交给桥接，不落盘、不打印。 */
  readonly password: string
}

export interface LoginState {
  readonly loggedIn: boolean
  readonly connected: boolean
  readonly account: string
}

const LOGIN_TIMEOUT_MS = 45_000

/**
 * 可执行文件的位置。打包后的布局优先，其次是源码目录里的构建产物；
 * 用户在设置里指定的路径总是优先，方便换 SDK 版本时覆盖。
 */
export function bridgeExecutable(pluginRoot: string, configured = "") {
  const custom = configured.trim()
  if (custom.length > 0) return custom
  const name = process.platform === "win32" ? "hyt-native-bridge.exe" : "hyt-native-bridge"
  const candidates = [
    join(pluginRoot, "native", `${process.platform}-${process.arch}`, name),
    // 桥接只按 x64 宿主构建：Windows ARM、Apple Silicon 上分别由系统模拟 x86 / Rosetta 运行 x64 产物。
    join(pluginRoot, "native", `${process.platform}-x64`, name),
    join(pluginRoot, "native", process.platform, name),
    join(pluginRoot, "native", "build", "bin", name),
    join(pluginRoot, "native", name),
  ]
  const found = candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!
  ensureExecutable(found)
  return found
}

/**
 * `.exc` 是 tar 包，安装后的文件不一定带执行位。桥接要能被 spawn 拉起，所以找到后补一次 0755；
 * Windows 没有执行位，直接跳过；只读安装位置改不动时保持原样，spawn 失败会带出明确原因。
 */
function ensureExecutable(file: string) {
  if (process.platform === "win32") return
  if (((statSync(file, { throwIfNoEntry: false })?.mode ?? 0) & 0o111) === 0o111) return
  try {
    chmodSync(file, 0o755)
  } catch {
    // 只读安装位置改不动权限时就保持原样。
  }
}

/** 读 `auth.state`：桥接没有登录时也正常返回，只是 loggedIn 为 false。 */
export async function readLoginState(client: BridgeClient): Promise<LoginState> {
  const value = await client.request(METHODS.state).catch(() => undefined)
  if (!isRecord(value))
    return { loggedIn: false, connected: false, account: "" }
  return {
    loggedIn: value.loggedIn === true,
    connected: value.connected === true,
    account: typeof value.account === "string" ? value.account : "",
  }
}

/** 已登录且连接正常才复用；否则把插件保存的凭据交给桥接登录。失败时抛出带原因的错误。 */
export async function ensureLogin(client: BridgeClient, credentials: BridgeCredentials) {
  const state = await readLoginState(client)
  if (state.loggedIn && state.connected) return
  // 已登录但连接断开时，SdkHost::login 会直接复用旧会话，所以先登出再重新登录。
  if (state.loggedIn) await client.request(METHODS.logout).catch(() => undefined)
  const result = await client
    .request(
      METHODS.login,
      { userName: credentials.userName, password: credentials.password, waitMs: 12_000 },
      LOGIN_TIMEOUT_MS,
    )
    .catch(async (cause: unknown) => {
      // 服务端偶尔比请求超时更晚完成：再确认一次状态，避免把已登录的通道报成失败。
      if ((await readLoginState(client)).loggedIn) return { ok: true }
      throw new Error(`登录消息通道失败：${cause instanceof Error ? cause.message : String(cause)}`)
    })
  if (!isRecord(result) || (result.ok !== true && result.pending !== true)) {
    const message = isRecord(result) && typeof result.message === "string" ? result.message : "桥接没有确认登录成功"
    throw new Error(`登录消息通道失败：${message}`)
  }
}

/** 认证状态失效的一类错误：掉线、被踢、未授权、会话过期；重登一次通常能恢复。 */
const AUTH_ERROR = /未登录|未连接|鉴权|认证|授权|登录失效|401|403|token|expired/i

/** 强制重登：先清掉桥接里的旧会话，再交给 ensureLogin，避免复用一个已断开的连接。 */
async function relogin(client: BridgeClient, credentials: BridgeCredentials) {
  await client.request(METHODS.logout).catch(() => undefined)
  await ensureLogin(client, credentials)
}

/**
 * 发送文本；失败于认证类原因时用保存的凭据静默重登，并重试一次。
 * 其余错误（会话不在白名单、内容为空、SDK 拒绝等）原样返回，不做无意义的重试。
 */
export async function sendTextEnsuringLogin(
  client: BridgeClient,
  credentials: BridgeCredentials,
  params: SendParams,
): Promise<SendResult> {
  const first = await sendMessage(client, params)
  if (first.ok || !AUTH_ERROR.test(first.error)) return first
  try {
    await relogin(client, credentials)
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }
  }
  return sendMessage(client, params)
}
