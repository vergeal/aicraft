import { execFile } from "node:child_process"
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto"
import { copyFile, mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import type { Session } from "electron"
import { cookieDomainAllowed } from "../src/logic.js"

const run = promisify(execFile)

export interface ChromeCookie {
  readonly host: string
  readonly name: string
  readonly value: string
  readonly path: string
  readonly secure: boolean
  readonly httpOnly: boolean
  /** Unix 秒；0 表示会话 cookie。 */
  readonly expires: number
  readonly sameSite: "unspecified" | "no_restriction" | "lax" | "strict"
}

export interface ImportOutcome {
  readonly ok: boolean
  readonly imported: number
  readonly profiles: string[]
  readonly reason?: string
}

/** Chrome 的用户数据目录：两套平台各一个，未写死任何绝对路径。 */
export function chromeRoot() {
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "Google", "Chrome")
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Google", "Chrome", "User Data")
  return undefined
}

/** Chrome 的 profile 目录：`Default` 与 `Profile N`，以及 guest。 */
export async function listChromeProfiles() {
  const root = chromeRoot()
  if (!root) return { root: "", profiles: [] as string[] }
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const profiles = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name === "Default" || name === "Guest Profile" || /^Profile \d+$/.test(name))
      .sort()
    return { root, profiles }
  } catch {
    return { root, profiles: [] as string[] }
  }
}

function cookiePath(root: string, profile: string) {
  return join(root, profile, "Network", "Cookies")
}

/**
 * 从本机 Chrome 导入 `.changhong.com` 的 cookie。只返回结果计数与失败原因，任何路径都不记录 cookie 值。
 * 读取 Cookie 库前先拷贝，避免锁住正在运行的 Chrome。
 */
export async function importChromeCookies(input: {
  readonly session: Session
  readonly chromeProfile?: string
}): Promise<ImportOutcome> {
  const { root, profiles } = await listChromeProfiles()
  if (profiles.length === 0) return { ok: false, imported: 0, profiles, reason: "没有找到本机 Chrome 的用户数据目录。" }
  const profile = input.chromeProfile && profiles.includes(input.chromeProfile) ? input.chromeProfile : profiles[0]!
  const source = cookiePath(root, profile)
  const directory = await mkdtemp(join(tmpdir(), "itsm-cookies-"))
  try {
    const database = join(directory, "Cookies")
    await copyFile(source, database)
    const rows = await readRows(database)
    const decrypt = await decryptor()
    let imported = 0
    for (const row of rows) {
      if (!cookieDomainAllowed(row.host)) continue
      let value: string
      try {
        value = decrypt(row.encrypted, row.host)
      } catch {
        continue
      }
      if (value.length === 0) continue
      await input.session.cookies.set({
        url: `${row.secure ? "https" : "http"}://${row.host.replace(/^\./, "")}${row.path || "/"}`,
        name: row.name,
        value,
        domain: row.host,
        path: row.path || "/",
        secure: row.secure,
        httpOnly: row.httpOnly,
        ...(row.expires > 0 ? { expirationDate: row.expires } : {}),
        sameSite: row.sameSite,
      })
      imported += 1
    }
    if (imported === 0)
      return {
        ok: false,
        imported: 0,
        profiles,
        reason: `读到 ${rows.length} 条 cookie，但没有可用且属于 changhong.com 的条目。请在插件里手动登录一次。`,
      }
    return { ok: true, imported, profiles }
  } catch (cause) {
    return { ok: false, imported: 0, profiles, reason: reasonOf(cause) }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

interface StoredRow {
  readonly host: string
  readonly name: string
  readonly path: string
  readonly secure: boolean
  readonly httpOnly: boolean
  readonly expires: number
  readonly sameSite: ChromeCookie["sameSite"]
  readonly encrypted: Buffer
}

const SQL =
  "select host_key as host, name, path, is_secure as secure, is_httponly as httpOnly, expires_utc as expires, hex(encrypted_value) as encrypted, same_site as sameSite from cookies"

/** 通过系统 sqlite3 读取 Cookie 库；Chrome 运行时数据库是锁住的，所以读的是拷贝。 */
async function readRows(database: string): Promise<StoredRow[]> {
  const { stdout } = await run("sqlite3", ["-json", database, SQL], { maxBuffer: 64 * 1024 * 1024, timeout: 10_000 })
  const text = stdout.trim()
  if (text.length === 0) return []
  const rows = JSON.parse(text) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    host: String(row.host ?? ""),
    name: String(row.name ?? ""),
    path: String(row.path ?? "/"),
    secure: Number(row.secure) === 1,
    httpOnly: Number(row.httpOnly) === 1,
    expires: webkitToUnix(Number(row.expires ?? 0)),
    sameSite: sameSite(Number(row.sameSite ?? -1)),
    encrypted: Buffer.from(String(row.encrypted ?? ""), "hex"),
  }))
}

function sameSite(value: number): ChromeCookie["sameSite"] {
  if (value === 0) return "no_restriction"
  if (value === 1) return "lax"
  if (value === 2) return "strict"
  return "unspecified"
}

/** WebKit 时间（1601 年起的微秒）转 Unix 秒。 */
function webkitToUnix(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.max(0, Math.round(value / 1_000_000 - 11_644_473_600))
}

type Decrypt = (encrypted: Buffer, host: string) => string

async function decryptor(): Promise<Decrypt> {
  if (process.platform === "darwin") return macDecryptor()
  if (process.platform === "win32") return windowsDecryptor()
  throw new Error("只支持 macOS 与 Windows 上的 Chrome 登录态导入。")
}

/** macOS：Keychain 的 `Chrome Safe Storage` 口令 + PBKDF2-SHA1（1003 轮），v10 是 AES-128-CBC。 */
async function macDecryptor(): Promise<Decrypt> {
  const { stdout } = await run("security", ["find-generic-password", "-w", "-s", "Chrome Safe Storage"], { timeout: 10_000 })
  const password = stdout.trim()
  if (password.length === 0) throw new Error("Keychain 里没有 Chrome Safe Storage，无法解密 Chrome 的 cookie。")
  const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1")
  const iv = Buffer.alloc(16, " ")
  return (encrypted, host) => {
    const prefix = encrypted.subarray(0, 3).toString("utf8")
    if (prefix !== "v10" && prefix !== "v11") throw new Error("不是 v10 cookie")
    const decipher = createDecipheriv("aes-128-cbc", key, iv)
    const plain = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()])
    return cookieText(plain, host)
  }
}

/** Chrome 24+ 在明文前放了 32 字节的 host hash，匹配时去掉。 */
function cookieText(plain: Buffer, host: string) {
  if (plain.byteLength > 32) {
    const hash = createHash("sha256").update(host).digest()
    if (hash.equals(plain.subarray(0, 32))) return plain.subarray(32).toString("utf8")
  }
  return plain.toString("utf8")
}

/**
 * Windows：Local State 里的密钥本身用 DPAPI 保护，用 PowerShell 调 .NET 解密；cookie 是 v10/v20 的
 * AES-256-GCM。
 */
async function windowsDecryptor(): Promise<Decrypt> {
  const root = chromeRoot()
  if (!root) throw new Error("找不到 Chrome 的用户数据目录。")
  const localState = JSON.parse(await readFile(join(root, "Local State"), "utf8")) as {
    os_crypt?: { encrypted_key?: string }
  }
  const encoded = localState.os_crypt?.encrypted_key
  if (!encoded) throw new Error("Chrome 的 Local State 里没有 cookie 密钥。")
  const protectedKey = Buffer.from(encoded, "base64").subarray(5)
  const key = Buffer.from((await dpapi(protectedKey)).toString("base64"), "base64")
  const gcm = key.byteLength === 32
  const legacy = pbkdf2Sync("", "saltysalt", 1, 16, "sha1")
  return (encrypted, host) => {
    const prefix = encrypted.subarray(0, 3).toString("utf8")
    const body = encrypted.subarray(3)
    if (prefix === "v10" || prefix === "v20") {
      if (!gcm) throw new Error("cookie 密钥长度不支持 AES-GCM。")
      const nonce = body.subarray(0, 12)
      const tag = body.subarray(body.byteLength - 16)
      const ciphertext = body.subarray(12, body.byteLength - 16)
      const decipher = createDecipheriv("aes-256-gcm", key, nonce)
      decipher.setAuthTag(tag)
      return cookieText(Buffer.concat([decipher.update(ciphertext), decipher.final()]), host)
    }
    const iv = Buffer.alloc(16, " ")
    const decipher = createDecipheriv("aes-128-cbc", legacy, iv)
    return cookieText(Buffer.concat([decipher.update(body), decipher.final()]), host)
  }
}

/** 调 .NET 的 DPAPI（当前用户范围）解开一段二进制。返回解密后的字节。 */
async function dpapi(input: Buffer) {
  const script = [
    "$ErrorActionPreference='Stop'",
    `$bytes=[Convert]::FromBase64String('${input.toString("base64")}')`,
    "$plain=[System.Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Convert]::ToBase64String($plain)",
  ].join(";")
  const { stdout } = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 15_000 })
  return Buffer.from(stdout.trim(), "base64")
}

function reasonOf(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/ENOENT/.test(message)) return "本机没有 sqlite3 命令，读不到 Chrome 的 Cookie 库。请在插件里手动登录一次。"
  return message
}

