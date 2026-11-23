export * as BrowserRuntime from "./browser.js"

import type { PluginOptions } from "@opencode/plugin/options"
import type { Browser as CdpBrowser, BrowserContext, Page, chromium } from "playwright-core"
import { spawn } from "node:child_process"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { homedir, platform } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import type { Browser } from "./rpc.js"

type Playwright = { chromium: typeof chromium }

type Log = { level: "debug" | "log" | "info" | "warning" | "error"; text: string }

type State = {
  readonly profile: string
  readonly options: PluginOptions
  launching?: Promise<{ context: BrowserContext; channel: string }>
  browser?: CdpBrowser
  /** True when this plugin started the Chrome process itself; only then may it stop it again. */
  owned: boolean
  pid?: number
  context?: BrowserContext
  channel: string
  tabs: Map<Page, number>
  next: number
  logs: WeakMap<Page, Log[]>
  error?: string
  /** Set when this plugin had to start Chrome because no other browser was available. */
  note?: string
}

/**
 * Playwright resolves its own driver files relative to its package directory, so the driver ships as a package under
 * `assets/playwright-core` instead of being inlined into the server bundle. A worktree run falls back to the
 * devDependency.
 */
function load(): Playwright {
  const require = createRequire(import.meta.url)
  const asset = fileURLToPath(new URL("../assets/playwright-core/index.js", import.meta.url))
  return require(existsSync(asset) ? asset : require.resolve("playwright-core")) as Playwright
}

function profilePath(options: PluginOptions) {
  const configured = options.profile
  if (typeof configured === "string" && configured.length > 0) {
    return configured.startsWith("~") ? join(homedir(), configured.slice(1)) : configured
  }
  // A separate directory from the old Playwright profile: a profile written by Playwright's bundled Chromium makes
  // the installed Chrome refuse to start while it migrates the data.
  return join(homedir(), ".opencode", "webwright", "chrome-profile")
}

/**
 * Webwright drives the installed Chrome through the DevTools protocol and never falls back to a downloaded browser.
 * Playwright's bundled Chromium is branded "Chrome for Testing", which is not what the user asked us to automate.
 */
function chromePath() {
  const candidates =
    platform() === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : platform() === "win32"
        ? [
            join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
            join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome"]
  return candidates.find((path) => existsSync(path))
}

async function launch(state: State) {
  if (state.context) return { context: state.context, channel: state.channel }
  if (state.launching) return state.launching
  state.launching = start(state).finally(() => {
    state.launching = undefined
  })
  return state.launching
}

async function start(state: State) {
  const { chromium } = load()
  const configured = typeof state.options.cdp === "string" && state.options.cdp.length > 0 ? state.options.cdp : undefined
  if (configured) {
    // An endpoint the user already opened is theirs: attach to it, but never stop it on dispose.
    const browser = await chromium.connectOverCDP(configured)
    return adopt(state, browser, configured, undefined)
  }
  const existing = await connectExisting(state, chromium)
  if (existing) return existing
  // Attaching to a browser the user already has open is always preferred. Only when nothing at all is running may
  // this plugin start its own Chrome: a second Chrome window appearing behind the user's back is not acceptable.
  const running = await runningBrowsers()
  if (running.length > 0) throw blocked(running)
  const chrome = chromePath()
  if (!chrome)
    throw new Error(
      "Webwright only drives the installed Google Chrome over CDP; Playwright's bundled Chromium is not used. " +
        "Install Google Chrome, or set `cdp` to the endpoint of a Chrome started with --remote-debugging-port.",
    )
  const { port, pid } = await startChrome(chrome, state.profile, state.options.headless === true)
  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    state.note = `本机没有任何浏览器在运行，已为你启动独立的 Chrome（用户目录 ${state.profile}，调试端口 ${port}）`
    return adopt(state, browser, `chrome-cdp:${port}`, pid)
  } catch (error) {
    stopProcess(pid)
    throw new Error(
      `Chrome started but refused the CDP connection on port ${port}: ${error instanceof Error ? error.message : String(error)}. ` +
        `Close any Chrome already using ${state.profile} and try again.`,
    )
  }
}

/** Ports a browser that a user started by hand most often publishes for CDP. */
const KNOWN_CDP_PORTS = [9222, 9223, 9224, 9333]

const PROBE_TIMEOUT_MS = 800

/**
 * Attach to an already running browser that exposes a debugging port, including the one this plugin started in an
 * earlier session (its port is recorded in the profile). Returns undefined when no reachable endpoint exists.
 */
async function connectExisting(state: State, chromium: Playwright["chromium"]) {
  const own = readDevToolsPort(join(state.profile, "DevToolsActivePort"))
  const ports = [...new Set([...KNOWN_CDP_PORTS, ...(own === undefined ? [] : [own])])]
  for (const port of ports) {
    if (!(await probe(port))) continue
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => undefined)
    if (!browser) continue
    // A browser with no window has no context to drive; leave it alone instead of failing the whole call.
    if (browser.contexts().length === 0) {
      await browser.close().catch(() => {})
      continue
    }
    return adopt(state, browser, `chrome-cdp:${port}`, undefined)
  }
  return undefined
}

async function probe(port: number) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  }).catch(() => undefined)
  if (!response?.ok) return false
  const body: unknown = await response.json().catch(() => undefined)
  if (typeof body !== "object" || body === null) return false
  const fields = body as Record<string, unknown>
  if (fields.webSocketDebuggerUrl === undefined) return false
  // The desktop client is Electron too and publishes CDP on 9222 in development. Driving the app itself is never a
  // web browser, so its endpoint is rejected even though it answers the same protocol and even reports a Chrome
  // version; only its User-Agent names Electron.
  return !String(fields["User-Agent"]).includes("Electron/")
}

/** Process names of the browsers we look for before deciding that no browser is running at all. */
const BROWSER_PROCESSES: Record<string, string[]> = {
  darwin: [
    "Google Chrome",
    "Google Chrome Canary",
    "Chromium",
    "Microsoft Edge",
    "Brave Browser",
    "Brave Browser Beta",
    "Arc",
    "Safari",
    "firefox",
    "Firefox",
    "Opera",
    "Vivaldi",
  ],
  win32: ["chrome.exe", "msedge.exe", "brave.exe", "chromium.exe", "firefox.exe", "opera.exe", "vivaldi.exe"],
  linux: [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "brave-browser",
    "firefox",
    "opera",
  ],
}

/** Browsers the user already has open, by process name. Empty means the desktop has no browser at all. */
export async function runningBrowsers() {
  const key = platform() === "darwin" ? "darwin" : platform() === "win32" ? "win32" : "linux"
  const names = BROWSER_PROCESSES[key] ?? []
  if (key === "win32") {
    const output = await run("tasklist", ["/NH"])
    return names.filter((name) => output?.toLowerCase().includes(name.toLowerCase()) === true)
  }
  const found = await Promise.all(
    names.map(async (name) => ((await run("pgrep", ["-x", name])) === undefined ? undefined : name)),
  )
  return found.filter((name) => name !== undefined)
}

function run(command: string, args: string[]) {
  return new Promise<string | undefined>((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] })
    let output = ""
    child.stdout?.on("data", (chunk) => (output += chunk))
    child.on("error", () => resolve(undefined))
    child.on("close", (code) => resolve(code === 0 ? output : undefined))
  })
}

/**
 * Never start a second browser behind the user's back, and never kill the one they already own. A browser without a
 * debugging port cannot be driven over CDP, so the only honest answer is an error that says how to fix it.
 */
function blocked(running: string[]) {
  return new Error(
    `检测到你已打开 ${running.join("、")}，但它没有开启 CDP 调试端口，无法接管；` +
      `webwright 不会另外启动一个 Chrome 实例，也不会关掉你的浏览器。` +
      "请用一个独立的用户数据目录带 --remote-debugging-port=9222 重启 Chrome（例如 " +
      `open -na "Google Chrome" --args --user-data-dir=/tmp/webwright-cdp --remote-debugging-port=9222），` +
      "或把这个端点配置到插件的 cdp 选项后重试。",
  )
}

function adopt(state: State, browser: CdpBrowser, channel: string, pid?: number) {
  const context = browser.contexts()[0]
  if (!context)
    throw new Error(
      "The CDP browser has no default context. Start Chrome normally with --remote-debugging-port and make sure it has at least one window.",
    )
  state.browser = browser
  state.pid = pid
  state.owned = pid !== undefined
  state.context = context
  state.channel = channel
  context.on("page", (page) => attach(state, page))
  context.pages().forEach((page) => attach(state, page))
  browser.on("disconnected", () => {
    state.context = undefined
    state.browser = undefined
    state.pid = undefined
    state.tabs.clear()
  })
  return { context, channel }
}

function stopProcess(pid?: number) {
  if (pid === undefined) return
  try {
    process.kill(pid, "SIGTERM")
  } catch {
    // The process is already gone.
  }
}

const START_TIMEOUT_MS = 15_000

/**
 * Start the installed Chrome with an ephemeral debugging port and read the port it picked. The port cannot be fixed
 * in advance because the user's other apps may already hold it, and Chrome itself may already be serving CDP.
 */
async function startChrome(chrome: string, profile: string, headless: boolean) {
  const portFile = join(profile, "DevToolsActivePort")
  rmSync(portFile, { force: true })
  const child = spawn(
    chrome,
    [
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      ...(headless ? ["--headless=new"] : []),
    ],
    { detached: true, stdio: "ignore" },
  )
  child.unref()
  const pid = child.pid
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    const port = readDevToolsPort(portFile)
    if (port !== undefined) return { port, pid }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  stopProcess(pid)
  throw new Error(
    `Chrome did not expose a DevTools port within ${START_TIMEOUT_MS / 1_000}s. ` +
      `If Chrome is already running with ${profile}, close it so this plugin can start it with --remote-debugging-port.`,
  )
}

function readDevToolsPort(file: string) {
  try {
    const line = readFileSync(file, "utf8").split("\n")[0]?.trim()
    const port = Number(line)
    return Number.isInteger(port) && port > 0 ? port : undefined
  } catch {
    return undefined
  }
}


function attach(state: State, page: Page) {
  if (state.tabs.has(page)) return
  state.tabs.set(page, state.next++)
  // Record surfaces before the page's own scripts run, and re-run now for a page that was already loading.
  void page.addInitScript(surfaceRecorder).catch(() => {})
  void page.evaluate(surfaceRecorder).catch(() => {})
  const logs: Log[] = []
  state.logs.set(page, logs)
  page.on("console", (message) => {
    const type = message.type()
    const level: Log["level"] =
      type === "debug" ? "debug" : type === "info" ? "info" : type === "warning" ? "warning" : type === "error" ? "error" : "log"
    logs.push({ level, text: message.text().slice(0, 4_000) })
    if (logs.length > 200) logs.shift()
  })
  page.on("close", () => state.tabs.delete(page))
}

function tabID(state: State, page: Page) {
  const id = state.tabs.get(page)
  if (id !== undefined) return id
  attach(state, page)
  return state.tabs.get(page)!
}

async function page(state: State, id: number) {
  const { context } = await launch(state)
  for (const item of context.pages()) {
    attach(state, item)
    if (state.tabs.get(item) === id) return item
  }
  throw new Error(`No browser tab has id ${id}. Discard it and read webwright.tabs.list; tab ids can change after a close.`)
}

async function tab(state: State, item: Page): Promise<Browser.Tab> {
  return {
    id: tabID(state, item),
    url: item.url(),
    title: await item.title().catch(() => ""),
    active: await item.evaluate(() => document.visibilityState === "visible").catch(() => false),
  }
}

/** about:blank and Chrome's startup new-tab page carry no content, so they are never real targets. */
function isBlankUrl(url: string) {
  const value = url.trim().toLowerCase()
  return (
    value === "about:blank" ||
    value.startsWith("about:blank#") ||
    value === "chrome://newtab/" ||
    value === "chrome://new-tab-page/"
  )
}

function untrusted(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(`${action} failed: ${message}`)
}

type Box = { x: number; y: number; width: number; height: number }

type Recorded = {
  key: string
  tag: string
  element: Element
  born: Box
  seen: Box
  updates: number
}

/**
 * Runs in every document before the page's own scripts. Canvas UIs draw after layout, and a repaint can replace the
 * DOM around the canvas, so the only reliable moment to record where a surface sits — and where it sat when it was
 * created — is the frame it first appears. The recorder keeps that first-seen box alongside the live one.
 */
function surfaceRecorder() {
  const store = ((window as unknown as { __webwright?: { surfaces: Recorded[]; installed?: boolean } }).__webwright ??= {
    surfaces: [],
  })
  const box = (element: Element): Box => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }
  const keyOf = (element: Element) => {
    const parts: string[] = []
    let current: Element | null = element
    while (current && current !== document.documentElement) {
      const parent: Element | null = current.parentElement
      const index = parent ? Array.from(parent.children).indexOf(current) + 1 : 1
      parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`)
      current = parent
    }
    return parts.join(">")
  }
  const record = (element: Element) => {
    const seen = box(element)
    const existing = store.surfaces.find((entry) => entry.element === element)
    if (existing) {
      existing.seen = seen
      existing.updates += 1
      return
    }
    store.surfaces.push({
      key: keyOf(element),
      tag: element.tagName.toLowerCase(),
      element,
      born: seen,
      seen,
      updates: 0,
    })
  }
  const scan = () =>
    document
      .querySelectorAll("canvas,svg,video,iframe,object,embed,[data-webwright-surface]")
      .forEach(record)
  if (store.installed) {
    scan()
    return
  }
  store.installed = true
  let scheduled = false
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      scan()
    })
  }
  const start = () => {
    scan()
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true })
  }
  if (document.documentElement) start()
  else document.addEventListener("DOMContentLoaded", start, { once: true })
  addEventListener("scroll", scan, { passive: true })
  addEventListener("resize", scan)
}

/** Read the recorded surfaces, refreshing the live box and canvas backing-store scale. */
function readSurfaces(item: Page) {
  return item.evaluate(() => {
    const store = (window as unknown as { __webwright?: { surfaces: Recorded[] } }).__webwright
    const surfaces = (store?.surfaces ?? []).map((entry) => {
      const rect = entry.element.getBoundingClientRect()
      const connected = entry.element.isConnected
      const canvas = entry.element instanceof HTMLCanvasElement ? entry.element : undefined
      const centerX = rect.x + rect.width / 2
      const centerY = rect.y + rect.height / 2
      const inside =
        centerX >= 0 && centerY >= 0 && centerX <= window.innerWidth && centerY <= window.innerHeight
      // A surface that is not the topmost element at its own center is painted over, so a click there reaches
      // something else; report it instead of letting the agent guess.
      const covered = inside && document.elementFromPoint(centerX, centerY) !== entry.element
      return {
        tag: entry.tag,
        key: entry.key,
        name: (
          entry.element.getAttribute("aria-label") ??
          entry.element.getAttribute("title") ??
          entry.element.getAttribute("class") ??
          ""
        ).slice(0, 120),
        box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        born: entry.born,
        ...(canvas
          ? {
              backing: { width: canvas.width, height: canvas.height },
              scale: { x: canvas.width / (rect.width || 1), y: canvas.height / (rect.height || 1) },
            }
          : {}),
        inViewport: inside,
        updates: entry.updates,
        connected,
        covered,
      }
    })
    return {
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      surfaces,
    }
  })
}

async function locator(state: State, id: number, ref: string) {
  const item = await page(state, id)
  const found = item.locator(`[data-ocref="${ref}"]`)
  if ((await found.count()) === 0)
    throw new Error(
      `Element ref ${ref} is not on the page. Refs expire on navigation and on the next snapshot; call webwright.snapshot again and use a current ref.`,
    )
  return { item, found }
}

export function create(options: PluginOptions) {
  const state: State = {
    profile: profilePath(options),
    options,
    owned: false,
    channel: "",
    tabs: new Map(),
    next: 1,
    logs: new WeakMap(),
  }

  /** Every page operation starts by resolving the tab, so a closed or replaced browser reports clearly. */
  async function withPage<T>(id: number, action: string, run: (item: Page) => Promise<T>) {
    try {
      return await run(await page(state, id))
    } catch (error) {
      throw untrusted(action, error)
    }
  }

  return {
    async status(): Promise<{
      ready: boolean
      browser: string
      version: string
      profile: string
      tabs: number
      error?: string
      note?: string
    }> {
      try {
        const { context, channel } = await launch(state)
        state.error = undefined
        return {
          ready: true,
          browser: channel,
          version: context.browser()?.version() ?? "",
          profile: state.profile,
          tabs: context.pages().length,
          ...(state.note === undefined ? {} : { note: state.note }),
        }
      } catch (error) {
        state.error = error instanceof Error ? error.message : String(error)
        return { ready: false, browser: "", version: "", profile: state.profile, tabs: 0, error: state.error }
      }
    },

    async tabs() {
      const { context } = await launch(state)
      return {
        tabs: await Promise.all(context.pages().map((item) => tab(state, item))),
        ...(state.note === undefined ? {} : { note: state.note }),
      }
    },

    async open(input: { url?: string; active?: boolean }) {
      try {
        const url = input.url?.trim()
        if (!url || isBlankUrl(url))
          throw new Error("tabs.open needs an http(s) URL; about:blank tabs are not allowed")
        const { context } = await launch(state)
        // Reuse the blank page Chrome opened on startup instead of stacking another blank tab on top of it.
        const item = context.pages().find((page) => isBlankUrl(page.url())) ?? (await context.newPage())
        attach(state, item)
        await item.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
        if (input.active !== false) await item.bringToFront()
        return tab(state, item)
      } catch (error) {
        throw untrusted("webwright.tabs.open", error)
      }
    },

    async close(id: number) {
      return withPage(id, "webwright.tabs.close", async (item) => {
        await item.close()
        state.tabs.delete(item)
        return { ok: true }
      })
    },

    async focus(id: number) {
      return withPage(id, "webwright.tabs.focus", async (item) => {
        await item.bringToFront()
        return tab(state, item)
      })
    },

    async navigate(id: number, url: string) {
      return withPage(id, "webwright.navigate", async (item) => {
        await item.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 })
        return tab(state, item)
      })
    },

    async back(id: number) {
      return withPage(id, "webwright.back", async (item) => {
        await item.goBack({ waitUntil: "domcontentloaded", timeout: 30_000 })
        return tab(state, item)
      })
    },

    async forward(id: number) {
      return withPage(id, "webwright.forward", async (item) => {
        await item.goForward({ waitUntil: "domcontentloaded", timeout: 30_000 })
        return tab(state, item)
      })
    },

    async reload(id: number) {
      return withPage(id, "webwright.reload", async (item) => {
        await item.reload({ waitUntil: "domcontentloaded", timeout: 30_000 })
        return tab(state, item)
      })
    },

    async snapshot(id: number, maxNodes = 2_000, includeHidden = false) {
      return withPage(id, "webwright.snapshot", async (item) => read(item, { maxNodes, includeHidden }))
    },

    async find(id: number, text: string) {
      return withPage(id, "webwright.find", async (item) => {
        const result = await read(item, { maxNodes: 10_000, includeHidden: false })
        const needle = text.toLowerCase()
        const lines = result.content.split("\n").filter((line) => line.toLowerCase().includes(needle))
        const refs = lines.flatMap((line) => line.match(/\[(e[1-9][0-9]*)\]/u)?.[1] ?? []).length
        return {
          content: lines.length > 0 ? lines.join("\n") : `No line contains ${JSON.stringify(text)}.`,
          truncated: result.truncated,
          refs,
          url: result.url,
          title: result.title,
        }
      })
    },

    async surfaces(id: number) {
      return withPage(id, "webwright.surfaces", async (item) => {
        // A page that loaded before this plugin attached still needs the recorder; the store makes it idempotent.
        await item.evaluate(surfaceRecorder).catch(() => {})
        return readSurfaces(item)
      })
    },

    async clickAt(
      id: number,
      x: number,
      y: number,
      input: { button?: "left" | "right" | "middle"; count?: 1 | 2; modifiers?: ReadonlyArray<"Alt" | "Control" | "Meta" | "Shift"> },
    ) {
      return withPage(id, "webwright.click_at", async (item) => {
        const modifiers = [...(input.modifiers ?? [])]
        for (const key of modifiers) await item.keyboard.down(key)
        try {
          await item.mouse.click(x, y, { button: input.button ?? "left", clickCount: input.count ?? 1 })
        } finally {
          for (const key of modifiers) await item.keyboard.up(key).catch(() => {})
        }
        return { ok: true }
      })
    },

    async drag(
      id: number,
      input: { fromX: number; fromY: number; toX: number; toY: number; steps?: number; button?: "left" | "right" | "middle" },
    ) {
      return withPage(id, "webwright.drag", async (item) => {
        const button = input.button ?? "left"
        await item.mouse.move(input.fromX, input.fromY)
        await item.mouse.down({ button })
        try {
          await item.mouse.move(input.toX, input.toY, { steps: input.steps ?? 12 })
        } finally {
          await item.mouse.up({ button })
        }
        return { ok: true }
      })
    },

    async click(
      id: number,
      ref: string,
      input: { button?: "left" | "right" | "middle"; count?: 1 | 2; modifiers?: ReadonlyArray<"Alt" | "Control" | "Meta" | "Shift"> },
    ) {
      const { found } = await locator(state, id, ref)
      try {
        await found.click({
          button: input.button ?? "left",
          clickCount: input.count ?? 1,
          modifiers: [...(input.modifiers ?? [])],
        })
        return { ok: true }
      } catch (error) {
        throw untrusted("webwright.click", error)
      }
    },

    async hover(id: number, ref: string) {
      const { found } = await locator(state, id, ref)
      try {
        await found.hover()
        return { ok: true }
      } catch (error) {
        throw untrusted("webwright.hover", error)
      }
    },

    async fill(id: number, ref: string, text: string) {
      const { found } = await locator(state, id, ref)
      try {
        await found.fill(text)
        return { ok: true, value: await found.inputValue().catch(() => text) }
      } catch (error) {
        throw untrusted("webwright.fill", error)
      }
    },

    async fillForm(
      id: number,
      fields: ReadonlyArray<
        | { type: "text"; ref: string; value: string }
        | { type: "select"; ref: string; values: readonly string[] }
        | { type: "check"; ref: string; checked: boolean }
      >,
    ) {
      for (const field of fields) {
        const { found } = await locator(state, id, field.ref)
        try {
          if (field.type === "text") await found.fill(field.value)
          else if (field.type === "select") await found.selectOption([...field.values])
          else await found.setChecked(field.checked)
        } catch (error) {
          throw untrusted(`webwright.fill_form at ${field.ref}`, error)
        }
      }
      return { ok: true }
    },

    async select(id: number, ref: string, values: readonly string[]) {
      const { found } = await locator(state, id, ref)
      try {
        return { ok: true, values: await found.selectOption([...values]) }
      } catch (error) {
        throw untrusted("webwright.select", error)
      }
    },

    async check(id: number, ref: string, checked: boolean) {
      const { found } = await locator(state, id, ref)
      try {
        await found.setChecked(checked)
        return { ok: true }
      } catch (error) {
        throw untrusted("webwright.check", error)
      }
    },

    async press(id: number, key: string, ref?: string) {
      try {
        if (ref) {
          const { found } = await locator(state, id, ref)
          await found.press(key)
        } else await (await page(state, id)).keyboard.press(key)
        return { ok: true }
      } catch (error) {
        throw untrusted("webwright.press", error)
      }
    },

    async scroll(id: number, deltaY: number, ref?: string) {
      return withPage(id, "webwright.scroll", async (item) => {
        if (ref) await item.locator(`[data-ocref="${ref}"]`).scrollIntoViewIfNeeded()
        await item.mouse.wheel(0, deltaY)
        return { ok: true, scrollY: await item.evaluate(() => window.scrollY) }
      })
    },

    async evaluate(id: number, script: string, ref?: string) {
      return withPage(id, "webwright.evaluate", async (item) => {
        const value = await item.evaluate(
          ({ script, ref }) => {
            const target = ref ? document.querySelector(`[data-ocref="${ref}"]`) : document
            if (!target) throw new Error(`Element ref ${ref} is not on the page.`)
            // CSP can block Function construction; the error is reported instead of being hidden.
            return new Function("element", `return (${script})`)(target)
          },
          { script, ref },
        )
        return { value: value ?? null }
      })
    },

    async html(id: number, selector?: string) {
      return withPage(id, "webwright.html", async (item) => {
        const html = selector
          ? await item.locator(selector).first().evaluate((element) => element.outerHTML)
          : await item.content()
        const limit = 100_000
        return {
          html: html.slice(0, limit),
          truncated: html.length > limit,
          url: item.url(),
          title: await item.title().catch(() => ""),
        }
      })
    },

    async screenshot(id: number, fullPage = false) {
      return withPage(id, "webwright.screenshot", async (item) => {
        const bytes = await item.screenshot({ fullPage, type: "png" })
        return { dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`, mime: "image/png" }
      })
    },

    async wait(id: number, input: { text?: string; selector?: string; timeoutMs?: number }) {
      return withPage(id, "webwright.wait", async (item) => {
        const timeout = input.timeoutMs ?? 30_000
        if (input.selector) await item.waitForSelector(input.selector, { timeout })
        else if (input.text)
          await item.waitForFunction(
            (needle) => (document.body?.innerText ?? "").toLowerCase().includes(needle),
            input.text.toLowerCase(),
            { timeout },
          )
        else throw new Error("webwright.wait needs text or selector.")
        return { ok: true }
      })
    },

    async console(id: number) {
      return withPage(id, "webwright.console", async (item) => ({ messages: state.logs.get(item) ?? [] }))
    },

    async dispose() {
      const browser = state.browser
      const owned = state.owned
      const pid = state.pid
      state.context = undefined
      state.browser = undefined
      state.pid = undefined
      state.owned = false
      state.tabs.clear()
      // Only the Chrome this plugin started is ours to stop. A browser reached through a user-provided `cdp`
      // endpoint belongs to the user, so closing the connection must not close it.
      if (!owned || !browser) return
      stopProcess(pid)
      await browser.close().catch(() => {})
    },
  }
}

/** Read the page as a compact tree and stamp fresh refs, so actions can target stable data attributes. */
function read(item: Page, input: { maxNodes: number; includeHidden: boolean }) {
  return item.evaluate(({ maxNodes, includeHidden }) => {
    document.querySelectorAll("[data-ocref]").forEach((element) => element.removeAttribute("data-ocref"))
    const clean = (value: string | null | undefined) =>
      (value ?? "").replace(/\s+/g, " ").trim().slice(0, 160)
    const visible = (element: Element) => {
      if (includeHidden) return true
      const style = getComputedStyle(element)
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false
      const rect = element.getBoundingClientRect()
      return rect.width > 0 || rect.height > 0
    }
    const interactive =
      "a,button,input,select,textarea,summary,[role],[contenteditable],label,[onclick],[tabindex]"
    const nodes = Array.from(
      document.querySelectorAll(`${interactive},h1,h2,h3,h4,h5,h6,p,li,td,th,pre,code`),
    )
    const lines: string[] = []
    let refs = 0
    let truncated = false
    for (const element of nodes) {
      if (refs >= maxNodes) {
        truncated = true
        break
      }
      if (!visible(element)) continue
      const text = clean(element.textContent)
      if (element.matches(interactive)) {
        refs += 1
        const ref = `e${refs}`
        element.setAttribute("data-ocref", ref)
        const role = element.getAttribute("role") ?? element.tagName.toLowerCase()
        const name =
          clean(
            element.getAttribute("aria-label") ??
              element.getAttribute("alt") ??
              element.getAttribute("title") ??
              (element instanceof HTMLInputElement ? element.value || element.placeholder : ""),
          ) || text.slice(0, 80)
        const extra =
          element instanceof HTMLInputElement
            ? ` type=${element.type}${element.type === "checkbox" || element.type === "radio" ? ` checked=${element.checked}` : ""}`
            : element instanceof HTMLSelectElement
              ? ` options=${element.options.length}`
              : ""
        lines.push(`[${ref}] ${role} "${name}"${extra}`)
      } else if (text) lines.push(`${element.tagName.toLowerCase()}: ${text.slice(0, 200)}`)
    }
    // Painted surfaces have no DOM inside them. Name them here so a caller knows to read coordinates from
    // webwright.surfaces instead of looking for element refs that cannot exist.
    for (const element of document.querySelectorAll("canvas,svg,video,iframe,object,embed")) {
      if (!visible(element)) continue
      const rect = element.getBoundingClientRect()
      lines.push(
        `surface ${element.tagName.toLowerCase()} ${Math.round(rect.width)}x${Math.round(rect.height)} at ${Math.round(rect.x)},${Math.round(rect.y)} — no DOM inside, use webwright.surfaces and webwright.click_at`,
      )
    }
    return {
      content: lines.join("\n"),
      truncated,
      refs,
      url: location.href,
      title: document.title,
    }
  }, input)
}
