// The main-process capture that a diagnostics dump carries under `sections.main`. Shared by the
// collector in the main process and the renderer that reads it, so both agree on the shape. Every
// field is plain JSON: the renderer gets this value over IPC and serializes it into the dump.

/** Main-process wall clock and uptime at snapshot time, for aligning both process timelines. */
export type DiagnosticsMainClock = {
  /** `Date.now()` in the main process at snapshot time. */
  wall: number
  /** `process.uptime()`, in seconds. */
  uptime: number
  /** The same instant as `wall`, as an ISO string. */
  capturedAt: string
}

/** One RPC reply the main process saw, kept only when it was slow or failed. */
export type DiagnosticsMainIpcSample = {
  /** Unix milliseconds when the reply was posted. */
  at: number
  /** RPC tag, e.g. `AppReadDiagnosticsMain`. */
  channel: string
  /** Time from receiving the request to posting the reply, one decimal. */
  ms: number
  /** The handler failed, died, or was interrupted. */
  failed: boolean
}

export type DiagnosticsMainIpc = {
  windowMs: number
  /** Samples at or below this duration are counted as observed but not kept. */
  thresholdMs: number
  observed: number
  recorded: number
  dropped: number
  /** Requests received but not answered yet; a value that keeps growing is a leak. */
  pending: number
  samples: DiagnosticsMainIpcSample[]
}

export type DiagnosticsMainBounds = { x: number; y: number; width: number; height: number }

/**
 * A window or display event. Window entries carry `window` and its bounds at that moment; display
 * entries carry every display's scale factor and bounds, plus each window's bounds.
 */
export type DiagnosticsMainWindowEvent = {
  at: number
  type: string
  window?: number
  bounds?: DiagnosticsMainBounds
  scaleFactor?: number
  displays?: Array<{ id: number; scaleFactor: number; bounds: DiagnosticsMainBounds }>
  windows?: Array<{ id: number; bounds: DiagnosticsMainBounds; scaleFactor: number }>
}

/** One window as it stood when the snapshot was taken. */
export type DiagnosticsMainWindowState = {
  id: number
  focused: boolean
  visible: boolean
  minimized: boolean
  fullscreen: boolean
  bounds: DiagnosticsMainBounds
  scaleFactor: number
}

export type DiagnosticsMainWindows = {
  windowMs: number
  events: DiagnosticsMainWindowEvent[]
  /** Windows alive at snapshot time, so events can be read without replaying them. */
  current: DiagnosticsMainWindowState[]
}

/** One process row from `app.getAppMetrics()`. */
export type DiagnosticsMainProcess = {
  /** Electron's process type: `Browser`, `Tab`, `GPU`, `Utility`, ... */
  kind: string
  name?: string
  pid: number
  /** The GPU process is marked explicitly rather than being looked up by position. */
  gpu: boolean
  /** Percent of one core since the previous sample. */
  cpu: number
  idleWakeups: number
  /** `workingSetSize`, in kilobytes. */
  memory: number
  /** `peakWorkingSetSize`, in kilobytes. */
  peakMemory: number
}

/** One sample per second. `available: false` with `reason` when the API could not answer. */
export type DiagnosticsMainProcessSample = {
  at: number
  available: boolean
  reason?: string
  processes: DiagnosticsMainProcess[]
}

export type DiagnosticsMainProcesses = {
  windowMs: number
  intervalMs: number
  samples: DiagnosticsMainProcessSample[]
}

/** One line from this run's log files, kept only when written inside the window. */
export type DiagnosticsMainLogLine = {
  /** Log file base name without `.log`, e.g. `main`. */
  source: string
  at: number
  line: string
}

export type DiagnosticsMainLogs = {
  windowMs: number
  maxLines: number
  available: boolean
  /** Why the slice is empty, when it is. */
  reason?: string
  /** Older lines inside the window were cut to fit `maxLines`. */
  truncated: boolean
  lines: DiagnosticsMainLogLine[]
}

export type DiagnosticsMainEnvironment = {
  app: string
  version: string
  packaged: boolean
  platform: string
  arch: string
  pid: number
  electron: string
  chrome: string
  node: string
  /** Unix milliseconds when the capture started. */
  startedAt: number
}

export type DiagnosticsMainSnapshot = {
  clock: DiagnosticsMainClock
  environment: DiagnosticsMainEnvironment
  ipc: DiagnosticsMainIpc
  windows: DiagnosticsMainWindows
  processes: DiagnosticsMainProcesses
  logs: DiagnosticsMainLogs
}
