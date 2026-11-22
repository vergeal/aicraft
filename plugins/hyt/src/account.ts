import { Database } from "bun:sqlite"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * 虹云通的数据目录：`~/Documents/CHFile`（Windows 用用户目录下的 Documents），里面是 login.db 与每个账号一个目录。
 * 账号目录名是 `cs` + loginuser.UserName，例如 UserName=T1002173 对应 csT1002173。
 */

export interface LoginInfo {
  readonly userName: string
  readonly account: string
  readonly displayName: string
  readonly compId: string
  readonly autoLogin: boolean
}

export interface Credentials extends LoginInfo {
  /** base64 明文解码后的密码。只在进程内交给 bridge 登录用，不写日志、不落盘。 */
  readonly password: string
}

export function defaultChfileRoot(input: { platform?: string; home?: string } = {}) {
  const platform = input.platform ?? process.platform
  const home = input.home ?? homedir()
  if (platform === "win32") return join(process.env.USERPROFILE ?? home, "Documents", "CHFile")
  return join(home, "Documents", "CHFile")
}

/** 配置里给了目录就用它，否则用平台默认位置。 */
export function resolveChfileRoot(configured: string, input: { platform?: string; home?: string } = {}) {
  return configured.trim().length > 0 ? configured.trim() : defaultChfileRoot(input)
}

export function accountOf(userName: string) {
  const value = userName.trim()
  if (value.length === 0) return ""
  return value.startsWith("cs") ? value : `cs${value}`
}

export function accountDirectory(root: string, account: string) {
  return join(root, account)
}

/**
 * login.db 里记住的账号，按最近登录排序。表或文件不存在时返回空数组，让调用方给出「未登录」的提示。
 * Password 不进入这个列表。
 */
export function listLogins(root: string): LoginInfo[] {
  const rows = readRows<LoginRow>(
    join(root, "login.db"),
    "select UserName, name, compId, ifAutoLogin from loginuser order by LoginTime desc",
  )
  return rows.flatMap((row) => {
    const userName = typeof row.UserName === "string" ? row.UserName.trim() : ""
    if (userName.length === 0) return []
    const account = accountOf(userName)
    return [
      {
        userName,
        account,
        displayName: typeof row.name === "string" && row.name.length > 0 ? row.name : account,
        compId: typeof row.compId === "string" ? row.compId : "",
        autoLogin: row.ifAutoLogin === 1,
      },
    ]
  })
}

/** lastuser 是客户端最后使用的账号，账号目录以它为准。 */
export function readLastUser(root: string): string | undefined {
  const rows = readRows<{ UserName: string | null }>(join(root, "login.db"), "select UserName from lastuser limit 1")
  const value = rows[0]?.UserName
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

/**
 * 读取指定账号的登录信息，含解码后的密码。configured 为空时用 lastuser，再退到 loginuser 的最近一条。
 * 密码只返回给 bridge 的 auth.login，任何日志都不要打印它。
 */
export function readCredentials(root: string, configured = ""): Credentials | undefined {
  const wanted = configured.trim().length > 0 ? configured.trim() : (readLastUser(root) ?? "")
  const rows = readRows<CredentialsRow>(
    join(root, "login.db"),
    "select UserName, Password, name, compId, ifAutoLogin from loginuser order by LoginTime desc",
  )
  const row = wanted.length > 0 ? rows.find((item) => accountOf(item.UserName ?? "") === accountOf(wanted)) : rows[0]
  if (!row || typeof row.UserName !== "string") return undefined
  const password = decodePassword(row.Password)
  if (password === undefined) return undefined
  const account = accountOf(row.UserName)
  return {
    userName: row.UserName.trim(),
    account,
    displayName: typeof row.name === "string" && row.name.length > 0 ? row.name : account,
    compId: typeof row.compId === "string" ? row.compId : "",
    autoLogin: row.ifAutoLogin === 1,
    password,
  }
}

/** 客户端把密码按 base64 明文存在 loginuser.Password；解不出来就当作没有凭据，交给用户重新登录。 */
export function decodePassword(value: string | null | undefined) {
  if (typeof value !== "string" || value.trim().length === 0) return undefined
  const decoded = Buffer.from(value.trim(), "base64").toString("utf8")
  if (decoded.length === 0) return undefined
  // 解出来带控制字符说明不是 base64 文本，按坏数据处理。
  if (/[\u0000-\u0008\u000e-\u001f]/.test(decoded)) return undefined
  return decoded
}

interface LoginRow {
  readonly UserName: string | null
  readonly name: string | null
  readonly compId: string | null
  readonly ifAutoLogin: number | null
}

interface CredentialsRow extends LoginRow {
  readonly Password: string | null
}

/** 只读打开一张客户端库，只为读一次元数据；文件缺失或表不存在都当作空结果。 */
function readRows<T>(path: string, sql: string): T[] {
  if (!existsSync(path)) return []
  const db = new Database(path, { readonly: true })
  try {
    return db.query<T, []>(sql).all()
  } catch {
    return []
  } finally {
    db.close()
  }
}
