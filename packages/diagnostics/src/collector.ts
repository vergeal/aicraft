// A one-minute, in-memory diagnostics recorder for the desktop window. It never writes to disk on its own:
// the panel's "Agent diagnosis" button takes a dump and hands it to a new session.
//
// Everything recorded here is a plain JSON value so a dump can be serialized without a custom encoder.
// The domains live in ./recorder; this file owns the capture window, metric publishing and the dump assembly.

import { createCapture, type CaptureEntry } from "./buffer"
import { domSnapshot, environment } from "./environment"
import { createFreezer } from "./freeze"
import { createMarks } from "./marks"
import { RECORDERS, type RecorderContext } from "./recorder"
import { createRetention } from "./retention"
import { round } from "./recorder/format"
import { ignored, nodeLabel, pathOf } from "./recorder/tree"
import type { DiagnosticsDocument, DiagnosticsExtra, DiagnosticsMetrics } from "./types"

const CAPTURE_MS = 60_000
const MAX_EVENTS = 6_000
const TREND_SAMPLES = 60

const EMPTY_METRICS: DiagnosticsMetrics = {
  fps: 0,
  frame: 0,
  p95: 0,
  slow: 0,
  stutters: 0,
  longTasks: 0,
  longTaskMax: 0,
  input: 0,
  cls: 0,
  lag: 0,
  heapUsed: 0,
  heapLimit: 0,
  nodes: 0,
  viewport: "",
  trend: [],
}

const capture = createCapture({
  windowMs: CAPTURE_MS,
  maxEvents: MAX_EVENTS,
  // `mark` has no recorder: the collector writes those events itself, and still reports its funnel.
  sources: [...RECORDERS.map((recorder) => recorder.name), "mark"],
})

const state = {
  started: false,
  startedAt: 0,
  startedAtWall: 0,
  clockOffset: 0,
  extra: {} as DiagnosticsExtra,
  metrics: EMPTY_METRICS,
  listeners: new Set<(metrics: DiagnosticsMetrics) => void>(),
  // Extra top-level blocks (`main`, `server`, `state`, `findings`, ...) contributed by features that
  // live outside this file. Registering the same name again replaces the previous provider.
  sections: new Map<string, () => unknown>([
    ["marks", () => marks.section()],
    ["freezes", () => freezer.section()],
    ["retention", () => retention.section()],
  ]),
}

const retention = createRetention()
const marks = createMarks()

// The thresholds and the layers read the hot layer, they never write to it: the dump's `events` stay the
// ring buffer's own list, and the sections hold copies.
const freezer = createFreezer({
  captureFreeze: () => ({
    at: round(performance.now() - state.startedAt),
    events: capture.events(),
    metrics: state.metrics,
  }),
})

export const diagnostics = {
  start(): void {
    if (state.started || typeof window === "undefined") return
    state.started = true
    state.startedAt = performance.now()
    state.startedAtWall = Math.round(performance.timeOrigin + state.startedAt)
    for (const recorder of RECORDERS) recorder.start(contextFor(recorder.name))
  },
  metrics(): DiagnosticsMetrics {
    return state.metrics
  },
  /** Called once per second with the latest performance sample. */
  subscribe(listener: (metrics: DiagnosticsMetrics) => void): () => void {
    state.listeners.add(listener)

    return () => state.listeners.delete(listener)
  },
  size(): { events: number; dropped: number; seconds: number } {
    return {
      events: capture.count(),
      dropped: capture.dropped(),
      seconds: CAPTURE_MS / 1000,
    }
  },
  /** Main-process clock minus renderer clock, so a dump can be placed on the main process timeline. */
  setClockOffset(offsetMs: number): void {
    state.clockOffset = offsetMs
  },
  /**
   * Contributes a top-level block to every dump, evaluated at dump time.
   *
   * A feature that owns its own data (main-process capture, server spans, state snapshots, findings)
   * registers here instead of editing this file, so independent recorders never collide. Returns an
   * unsubscribe function.
   */
  section(name: string, read: () => unknown): () => void {
    state.sections.set(name, read)

    return () => state.sections.delete(name)
  },
  /**
   * Writes a `mark` event and freezes the current window on the spot, so "right now" survives whatever
   * traffic follows it and never has to be reconstructed from the hot layer afterwards.
   */
  mark(label?: string, data?: Record<string, unknown>): void {
    if (!state.started) return
    const t = round(performance.now() - state.startedAt)
    const entry: CaptureEntry = {
      t,
      wall: Math.round(performance.timeOrigin + t),
      type: "mark",
      data: { label, ...data },
      source: "mark",
    }
    capture.observe("mark")
    pushEvent(entry)
    marks.add({ t, wall: entry.wall, label, data: { ...data } })
    freezer.freeze("mark")
  },
  clear(): void {
    capture.clear()
    retention.clear()
    marks.clear()
    freezer.clear()
  },
  /**
   * Everything a derived summary needs, read without evaluating the section providers.
   *
   * `dump()` snapshots the DOM and captures every registered section, which is right for an export but too
   * expensive — and too stateful — for a live preview. This returns only the hot events and the stats that
   * describe them, so a panel can summarize on every tick.
   */
  preview(): Pick<DiagnosticsDocument, "generatedAt" | "capture" | "events"> {
    return { generatedAt: new Date().toISOString(), capture: captureStats(), events: capture.events() }
  },
  dump(extra: DiagnosticsExtra): DiagnosticsDocument {
    state.extra = extra
    const timeOrigin = performance.timeOrigin

    return {
      schema: "aicraft.diagnostics.v2",
      generatedAt: new Date().toISOString(),
      timeOrigin,
      capture: captureStats(),
      environment: environment(extra, { timeOrigin, offsetMs: state.clockOffset }),
      metrics: state.metrics,
      events: capture.events(),
      dom: domSnapshot(),
      sections: Object.fromEntries(Array.from(state.sections, ([name, read]) => [name, read()])),
      notes: [
        "events 按 t（毫秒，自采集开始，一位小数）升序排列；wall 是同一时刻的 Unix 毫秒（timeOrigin + t）；perf 每秒一条，dom/input/network 等按发生顺序插入。",
        `环形缓冲只保留最近 ${CAPTURE_MS / 1000} 秒、最多 ${MAX_EVENTS} 条；capture.dropped 是被更早事件挤出的条数，capture.sources[] 按 recorder 给出 observed（候选数）/recorded（入库数）/dropped（被挤出数）。`,
        "environment.clock.offsetMs 是主进程时钟减渲染进程时钟的估算值，未校准时为 0；跨进程对齐时用它换算 wall。",
        "dom.* 的 target/added/removed 是截断后的节点标签（tag#id.class[data-slot]），不是完整选择器；dom.html 是导出时刻的快照。",
        "input 事件只记录目标、按键和输入长度，不记录输入内容；password 字段的按键一律记作 [redacted]。",
        "console.* 与 error 的参数会截断到约 800 字符，可能包含用户数据，仅保存在本机内存和这份 dump 中。",
        "sections 是按模块注册的额外顶层区块：main（主进程采集）、server（服务端 span 与慢查询）、state（状态快照）、findings（派生摘要）；未启用时该键不存在。",
        "sections.marks 是 mark 事件（label 与调用方附带的数据）的全程记录，items 最多留最近 50 条；sections.freezes 是自动与手动冻结的窗口副本（reason 为 fps/cls/errors/longtask/mark，at 与 events.t 同基准），最多 3 份、超出的计入 dropped；sections.retention 是热层之外的两层保留：warm 为最近 10 分钟降采样，cold 为最近 60 分钟只留故障相关事件，两者各自给出 events 与 dropped。三块都是热层的副本，不占用 events 的 6000 条预算。",
      ],
    }
  },
}

/** The capture block shared by `dump()` and `preview()`, so both describe the same window the same way. */
function captureStats(): DiagnosticsDocument["capture"] {
  return {
    windowSeconds: CAPTURE_MS / 1000,
    events: capture.count(),
    dropped: capture.dropped(),
    startedAt: new Date(state.startedAtWall).toISOString(),
    sources: capture.sources(),
  }
}

function contextFor(name: string): RecorderContext {
  return {
    record(type, data) {
      if (!state.started) return
      const t = round(performance.now() - state.startedAt)
      pushEvent({ t, wall: Math.round(performance.timeOrigin + t), type, data, source: name })
    },
    observed: (count = 1) => capture.observe(name, count),
    ignored,
    pathOf,
    nodeLabel,
    now: () => round(performance.now() - state.startedAt),
    get extra() {
      return state.extra
    },
    metrics: {
      read: () => state.metrics,
      update: updateMetrics,
      publish: publishMetrics,
    },
  }
}

function updateMetrics(patch: Partial<DiagnosticsMetrics>): DiagnosticsMetrics {
  state.metrics = {
    ...state.metrics,
    ...patch,
    // `trend` is derived from `fps`, so it always wins over whatever the patch carried.
    trend:
      typeof patch.fps === "number" ? [...state.metrics.trend, patch.fps].slice(-TREND_SAMPLES) : state.metrics.trend,
  }

  return state.metrics
}

function publishMetrics(patch: Partial<DiagnosticsMetrics>): DiagnosticsMetrics {
  const next = updateMetrics(patch)
  freezer.sample(next)
  state.listeners.forEach((listener) => listener(next))

  return next
}

/** Every event enters the hot layer, both retention layers and the freeze thresholds in that order. */
function pushEvent(entry: CaptureEntry): void {
  capture.push(entry)
  retention.push(entry)
  freezer.note(entry)
}
