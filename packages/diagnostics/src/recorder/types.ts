import type { DiagnosticsExtra, DiagnosticsMetrics } from "../types"

/** The host services a recorder is given. Recorders never touch collector state directly. */
export type RecorderContext = {
  /** Appends one event to the capture window, attributed to this recorder. */
  record(type: string, data: unknown): void
  /** Adds to this recorder's `observed` counter: candidates seen before its own filters. */
  observed(count?: number): void
  ignored(node: Node | null): boolean
  pathOf(node: Node | null): string
  nodeLabel(node: Node): string
  /** Milliseconds since the capture started, one decimal. */
  now(): number
  /** The most recent context the app passed in; empty until the first dump. */
  extra: DiagnosticsExtra
  metrics: {
    read(): DiagnosticsMetrics
    /** Merges a sample without notifying subscribers. */
    update(patch: Partial<DiagnosticsMetrics>): DiagnosticsMetrics
    /** Merges a sample, notifies subscribers and returns the merged metrics. */
    publish(patch: Partial<DiagnosticsMetrics>): DiagnosticsMetrics
  }
}

export type Recorder = {
  name: string
  start(ctx: RecorderContext): void
  stop?(): void
}
