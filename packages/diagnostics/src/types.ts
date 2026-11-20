// The types every consumer sees. They are plain JSON shapes: a dump can be serialized without a custom encoder.

export type DiagnosticsMetrics = {
  fps: number
  frame: number
  p95: number
  slow: number
  stutters: number
  longTasks: number
  longTaskMax: number
  input: number
  cls: number
  lag: number
  heapUsed: number
  heapLimit: number
  nodes: number
  viewport: string
  trend: number[]
}

export type DiagnosticsEvent = {
  /** Milliseconds since the capture started, one decimal, so events sort and align with `perf`. */
  t: number
  /** Unix milliseconds of the same instant, derived from `performance.timeOrigin + t`. */
  wall: number
  type: string
  data: unknown
}

export type DiagnosticsExtra = {
  route?: string
  sessionID?: string
  server?: string
  app?: { version?: string; platform: string; os?: string }
}

/** One recorder's funnel: what it saw, what it handed to the buffer, what the buffer no longer holds. */
export type DiagnosticsSourceStats = {
  name: string
  /** Candidates the recorder saw before it applied its own filters and throttles. */
  observed: number
  /** Events the recorder handed to the capture buffer. */
  recorded: number
  /** Recorded events the ring buffer evicted to stay inside the window or the size limit. */
  dropped: number
}

export type DiagnosticsDocument = {
  schema: "opencode.diagnostics.v2"
  generatedAt: string
  /** `performance.timeOrigin` of the renderer that produced this dump. */
  timeOrigin: number
  capture: {
    windowSeconds: number
    events: number
    dropped: number
    startedAt: string
    sources: DiagnosticsSourceStats[]
  }
  environment: Record<string, unknown>
  metrics: DiagnosticsMetrics
  events: DiagnosticsEvent[]
  dom: { html: string; truncated: boolean; nodes: number }
  /**
   * Top-level blocks contributed by features that own their own data: `main` (main-process capture),
   * `server` (server spans and slow queries), `state` (read-model snapshots), `findings` (derived
   * summary). Present only when the corresponding feature registered a provider.
   */
  sections: Record<string, unknown>
  notes: string[]
}
