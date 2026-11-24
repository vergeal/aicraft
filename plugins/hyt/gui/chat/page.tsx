import type { Context, IpcClient } from "@aicraft/plugin/gui"
import { Show, createEffect, createMemo, createResource, createSignal, onCleanup, onMount } from "solid-js"
import { Blank } from "./blank.js"
import { Composer } from "./composer.js"
import { ChatIpc } from "./contract.js"
import type { MergeItemRow, MessageRow, SessionRow } from "./contract.js"
import { text } from "./i18n.js"
import { InfoPanel } from "./info.js"
import { LoginPage } from "./login.js"
import { MenuLayer, createMenu } from "./menu.js"
import type { MenuEntry, MenuTarget } from "./menu.js"
import { MessageStream } from "./messages.js"
import { ProfileCard, createProfile } from "./profile.js"
import type { Person } from "./profile.js"
import { Rail } from "./sessions.js"
import { RAIL_MAX, RAIL_MIN, rowTime, shellBlank } from "./util.js"

const POLL_MS = 4_000
/**
 * 对方正在输入时的轮询间隔。
 *
 * 输入状态是几秒钟的瞬时信号，4 秒一轮很容易整段错过（人打完就发了）。对方停止后自动回到 4 秒，
 * 所以这档加速只发生在真正有人打字的那几秒。
 */
const TYPING_POLL_MS = 1_500
const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const

/**
 * 聊天主页。
 *
 * 只读本地库：进入时刷新一次，之后窗口可见时每 4 秒刷新一次（切到后台就停）。
 * 所有写操作都走 Ipc，主进程改完立刻推送新 state，因此这里不维护数据副本；
 * 只保留真正属于窗口的东西：输入草稿、搜索词、面板开合、正在发送与临时提示。
 */
export function ChatPage(props: {
  ctx: Context
  client: IpcClient<typeof ChatIpc.spec>
  /** 左栏当前宽度，顶栏分段与分隔线位置都读它。 */
  listWidth: () => number
  /** 拖动分隔线时上报新宽度，只改内存。 */
  onListWidth: (width: number) => void
  /** 松开分隔线时提交一次，写进存储。 */
  onListWidthEnd: () => void
  /** 是否处于整页视图（登录、空态、错误），外层据此把窗口顶栏换成纸张色。 */
  onFullPage: (value: boolean) => void
}) {
  const ctx = props.ctx
  const state = () => props.client.state()
  /** 退出登录进行中：按钮置灰，避免重复断连。 */
  const [loggingOut, setLoggingOut] = createSignal(false)
  /** 主动打开的登录页：有 login.db 旧账号时也能改用账号密码重新登录。 */
  const [loginOpen, setLoginOpen] = createSignal(false)
  /**
   * 只有服务端拒绝这组账号密码时才自动打开登录页。
   *
   * 桥接刚启动、旧实例还没退出、网络抖动、被同事在本机客户端顶下线，都与密码无关：
   * 本地的凭据仍然有效，后台会自己重登，不该每次都拿登录页打断用户。
   */
  const passwordRejected = (message: string) => /连接失败（code=2|密码|账号或密码/.test(message)
  let authPrompted = false
  createEffect(() => {
    const error = state()?.status.authError ?? ""
    if (error.length === 0) {
      authPrompted = false
      return
    }
    if (authPrompted) return
    if (!passwordRejected(error)) return
    authPrompted = true
    setLoginOpen(true)
  })

  const phase = () => state()?.status.phase ?? "loading"
  /**
   * 轮询每次推来新数组与新对象，内容却常常没变。按内容保住旧引用，
   * 消息组件才不会每 4 秒重建一次（展开的长文、展开的合并转发会被重置）。
   */
  const sessions = createMemo((previous?: readonly SessionRow[]) => {
    const next = state()?.sessions ?? []
    if (previous === undefined || previous.length !== next.length) return next
    for (let index = 0; index < next.length; index += 1)
      if (sessionKey(previous[index]!) !== sessionKey(next[index]!)) return next
    return previous
  })
  const selectedId = () => state()?.selected ?? ""
  const selected = () => sessions().find((session) => session.id === selectedId())
  /**
   * 消息数组按条复用。
   *
   * 主进程每次刷新都会推全新的对象；整页换成新引用时，消息流的 `<For>` 会把 40 条气泡全部销毁重建
   * （图片重载、展开状态丢失、滚动跳一下）——看起来就是每几秒闪一次。
   * 内容没变的条目沿用上一份对象，只让真正变化的那一条更新。
   */
  const messages = createMemo((previous?: readonly MessageRow[]) => {
    const next = state()?.messages ?? []
    if (previous === undefined) return next
    const byId = new Map(previous.map((message) => [message.id, message]))
    let changed = previous.length !== next.length
    const reused = next.map((message) => {
      const old = byId.get(message.id)
      if (old !== undefined && messageKey(old) === messageKey(message)) return old
      changed = true
      return message
    })
    return changed ? reused : previous
  })
  /** 没有数据、读取失败、或者一条会话都没有时整页走空态，不画空三栏。 */
  const blank = () => shellBlank(state())

  // 整页视图（含登录页）时把窗口顶栏也换成纸张色；回到聊天页再换回左栏色。
  createEffect(() => {
    props.onFullPage(blank() || loginOpen() || phase() === "no-account")
  })

  const [query, setQuery] = createSignal("")
  const [searching, setSearching] = createSignal(false)
  const [loadingMore, setLoadingMore] = createSignal(false)
  const [sending, setSending] = createSignal(false)
  const [notice, setNotice] = createSignal<string | undefined>()
  const [focusId, setFocusId] = createSignal<number | undefined>()
  const [infoOpen, setInfoOpen] = createSignal(false)
  const [ignoredDraft, setIgnoredDraft] = createSignal("")
  const [draftText, setDraftText] = createSignal("")
  /** 卡片里点「发消息」后让输入框拿到焦点，值只是变化通知。 */
  const [composerFocus, setComposerFocus] = createSignal(0)
  /** 会话头像解码失败：退回名字的首字，别让浏览器画破图图标。 */
  const [headBroken, setHeadBroken] = createSignal(false)

  /** 左栏与聊天区之间的分隔线：拖动改左栏宽度，松手才写存储。 */
  const [resizing, setResizing] = createSignal(false)
  let drag: { pointer: number; x: number; width: number } | undefined

  const clampWidth = (width: number) =>
    Math.min(Math.max(Math.round(width), RAIL_MIN), Math.min(RAIL_MAX, Math.round(window.innerWidth * 0.5)))

  const beginResize = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (event.button !== 0) return
    event.preventDefault()
    drag = { pointer: event.pointerId, x: event.clientX, width: props.listWidth() }
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizing(true)
  }

  const moveResize = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (drag === undefined || event.pointerId !== drag.pointer) return
    props.onListWidth(clampWidth(drag.width + event.clientX - drag.x))
  }

  const endResize = (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    if (drag === undefined || event.pointerId !== drag.pointer) return
    drag = undefined
    setResizing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    props.onListWidthEnd()
  }

  // 键盘：左右方向键每次 16px，够不到时停在范围边界。
  const nudgeResize = (event: KeyboardEvent) => {
    const step = event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0
    if (step === 0) return
    event.preventDefault()
    props.onListWidth(clampWidth(props.listWidth() + step))
    props.onListWidthEnd()
  }

  /** 每个会话各自的未发送草稿：切走再切回来还在，也不会串到别的会话。 */
  const localDrafts = new Map<string, string>()
  let lastSelected = ""
  let searchTimer: number | undefined
  let searchToken = 0
  /** 当前这一页是不是被搜索或「定位」锚到某条旧消息上。 */
  let anchored = false

  const avatarKey = () => {
    const current = state()
    if (current === undefined) return ""
    const paths = new Set<string>()
    // 当前会话的头像先入队：名额有限，正在看的消息与成员不该被左栏的会话头像挤掉。
    for (const message of current.messages) if (message.senderHead.length > 0) paths.add(message.senderHead)
    for (const session of current.sessions) {
      if (session.avatar.length > 0) paths.add(session.avatar)
      for (const member of session.members) if (member.headPath.length > 0) paths.add(member.headPath)
    }
    return [...paths].slice(0, 200).sort().join("\n")
  }

  /**
   * 头像累积表。
   *
   * 切会话时需要的头像集合会变；若每次都拿新结果整体替换，已显示的头像会先退回文字再变回图片，
   * 整屏看起来就是闪一下。这里只增不减：一屏里出现过的头像不会因为换了会话而消失。
   */
  const [avatarMap, setAvatarMap] = createSignal<Record<string, string>>({})
  /** 已经请求过的头像路径：弹窗按需补人时不会把同一张重复下载。 */
  const requestedAvatars = new Set<string>()
  /**
   * 取一批头像并入共享表。
   *
   * 侧栏、会话头、消息、成员列表、回执名单都从这里拿图，主进程只按路径解码一次；
   * 任何地方都不该自己再发一次头像请求。
   */
  const loadAvatars = (paths: readonly string[]) => {
    const fresh = paths.filter((path) => path.length > 0 && !requestedAvatars.has(path))
    if (fresh.length === 0) return
    for (const path of fresh) requestedAvatars.add(path)
    void props.client
      .avatars({ paths: fresh })
      .then((rows) => {
        if (rows.length === 0) return
        setAvatarMap((previous) => {
          const next = { ...previous }
          for (const row of rows) if (row.dataUrl.length > 0) next[row.path] = row.dataUrl
          return next
        })
      })
      .catch(() => {
        // 失败的头像允许下一轮再试，不要永久占住路径。
        for (const path of fresh) requestedAvatars.delete(path)
      })
  }

  let avatarQuery = ""
  createEffect(() => {
    const key = avatarKey()
    if (key.length === 0 || key === avatarQuery) return
    avatarQuery = key
    loadAvatars(key.split("\n"))
  })

  const fail = (cause: unknown) => {
    setNotice(cause instanceof Error ? cause.message : String(cause))
  }

  const refresh = () => {
    void props.client.refresh().catch(fail)
  }

  const logout = async () => {
    if (loggingOut()) return
    setLoggingOut(true)
    try {
      const result = await props.client.logout()
      if (!result.ok)
        setNotice(text(ctx, "hyt.chat.rail.logout.failed", { message: result.error || "未知原因" }))
    } catch (cause) {
      setNotice(text(ctx, "hyt.chat.rail.logout.failed", { message: cause instanceof Error ? cause.message : String(cause) }))
    } finally {
      setLoggingOut(false)
      void props.client.refresh().catch(() => undefined)
    }
  }

  onMount(() => {
    // 自调度轮询而不是固定 setInterval：间隔要看当前是否有人在输入，且上一轮没回来就不再发请求，
    // 读库偶尔变慢时不会在窗口侧堆一串排队。
    let timer: number | undefined
    const delay = () => (state()?.typing.active === true ? TYPING_POLL_MS : POLL_MS)
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(tick, delay())
    }
    const tick = () => {
      window.clearTimeout(timer)
      // 窗口不可见时不轮询；切回前台由 visibilitychange 立刻补一轮。
      if (document.visibilityState !== "visible") return
      void props.client
        .refresh()
        .catch(() => undefined)
        .finally(schedule)
    }
    tick()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        focusSearch()
        return
      }
      if (event.key === "Escape" && infoOpen()) setInfoOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    document.addEventListener("visibilitychange", tick)
    onCleanup(() => {
      window.clearTimeout(timer)
      window.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("visibilitychange", tick)
      if (searchTimer !== undefined) window.clearTimeout(searchTimer)
    })
  })

  // 正盯着某个会话时，轮询带回来的新未读直接标已读，否则自己的角标会越积越多。
  createEffect(() => {
    const current = state()
    if (current === undefined || document.visibilityState !== "visible") return
    const active = current.sessions.find((item) => item.id === current.selected)
    if (active === undefined || active.unread === 0) return
    void props.client.markRead({ sessionId: active.id }).catch(() => undefined)
  })

  // 会话切换时把输入框内容存回旧会话、取出新会话的草稿。
  createEffect(() => {
    const id = selectedId()
    if (id === lastSelected) return
    if (lastSelected.length > 0) localDrafts.set(lastSelected, draftText())
    lastSelected = id
    setDraftText(localDrafts.get(id) ?? "")
  })

  const focusSearch = () => {
    document.querySelector<HTMLInputElement>(".hyt-shell .search input")?.focus()
  }

  const select = (sessionId: string, messageId?: number) => {
    if (searchTimer !== undefined) window.clearTimeout(searchTimer)
    setQuery("")
    setSearching(false)
    setNotice(undefined)
    anchored = messageId !== undefined
    setFocusId(messageId)
    void props.client.selectSession({ sessionId, messageId }).catch(fail)
  }

  /** 停在旧消息那一页时，「回到最新」要把最新一页重新载回来，光滚到底没有新内容。 */
  const latest = () => {
    if (!anchored) return
    anchored = false
    const sessionId = selectedId()
    if (sessionId.length === 0) return
    void props.client.selectSession({ sessionId }).catch(fail)
  }

  const menu = createMenu()
  const profile = createProfile()

  /** 复制走宿主的内部通知卡片，和客户端自己的「已复制」提示是同一张。 */
  const copy = (value: string) => {
    if (value.length === 0) return
    void ctx.system.copy(value).then(
      () => ctx.toast.show({ variant: "success", title: text(ctx, "hyt.chat.msg.copied") }),
      () => ctx.toast.show({ variant: "error", title: text(ctx, "hyt.chat.msg.copyFailed") }),
    )
  }

  /** 「查看资料」要贴着触发元素弹出；键盘打开时给的就是那个元素本身。 */
  const anchorOfTarget = (target: MenuTarget) =>
    target instanceof HTMLElement ? target : target.currentTarget instanceof HTMLElement ? target.currentTarget : undefined

  const departmentOf = (account: string | undefined) =>
    account === undefined ? undefined : state()?.members.find((member) => member.account === account)?.department

  /** 头像路径 → 已解码的 data URL：卡片里不能直接拿路径当 img src。 */
  const headOf = (path: string | undefined) => {
    if (path === undefined || path.length === 0) return undefined
    return avatarOf(avatarMap(), path)
  }

  /** 会话 → 卡片里的身份。群聊只说「群聊」，本地库拿不到可信人数就不写数字。 */
  const personOfSession = (session: SessionRow): Person => ({
    account: session.id,
    name: session.name,
    head: headOf(session.avatar),
    online: session.online,
    department: departmentOf(session.group ? undefined : session.id),
    group: session.group,
    sessionId: session.id,
  })

  /** 消息 → 卡片里的身份；有单聊会话才能「发消息」，否则只给复制账号。 */
  const personOfMessage = (message: MessageRow): Person => {
    const direct = sessions().find((session) => !session.group && session.id === message.sender)
    return {
      account: message.sender,
      name: message.senderNick || message.sender,
      head: headOf(message.senderHead),
      online: direct?.online ?? false,
      department: departmentOf(message.sender),
      sessionId: direct?.id,
    }
  }

  const openSession = (sessionId: string) => {
    select(sessionId)
    setComposerFocus((value) => value + 1)
  }

  /** 头像菜单：看资料、能发就发消息、复制账号。锚点先接住，菜单回调里 currentTarget 已经没了。 */
  const personMenu = (person: Person, target: MenuTarget) => {
    const anchor = anchorOfTarget(target)
    const sessionId = person.sessionId
    menu.open(target, [
      { label: text(ctx, "hyt.chat.menu.avatar.profile"), onSelect: () => anchor && profile.open(anchor, person) },
      ...(sessionId !== undefined && person.group !== true
        ? [{ label: text(ctx, "hyt.chat.menu.avatar.message"), onSelect: () => openSession(sessionId) }]
        : []),
      { separator: true as const },
      { label: text(ctx, "hyt.chat.menu.avatar.copy"), onSelect: () => copy(person.account) },
    ])
  }

  const sessionMenu = (session: SessionRow, target: MenuTarget) => {
    const anchor = anchorOfTarget(target)
    menu.open(target, [
      ...(session.unread > 0
        ? [
            {
              label: text(ctx, "hyt.chat.menu.session.read"),
              onSelect: () => void props.client.markRead({ sessionId: session.id }).catch(fail),
            },
          ]
        : []),
      { label: text(ctx, "hyt.chat.menu.session.copyName"), onSelect: () => copy(session.name) },
      {
        label: text(
          ctx,
          session.group ? "hyt.chat.menu.session.copyId.group" : "hyt.chat.menu.session.copyId.direct",
        ),
        onSelect: () => copy(session.id),
      },
      { separator: true as const },
      {
        label: text(ctx, "hyt.chat.menu.session.profile"),
        onSelect: () => anchor && profile.open(anchor, personOfSession(session)),
      },
    ])
  }

  const messageMenu = (message: MessageRow, target: MenuTarget) => {
    const anchor = anchorOfTarget(target)
    const selection = window.getSelection()
    const selected = selection !== null && !selection.isCollapsed ? selection.toString().trim() : ""
    const body = message.text.trim() || message.fileName
    const entries: MenuEntry[] = []
    if (selected.length > 0) entries.push({ label: text(ctx, "hyt.chat.menu.message.copySelection"), onSelect: () => copy(selected) })
    if (body.length > 0 && body !== selected)
      entries.push({ label: text(ctx, "hyt.chat.menu.message.copyAll"), onSelect: () => copy(body) })
    if (entries.length > 0) entries.push({ separator: true })
    if (message.kind === "image" && message.filePath.length > 0)
      entries.push({ label: text(ctx, "hyt.chat.msg.enlarge"), onSelect: () => openImage(message.filePath) })
    if (message.filePath.length > 0)
      entries.push({ label: text(ctx, "hyt.chat.msg.reveal"), onSelect: () => reveal(message.filePath) })
    entries.push({ label: text(ctx, "hyt.chat.menu.message.copySender"), onSelect: () => copy(message.sender) })
    entries.push({
      label: text(ctx, "hyt.chat.menu.message.profile"),
      onSelect: () => anchor && profile.open(anchor, personOfMessage(message)),
    })
    menu.open(target, entries)
  }

  const search = (value: string) => {
    setQuery(value)
    setSearching(true)
    if (searchTimer !== undefined) window.clearTimeout(searchTimer)
    const token = ++searchToken
    searchTimer = window.setTimeout(() => {
      void props.client
        .search({ query: value })
        .catch(fail)
        .then(() => {
          if (token === searchToken) setSearching(false)
        })
    }, 180)
  }

  const loadMore = () => {
    if (loadingMore() || state()?.hasMore !== true) return
    setLoadingMore(true)
    void props.client.loadMore().catch(fail).then(() => setLoadingMore(false))
  }

  const writeDraft = (value: string) => {
    const id = selectedId()
    if (id.length > 0) localDrafts.set(id, value)
    setDraftText(value)
  }

  const send = (body: string, at: readonly string[]) => {
    const sessionId = selectedId()
    if (sessionId.length === 0) return
    setSending(true)
    setNotice(undefined)
    void props.client
      .send({ sessionId, text: body, at: [...at] })
      .then((result) => {
        if (!result.ok) {
          setNotice(text(ctx, "hyt.chat.composer.rejected", { reason: reasonLabel(ctx, result.reason) }))
          return
        }
        localDrafts.delete(sessionId)
        setDraftText("")
        if (result.reason.length > 0) setNotice(result.reason)
      })
      .catch(fail)
      .then(() => setSending(false))
  }

  const mediaCache = new Map<string, Promise<string>>()
  // 本地没有副本时主进程会按 msgId 补下载，所以缓存键必须带上消息 id：
  // 同一条消息补下载完成后 path 会变，那时应重新读一次，而不是复用失败的缓存。
  const onMedia = (path: string, msgId: string) => {
    if (path.length === 0 && msgId.length === 0) return Promise.resolve("")
    const key = `${msgId}\u0000${path}`
    const cached = mediaCache.get(key)
    if (cached !== undefined) return cached
    const request = props.client
      .media({ path, msgId })
      .then((result) => {
        // 失败（未登录、下载还没回来）不留在缓存里：登录成功或下次进入会话时要能重试。
        if (result.error.length > 0) {
          mediaCache.delete(key)
          return ""
        }
        return result.dataUrl
      })
      .catch(() => {
        mediaCache.delete(key)
        return ""
      })
    mediaCache.set(key, request)
    return request
  }

  const mergeCache = new Map<string, Promise<{ items: readonly MergeItemRow[]; error: string }>>()
  const onMerge = (path: string) => {
    const cached = mergeCache.get(path)
    if (cached !== undefined) return cached
    const request = props.client.merge({ path }).catch((cause: unknown) => ({
      items: [] as readonly MergeItemRow[],
      error: cause instanceof Error ? cause.message : String(cause),
    }))
    mergeCache.set(path, request)
    return request
  }

  const reveal = (path: string) => {
    if (path.length === 0) return
    if (ctx.desktop !== undefined) {
      void ctx.desktop.reveal(path)
      return
    }
    ctx.system.openExternal(fileUrl(path))
  }

  const openImage = (path: string) => {
    if (path.length === 0) return
    ctx.system.openExternal(fileUrl(path))
  }

  const currentDraft = () => {
    const current = state()
    if (current === undefined || current.selected.length === 0) return undefined
    const rows = current.drafts
      .filter((draft) => draft.sessionId === current.selected && draft.id !== ignoredDraft())
      .sort((left, right) => right.createdAt - left.createdAt)
    return rows[0]
  }

  const useDraft = (value: string) => {
    writeDraft(value)
    queueMicrotask(() => document.querySelector<HTMLTextAreaElement>(".hyt-shell .box textarea")?.focus())
  }

  const today = () => {
    const date = new Date()
    const account = state()?.status.displayName || state()?.status.account || ""
    const stamp = `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAYS[date.getDay()]!}`
    return account.length > 0 ? text(ctx, "hyt.chat.brand.meta", { account, date: stamp }) : stamp
  }

  const headKind = () => {
    const session = selected()
    if (session === undefined) return ""
    if (!session.group) return text(ctx, "hyt.chat.head.direct")
    return session.members.length > 0 && session.members.length < 9
      ? text(ctx, "hyt.chat.head.group", { count: session.members.length })
      : text(ctx, "hyt.chat.sessions.group")
  }

  const headMeta = () => {
    const session = selected()
    if (session === undefined) return { live: "", updated: "" }
    return {
      live:
        state()?.status.bridge === "ready"
          ? text(ctx, "hyt.chat.head.live")
          : text(ctx, "hyt.chat.head.readonly"),
      updated: session.lastAt > 0 ? text(ctx, "hyt.chat.head.updated", { time: rowTime(ctx, session.lastAt) }) : "",
    }
  }

  return (
    <div
      class="hyt-shell"
      data-theme={ctx.appearance.mode()}
      data-panel={infoOpen() && !blank() && !loginOpen() ? "open" : "closed"}
      data-blank={blank() || loginOpen() ? "true" : "false"}
      data-resizing={resizing() ? "true" : undefined}
      style={{ "--rail": `${props.listWidth()}px` }}
    >
      {/*
        登录页要盖住整页：主界面有本地数据时 blank() 为 false，若只在空态分支里判断 loginOpen，
        栏脚的「登录」按钮点了不会有任何反应。
      */}
      <Show
        when={!blank() && !loginOpen() && phase() !== "no-account"}
        fallback={
          <Show
            when={loginOpen() || phase() === "no-account"}
            fallback={
              <Blank
                ctx={ctx}
                phase={phase()}
                detail={state()?.status.detail ?? ""}
                authError={state()?.status.authError ?? ""}
                credential={state()?.status.credential ?? "missing"}
                onRetry={refresh}
                onSettings={() => ctx.layout.settings()}
                onLogin={() => setLoginOpen(true)}
                onLogout={
                  state()?.status.credential === "saved" ? () => void logout() : undefined
                }
              />
            }
          >
            <LoginPage
              ctx={ctx}
              client={props.client}
              detail={state()?.status.detail ?? ""}
              initialError={state()?.status.authError ?? ""}
              defaultUser={state()?.status.credentialUser ?? ""}
              onCancel={blank() ? undefined : () => setLoginOpen(false)}
              onLoggedIn={() => setLoginOpen(false)}
            />
          </Show>
        }
      >
        <Rail
          ctx={ctx}
          sessions={sessions()}
          selected={selectedId()}
          unread={state()?.unread ?? 0}
          query={query()}
          hits={state()?.search.hits ?? []}
          searching={searching()}
          drafts={state()?.drafts ?? []}
          avatars={avatarMap()}
          today={today()}
          onSelect={select}
          onSearch={search}
          onMarkAllRead={() => void props.client.markAllRead().catch(fail)}
          credential={state()?.status.credential ?? "missing"}
          loggingOut={loggingOut()}
          onLogin={() => setLoginOpen(true)}
          onLogout={() => void logout()}
          onProfile={(session, element) => profile.open(element, personOfSession(session))}
          onPersonMenu={(session, event) => personMenu(personOfSession(session), event)}
          onMenu={sessionMenu}
          onEscape={() => {
            setQuery("")
            setSearching(false)
            void props.client.search({ query: "" }).catch(() => undefined)
          }}
        />

        <div
          class="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label={text(ctx, "hyt.chat.rail.resize")}
          aria-valuemin={RAIL_MIN}
          aria-valuemax={RAIL_MAX}
          aria-valuenow={Math.round(props.listWidth())}
          data-dragging={resizing() ? "true" : undefined}
          tabIndex={0}
          onPointerDown={beginResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onKeyDown={nudgeResize}
        />

        <section class="desk" aria-label={text(ctx, "hyt.chat.side.title")}>
          <header class="head">
            <Show when={selected()}>
              <span class="head-face" aria-hidden="true">
                {/* 群聊没有「脸」，固定用群头像；单聊才取对方的头像。 */}
                <Show when={selected()?.group !== true} fallback={<GroupMark />}>
                  <Show
                    when={headSource()}
                    fallback={(selected()?.members[0]?.name ?? selected()?.name ?? "").slice(0, 2)}
                  >
                    <img src={headSource()} alt="" onError={() => setHeadBroken(true)} />
                  </Show>
                </Show>
              </span>
              <div class="head-text">
                <h2 class="head-name">
                  <span>{selected()?.name}</span>
                  <span class="pill">{headKind()}</span>
                </h2>
                <div class="head-meta">
                  <span>{headMeta().live}</span>
                  <Show when={headMeta().updated.length > 0}>
                    <span>{headMeta().updated}</span>
                  </Show>
                </div>
              </div>
            </Show>
            <div class="head-actions">
              <button class="icon-btn" type="button" aria-label={text(ctx, "hyt.chat.head.search")} onClick={focusSearch}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4 4" />
                </svg>
              </button>
              <button class="icon-btn" type="button" aria-label={text(ctx, "hyt.chat.head.refresh")} onClick={refresh}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                  <path d="M20 12a8 8 0 1 1-2.4-5.7" />
                  <path d="M20 4v4h-4" />
                </svg>
              </button>
              <button
                class="icon-btn"
                type="button"
                aria-label={text(ctx, "hyt.chat.head.info")}
                aria-expanded={infoOpen() ? "true" : "false"}
                onClick={() => setInfoOpen(!infoOpen())}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="M12 11v5M12 8.2v.2" />
                </svg>
              </button>
            </div>
          </header>

          {/*
            凭据过期或被服务端踢下线时，本地历史仍能只读浏览，但发送一定失败。
            主界面也必须把这件事摆出来，否则用户只看到正常的会话列表。
          */}
          <Show when={(state()?.status.authError ?? "").length > 0}>
            <div class="auth-banner" role="status">
              <span>{text(ctx, "hyt.chat.state.auth.banner", { message: state()?.status.authError ?? "" })}</span>
              <button class="ghost" type="button" onClick={() => setLoginOpen(true)}>
                {text(ctx, "hyt.chat.rail.login")}
              </button>
            </div>
          </Show>

          <MessageStream
            ctx={ctx}
            messages={messages()}
            typing={state()?.typing.active ?? false}
            hasMore={state()?.hasMore ?? false}
            newMessageId={state()?.newMessageId ?? 0}
            loadingMore={loadingMore()}
            focusId={focusId()}
            onFocusDone={() => setFocusId(undefined)}
            onLatest={latest}
            onLoadMore={loadMore}
            avatars={avatarMap()}
            sessionId={selected()?.id ?? ""}
            receiptVersion={state()?.receiptsVersion ?? 0}
            onReceipts={(input) => props.client.receipts(input)}
            onAvatars={loadAvatars}
            onMedia={onMedia}
            onMerge={onMerge}
            onOpenFile={reveal}
            onOpenImage={openImage}
            onMenu={messageMenu}
            onProfile={(message, element) => profile.open(element, personOfMessage(message))}
            onPersonMenu={(message, event) => personMenu(personOfMessage(message), event)}
          />

          <Composer
            ctx={ctx}
            sessionName={selected()?.name ?? ""}
            value={draftText()}
            send={state()?.send ?? { enabled: false, reason: "" }}
            bridge={state()?.status.bridge ?? "missing"}
            sending={sending()}
            members={state()?.members ?? []}
            avatars={avatarMap()}
            draft={currentDraft()}
            basis={messages().length}
            notice={notice()}
            onInput={writeDraft}
            onSend={send}
            onUseDraft={useDraft}
            onIgnoreDraft={() => {
              const draft = currentDraft()
              if (draft !== undefined) setIgnoredDraft(draft.id)
            }}
            onRefresh={refresh}
            focus={composerFocus()}
          />
        </section>

        <InfoPanel
          ctx={ctx}
          session={selected()}
          directory={state()?.members ?? []}
          messages={messages()}
          avatars={avatarMap()}
          open={infoOpen()}
          onClose={() => setInfoOpen(false)}
          onOpenFile={reveal}
        />
      </Show>

      <MenuLayer ctx={ctx} menu={menu} />
      <ProfileCard ctx={ctx} profile={profile} onOpenSession={openSession} onCopy={copy} />
    </div>
  )

  /** 头像地址会随会话切换和头像表刷新变化，一变化就允许重新解码。 */
  createEffect(() => {
    headAvatar()
    setHeadBroken(false)
  })

  function headSource() {
    return headBroken() ? undefined : headAvatar()
  }

  function headAvatar() {
    const session = selected()
    if (session === undefined || session.group) return undefined
    const path = session.avatar
    if (path.length === 0) return undefined
    const value = avatarMap()[path]
    return value === undefined || value.length === 0 ? undefined : value
  }
}

/** 渲染用得到的全部字段：只要这些没变，就沿用上一份数组。 */
function messageKey(message: MessageRow) {
  return [
    message.id,
    message.kind,
    message.createdAt,
    message.sender,
    message.senderNick,
    message.outgoing ? 1 : 0,
    message.atMe ? 1 : 0,
    message.atNames.join("/"),
    message.text,
    message.fileName,
    message.fileSize,
    message.filePath,
    message.receipt === undefined
      ? ""
      : `${message.receipt.available ? 1 : 0}:${message.receipt.read}:${message.receipt.unread}`,
  ].join("\u0001")
}

function sessionKey(session: SessionRow) {
  return [
    session.id,
    session.name,
    session.preview,
    session.lastAt,
    session.unread,
    session.atMe ? 1 : 0,
    session.group ? 1 : 0,
    session.online ? 1 : 0,
    session.members.map((member) => `${member.name}\u0000${member.headPath}`).join("/"),
  ].join("\u0001")
}

function reasonLabel(ctx: Context, reason: string) {
  if (reason === "empty") return text(ctx, "hyt.chat.composer.empty")
  if (reason === "not-allowed") return text(ctx, "hyt.chat.composer.disabled.notAllowed")
  if (reason === "whitelist-empty") return text(ctx, "hyt.chat.composer.disabled.whitelist")
  if (reason === "bridge-missing") return text(ctx, "hyt.chat.composer.bridge.missing")
  if (reason === "pending") return text(ctx, "hyt.chat.composer.disabled.pending")
  if (reason === "not-wired") return text(ctx, "hyt.chat.composer.notWired")
  return reason
}

/** 本地文件用默认应用打开；`file://` 下保留盘符的冒号，只转义空格与中文。 */
function fileUrl(path: string) {
  const normalized = path.replace(/\\/g, "/")
  return encodeURI(normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`)
}
