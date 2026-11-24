import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs"
import { enableCompileCache } from "node:module"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { app } from "electron"
import { debugBuild, memoryLogInterval } from "@aicraft/gui-plugins/debug/options"
import { APP_ID, APP_NAME, CHANNEL } from "../constants"
import { remoteDebuggingPort } from "../diagnostics/options"

const testOnboarding = process.env.AICRAFT_TEST_ONBOARDING === "1"

const jsCallStackFeature = "DocumentPolicyIncludeJSCallStacksInCrashReports"

// Runs synchronously from the entry module, before Chromium is ready: command-line switches only
// take effect before ready, the single-instance lock is scoped to userData, and the early window
// needs userData to find the persisted window list and state.
export function configureApplication() {
  try {
    process.chdir(homedir())
  } catch {}

  process.env.AICRAFT_DISABLE_EMBEDDED_WEB_UI = "true"

  app.setName(APP_NAME)
  app.setAppUserModelId(APP_ID)
  app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>")
  const features = app.commandLine.getSwitchValue("enable-features")
  app.commandLine.appendSwitch("enable-features", features ? `${jsCallStackFeature},${features}` : jsCallStackFeature)

  // Chromium animates each mouse-wheel notch on Linux; native Linux apps scroll by the full delta immediately.
  if (process.platform === "linux") app.commandLine.appendSwitch("disable-smooth-scrolling")

  // macOS hands a dual-GPU Mac the integrated GPU by default, which cannot composite a Retina-sized window
  // inside a frame budget and pins the UI to 30fps. The discrete GPU keeps the frame budget. Single-GPU Macs
  // ignore the switch.
  if (process.platform === "darwin") app.commandLine.appendSwitch("force-high-performance-gpu")

  const build = { packaged: app.isPackaged, channel: CHANNEL }
  const debugPort = remoteDebuggingPort(build, process.env.AICRAFT_DESKTOP_REMOTE_DEBUGGING_PORT)

  if (debugPort) app.commandLine.appendSwitch("remote-debugging-port", debugPort)

  if (app.commandLine.hasSwitch("remote-debugging-port"))
    app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1")

  // Precise heap sizes need a launch switch. The debug bar's toggle starts the log without one.
  if (debugBuild(build) && memoryLogInterval(process.env.AICRAFT_DESKTOP_MEMORY_LOG) !== undefined)
    app.commandLine.appendSwitch("enable-precise-memory-info")

  const testRoot = createTestRoot()
  if (!testRoot) migrateLegacyData(app.getPath("appData"))
  app.setPath("userData", testRoot ? path.join(testRoot, "desktop") : path.join(app.getPath("appData"), APP_ID))

  if (testRoot) {
    app.setPath("sessionData", path.join(testRoot, "session"))

    if (testOnboarding) app.setPath("documents", path.join(testRoot, "documents"))
  }

  // V8 bytecode for the main bundle survives between launches, like the renderer's code cache.
  enableCompileCache(path.join(app.getPath("userData"), "compile-cache"))
}

export function acquireApplicationLock() {
  if (app.requestSingleInstanceLock()) return true
  app.quit()

  return false
}

const legacyAppIDs: Record<string, string> = {
  local: "ai.aicraft.desktop.dev",
  dev: "ai.aicraft.desktop.dev",
  beta: "ai.aicraft.desktop.beta",
  prod: "ai.aicraft.desktop",
}

// The product rename moved every data root. Move the previous roots once, before anything reads or
// recreates them, so an upgrade keeps installed plugins, configuration and session history.
function migrateLegacyData(appData: string) {
  const home = homedir()
  const base = (value: string | undefined, fallback: string) => value || path.join(home, fallback)
  const roots = [
    base(process.env.XDG_DATA_HOME, ".local/share"),
    base(process.env.XDG_CACHE_HOME, ".cache"),
    base(process.env.XDG_CONFIG_HOME, ".config"),
    base(process.env.XDG_STATE_HOME, ".local/state"),
  ]
  const userData = path.join(appData, APP_ID)
  const pairs: [string, string][] = [
    [path.join(home, ".aicraft"), path.join(home, ".aicraft")],
    ...roots.map((root): [string, string] => [path.join(root, "opencode"), path.join(root, "aicraft")]),
    [path.join(appData, legacyAppIDs[CHANNEL] ?? legacyAppIDs.dev), userData],
    [path.join(userData, "aicraft.settings"), path.join(userData, "aicraft.settings")],
  ]

  for (const [from, to] of pairs) {
    if (existsSync(to) || !existsSync(from)) continue
    try {
      renameSync(from, to)
    } catch {}
  }

  // Session history keeps the database file name it was written under.
  const dataRoot = path.join(roots[0], "aicraft")

  if (!existsSync(dataRoot)) return

  for (const name of readdirSync(dataRoot)) {
    if (!/^aicraft.*\.db(?:-(?:wal|shm))?$/.test(name)) continue
    const next = `aicraft${name.slice("opencode".length)}`
    if (existsSync(path.join(dataRoot, next))) continue
    try {
      renameSync(path.join(dataRoot, name), path.join(dataRoot, next))
    } catch {}
  }
}

function createTestRoot() {
  const root = testOnboarding
    ? path.join(tmpdir(), `aicraft-onboarding-${randomUUID()}`)
    : process.env.AICRAFT_DESKTOP_TEST_ROOT

  if (!root) return undefined

  if (testOnboarding) rmSync(root, { recursive: true, force: true })

  for (const dir of ["data", "config", "cache", "state", "desktop", "session", "documents"])
    mkdirSync(path.join(root, dir), { recursive: true })

  if (testOnboarding) process.env.AICRAFT_DB = ":memory:"

  process.env.XDG_DATA_HOME = path.join(root, "data")
  process.env.XDG_CONFIG_HOME = path.join(root, "config")
  process.env.XDG_CACHE_HOME = path.join(root, "cache")
  process.env.XDG_STATE_HOME = path.join(root, "state")

  return root
}
