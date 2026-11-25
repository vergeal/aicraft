import type { WebContentsView } from "electron"
import { WebContentsView as View, session as electronSession } from "electron"
import type { Embed, IpcImpl, MainContext } from "@aicraft/aix/gui/main"
import { ItsmBrowser } from "../src/ipc.js"
import { importChromeCookies } from "./cookies.js"
import { Cdp, probePage, timeoutOf } from "./cdp.js"
import { openServiceByName, readCatalog, runStep, searchIn } from "./steps.js"

/** 一个窗口里一个账号的内嵌浏览器；分区不同，登录态互不影响。 */
interface Entry {
  readonly key: string
  readonly embed: Embed
  readonly view: WebContentsView
  readonly cdp: Cdp
}

/**
 * 内嵌浏览器的主进程实现。窗口每要一个账号的浏览器就建一个 `WebContentsView`，每个账号固定一个
 * `persist:` 分区，所以导入的 cookie 与手动登录都留在自己的分区里。页面操作都是只读的，只有 `runStep`
 * 会真的填写；提交永远由界面上的二次确认触发。
 */
export function createHost(ctx: MainContext): IpcImpl<(typeof ItsmBrowser)["spec"]> {
  const entries = new Map<string, Entry>()

  const forget = (entry: Entry) => {
    entries.delete(entry.key)
    void entry.cdp.detach().catch(() => undefined)
    entry.embed.dispose()
    const contents = entry.view.webContents
    if (!contents.isDestroyed()) contents.close()
  }

  const find = (embedId: string) => {
    for (const entry of entries.values()) if (entry.embed.id === embedId) return entry
    throw new Error("内嵌浏览器还没有创建。先点「打开内嵌浏览器」再继续。")
  }

  const create = (caller: { window: number }, accountId: string, partition: string) => {
    const window = ctx.windows.get(caller.window)
    if (!window) throw new Error("找不到发起请求的窗口，可能已经关闭。")
    const view = new View({
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
        devTools: false,
        backgroundThrottling: false,
        // 自动化在后台推进时不应抢走用户的键盘焦点。
        focusOnNavigation: false,
      },
    })
    const contents = view.webContents
    // 门户有些入口会开新窗口；自动化只驱动当前这一个 view，所以把新地址接回来。
    contents.setWindowOpenHandler(({ url }) => {
      void contents.loadURL(url).catch(() => undefined)
      return { action: "deny" }
    })
    // 隐藏的 view 拿不到真实尺寸，先给一个桌面大小的初始边界。
    view.setBounds({ x: 0, y: 0, width: 1_000, height: 700 })
    const embed = ctx.embeds.create(view, window)
    const entry: Entry = { key: `${caller.window}:${accountId}`, embed, view, cdp: new Cdp(contents) }
    entries.set(entry.key, entry)
    return entry
  }

  const stateOf = (cdp: Cdp) =>
    cdp.evaluate<{ url: string; title: string; ready: boolean }>(
      `(() => ({ url: location.href, title: document.title, ready: document.readyState === "complete" }))()`,
    )

  const watched = ctx.windows.on("close", (window) => {
    for (const entry of [...entries.values()]) if (entry.key.startsWith(`${window.id}:`)) forget(entry)
  })

  ctx.onCleanup(() => {
    watched()
    for (const entry of [...entries.values()]) forget(entry)
  })

  return {
    ensure: (input, caller) => {
      const key = `${caller.window}:${input.accountId}`
      const existing = entries.get(key)
      if (existing && !existing.view.webContents.isDestroyed())
        return { embed: existing.embed.id, partition: input.partition }
      if (existing) forget(existing)
      const entry = create(caller, input.accountId, input.partition)
      return { embed: entry.embed.id, partition: input.partition }
    },
    show: (input) => {
      find(input.embed).embed.show(input.visible)
    },
    navigate: async (input) => {
      const { cdp } = find(input.embed)
      if (input.url.length > 0) {
        await cdp.send("Page.navigate", { url: input.url })
        await cdp.waitFor(`document.readyState === "complete"`, timeoutOf(input.timeoutMs))
      }
      await cdp.inject()
      return stateOf(cdp)
    },
    page: (input) => stateOf(find(input.embed).cdp),
    probe: async (input) => {
      const { cdp } = find(input.embed)
      await cdp.waitFor(`document.body && document.body.innerText.length > 0`, timeoutOf(input.timeoutMs))
      return probePage(cdp)
    },
    loginState: async (input) => {
      const { cdp } = find(input.embed)
      await cdp.inject()
      return cdp.evaluate<{ loggedIn: boolean; url: string; title: string }>(`(() => {
        const url = location.href
        const title = document.title
        const text = (document.body && document.body.innerText || "").trim().slice(0, 2_000)
        const password = Array.from(document.querySelectorAll('input[type="password"]')).some(globalThis.__itsm.visible)
        const loginPage = /login|passport|sso|signin/i.test(url) || /登录|sign in/i.test(title)
        return { loggedIn: text.length > 0 && !password && !loginPage, url, title }
      })()`)
    },
    importCookies: async (input) => {
      const target = electronSession.fromPartition(input.partition)
      return importChromeCookies({ session: target, chromeProfile: input.chromeProfile })
    },
    catalog: async (input) => {
      const { cdp } = find(input.embed)
      const items = await readCatalog(cdp, timeoutOf(input.timeoutMs))
      return { items, source: "dom", syncedAt: new Date().toISOString() }
    },
    openService: async (input) => {
      const { cdp } = find(input.embed)
      const timeoutMs = timeoutOf(input.timeoutMs)
      const searched = await searchIn(cdp, input.serviceName, timeoutMs)
      if (searched.status === "failed") throw new Error(searched.error ?? `没有搜到「${input.serviceName}」。`)
      const opened = await openServiceByName(cdp, input.serviceName, timeoutMs)
      if (opened.status === "failed") throw new Error(opened.error ?? `没能打开「${input.serviceName}」。`)
      return stateOf(cdp)
    },
    runStep: (input) =>
      runStep(input.stepId, {
        cdp: find(input.embed).cdp,
        template: input.template,
        values: input.values,
        timeoutMs: timeoutOf(input.timeoutMs),
        back: input.back,
      }),
    dispose: (input) => {
      forget(find(input.embed))
    },
  }
}
