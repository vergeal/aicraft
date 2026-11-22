import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * 群名解析。
 *
 * 本地消息库只有已退出群的 keepgroup 名字，在线群名要问客户端，所以按新版客户端的顺序退让：
 * 手动映射（`Config/newhyt.ini` 的 `[Groups]`）→ 桥接缓存（`Config/newhyt-groups.json`）→
 * keepgroup → 用群成员昵称拼出的默认名（与客户端自己生成的「刘程、罗添胜」一致）。
 * 两个配置文件都是可手工编辑的纯文本，读不到就当没有。
 */
export interface GroupNameInput {
  /** 虹云通数据根目录；只读它下面的 `Config`。空串表示没有可读的配置目录。 */
  readonly root: string
  readonly keepgroup: ReadonlyMap<string, string>
  /** 会话 id → 群成员昵称，按发言条数排序。 */
  readonly members: ReadonlyMap<string, readonly string[]>
}

/** 客户端拼默认名时最多取三个成员。 */
const NAME_LIMIT = 3

export function resolveGroupNames(input: GroupNameInput) {
  const manual = readManualNames(input.root)
  const cached = readCachedNames(input.root)
  const ids = new Set([...manual.keys(), ...cached.keys(), ...input.keepgroup.keys(), ...input.members.keys()])
  const names = new Map<string, string>()
  for (const id of ids) {
    const name = manual.get(id) ?? cached.get(id) ?? input.keepgroup.get(id) ?? memberName(input.members.get(id))
    if (name.length > 0) names.set(id, name)
  }
  return names
}

/** 默认群名：去重后取前三个昵称，用顿号连接；没有昵称时给空串。 */
function memberName(members: readonly string[] | undefined) {
  const names = (members ?? []).map((name) => name.trim()).filter((name) => name.length > 0)
  return [...new Set(names)].slice(0, NAME_LIMIT).join("、")
}

/** `newhyt.ini` 的 `[Groups]` 段：群 ID = 群名，用户自己起的名字优先。 */
function readManualNames(root: string) {
  const map = new Map<string, string>()
  let inGroups = false
  for (const raw of readConfigText(root, "newhyt.ini").split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith("[") && line.endsWith("]")) {
      inGroups = line.slice(1, -1).trim().toLowerCase() === "groups"
      continue
    }
    if (!inGroups || line.length === 0 || line.startsWith(";") || line.startsWith("#")) continue
    const at = line.indexOf("=")
    if (at <= 0) continue
    const id = line.slice(0, at).trim()
    const name = line.slice(at + 1).trim()
    if (id.length > 0 && name.length > 0) map.set(id, name)
  }
  return map
}

/** 桥接进程写出的群列表：数组，或 `{ groups: [...] }`。 */
function readCachedNames(root: string) {
  const map = new Map<string, string>()
  const parsed = readConfigJson(root, "newhyt-groups.json")
  const list = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.groups) ? parsed.groups : []
  for (const item of list) {
    if (!isRecord(item)) continue
    const id = str(item.groupId)
    const name = str(item.name)
    if (id.length > 0 && name.length > 0) map.set(id, name)
  }
  return map
}

function readConfigText(root: string, file: string) {
  if (root.length === 0) return ""
  try {
    return readFileSync(join(root, "Config", file), "utf8")
  } catch {
    return ""
  }
}

function readConfigJson(root: string, file: string) {
  const text = readConfigText(root, file)
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function str(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return String(value)
  return ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
