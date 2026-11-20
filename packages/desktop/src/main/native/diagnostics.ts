// Main-process capture for the diagnostics dump. It records what the renderer cannot see: RPC
// round-trip latency, window and display changes, per-process CPU and memory, and a slice of the
// run's own log files. A dump reads all of it at once through `snapshot()`, which the renderer asks
// for over `AppReadDiagnosticsMain` and puts under `sections.main`.
//
// Nothing here writes to disk: the log slice reuses the files DesktopLogging already writes.

import { closeSync, fstatSync, openSync, readdirSync, readSync, statSync } from "node:fs"
import { basename, join } from "node:path"
import { app, BrowserWindow, screen } from "electron"
import { createRing, logTime, recentLogLines, type LogEntry } from "./diagnostics-ring"
import { ipcDiagnostics } from "./diagnostics-ipc"
import { logsDirectory } from "./logging"
import type {
  DiagnosticsMainLogs,
  DiagnosticsMainProcess,
  DiagnosticsMainProcessSample,
  DiagnosticsMainSnapshot,
  DiagnosticsMainWindowEvent,
  DiagnosticsMainWindowState,
} from "../../shared/diagnostics"

/** The renderer keeps the same one-minute window, so both halves of a dump cover the same span. */
const WINDOW_MS = 60_000

/** Window and display churn is far lower than IPC traffic, so a small ring is enough. */
const MAX_WINDOW_EVENTS = 200

const MAX_WINDOWS = 10

const PROCESS_INTERVAL_MS = 1_000

const MAX_PROCESS_SAMPLES = 60

const MAX_LOG_LINES = 200

/** Only the tail of a log file can hold the last minute, and it bounds the synchronous read. */
const LOG_TAIL_BYTES = 256 * 1024

const MAX_LOG_LINE_LENGTH = 500

const windowEvents = createRing<DiagnosticsMainWindowEvent>({ windowMs: WINDOW_MS, max: MAX_WINDOW_EVENTS })

const processSamples = createRing<DiagnosticsMainProcessSample>({ windowMs: WINDOW_MS, max: MAX_PROCESS_SAMPLES })

let startedAt = 0

let timer: ReturnType<typeof setInterval> | undefined

const detachers: Array<() => void> = []

const wired = new Set<BrowserWindow>()

export const mainDiagnostics = {
  /** Attaches the capture. Idempotent; call after `app.whenReady()`. Dev builds only. */
  start(): void {
    if (app.isPackaged || timer) return
    ipcDiagnostics.start()
    startedAt = Date.now()
    detachers.push(watchApp())
    detachers.push(watchScreen())

    for (const win of BrowserWindow.getAllWindows()) wireWindow(win)
    sampleProcesses()

    timer = setInterval(sampleProcesses, PROCESS_INTERVAL_MS)
    // Diagnostics must never be the reason the process stays alive.
    timer.unref?.()
  },
  /** Detaches every listener, stops the sampling timer, and clears the buffers. */
  stop(): void {
    if (timer) clearInterval(timer)

    timer = undefined

    for (const detach of detachers.splice(0)) detach()
    wired.clear()
    ipcDiagnostics.stop()
  },
  /** Everything the capture holds now. Synchronous: the dump reads it inside one section provider. */
  snapshot(): DiagnosticsMainSnapshot {
    const wall = Date.now()

    return {
      clock: { wall, uptime: round(process.uptime(), 3), capturedAt: new Date(wall).toISOString() },
      environment: {
        app: app.getName(),
        version: app.getVersion(),
        packaged: app.isPackaged,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        electron: process.versions.electron ?? "",
        chrome: process.versions.chrome ?? "",
        node: process.versions.node,
        startedAt,
      },
      ipc: ipcDiagnostics.snapshot(),
      windows: { windowMs: WINDOW_MS, events: windowEvents.values(), current: liveWindows() },
      processes: { windowMs: WINDOW_MS, intervalMs: PROCESS_INTERVAL_MS, samples: processSamples.values() },
      logs: readLogs(wall),
    }
  },
}

function watchApp() {
  const onCreated = (_event: Electron.Event, win: BrowserWindow) => wireWindow(win)

  app.on("browser-window-created", onCreated)

  return () => app.off("browser-window-created", onCreated)
}

function watchScreen() {
  const onChange = () => recordDisplays("display-metrics-changed")
  const onAdded = () => recordDisplays("display-added")
  const onRemoved = () => recordDisplays("display-removed")

  screen.on("display-metrics-changed", onChange)
  screen.on("display-added", onAdded)
  screen.on("display-removed", onRemoved)

  return () => {
    screen.off("display-metrics-changed", onChange)
    screen.off("display-added", onAdded)
    screen.off("display-removed", onRemoved)
  }
}

function wireWindow(win: BrowserWindow) {
  if (wired.has(win)) return
  wired.add(win)

  const record = (type: string) => () => {
    windowEvents.push({
      at: Date.now(),
      type,
      window: win.id,
      bounds: win.isDestroyed() ? undefined : win.getBounds(),
      scaleFactor: win.isDestroyed() ? undefined : scaleOf(win),
    })
  }

  // Electron types `.on` as one overload per event, so each event is bound with its own literal.
  const onFocus = record("focus")
  const onBlur = record("blur")
  const onMinimize = record("minimize")
  const onRestore = record("restore")
  const onShow = record("show")
  const onHide = record("hide")
  const onEnterFullScreen = record("enter-full-screen")
  const onLeaveFullScreen = record("leave-full-screen")

  win.on("focus", onFocus)
  win.on("blur", onBlur)
  win.on("minimize", onMinimize)
  win.on("restore", onRestore)
  win.on("show", onShow)
  win.on("hide", onHide)
  win.on("enter-full-screen", onEnterFullScreen)
  win.on("leave-full-screen", onLeaveFullScreen)

  // `closed` fires after the window is gone, so the entry carries only its id.
  const closed = record("closed")

  const onClosed = () => {
    wired.delete(win)
    closed()
  }

  win.on("closed", onClosed)
  detachers.push(() => {
    win.off("focus", onFocus)
    win.off("blur", onBlur)
    win.off("minimize", onMinimize)
    win.off("restore", onRestore)
    win.off("show", onShow)
    win.off("hide", onHide)
    win.off("enter-full-screen", onEnterFullScreen)
    win.off("leave-full-screen", onLeaveFullScreen)
    win.off("closed", onClosed)
  })
}

function recordDisplays(type: string) {
  const windows = liveWindows()

  const displays = screen.getAllDisplays().map((display) => ({
    id: display.id,
    scaleFactor: display.scaleFactor,
    bounds: display.bounds,
  }))

  windowEvents.push({
    at: Date.now(),
    type,
    displays,
    windows: windows.map((win) => ({ id: win.id, bounds: win.bounds, scaleFactor: win.scaleFactor })),
  })
}

function liveWindows(): DiagnosticsMainWindowState[] {
  return BrowserWindow.getAllWindows()
    .filter((win) => !win.isDestroyed())
    .slice(0, MAX_WINDOWS)
    .map((win) => ({
      id: win.id,
      focused: win.isFocused(),
      visible: win.isVisible(),
      minimized: win.isMinimized(),
      fullscreen: win.isFullScreen(),
      bounds: win.getBounds(),
      scaleFactor: scaleOf(win),
    }))
}

function scaleOf(win: BrowserWindow) {
  return screen.getDisplayMatching(win.getBounds()).scaleFactor
}

function sampleProcesses() {
  const at = Date.now()

  try {
    const metrics = app.getAppMetrics()

    if (metrics.length === 0) {
      processSamples.push({ at, available: false, reason: "app.getAppMetrics() returned no processes", processes: [] })

      return
    }

    processSamples.push({ at, available: true, processes: metrics.map(toProcess) })
  } catch (error) {
    // Some platforms cannot report per-process metrics; the sample says so instead of disappearing.
    processSamples.push({
      at,
      available: false,
      reason: error instanceof Error ? error.message : String(error),
      processes: [],
    })
  }
}

function toProcess(metric: Electron.ProcessMetric): DiagnosticsMainProcess {
  const row: DiagnosticsMainProcess = {
    kind: String(metric.type),
    pid: metric.pid,
    gpu: String(metric.type) === "GPU",
    cpu: round(metric.cpu?.percentCPUUsage ?? 0),
    idleWakeups: round(metric.cpu?.idleWakeupsPerSecond ?? 0),
    memory: Math.round(metric.memory?.workingSetSize ?? 0),
    peakMemory: Math.round(metric.memory?.peakWorkingSetSize ?? 0),
  }

  if (metric.name) row.name = metric.name

  return row
}

function readLogs(wall: number): DiagnosticsMainLogs {
  const dir = logsDirectory()

  if (!dir) {
    return {
      windowMs: WINDOW_MS,
      maxLines: MAX_LOG_LINES,
      available: false,
      reason: "logging has not started",
      truncated: false,
      lines: [],
    }
  }

  let files: string[]

  try {
    files = readdirSync(dir).filter((name) => name.endsWith(".log"))
  } catch (error) {
    return {
      windowMs: WINDOW_MS,
      maxLines: MAX_LOG_LINES,
      available: false,
      reason: error instanceof Error ? error.message : String(error),
      truncated: false,
      lines: [],
    }
  }

  const cutoff = wall - WINDOW_MS
  const entries: LogEntry[] = []

  for (const name of files) {
    const path = join(dir, name)
    let text: string

    try {
      // A rotation or a vanished file between listing and reading must not fail the whole dump.
      if (statSync(path).mtimeMs < cutoff) continue
      text = readTail(path)
    } catch {
      continue
    }

    const source = basename(name, ".log")

    for (const line of text.split("\n")) {
      const at = logTime(line)

      if (at === null || at < cutoff) continue
      entries.push({ source, at, line: line.slice(0, MAX_LOG_LINE_LENGTH) })
    }
  }

  const recent = recentLogLines(entries, { windowMs: WINDOW_MS, max: MAX_LOG_LINES })

  return {
    windowMs: WINDOW_MS,
    maxLines: MAX_LOG_LINES,
    available: true,
    truncated: recent.truncated,
    lines: recent.lines,
  }
}

/** Reads the end of a log file without loading a rotated 5 MB file in full. */
function readTail(path: string) {
  const handle = openSync(path, "r")

  try {
    const { size } = fstatSync(handle)
    const length = Math.min(size, LOG_TAIL_BYTES)
    const buffer = Buffer.alloc(length)

    readSync(handle, buffer, 0, length, size - length)
    const text = buffer.toString("utf8")

    // The tail starts mid-line unless it starts at the beginning of the file.
    return length < size ? text.slice(text.indexOf("\n") + 1) : text
  } finally {
    closeSync(handle)
  }
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits

  return Math.round(value * factor) / factor
}
