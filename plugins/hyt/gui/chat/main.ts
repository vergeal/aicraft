import type { IpcImpl, IpcProvider, MainContext } from "@opencode/plugin/gui/main"
import { Schema } from "effect"
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { decodeMergeText } from "../../src/chat/merge.js"
import type { MergeItem } from "../../src/chat/merge.js"
import * as Data from "../shared/data.js"
import { ChatIpc } from "./contract.js"
import type { AvatarEntry, ChatState, DraftRow, MergeItemRow, MessageRow, SearchHit, SendState } from "./contract.js"
import * as Db from "./db.js"

/**
 * 聊天主界面的主进程入口。
 *
 * 窗口不读盘：会话、消息、草稿、通讯录与白名单都在这里算好，作为一个 state 推给每个窗口；
 * 轮询由窗口驱动（可见时每 4 秒 `refresh` 一次），主进程只负责读与合并。
 */

const MIME: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
}

const MAX_MEDIA_BYTES = 24 * 1024 * 1024

function emptyState(phase: ChatState["status"]["phase"]): ChatState {
  return {
    status: {
      phase,
      detail: "",
      account: "",
      displayName: "",
      bridge: "missing",
      autopilot: false,
      whitelist: 0,
    },
    sessions: [],
    selected: "",
    messages: [],
    hasMore: false,
    unread: 0,
    search: { query: "", hits: [] },
    drafts: [],
    members: [],
    send: { enabled: false, reason: "" },
    knowledge: [],
  }
}

export function provideChatIpc(ctx: MainContext): IpcProvider<typeof ChatIpc.spec> {
  const dataDir = Data.resolveDataDir()
  const settings = ctx.storage.store("gui", {
    schema: Schema.Struct({ chfileRoot: Schema.String, bridgePath: Schema.String }),
    initial: { chfileRoot: "", bridgePath: "" },
  })

  let current = emptyState("loading")
  let selected = ""
  let messages: MessageRow[] = []
  let hasMore = false
  let markedRead = new Set<string>()
  let searchState = { query: "", hits: [] as SearchHit[] }
  let provider: IpcProvider<typeof ChatIpc.spec> | undefined

  // 头像按「路径 + mtime」缓存：同一张图跨窗口、跨 4 秒轮询只读一次盘。
  const avatarCache = new Map<string, { readonly stamp: number; readonly dataUrl: string }>()

  const report = () => provider?.changed()

  const rootOf = () => Data.resolveChfileRoot(settings.value.chfileRoot)

  const readConfigWhitelist = () => {
    const parsed = readJson(join(dataDir, "config.json"))
    const list = isRecord(parsed) ? parsed.whitelist : undefined
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : []
  }

  /** 两个来源的白名单取并集：档案里的是用户在本机选的，config.json 里的是安装清单或项目配置。 */
  const mergedWhitelist = (profile: { capabilities: { autopilot: { whitelist: readonly string[] } } }) => {
    const fromProfile = profile.capabilities.autopilot.whitelist
    const fromConfig = readConfigWhitelist()
    return Array.from(new Set([...fromProfile, ...fromConfig].map((item) => item.trim()).filter(Boolean)))
  }

  const sendState = (whitelist: readonly string[], bridge: "ready" | "missing", selectedId: string): SendState => {
    if (whitelist.length === 0) return { enabled: false, reason: "whitelist-empty" }
    if (selectedId.length === 0) return { enabled: false, reason: "not-allowed" }
    if (!whitelist.includes(selectedId)) return { enabled: false, reason: "not-allowed" }
    if (bridge === "missing") return { enabled: false, reason: "bridge-missing" }
    return { enabled: true, reason: "" }
  }

  const load = async (mergeMessages: boolean): Promise<ChatState> => {
    const root = rootOf()
    try {
      const logins = Data.readLogins(root)
      const lastUser = Data.readLastUser(root)
      const profile = await Data.readProfile(dataDir, "")
      const login = Data.pickLogin(logins, profile.account, lastUser)
      if (login === undefined) {
        const state = emptyState("no-account")
        current = { ...state, status: { ...state.status, detail: root } }
        return current
      }
      if (!Db.hasChatData(root, login.account)) {
        const state = emptyState("no-data")
        current = {
          ...state,
          status: { ...state.status, account: login.account, displayName: login.displayName, detail: join(root, login.account) },
        }
        return current
      }

      const sessions = Db.readSessions(root, login.account, [...markedRead])
      const chosen = sessions.find((item) => item.id === selected) ?? sessions[0]
      selected = chosen?.id ?? ""
      const latest = Db.readMessages(root, login.account, selected, undefined)
      if (mergeMessages && messages.length > 0 && latest.messages.length > 0) {
        const oldestLoaded = latest.messages[0]?.id ?? Number.MAX_SAFE_INTEGER
        const kept = messages.filter((message) => message.id < oldestLoaded)
        messages = [...kept, ...latest.messages]
        hasMore = latest.hasMore || kept.length > 0
      } else {
        messages = latest.messages
        hasMore = latest.hasMore
      }

      const whitelist = mergedWhitelist(profile)
      const bridge = Db.bridgeRunning(root) ? "ready" : "missing"
      const drafts = readDrafts(dataDir, selected)
      const unread = sessions.reduce((total, item) => total + item.unread, 0)
      current = {
        status: {
          phase: "ready",
          detail: join(root, login.account),
          account: login.account,
          displayName: login.displayName,
          bridge,
          autopilot: profile.capabilities.autopilot.enabled,
          whitelist: whitelist.length,
        },
        sessions,
        selected,
        messages,
        hasMore,
        unread,
        search: searchState.query.length === 0 ? { query: "", hits: [] } : searchState,
        drafts,
        members: Db.readMembers(root, login.account),
        send: sendState(whitelist, bridge, selected),
        knowledge: [],
      }
      return current
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      current = {
        ...emptyState("error"),
        status: { ...emptyState("error").status, detail },
      }
      return current
    }
  }

  const readDrafts = (dir: string, sessionId: string): DraftRow[] => {
    const parsed = readJson(join(dir, "hyt", "drafts.json"))
    const drafts = isRecord(parsed) && Array.isArray(parsed.drafts) ? parsed.drafts : []
    return drafts.flatMap((value, index) => {
      if (!isRecord(value)) return []
      const text = str(value.text)
      const target = str(value.sessionId)
      if (text.length === 0 || target !== sessionId) return []
      return [
        {
          id: str(value.id) || `${target}:${index}`,
          sessionId: target,
          text,
          createdAt: createdAtOf(value.createdAt),
          note: str(value.note),
        },
      ]
    })
  }

  const impl: IpcImpl<typeof ChatIpc.spec> = {
    state: () => current,

    async refresh() {
      await load(true)
      report()
    },

    async selectSession(input) {
      selected = input.sessionId
      messages = []
      hasMore = false
      searchState = { query: "", hits: [] }
      await load(false)
      report()
    },

    async loadMore() {
      const account = current.status.account
      if (account.length === 0 || selected.length === 0 || !hasMore) return
      const before = messages[0]?.id
      if (before === undefined) return
      const page = Db.readMessages(rootOf(), account, selected, before)
      messages = [...page.messages, ...messages]
      hasMore = page.hasMore
      current = { ...current, messages, hasMore }
      report()
    },

    async search(input) {
      const query = input.query.trim()
      const account = current.status.account
      const names = new Map(current.sessions.map((item) => [item.id, item.name]))
      const hits =
        query.length === 0 || account.length === 0
          ? []
          : Db.searchMessages(rootOf(), account, query).map((hit) => ({
              sessionId: hit.sessionId,
              sessionName: names.get(hit.sessionId) ?? hit.sessionId,
              message: hit.message,
            }))
      searchState = { query, hits }
      current = { ...current, search: searchState }
      report()
    },

    async markRead(input) {
      markedRead.add(input.sessionId)
      current = {
        ...current,
        sessions: current.sessions.map((item) => (item.id === input.sessionId ? { ...item, unread: 0 } : item)),
        unread: current.sessions.reduce((total, item) => total + (item.id === input.sessionId ? 0 : item.unread), 0),
      }
      report()
    },

    async send(input) {
      const text = input.text.trim()
      if (text.length === 0) return { ok: false, reason: "empty" }
      if (current.send.reason === "whitelist-empty") return { ok: false, reason: "whitelist-empty" }
      if (current.send.reason === "bridge-missing") return { ok: false, reason: "bridge-missing" }
      if (!current.send.enabled) return { ok: false, reason: "not-allowed" }
      // 真实发送要接 `src/bridge/client.ts` 的 sendMessage；本轮只做白名单与连接校验，不向客户端发出任何消息。
      return { ok: false, reason: "not-wired" }
    },

    async merge(input) {
      const path = input.path
      if (!insideRoot(path, rootOf())) return { items: [], error: "路径不在数据目录内" }
      const text = readText(path)
      if (text === undefined) return { items: [], error: "文件不存在或无法读取" }
      return { items: decodeMergeText(text).map(mergeRow), error: "" }
    },

    async media(input) {
      const path = input.path
      if (!insideRoot(path, rootOf())) return { dataUrl: "", error: "路径不在数据目录内" }
      const bytes = readBytes(path)
      if (bytes === undefined) return { dataUrl: "", error: "文件不存在或无法读取" }
      if (bytes.byteLength > MAX_MEDIA_BYTES) return { dataUrl: "", error: "图片超过 24 MB" }
      const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase()
      const mime = MIME[extension] ?? "application/octet-stream"
      return { dataUrl: `data:${mime};base64,${bytes.toString("base64")}`, error: "" }
    },

    async avatars(input) {
      const root = rootOf()
      return input.paths.slice(0, 200).map((path): AvatarEntry => {
        if (path.length === 0 || !insideRoot(path, root)) return { path, dataUrl: "" }
        const stamp = mtimeOf(path)
        if (stamp === undefined) return { path, dataUrl: "" }
        const cached = avatarCache.get(path)
        if (cached !== undefined && cached.stamp === stamp) return { path, dataUrl: cached.dataUrl }
        const bytes = readBytes(path)
        const dataUrl = bytes === undefined ? "" : `data:${avatarMime(bytes)};base64,${bytes.toString("base64")}`
        avatarCache.set(path, { stamp, dataUrl })
        return { path, dataUrl }
      })
    },
  }

  const provided = ctx.provide(ChatIpc, impl)
  provider = provided
  void load(false).then(report)

  return provided
}

function mergeRow(item: MergeItem): MergeItemRow {
  return {
    account: item.account,
    title: item.title,
    content: item.content,
    kind: item.kind,
    time: item.time,
  }
}

function createdAtOf(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value !== "string") return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/** JSON 里取字符串：非字符串给空串，数字转文本。 */
function str(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return String(value)
  return ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 只允许读取数据根目录下的文件，避免窗口通过 Ipc 读任意路径。 */
function insideRoot(path: string, root: string) {
  return path.startsWith(root) && !path.includes("\0")
}

function readJson(path: string) {
  const text = readText(path)
  if (text === undefined) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function readText(path: string) {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

function readBytes(path: string) {
  try {
    return readFileSync(path)
  } catch {
    return undefined
  }
}

function mtimeOf(path: string) {
  try {
    return statSync(path).mtimeMs
  } catch {
    return undefined
  }
}

/** 头像文件没有扩展名，格式也不统一（实测 PNG 与 JPEG 混存），按文件头判断。 */
function avatarMime(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif"
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")
    return "image/webp"
  return "image/png"
}
