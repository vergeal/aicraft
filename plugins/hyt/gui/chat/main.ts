import type { IpcImpl, IpcProvider, MainContext } from "@opencode/plugin/gui/main"
import { Schema } from "effect"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { decodeMergeText } from "../../src/chat/merge.js"
import type { MergeItem } from "../../src/chat/merge.js"
import { parseReceipt } from "../../src/chat/receipts.js"
import { bridgeExecutable } from "../../src/bridge/native.js"
import { EVENTS } from "../../src/bridge/protocol.js"
import type { BridgeMember } from "../../src/bridge/protocol.js"
import { clearSavedCredentials, readSavedCredentialsSync, saveSavedCredentials } from "../../src/credentials.js"
import * as Bridge from "./bridge.js"
import * as Data from "../shared/data.js"
import { ChatIpc } from "./contract.js"
import type {
  AvatarEntry,
  ChatState,
  DraftRow,
  MergeItemRow,
  MessageRow,
  ReceiptPerson,
  SearchHit,
  SendState,
} from "./contract.js"
import * as Db from "./db.js"
import { createReceiptLedger } from "./receipts.js"

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
/** 头像很小；超过这个大小的一定不是头像，直接放弃。 */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024
/** 远端头像在内存里保留 6 小时；磁盘缓存长期有效，跨重启不重复下载。 */
const AVATAR_TTL = 6 * 60 * 60_000
/** 下载失败的头像记 5 分钟，避免每轮轮询都去请求一个拿不到的地址。 */
const AVATAR_MISS_TTL = 5 * 60_000
/** 群成员名单的缓存时长：退群、拉人不会每 4 秒就变，弹窗里点「重试」可以立刻重拉。 */
const MEMBER_TTL = 5 * 60_000

function emptyState(phase: ChatState["status"]["phase"]): ChatState {
  return {
    status: {
      phase,
      detail: "",
      account: "",
      displayName: "",
      bridge: "missing",
      credential: "missing",
      credentialUser: "",
      authError: "",
      autopilot: false,
      whitelist: 0,
    },
    sessions: [],
    selected: "",
    messages: [],
    hasMore: false,
    newMessageId: 0,
    unread: 0,
    search: { query: "", hits: [] },
    drafts: [],
    members: [],
    send: { enabled: false, reason: "" },
    knowledge: [],
    receiptsVersion: 0,
  }
}

export function provideChatIpc(ctx: MainContext): IpcProvider<typeof ChatIpc.spec> {
  const dataDir = Data.resolveDataDir()
  const settings = ctx.storage.store("gui", {
    schema: Schema.Struct({ chfileRoot: Schema.String, bridgePath: Schema.String }),
    initial: { chfileRoot: "", bridgePath: "" },
  })
  // 插件自带的桥接安装在 exc 下；打包布局与版本无关，路径固定。
  const pluginRoot = join(homedir(), ".aicraft", "exc", "changhong.aicraft.hyt")

  let current = emptyState("loading")
  let selected = ""
  let messages: MessageRow[] = []
  let hasMore = false
  let newMessageId = 0
  let markedRead = new Map<string, number>()
  let searchState = { query: "", hits: [] as SearchHit[] }
  let provider: IpcProvider<typeof ChatIpc.spec> | undefined
  // 搜索命中或「定位」要落在某条旧消息上：这一页以它为最新一条，下一次刷新回落到最新一页。
  let anchorId: number | undefined

  // 已读回执：桥接推送的实时流，落一份盘；`connectedAt` 之前发出的消息补不回来，标成不可用。
  const receipts = createReceiptLedger(join(dataDir, "receipts.json"))
  let connectedAt = 0
  let receiptsVersion = 0
  /** 最近一次后台静默登录的失败原因；成功时清空，显示在整页空态里。 */
  let warmError = ""
  // 群成员按会话缓存：未读要用成员总数，而 SDK 拉一次要等回调，不能每次 4 秒轮询都拉。
  const memberCache = new Map<string, { readonly at: number; readonly ok: boolean; readonly members: readonly BridgeMember[] }>()
  // 已经上报过已读的消息：轮询不能反复上报同一条。
  const reported = new Set<string>()

  // 头像按「路径 + mtime」缓存：同一张图跨窗口、跨 4 秒轮询只读一次盘。
  const avatarCache = new Map<string, { readonly stamp: number; readonly dataUrl: string }>()
  /** 下载失败的地址 + 失败时间：短时间内不再请求。 */
  const avatarMisses = new Map<string, number>()
  /**
   * 每轮最多发起的网络请求数。
   *
   * 通讯录里同时有上百张只有远端地址的头像，一次全发会把界面卡在等待上；
   * 落到磁盘缓存后下一轮就不再请求，几轮之内自然补齐。
   */
  const AVATAR_FETCH_BUDGET = 12
  /** 远端头像落盘缓存目录：插件自己的数据目录，不写客户端的 HeadFiles。 */
  const avatarDir = join(dataDir, "avatars")

  const avatarFromRemote = async (url: string, budget: { left: number }) => {
    const hit = avatarCache.get(url)
    if (hit !== undefined && Date.now() - hit.stamp < AVATAR_TTL) return hit.dataUrl
    const missedAt = avatarMisses.get(url)
    if (missedAt !== undefined && Date.now() - missedAt < AVATAR_MISS_TTL) return ""

    // 磁盘上已经有就直接读，不占网络预算。
    const file = join(avatarDir, createHash("sha1").update(url).digest("hex"))
    const cachedBytes = readBytes(file)
    if (cachedBytes !== undefined) return rememberAvatar(url, cachedBytes)

    if (budget.left <= 0) return ""
    budget.left -= 1
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) throw new Error("头像大小异常")
      mkdirSync(avatarDir, { recursive: true })
      writeFileSync(file, bytes)
      return rememberAvatar(url, bytes)
    } catch {
      avatarMisses.set(url, Date.now())
      return ""
    }
  }

  const rememberAvatar = (url: string, bytes: Buffer) => {
    const dataUrl = avatarDataUrl(bytes)
    avatarCache.set(url, { stamp: Date.now(), dataUrl })
    avatarMisses.delete(url)
    return dataUrl
  }

  const report = () => provider?.changed()

  const rootOf = () => Data.resolveChfileRoot(settings.value.chfileRoot)

  const isGroup = (sessionId: string) => current.sessions.find((item) => item.id === sessionId)?.group === true

  /** 缓存里的群成员；过期或上次失败都算未知（返回 undefined），不用 0 个成员冒充「都读完了」。 */
  const knownMembers = (sessionId: string) => {
    const cached = memberCache.get(sessionId)
    if (cached === undefined || !cached.ok || Date.now() - cached.at > MEMBER_TTL) return undefined
    return cached.members
  }

  /**
   * 拉群成员并缓存。失败也记一条短缓存，避免每次轮询都等一轮 SDK 超时。
   * 成功或失败都推新状态：未读人数依赖它。
   */
  const refreshMembers = async (sessionId: string, force = false) => {
    const cached = memberCache.get(sessionId)
    if (!force && cached !== undefined && Date.now() - cached.at < MEMBER_TTL) return
    const result = await sender.members(sessionId)
    const fresh = { at: Date.now(), ok: result.ok, members: result.members }
    memberCache.set(sessionId, fresh)
    if (sessionId !== selected) return
    refreshReceipts()
    report()
  }

  /** 消息行上的回执摘要；别人的消息没有回执。 */
  const receiptOf = (message: MessageRow, group: boolean): MessageRow["receipt"] => {
    if (!message.outgoing || message.msgId.length === 0) return undefined
    const record = receipts.get(message.msgId)
    // 有记录就是事实；没记录且消息早于本次连接，说明这段回执永远补不回来，不能报 0。
    if (record === undefined && !(connectedAt > 0 && message.createdAt >= connectedAt)) {
      return { available: false, group, read: 0, unread: -1 }
    }
    const read = record === undefined ? [] : [...record.read.keys()].filter((account) => account !== current.status.account)
    if (!group) return { available: true, group, read: read.length > 0 ? 1 : 0, unread: read.length > 0 ? 0 : 1 }
    const members = knownMembers(selected)
    const known = members === undefined ? undefined : members.filter((item) => item.account !== current.status.account)
    const counted = known === undefined ? read : read.filter((account) => known.some((item) => item.account === account))
    return {
      available: true,
      group,
      read: counted.length,
      unread: known === undefined ? -1 : Math.max(0, known.length - counted.length),
    }
  }

  /** 回执进来时只重算消息行上的摘要与版本号，不读库；窗口按版本号重新取弹窗名单。 */
  const refreshReceipts = () => {
    const group = isGroup(selected)
    messages = messages.map((message) =>
      message.outgoing ? { ...message, receipt: receiptOf(message, group) } : message,
    )
    receiptsVersion += 1
    current = { ...current, messages, receiptsVersion }
  }

  const sender = Bridge.createSender({
    root: () => Data.resolveChfileRoot(settings.value.chfileRoot),
    executable: () => bridgeExecutable(pluginRoot, settings.value.bridgePath),
    credentials: () => {
      // 插件保存的凭据优先：不依赖虹云通客户端是否装过、登录过。
      const saved = readSavedCredentialsSync(dataDir)
      if (saved !== undefined) return { userName: saved.userName, password: saved.password }
      const root = Data.resolveChfileRoot(settings.value.chfileRoot)
      const account = current.status.account || (Data.readLastUser(root) ?? "")
      return Data.readCredential(root, account)
    },
    onEvent: (method, params) => {
      if (method !== EVENTS.readReceipt) return
      const notice = parseReceipt(params)
      if (notice === undefined) return
      if (!receipts.record(notice, current.status.account)) return
      connectedAt = connectedAt > 0 ? connectedAt : Date.now()
      refreshReceipts()
      report()
    },
  })
  ctx.onCleanup(() => {
    receipts.flush()
    void sender.stop()
  })


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

  /** 只有「没有打开会话」时才不能发；白名单、连接状态都不再拦输入，失败原因由发送结果给出。 */
  const sendState = (selectedId: string): SendState => {
    if (selectedId.length === 0) return { enabled: false, reason: "not-allowed" }
    return { enabled: true, reason: "" }
  }

  const load = async (mergeMessages: boolean): Promise<ChatState> => {
    const root = rootOf()
    try {
      // 插件保存的凭据优先于客户端 login.db：没装客户端时也能确定账号。
      const saved = readSavedCredentialsSync(dataDir)
      const logins = Data.readLogins(root)
      const lastUser = Data.readLastUser(root)
      const profile = await Data.readProfile(dataDir, saved?.account ?? "")
      const login =
        saved === undefined
          ? Data.pickLogin(logins, profile.account, lastUser)
          : {
              userName: saved.userName,
              account: saved.account,
              displayName: saved.displayName,
              compId: saved.comId,
              autoLogin: true,
            }
      const credential: ChatState["status"]["credential"] =
        saved !== undefined ? "saved" : login === undefined ? "missing" : "client"
      if (login === undefined) {
        const state = emptyState("no-account")
        current = { ...state, status: { ...state.status, detail: root, credential, authError: warmError } }
        return current
      }
      if (!Db.hasChatData(root, login.account)) {
        const state = emptyState("no-data")
        current = {
          ...state,
          status: {
            ...state.status,
            account: login.account,
            displayName: login.displayName,
            detail: join(root, login.account),
            credential,
            credentialUser: login.userName,
            authError: warmError,
          },
        }
        return current
      }

      const sessions = Db.readSessions(root, login.account, markedRead)
      const chosen = sessions.find((item) => item.id === selected) ?? sessions[0]
      selected = chosen?.id ?? ""
      const latest = Db.readMessages(
        root,
        login.account,
        selected,
        anchorId === undefined ? undefined : anchorId + 1,
      )
      if (mergeMessages && messages.length > 0 && latest.messages.length > 0) {
        const oldestLoaded = latest.messages[0]?.id ?? Number.MAX_SAFE_INTEGER
        const kept = messages.filter((message) => message.id < oldestLoaded)
        messages = [...kept, ...latest.messages]
        hasMore = latest.hasMore || kept.length > 0
      } else {
        messages = latest.messages
        hasMore = latest.hasMore
        // 只在整页换掉时重算分界：进入会话后马上会标已读，若让 4 秒轮询也重算，分隔线会在几秒内自己消失。
        // 锚定到某条旧消息时没有「新消息」可言。
        newMessageId = anchorId === undefined ? latest.firstUnreadId : 0
      }

      const whitelist = mergedWhitelist(profile)
      const bridge = (await sender.ready()) ? "ready" : "missing"
      if (bridge === "ready" && connectedAt === 0) connectedAt = Date.now()
      // 回执摘要同步算；群成员不在缓存里就后台拉一次，拉到后自己推新状态。
      const group = chosen?.group === true
      messages = messages.map((message) => (message.outgoing ? { ...message, receipt: receiptOf(message, group) } : message))
      if (group && chosen !== undefined && knownMembers(chosen.id) === undefined) void refreshMembers(chosen.id)
      // 在这个界面读了别人的消息，也要上报一次，否则对方永远看不到「已读」。
      // 只报当前会话最新一条，失败的从记录里去掉，下次轮询再试。
      const lastIncoming = [...messages].reverse().find((message) => !message.outgoing && message.msgId.length > 0)
      if (bridge === "ready" && lastIncoming !== undefined && !reported.has(lastIncoming.msgId)) {
        reported.add(lastIncoming.msgId)
        void sender.markRead(lastIncoming.msgId, group).then((result) => {
          if (!result.ok) reported.delete(lastIncoming.msgId)
        })
      }
      const drafts = readDrafts(dataDir, selected)
      const unread = sessions.reduce((total, item) => total + item.unread, 0)
      current = {
        status: {
          phase: "ready",
          detail: join(root, login.account),
          account: login.account,
          displayName: login.displayName,
          bridge,
          credential,
          credentialUser: login.userName,
          authError: warmError,
          autopilot: profile.capabilities.autopilot.enabled,
          whitelist: whitelist.length,
        },
        sessions,
        selected,
        messages,
        hasMore,
        newMessageId,
        unread,
        search: searchState.query.length === 0 ? { query: "", hits: [] } : searchState,
        drafts,
        members: Db.readSessionMembers(root, login.account, selected),
        send: sendState(selected),
        knowledge: [],
        receiptsVersion,
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
      anchorId = input.messageId !== undefined && input.messageId > 0 ? input.messageId : undefined
      await load(false)
      anchorId = undefined
      report()
    },

    async loadMore() {
      const account = current.status.account
      if (account.length === 0 || selected.length === 0 || !hasMore) return
      const before = messages[0]?.id
      if (before === undefined) return
      const page = Db.readMessages(rootOf(), account, selected, before)
      // 翻上来的旧消息同样要报回执状态：有记录报人数，没记录就报「暂不可用」。
      const group = isGroup(selected)
      messages = [
        ...page.messages.map((message) => (message.outgoing ? { ...message, receipt: receiptOf(message, group) } : message)),
        ...messages,
      ]
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
      // 先落库再改内存：只改内存的话重启后未读会复活，桥写进来的角标也降不下来。
      Db.markSessionRead(rootOf(), current.status.account, input.sessionId)
      markedRead.set(input.sessionId, Date.now())
      current = {
        ...current,
        sessions: current.sessions.map((item) => (item.id === input.sessionId ? { ...item, unread: 0 } : item)),
        unread: current.sessions.reduce((total, item) => total + (item.id === input.sessionId ? 0 : item.unread), 0),
      }
      report()
    },

    async markAllRead() {
      Db.markAllRead(rootOf(), current.status.account)
      // 记下标记时刻：之后客户端才写进来的未读仍会显示，只清掉此刻之前的。
      const now = Date.now()
      for (const item of current.sessions) markedRead.set(item.id, now)
      current = {
        ...current,
        sessions: current.sessions.map((item) => (item.unread === 0 ? item : { ...item, unread: 0 })),
        unread: 0,
      }
      report()
    },

    async send(input) {
      const body = input.text.trim()
      if (body.length === 0) return { ok: false, reason: "empty" }
      const sessionId = input.sessionId.length > 0 ? input.sessionId : current.selected
      if (sessionId.length === 0) return { ok: false, reason: "not-allowed" }

      const account = current.status.account
      const sent = await sender.send(sessionId, body)
      if (!sent.ok) return { ok: false, reason: sent.reason }
      connectedAt = connectedAt > 0 ? connectedAt : Date.now()

      // 消息已经发出去了：写库失败只影响本地历史，不能把成功报成失败。
      const recorded = Db.appendOwnMessage(rootOf(), account, {
        sessionId,
        text: body,
        sender: account,
        senderNick: current.status.displayName,
        msgId: sent.msgId,
      })
      await load(false)
      report()
      return { ok: true, reason: recorded.recorded ? "" : `已发送，但未写入本地历史：${recorded.error}` }
    },

    async login(input) {
      const userName = input.userName.trim()
      const result = await sender.login(userName, input.password)
      // pending：PBS 已接受账号密码，只是连接回调慢于等待时间；凭据同样要保存，发送时再登录一次即可。
      if (!result.ok && !result.pending)
        return { ok: false, account: result.account, message: result.message || "登录没有成功。" }
      // 账号目录与客户端一致（cs 前缀）；PBS 返回的 account 有时不带前缀。
      const account = Data.accountOf(result.account.length > 0 ? result.account : userName)
      const known = Data.readLogins(rootOf()).find((item) => item.account === account)
      await saveSavedCredentials(dataDir, {
        userName,
        password: input.password,
        account,
        displayName: known?.displayName ?? account,
        ...(result.comId.length > 0 ? { comId: result.comId } : {}),
        ...(result.env.length > 0 ? { env: result.env } : {}),
      })
      warmError = ""
      await load(false)
      report()
      return { ok: true, account, message: result.pending ? result.message : "" }
    },

    async logout() {
      const result = await sender.logout()
      // 退出后不再保留插件凭据；客户端 login.db 里的账号仍会被识别，但不主动登录。
      await clearSavedCredentials(dataDir)
      warmError = ""
      await load(false)
      report()
      return result
    },

    async merge(input) {
      const path = input.path
      const root = rootOf()
      if (!insideRoot(path, root)) return { items: [], error: "路径不在数据目录内" }
      const text = readText(path)
      if (text === undefined) return { items: [], error: "文件不存在或无法读取" }
      const names = Db.readPersonNames(root, current?.status.account ?? "")
      return { items: decodeMergeText(text).map((item) => mergeRow(item, names)), error: "" }
    },

    async receipts(input) {
      const root = rootOf()
      const account = current.status.account
      const group = isGroup(input.sessionId)
      const record = receipts.get(input.msgId)
      if (group) await refreshMembers(input.sessionId, input.retry === true)
      // 与消息行同一口径：有记录就是事实；没记录且早于本次连接，回执补不回来。
      if (record === undefined && !(connectedAt > 0 && input.createdAt >= connectedAt)) {
        return { available: false, group, read: [], unread: [] }
      }

      const people = Db.readPersonNames(root, account)
      const person = (who: string, at: number): ReceiptPerson => ({
        account: who,
        name: people.get(who) ?? who,
        at,
      })
      const readAccounts = record === undefined ? new Map<string, number>() : new Map(record.read)
      readAccounts.delete(account)

      if (!group) {
        const peer = input.sessionId
        const at = readAccounts.get(peer)
        const read = at === undefined ? [] : [person(peer, at)]
        return { available: true, group: false, read, unread: read.length > 0 ? [] : [person(peer, 0)] }
      }

      const members = knownMembers(input.sessionId)
      const read = [...readAccounts.entries()]
        .filter(([who]) => members === undefined || members.some((item) => item.account === who))
        .sort((left, right) => right[1] - left[1])
        .map(([who, at]) => person(who, at))
      const unread =
        members === undefined
          ? []
          : members
              .filter((item) => item.account !== account && !readAccounts.has(item.account))
              .map((item) => person(item.account, 0))
      return {
        available: true,
        group: true,
        read,
        unread,
      }
    },

    async media(input) {
      const root = rootOf()
      const path = input.path
      const bytes = path.length > 0 && insideRoot(path, root) ? readBytes(path) : undefined
      if (bytes !== undefined) return mediaOf(bytes, path)
      const msgId = input.msgId ?? ""
      if (msgId.length === 0) return { dataUrl: "", error: "文件不存在或无法读取" }
      // 本地没有副本（客户端不在线时收到的图片/文件）：让桥接从服务端补下载，
      // 成功后把路径记回本地库，下次刷新就是普通图片消息，不用再下第二次。
      const downloaded = await sender.download(msgId)
      if (downloaded.path.length === 0) {
        return { dataUrl: "", error: downloaded.error.length > 0 ? downloaded.error : "文件还在下载，稍后重试" }
      }
      if (!insideRoot(downloaded.path, root)) return { dataUrl: "", error: "下载路径不在数据目录内" }
      const fetched = readBytes(downloaded.path)
      if (fetched === undefined) return { dataUrl: "", error: "文件已下载但无法读取" }
      Db.recordMediaPath(root, current.status.account, msgId, downloaded.path)
      return mediaOf(fetched, downloaded.path)
    },

    async avatars(input) {
      const root = rootOf()
      const budget = { left: AVATAR_FETCH_BUDGET }
      return Promise.all(
        input.paths.slice(0, 200).map(async (path): Promise<AvatarEntry> => {
          // 通讯录里大多数头像本地没有缓存，`headPath` 会是远端地址；下载一次后长期复用。
          if (isRemote(path)) return { path, dataUrl: await avatarFromRemote(path, budget) }
          if (path.length === 0 || !insideRoot(path, root)) return { path, dataUrl: "" }
          const stamp = mtimeOf(path)
          if (stamp === undefined) return { path, dataUrl: "" }
          const cached = avatarCache.get(path)
          if (cached !== undefined && cached.stamp === stamp) return { path, dataUrl: cached.dataUrl }
          const bytes = readBytes(path)
          const dataUrl = bytes === undefined ? "" : avatarDataUrl(bytes)
          avatarCache.set(path, { stamp, dataUrl })
          return { path, dataUrl }
        }),
      )
    },
  }

  const provided = ctx.provide(ChatIpc, impl)
  provider = provided
  // 打开页面就在后台把独立通道准备好：拉起桥接、用本地凭据登录，之后发消息不再等启动。
  void sender
    .warm()
    .then(() => {
      connectedAt = connectedAt > 0 ? connectedAt : Date.now()
      warmError = ""
    })
    .then(() => load(false))
    .then(report)
    .catch((error: unknown) => {
      warmError = error instanceof Error ? error.message : String(error)
      ctx.log.write("warn", "hyt bridge warm failed", { error: warmError })
      // 失败原因要落到页面上：用户据此判断是密码失效、被踢下线，还是网络不通。
      void load(false).then(report)
    })

  return provided
}

function mergeRow(item: MergeItem, names: ReadonlyMap<string, string>): MergeItemRow {
  return {
    account: names.get(item.account) ?? item.account,
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

/** 本地文件 → data URL。扩展名决定 MIME，未知类型交给浏览器嗅探。 */
function mediaOf(bytes: Uint8Array, path: string) {
  if (bytes.byteLength > MAX_MEDIA_BYTES) return { dataUrl: "", error: "图片超过 24 MB" }
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase()
  const mime = MIME[extension] ?? "application/octet-stream"
  return { dataUrl: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`, error: "" }
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
function isRemote(path: string) {
  return path.startsWith("http://") || path.startsWith("https://")
}

function avatarDataUrl(bytes: Buffer) {
  return `data:${avatarMime(bytes)};base64,${bytes.toString("base64")}`
}

function avatarMime(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif"
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")
    return "image/webp"
  return "image/png"
}
