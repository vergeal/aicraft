import { Option, Schema } from "effect"
import { readFileSync } from "node:fs"
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * 插件自己的登录凭据：`<plugin data>/hyt/credentials.json`。
 *
 * 存在这里的原因是不再依赖虹云通客户端：客户端把账号密码放在 `login.db`，
 * 没装或没登录过客户端时就拿不到凭据，消息通道也就登不上。
 *
 * 密码按 base64 存在本地文件里，权限 0600。强度与客户端 `login.db` 同等（那边也是 base64），
 * 不是加密；只在本机、只交给本地桥接的 `auth.login`，不写日志、不进档案、不外发。
 */

const Stored = Schema.Struct({
  userName: Schema.String,
  password: Schema.String,
  savedAt: Schema.String,
  account: Schema.optional(Schema.String),
  displayName: Schema.optional(Schema.String),
  comId: Schema.optional(Schema.String),
  env: Schema.optional(Schema.String),
})

export interface SavedCredentials {
  /** 登录名，不带 `cs` 前缀。 */
  readonly userName: string
  /** `cs` + userName，用于拼账号目录。 */
  readonly account: string
  readonly displayName: string
  readonly comId: string
  /** `prod` 或 `test`。 */
  readonly env: string
  /** base64 解码后的明文密码。 */
  readonly password: string
  readonly savedAt: string
}

export interface CredentialsInput {
  readonly userName: string
  readonly password: string
  readonly account?: string
  readonly displayName?: string
  readonly comId?: string
  readonly env?: string
}

export function credentialsPath(dataDir: string) {
  return join(dataDir, "hyt", "credentials.json")
}

/** 账号目录名与客户端一致：`cs` + userName。 */
function accountOf(userName: string) {
  const value = userName.trim()
  if (value.length === 0) return ""
  return value.startsWith("cs") ? value : `cs${value}`
}

const decodeStored = Schema.decodeUnknownOption(Stored)

/** 读插件保存的凭据；文件缺失、损坏或密码解不出来都当作没有。 */
export async function readSavedCredentials(dataDir: string): Promise<SavedCredentials | undefined> {
  const raw = await readFile(credentialsPath(dataDir), "utf8").catch(() => undefined)
  return parseSaved(raw)
}

/**
 * 同步版本：GUI 主进程的消息通道在同步回调里取凭据（发送时立刻要拿到）。
 * 只读一个小 JSON，开销可以忽略。
 */
export function readSavedCredentialsSync(dataDir: string): SavedCredentials | undefined {
  let raw: string | undefined
  try {
    raw = readFileSync(credentialsPath(dataDir), "utf8")
  } catch {
    return undefined
  }
  return parseSaved(raw)
}

function parseSaved(raw: string | undefined): SavedCredentials | undefined {
  if (raw === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
  const decoded = decodeStored(parsed)
  if (Option.isNone(decoded)) return undefined
  const password = decodePassword(decoded.value.password)
  if (password === undefined) return undefined
  const userName = decoded.value.userName.trim()
  if (userName.length === 0) return undefined
  const account = decoded.value.account?.trim() || accountOf(userName)
  return {
    userName,
    account,
    displayName: decoded.value.displayName?.trim() || account,
    comId: decoded.value.comId?.trim() ?? "",
    env: decoded.value.env?.trim() || "prod",
    password,
    savedAt: decoded.value.savedAt,
  }
}

/** 只读元数据：界面用它显示「已保存哪个账号」，拿不到密码。 */
export async function describeSavedCredentials(dataDir: string) {
  const saved = await readSavedCredentials(dataDir)
  if (saved === undefined) return undefined
  return {
    userName: saved.userName,
    account: saved.account,
    displayName: saved.displayName,
    env: saved.env,
    savedAt: saved.savedAt,
  }
}

/** 原子写入：先写临时文件再改名，避免登录过程中别的进程读到半截 JSON。 */
export async function saveSavedCredentials(
  dataDir: string,
  input: CredentialsInput,
  now = new Date().toISOString(),
): Promise<SavedCredentials> {
  const userName = input.userName.trim()
  if (userName.length === 0) throw new Error("缺少登录账号。")
  if (input.password.length === 0) throw new Error("缺少登录密码。")
  const account = input.account?.trim() || accountOf(userName)
  const value = {
    userName,
    password: Buffer.from(input.password, "utf8").toString("base64"),
    account,
    displayName: input.displayName?.trim() || account,
    comId: input.comId?.trim() ?? "",
    env: input.env?.trim() || "prod",
    savedAt: now,
  }
  const path = credentialsPath(dataDir)
  await mkdir(join(dataDir, "hyt"), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", mode: 0o600 })
  await rename(temporary, path)
  // 覆盖已存在的文件时 rename 会保留旧文件的权限，这里再收紧一次。
  await chmod(path, 0o600).catch(() => undefined)
  return {
    userName,
    account,
    displayName: value.displayName,
    comId: value.comId,
    env: value.env,
    password: input.password,
    savedAt: now,
  }
}

export async function clearSavedCredentials(dataDir: string) {
  await rm(credentialsPath(dataDir), { force: true })
}

/** 与客户端 login.db 里的存法一致：base64 文本；解出控制字符就当作坏数据。 */
function decodePassword(value: string) {
  const text = value.trim()
  if (text.length === 0) return undefined
  const decoded = Buffer.from(text, "base64").toString("utf8")
  if (decoded.length === 0) return undefined
  if (/[\u0000-\u0008\u000e-\u001f]/.test(decoded)) return undefined
  return decoded
}
