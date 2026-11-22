import { Option, Schema } from "effect"
import { existsSync } from "node:fs"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { createConnection } from "node:net"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import { HytProfile as HytProfileSchema, defaultProfile } from "../../src/profile/schema.js"
import type { HytProfile } from "../../src/profile/schema.js"
import { describeProfile, emptyProfile, filterSamples, mergeSamples } from "../../src/style/profile.js"
import { Profile as StyleProfileSchema } from "../../src/style/profile.js"
import type { StyleProfile } from "../../src/style/profile.js"

/**
 * 主进程侧的数据访问。
 *
 * 这里刻意不用 `Bun.file` / `bun:sqlite`：GUI 的主进程是 Electron，只有 Node 运行时。
 * 只读客户端库、读写档案、风格与知识库都在这一层，窗口侧完全不碰文件系统。
 */

const PLUGIN_ID = "changhong.hyt"

/**
 * 数据目录。宿主目前没有把 plugin data 路径交给 GUI 主进程，所以默认按服务端的规则推导：
 * `~/.opencode/plugin-data/<插件 id>`。以后宿主能提供路径时，从 options 传进来即可。
 */
export function resolveDataDir(explicit?: string) {
  const value = explicit?.trim() ?? ""
  if (value.length > 0) return value
  return join(homedir(), ".opencode", "plugin-data", PLUGIN_ID)
}

const decodeProfile = Schema.decodeUnknownOption(HytProfileSchema)
const decodeStyle = Schema.decodeUnknownOption(StyleProfileSchema)

export function profilePath(dataDir: string) {
  return join(dataDir, "hyt", "profile.json")
}

export function stylePath(dataDir: string, account: string) {
  return join(dataDir, "hyt", "style", `${account}.json`)
}

export function knowledgeIndexPath(dataDir: string) {
  return join(dataDir, "hyt", "knowledge", "index.json")
}

/** 读档案；文件缺失、损坏或不符合契约时回落到中性档案，不回写原文件。 */
export async function readProfile(dataDir: string, fallbackAccount: string): Promise<HytProfile> {
  const parsed = await readJson(profilePath(dataDir))
  const decoded = decodeProfile(parsed)
  return Option.isSome(decoded) ? decoded.value : defaultProfile(fallbackAccount)
}

/** 原子写入档案：先解码，再由保存时间决定 updatedAt。 */
export async function writeProfile(dataDir: string, profile: HytProfile, now = Date.now()): Promise<HytProfile> {
  const decoded = decodeProfile(profile)
  if (Option.isNone(decoded)) throw new Error("档案不符合 HytProfile 契约，未写入。")
  const value: HytProfile = { ...decoded.value, updatedAt: now }
  const path = profilePath(dataDir)
  await mkdir(join(dataDir, "hyt"), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", "utf8")
  await rename(temporary, path)
  return value
}

async function readJson(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf8").catch(() => undefined)
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    // 损坏的档案保持原样，界面显示默认值，用户还能手工修复文件。
    return undefined
  }
}

/** 虹云通的数据根目录：`~/Documents/CHFile`，Windows 放在用户目录下的 Documents。 */
export function defaultChfileRoot(platform = process.platform, home = homedir()) {
  if (platform === "win32") return join(process.env.USERPROFILE ?? home, "Documents", "CHFile")
  return join(home, "Documents", "CHFile")
}

export function resolveChfileRoot(configured: string) {
  const value = configured.trim()
  return value.length > 0 ? value : defaultChfileRoot()
}

export function accountOf(userName: string) {
  const value = userName.trim()
  if (value.length === 0) return ""
  return value.startsWith("cs") ? value : `cs${value}`
}

export interface LoginInfo {
  readonly userName: string
  readonly account: string
  readonly displayName: string
  readonly compId: string
  readonly autoLogin: boolean
}

interface LoginRow {
  readonly UserName: string | null
  readonly Name: string | null
  readonly CompId: string | null
  readonly ifAutoLogin: number | null
}

/** login.db 里记住的账号，按最近登录排序；表或文件缺失时返回空数组。 */
export function readLogins(root: string): LoginInfo[] {
  const rows = readRows<LoginRow>(
    join(root, "login.db"),
    "select UserName, name as Name, compId as CompId, ifAutoLogin from loginuser order by LoginTime desc",
  )
  return rows.flatMap((row) => {
    const userName = typeof row.UserName === "string" ? row.UserName.trim() : ""
    if (userName.length === 0) return []
    const account = accountOf(userName)
    return [
      {
        userName,
        account,
        displayName: typeof row.Name === "string" && row.Name.length > 0 ? row.Name : account,
        compId: typeof row.CompId === "string" ? row.CompId : "",
        autoLogin: row.ifAutoLogin === 1,
      },
    ]
  })
}

/** lastuser 是客户端最后使用的账号。 */
export function readLastUser(root: string) {
  const rows = readRows<{ UserName: string | null }>(join(root, "login.db"), "select UserName from lastuser limit 1")
  const value = rows[0]?.UserName
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

/** 按档案里的 account 找到登录信息；找不到时退到上次登录的账号。 */
export function pickLogin(logins: readonly LoginInfo[], account: string, lastUser: string | undefined) {
  const wanted = account.trim()
  if (wanted.length > 0) {
    const match = logins.find((item) => item.account === accountOf(wanted))
    if (match !== undefined) return match
  }
  const last = lastUser === undefined ? "" : accountOf(lastUser)
  return logins.find((item) => item.account === last) ?? logins[0]
}

/** 通讯录里这个人的部门；Department 表为空时用 Person.DptFullName 兜底。 */
export function readDepartment(root: string, account: string, userName: string) {
  const rows = readRows<{ DptFullName: string | null }>(
    join(root, account, "AddressBookDB.db"),
    `select DptFullName from Person
     where (?1 <> '' and (Account = ?1 or Account = ?2))
     limit 1`,
    [account, userName],
  )
  const value = rows[0]?.DptFullName
  return typeof value === "string" ? value.trim() : ""
}

export interface PersonRow {
  readonly account: string
  readonly name: string
  readonly department: string
  readonly remark: string
}

/** 按姓名、账号或部门搜索联系人，用于自动回复白名单。 */
export function searchPeople(root: string, account: string, query: string, limit: number): PersonRow[] {
  const needle = query.trim()
  const pattern = `%${needle.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  const rows = readRows<{
    Account: string | null
    Name: string | null
    Remark: string | null
    DptFullName: string | null
  }>(
    join(root, account, "AddressBookDB.db"),
    `select Account, Name, Remark, DptFullName from Person
     where Account is not null and Account <> ''
       and (Name like ?1 escape '\\'
         or Remark like ?1 escape '\\'
         or Account like ?1 escape '\\'
         or DptFullName like ?1 escape '\\')
     order by IsFriend desc, Name asc limit ?2`,
    [pattern, Math.min(Math.max(limit, 1), 50)],
  )
  return rows.flatMap((row) => {
    const accountValue = typeof row.Account === "string" ? row.Account.trim() : ""
    if (accountValue.length === 0) return []
    return [
      {
        account: accountValue,
        name: typeof row.Name === "string" && row.Name.length > 0 ? row.Name : accountValue,
        department: typeof row.DptFullName === "string" ? row.DptFullName : "",
        remark: typeof row.Remark === "string" ? row.Remark : "",
      },
    ]
  })
}

/** 知识库条目数与最近更新时间，读 index.json 的头部。 */
export async function readKnowledge(dataDir: string) {
  const parsed = await readJson(knowledgeIndexPath(dataDir))
  if (!isRecord(parsed)) return { entries: 0, updatedAt: "" }
  const entries = Array.isArray(parsed.entries) ? parsed.entries.length : 0
  return { entries, updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "" }
}

export async function readStyle(dataDir: string, account: string): Promise<StyleProfile> {
  const decoded = decodeStyle(await readJson(stylePath(dataDir, account)))
  return Option.isSome(decoded) ? decoded.value : emptyProfile()
}

export async function saveStyle(dataDir: string, account: string, profile: StyleProfile) {
  const path = stylePath(dataDir, account)
  await mkdir(join(dataDir, "hyt", "style"), { recursive: true })
  await writeFile(`${path}.tmp`, JSON.stringify(profile, null, 2) + "\n", "utf8")
  await rename(`${path}.tmp`, path)
}

/**
 * 重新提炼风格：取该账号最近发出的文本，按本地的预过滤与合并规则重算一遍。
 * 这是纯统计，不调用模型；只使用最近 500 条，避免一次性扫完整个消息库。
 */
export async function restyle(dataDir: string, root: string, account: string, userName: string) {
  const rows = readRows<{ Msg: string | null }>(
    join(root, account, "chatmsg.db"),
    "select Msg from chatmsg where MsgType = 1 and Sender = ?1 and Msg is not null order by Id desc limit 500",
    [userName],
  )
  const samples = rows.flatMap((row) => (typeof row.Msg === "string" ? [{ text: row.Msg }] : []))
  const texts = filterSamples(samples)
  const profile = mergeSamples(emptyProfile(), texts, new Date().toISOString())
  await saveStyle(dataDir, account, profile)
  return { summary: describeProfile(profile), updatedAt: profile.updatedAt }
}

/** 清空学习数据：知识库目录与风格档案，保留档案与设置。 */
export async function clearLearning(dataDir: string, account: string) {
  const before = await readKnowledge(dataDir)
  await rm(join(dataDir, "hyt", "knowledge"), { recursive: true, force: true })
  if (account.length > 0) await rm(stylePath(dataDir, account), { force: true })
  return { entries: before.entries }
}

export interface TrialLine {
  readonly sender: string
  readonly text: string
  readonly at: number
}

/** 最近若干条消息的本地统计，用于引导里的试跑预览。 */
export function readTrial(root: string, account: string, limit = 20) {
  const rows = readRows<{
    SenderNick: string | null
    Sender: string | null
    Msg: string | null
    CreatedTime: number | string | null
    SessionId: string | null
  }>(
    join(root, account, "chatmsg.db"),
    `select SenderNick, Sender, Msg, CreatedTime, SessionId from chatmsg
     where Msg is not null and Msg <> ''
     order by Id desc limit ?1`,
    [Math.min(Math.max(limit, 1), 50)],
  )
  const sessions = new Set<string>()
  const lines: TrialLine[] = rows.flatMap((row) => {
    if (typeof row.SessionId === "string" && row.SessionId.length > 0) sessions.add(row.SessionId)
    const text = typeof row.Msg === "string" ? row.Msg.trim() : ""
    if (text.length === 0) return []
    return [
      {
        sender: firstText(row.SenderNick, row.Sender, "未知"),
        text: text.length > 60 ? `${text.slice(0, 60)}…` : text,
        at: typeof row.CreatedTime === "number" ? row.CreatedTime : Number(row.CreatedTime ?? 0),
      },
    ]
  })
  return { messages: lines.length, sessions: sessions.size, lines }
}

function firstText(primary: string | null, secondary: string | null, fallback: string) {
  if (typeof primary === "string" && primary.trim().length > 0) return primary.trim()
  if (typeof secondary === "string" && secondary.trim().length > 0) return secondary.trim()
  return fallback
}

export interface BridgeEndpoint {
  readonly host: string
  readonly port: number
}

export type BridgeStateName = "stopped" | "connecting" | "ready" | "restarting" | "failed"

export interface BridgeStatus {
  readonly state: BridgeStateName
  readonly endpoint?: BridgeEndpoint
  readonly restarts: number
  readonly lastError?: string
  readonly ownProcess: boolean
}

export function stoppedBridge(): BridgeStatus {
  return { state: "stopped", restarts: 0, ownProcess: false }
}

/** bridge 把端口写进 `<CHFile>/Config/bridge.json`。 */
export async function readEndpoint(root: string): Promise<BridgeEndpoint | undefined> {
  const parsed = await readJson(join(root, "Config", "bridge.json"))
  if (!isRecord(parsed)) return undefined
  const host = typeof parsed.host === "string" ? parsed.host : "127.0.0.1"
  const port = typeof parsed.port === "number" ? parsed.port : Number(parsed.port)
  if (!Number.isFinite(port) || port <= 0) return undefined
  return { host, port }
}

/**
 * bridge 的生命周期。只管理自己拉起的子进程，用户手动启动的实例保持运行。
 * 用 Node 的 net 与 setTimeout，不复用 `src/bridge/supervisor.ts`（那里用了 `Bun.sleep`）。
 */
export function createBridge(root: string) {
  let current: BridgeStatus = stoppedBridge()
  let child: ChildProcess | undefined

  return {
    status: () => current,
    async start(executable: string): Promise<BridgeStatus> {
      current = { state: "connecting", restarts: 0, ownProcess: child !== undefined }
      const before = await readEndpoint(root)
      const existing = before === undefined ? undefined : await probe(before)
      if (existing !== undefined) {
        current = { state: "ready", endpoint: existing, restarts: 0, ownProcess: child !== undefined }
        return current
      }
      const exe = executable.trim()
      if (exe.length === 0) {
        current = {
          state: "failed",
          restarts: 0,
          lastError: "没有配置 bridge 可执行文件路径，也没有发现运行中的实例。",
          ownProcess: child !== undefined,
        }
        return current
      }
      if (!existsSync(exe)) {
        current = { state: "failed", restarts: 0, lastError: `bridge 可执行文件不存在：${exe}`, ownProcess: false }
        return current
      }
      child = spawn(exe, [], { stdio: "ignore", detached: false })
      child.once("exit", () => {
        child = undefined
      })
      const endpoint = await waitForEndpoint(root, before)
      if (endpoint === undefined) {
        current = {
          state: "failed",
          restarts: 0,
          lastError: "bridge 已启动，但等待 Config/bridge.json 超时。",
          ownProcess: child !== undefined,
        }
        return current
      }
      const reachable = await probe(endpoint)
      current =
        reachable === undefined
          ? { state: "failed", restarts: 0, lastError: `无法连接 bridge：${endpoint.host}:${endpoint.port}`, ownProcess: true }
          : { state: "ready", endpoint: reachable, restarts: 0, ownProcess: true }
      return current
    },
    async stop(): Promise<BridgeStatus> {
      if (child !== undefined) {
        child.kill()
        child = undefined
      }
      current = { state: "stopped", restarts: 0, ownProcess: false }
      return current
    },
    dispose() {
      if (child !== undefined) child.kill()
      child = undefined
    },
  }
}

async function probe(endpoint: BridgeEndpoint, timeoutMs = 800) {
  return new Promise<BridgeEndpoint | undefined>((resolve) => {
    const socket = createConnection({ host: endpoint.host, port: endpoint.port })
    const done = (value: BridgeEndpoint | undefined) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeoutMs, () => done(undefined))
    socket.once("connect", () => done(endpoint))
    socket.once("error", () => done(undefined))
  })
}

/** 等 bridge 写出新实例的发现文件：pid 或 startedAt 与上次不同才算新实例。 */
async function waitForEndpoint(root: string, before: BridgeEndpoint | undefined) {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    const endpoint = await readEndpoint(root)
    if (endpoint !== undefined && (before === undefined || endpoint.port !== before.port)) return endpoint
    await sleep(250)
  }
  return undefined
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 只读打开一张客户端库；文件缺失、表不存在或列不匹配都当作空结果，界面据此显示「未登录」。 */
function readRows<T>(path: string, sql: string, params: readonly (string | number)[] = []): T[] {
  if (!existsSync(path)) return []
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as T[]
  } catch {
    return []
  } finally {
    db.close()
  }
}
