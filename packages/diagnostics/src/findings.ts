// The derived layer every reader should start from: a small, ranked summary of what happened, built only from
// the dump's own events. It answers "where do I look first" and never claims a root cause; each finding carries
// the time point, the aggregated evidence and a hint that names the surface to inspect.
//
// `summarize` is a pure function of the document. It reads nothing from the runtime, so the same dump always
// produces the same findings, which is what makes them comparable across sessions and safe to test.

import { round } from "./recorder/format"
import { sanitizeUrl } from "./recorder/http-detail"
import type { DiagnosticsDocument, DiagnosticsEvent } from "./types"

export type FindingSeverity = "error" | "warn" | "info"

export type Finding = {
  /** Capture-relative milliseconds and the matching Unix milliseconds, so a reader can jump to `events`. */
  at: { t: number; wall: number }
  severity: FindingSeverity
  kind: string
  title: string
  evidence: Record<string, unknown>
  /** Where to look, not what is wrong. */
  hint?: string
}

export type Findings = {
  generatedAt: string
  window: { seconds: number; events: number; dropped: number }
  counts: {
    error: number
    unhandledrejection: number
    networkError: number
    longTask: number
    layoutShift: number
    mark: number
  }
  timeline: Finding[]
  notes: string[]
}

const BURST_WINDOW_MS = 60_000
const BURST_MINIMUM = 5
const FINGERPRINT_LIMIT = 6
const ERROR_GROUP_MINIMUM = 2
const ERROR_GROUP_LIMIT = 5
const SLOW_REQUEST_MS = 1_000
const SLOW_REQUEST_LIMIT = 5
const FAILURE_LIMIT = 5
const DRIFT_TOLERANCE = 1
const DRIFT_LIMIT = 5
const SHIFT_TOTAL_MINIMUM = 0.1
const SHIFT_SOURCE_LIMIT = 5
const SCROLL_ATTRIBUTION_WINDOW_MS = 2_000
const SCROLL_RESET_LIMIT = 5
const LONG_TASK_MS = 200
const LONG_FRAME_BLOCKING_MS = 100
const LOW_FPS = 30
const STALL_LIMIT = 10
const MEMORY_SUSPECT_LIMIT = 3
const TIMELINE_LIMIT = 60

/** Event types that count as input evidence around a scroll reset. */
const INPUT_TYPES = new Set([
  "wheel",
  "touchmove",
  "touchstart",
  "key",
  "input.key",
  "input.pointer",
  "input.click",
  "input.value",
])

const SEVERITY_RANK: Record<FindingSeverity, number> = { error: 0, warn: 1, info: 2 }

type Rec = Record<string, unknown>
type Point = { t: number; wall: number }

/** The parts of a dump a summary is derived from: an export passes the whole document, a live preview only these. */
export type SummarizeInput = Pick<DiagnosticsDocument, "generatedAt" | "capture" | "events">

export function summarize(dump: SummarizeInput): Findings {
  const events = [...dump.events].sort((a, b) => a.t - b.t)
  const byType = new Map<string, DiagnosticsEvent[]>()
  for (const event of events) {
    const bucket = byType.get(event.type)
    if (bucket) bucket.push(event)
    else byType.set(event.type, [event])
  }
  const of = (type: string) => byType.get(type) ?? []

  const notes: string[] = [
    "timeline 是派生摘要，按 at.t 升序，最多 60 条；counts 是原始事件条数，两者口径不同。",
    "network.* 的 url 已脱敏：保留 origin/path 与 query 键，去掉 query 值与 fragment。只能按路径匹配源码，不要拿它去 grep 原始地址。",
    "error.burst 与 scroll.reset 是启发式：前者说明「60 秒内故障集中」；后者说明「scrollTop 非 0 突然归零」，并按 ±2 秒窗口分三档：program 有 target 匹配的 scroll.program 调用（带调用栈）、input 只有输入活动（severity 降为 info，不占 warn 名额）、unknown 两者都没有。都不构成根因结论。",
    "每个 kind 有固定上限（error.group/network.failure/network.slow/layout.drift/scroll.reset 各 5 条、performance.stall 10 条、memory.suspect 3 条）；超出部分只能回 events 里看。",
  ]

  const findings: Finding[] = []
  const collected: Array<[string, Finding[]]> = [
    ["error.burst", burstFindings(events)],
    ["error.group", errorGroupFindings(of("error.group"))],
    ["network.failure", failureFindings(events)],
    ["network.slow", slowFindings(events)],
    ["layout.drift", driftFindings(events)],
    ["scroll.reset", scrollResetFindings(events)],
    ["performance.stall", stallFindings(events)],
    ["memory.suspect", memoryFindings(of("memory.suspect"))],
    ["mark", markFindings(of("mark"))],
  ]
  for (const [kind, produced] of collected) {
    findings.push(...produced)
    if (produced.length > 0) continue
    notes.push(`${kind}：本 dump 没有满足阈值的数据。`)
  }

  // Trimming drops by severity first and only then by time, so the 60 slots go to the most urgent evidence.
  const ranked = [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.at.t - b.at.t)
  const timeline = ranked.slice(0, TIMELINE_LIMIT).sort((a, b) => a.at.t - b.at.t)
  const trimmed = findings.length - timeline.length
  if (trimmed > 0) notes.push(`timeline 超出 60 条上限，按 severity（error > warn > info）裁掉 ${trimmed} 条。`)

  return {
    generatedAt: dump.generatedAt,
    window: { seconds: dump.capture.windowSeconds, events: dump.capture.events, dropped: dump.capture.dropped },
    counts: {
      error: of("error").length,
      unhandledrejection: of("unhandledrejection").length,
      networkError: of("network.error").length + of("network").filter(isFailedResponse).length,
      longTask: of("longtask").length,
      layoutShift: of("layout.shift").length,
      mark: of("mark").length,
    },
    timeline,
    notes,
  }
}

/** A fault is anything that failed: a thrown error, a rejected promise, or a request with no usable response. */
function isFault(event: DiagnosticsEvent): boolean {
  if (event.type === "error" || event.type === "unhandledrejection") return true
  return isFailedResponse(event)
}

function isFailedResponse(event: DiagnosticsEvent): boolean {
  if (event.type === "network.error") return true
  if (event.type !== "network") return false
  const data = dataOf(event)
  if (data.ok === false) return true
  return numberOf(data.status) >= 400
}

function burstFindings(events: DiagnosticsEvent[]): Finding[] {
  const faults = events.filter(isFault)
  const window = densestWindow(faults)
  if (window.length < BURST_MINIMUM) return []

  const counts = { error: 0, unhandledrejection: 0, networkError: 0 }
  const fingerprints = new Map<string, number>()
  for (const event of window) {
    if (event.type === "error") counts.error++
    else if (event.type === "unhandledrejection") counts.unhandledrejection++
    else counts.networkError++

    const fingerprint = fingerprintOf(event)
    if (fingerprint) fingerprints.set(fingerprint, (fingerprints.get(fingerprint) ?? 0) + 1)
  }

  const first = window[0]
  const last = window[window.length - 1]

  return [
    {
      at: pointOf(first),
      severity: "error",
      kind: "error.burst",
      title: `故障集中：${round((last.t - first.t) / 1000)} 秒内 ${window.length} 次（错误 ${counts.error} / 未处理拒绝 ${counts.unhandledrejection} / 网络失败 ${counts.networkError}）`,
      evidence: {
        fromT: first.t,
        toT: last.t,
        seconds: round((last.t - first.t) / 1000),
        total: window.length,
        ...counts,
        fingerprints: topEntries(fingerprints, FINGERPRINT_LIMIT).map(([fingerprint, count]) => ({
          fingerprint,
          count,
        })),
      },
      hint: "先取这批故障的首条时间点，回 events 对齐同一时刻的 dom、network.* 与 error.group，确认它们是否来自同一次操作。",
    },
  ]
}

function errorGroupFindings(events: DiagnosticsEvent[]): Finding[] {
  const groups = events
    .map((event) => {
      const data = dataOf(event)

      return { event, data, count: numberOf(data.count) }
    })
    .filter((group) => group.count >= ERROR_GROUP_MINIMUM)
    .sort((a, b) => b.count - a.count || a.event.t - b.event.t)
    .slice(0, ERROR_GROUP_LIMIT)

  return groups.map(({ event, data, count }) => {
    const signature = stringOf(data.signature) || stringOf(data.message)
    const where = [stringOf(data.component), stringOf(data.signature)].filter(Boolean).join(" ")

    return {
      at: pointOf(event),
      severity: "error" as const,
      kind: "error.group",
      title: `重复错误 ×${count}：${signature || "未知签名"}`,
      evidence: {
        message: data.message,
        signature: data.signature,
        count,
        first: data.first,
        last: data.last,
        fingerprint: data.fingerprint,
        frame: data.frame,
        component: data.component,
        traceID: data.traceID,
        inferred: data.inferred,
      },
      ...(where
        ? { hint: `从 ${where} 入手：同一调用栈重复出现，检查该组件的重渲染、重试或未清理的监听器。` }
        : undefined),
    }
  })
}

function failureFindings(events: DiagnosticsEvent[]): Finding[] {
  const retries = new Map<string, number>()
  for (const event of events) {
    if (event.type !== "network.retry") continue
    const data = dataOf(event)
    const key = requestKey(stringOf(data.method), sanitizeUrl(stringOf(data.url)))
    retries.set(key, Math.max(retries.get(key) ?? 0, numberOf(data.attempt, 1)))
  }

  const groups = new Map<string, FailureAggregate>()
  for (const event of events) {
    if (!isFailedResponse(event)) continue
    const data = dataOf(event)
    const method = stringOf(data.method) || "GET"
    const url = sanitizeUrl(stringOf(data.url))
    const key = requestKey(method, url)
    const existing = groups.get(key)
    const status = numberOf(data.status)
    const ms = numberOf(data.ms)
    const aggregate: FailureAggregate = existing ?? {
      method,
      url,
      count: 0,
      statuses: [],
      error: "",
      slowestMs: 0,
      first: pointOf(event),
      last: pointOf(event),
    }
    aggregate.count++
    if (status > 0 && !aggregate.statuses.includes(status)) aggregate.statuses.push(status)
    if (!aggregate.error) aggregate.error = stringOf(data.error)
    aggregate.slowestMs = Math.max(aggregate.slowestMs, ms)
    aggregate.last = pointOf(event)
    groups.set(key, aggregate)
  }

  const produced = [...groups.entries()]
    .sort(([a, left], [b, right]) => right.count - left.count || a.localeCompare(b))
    .slice(0, FAILURE_LIMIT)

  return produced.map(([key, group]) => {
    const statuses = group.statuses.length > 0 ? `（${group.statuses.join("/")}）` : ""
    const attempts = retries.get(key) ?? 0

    return {
      at: group.last,
      severity: "error" as const,
      kind: "network.failure",
      title: `${group.method} ${group.url} 失败 ×${group.count}${statuses}`,
      evidence: {
        method: group.method,
        // Sanitized twice on purpose: this layer never assumes the recorder ran before it.
        url: group.url,
        count: group.count,
        statuses: group.statuses,
        error: group.error,
        retries: attempts,
        slowestMs: round(group.slowestMs),
        firstT: group.first.t,
        lastT: group.last.t,
      },
      hint: "按脱敏路径在源码里找这个请求的调用点；同一时间段再看 network.retry 的 attempt/gapMs，判断是重试风暴还是单次失败。",
    }
  })
}

type FailureAggregate = {
  method: string
  url: string
  count: number
  statuses: number[]
  error: string
  slowestMs: number
  first: Point
  last: Point
}

function slowFindings(events: DiagnosticsEvent[]): Finding[] {
  const requests = events
    .filter((event) => event.type === "network" || event.type === "network.error" || event.type === "network.stream")
    .map((event) => ({ event, data: dataOf(event), ms: numberOf(dataOf(event).ms) }))
    .filter((request) => request.ms >= SLOW_REQUEST_MS)
    .sort((a, b) => b.ms - a.ms || a.event.t - b.event.t)
    .slice(0, SLOW_REQUEST_LIMIT)

  return requests.map(({ event, data, ms }) => ({
    at: pointOf(event),
    severity: "warn" as const,
    kind: "network.slow",
    title: `${stringOf(data.method) || "GET"} ${sanitizeUrl(stringOf(data.url))} ${round(ms)}ms`,
    evidence: {
      type: event.type,
      method: data.method,
      url: sanitizeUrl(stringOf(data.url)),
      status: data.status,
      ms: round(ms),
      contentType: data.contentType,
      traceID: data.traceID,
      ...(event.type === "network.stream" ? { events: data.events, gapCount: data.gapCount } : {}),
    },
    hint: "对照 sections.server.spans 与 network.timing：服务端耗时高看 span，ttfb 高看连接阶段；同一时刻若还有 long.frame，再区分网络等待与主线程阻塞。",
  }))
}

function driftFindings(events: DiagnosticsEvent[]): Finding[] {
  const drift = new Map<string, DriftAggregate>()
  for (const event of events) {
    if (event.type !== "layout.rect") continue
    const changes = Array.isArray(dataOf(event).changes) ? (dataOf(event).changes as unknown[]) : []
    for (const change of changes) {
      if (!isRecord(change)) continue
      const target = stringOf(change.target)
      if (!target || !isRecord(change.from) || !isRecord(change.to)) continue

      const distance = Math.max(
        Math.abs(numberOf(change.to.x) - numberOf(change.from.x)),
        Math.abs(numberOf(change.to.y) - numberOf(change.from.y)),
        Math.abs(numberOf(change.to.w) - numberOf(change.from.w)),
        Math.abs(numberOf(change.to.h) - numberOf(change.from.h)),
      )
      // A scroll-only change moves no box; `layout.rect` records it, but it is not drift.
      if (distance <= DRIFT_TOLERANCE) continue

      const selector = target.replace(/#\d+$/, "")
      const existing = drift.get(selector)
      const aggregate: DriftAggregate = existing ?? {
        selector,
        moves: 0,
        totalPx: 0,
        maxPx: 0,
        scrollMoves: 0,
        first: pointOf(event),
        last: pointOf(event),
      }
      aggregate.moves++
      aggregate.totalPx += distance
      aggregate.maxPx = Math.max(aggregate.maxPx, distance)
      aggregate.last = pointOf(event)
      if (isRecord(change.scroll)) aggregate.scrollMoves++
      drift.set(selector, aggregate)
    }
  }

  const produced: Finding[] = [...drift.values()]
    .sort((a, b) => b.totalPx - a.totalPx || a.selector.localeCompare(b.selector))
    .slice(0, DRIFT_LIMIT)
    .map((aggregate) => ({
      at: aggregate.last,
      severity: "warn" as const,
      kind: "layout.drift",
      title: `布局漂移：${aggregate.selector} 累计 ${Math.round(aggregate.totalPx)}px（${aggregate.moves} 次）`,
      evidence: {
        selector: aggregate.selector,
        moves: aggregate.moves,
        totalPx: Math.round(aggregate.totalPx),
        maxPx: Math.round(aggregate.maxPx),
        scrollMoves: aggregate.scrollMoves,
        firstT: aggregate.first.t,
        lastT: aggregate.last.t,
      },
      hint: `对照 dom.html 里的 ${aggregate.selector} 与导出时刻的 frames 关键帧，检查它的尺寸约束、挂载顺序和是否参与动画/变换。`,
    }))

  const shifts = events.filter((event) => event.type === "layout.shift")
  const total = shifts.reduce((sum, event) => sum + numberOf(dataOf(event).value), 0)
  if (total >= SHIFT_TOTAL_MINIMUM) {
    const sources = new Map<string, number>()
    let max = 0
    for (const event of shifts) {
      const data = dataOf(event)
      max = Math.max(max, numberOf(data.value))
      const list = Array.isArray(data.sources) ? data.sources : []
      for (const source of list) {
        const label = stringOf(source)
        if (label) sources.set(label, (sources.get(label) ?? 0) + 1)
      }
    }
    const first = shifts[0]
    produced.push({
      at: pointOf(first),
      severity: "warn",
      kind: "layout.drift",
      title: `累积布局偏移 ${decimal(total)}（${shifts.length} 次）`,
      evidence: {
        total: decimal(total),
        entries: shifts.length,
        max: decimal(max),
        sources: topEntries(sources, SHIFT_SOURCE_LIMIT).map(([selector, count]) => ({ selector, count })),
        firstT: first.t,
        lastT: shifts[shifts.length - 1].t,
      },
      hint: "按 layout.shift 的 sourceSelectors 找到元素，检查首屏占位（图片/骨架屏高度）与异步内容插入顺序。",
    })
  }

  return produced
}

type DriftAggregate = {
  selector: string
  moves: number
  totalPx: number
  maxPx: number
  scrollMoves: number
  first: Point
  last: Point
}

function scrollResetFindings(events: DiagnosticsEvent[]): Finding[] {
  const inputTimes = events.filter((event) => INPUT_TYPES.has(event.type)).map((event) => event.t)
  const programs = events.filter((event) => event.type === "scroll.program")
  const byTarget = new Map<string, DiagnosticsEvent[]>()
  for (const event of events) {
    if (event.type !== "scroll") continue
    const target = stringOf(dataOf(event).target) || "#document"
    const bucket = byTarget.get(target)
    if (bucket) bucket.push(event)
    else byTarget.set(target, [event])
  }

  const produced: Finding[] = []
  for (const [target, scrolls] of byTarget) {
    for (let index = 1; index < scrolls.length; index++) {
      const previous = scrolls[index - 1]
      const current = scrolls[index]
      const from = numberOf(dataOf(previous).top)
      const to = numberOf(dataOf(current).top)
      if (from <= 0 || to !== 0) continue
      if (produced.length >= SCROLL_RESET_LIMIT) break

      const program = nearestProgram(programs, target, current.t)
      const inputEvents = countWithin(inputTimes, current.t, SCROLL_ATTRIBUTION_WINDOW_MS)
      const suspect: ScrollSuspect = program ? "program" : inputEvents > 0 ? "input" : "unknown"

      produced.push({
        at: pointOf(current),
        // A reset the user caused is context, not a problem: keeping it at `warn` would push real
        // anomalies out of the timeline's 60 slots, which are trimmed by severity first.
        severity: suspect === "input" ? "info" : "warn",
        kind: "scroll.reset",
        title: `${target} 的 scrollTop 从 ${from} 回到 0`,
        evidence: {
          target,
          from,
          to,
          height: dataOf(current).height,
          windowMs: SCROLL_ATTRIBUTION_WINDOW_MS,
          inputEvents,
          suspect,
          ...(program ? { program } : {}),
        },
        hint: resetHint(suspect, target, program),
      })
    }
  }

  return produced.slice(0, SCROLL_RESET_LIMIT)
}

type ScrollSuspect = "program" | "input" | "unknown"

type ProgramEvidence = { kind: string; stack: unknown[] }

/** The closest `scroll.program` call for this target inside the window, if any. */
function nearestProgram(events: DiagnosticsEvent[], target: string, at: number): ProgramEvidence | undefined {
  let nearest: DiagnosticsEvent | undefined
  for (const event of events) {
    if (Math.abs(event.t - at) > SCROLL_ATTRIBUTION_WINDOW_MS) continue
    if (!sameScrollTarget(stringOf(dataOf(event).target), target)) continue
    if (nearest && Math.abs(nearest.t - at) <= Math.abs(event.t - at)) continue
    nearest = event
  }
  if (!nearest) return undefined

  const data = dataOf(nearest)
  return { kind: stringOf(data.kind) || "scroll", stack: Array.isArray(data.stack) ? data.stack : [] }
}

/** `#document` and `window` name the same viewport; every other target has to match exactly. */
function sameScrollTarget(left: string, right: string): boolean {
  if (left === right) return true
  return isViewportTarget(left) && isViewportTarget(right)
}

function isViewportTarget(target: string): boolean {
  return target === "#document" || target === "window"
}

function resetHint(suspect: ScrollSuspect, target: string, program: ProgramEvidence | undefined): string {
  if (suspect === "program" && program) {
    const frame = program.stack[0]
    const file = isRecord(frame) ? stringOf(frame.file) : ""
    const line = isRecord(frame) ? numberOf(frame.line) : 0
    return file && line > 0
      ? `±2 秒内有匹配的程序化滚动（${program.kind}），调用点 ${file}:${line}：从那一帧往上查它的触发时机（挂载、依赖变化、scrollIntoView）。`
      : `±2 秒内有匹配的程序化滚动（${program.kind}），但没有可用的调用栈：在该容器上打一个 mark 再复现。`
  }
  if (suspect === "input") {
    return "±2 秒窗口内有滚轮/触摸/键盘活动，可能是用户滚动；若用户没有滚，再确认同期 input.* 的 target 是否落在该容器上。"
  }
  return `既无程序化滚动证据也无输入证据：检查 ${target} 的 scrollTop 赋值、虚拟列表 reset，以及挂载/依赖变化后的恢复逻辑。`
}

function stallFindings(events: DiagnosticsEvent[]): Finding[] {
  const produced: Finding[] = []

  for (const event of events) {
    const data = dataOf(event)
    if (event.type === "longtask") {
      const ms = numberOf(data.ms)
      if (ms < LONG_TASK_MS) continue
      produced.push({
        at: pointOf(event),
        severity: "warn",
        kind: "performance.stall",
        title: `长任务 ${round(ms)}ms`,
        evidence: { trigger: "longtask", ms: round(ms), name: data.name },
        hint: "在 events 里对齐同一 t 的 dom 与 long.frame，确认这段时间是脚本执行、样式计算还是布局。",
      })
      continue
    }

    if (event.type !== "long.frame") continue
    const blocking = numberOf(data.blockingDuration)
    if (blocking < LONG_FRAME_BLOCKING_MS) continue
    produced.push({
      at: pointOf(event),
      severity: "warn",
      kind: "performance.stall",
      title: `长帧 ${round(numberOf(data.duration))}ms（阻塞 ${round(blocking)}ms）`,
      evidence: {
        trigger: "long.frame",
        duration: data.duration,
        blockingDuration: data.blockingDuration,
        scriptDuration: data.scriptDuration,
        attribution: data.attribution,
        scriptsTruncated: data.scriptsTruncated,
      },
      hint: "看 attribution/scripts 的 invoker 与 sourceURL，回到对应的事件处理函数；blockingDuration 高说明主线程被同步脚本占满。",
    })
  }

  const perf = events.filter((event) => event.type === "perf")
  let run: DiagnosticsEvent[] = []
  const flush = () => {
    if (run.length < 2) {
      run = []
      return
    }
    const first = run[0]
    const last = run[run.length - 1]
    const min = Math.min(...run.map(fpsOf))
    produced.push({
      at: pointOf(first),
      severity: "warn",
      kind: "performance.stall",
      title: `帧率低于 ${LOW_FPS}fps 连续 ${run.length} 秒（最低 ${min}fps）`,
      evidence: {
        trigger: "fps",
        fromT: first.t,
        toT: last.t,
        samples: run.map((event) => ({ t: event.t, fps: fpsOf(event) })),
        min,
      },
      hint: "对照同一时段的 long.frame 与 frames 关键帧；若同时有 visibility 变化，先排除窗口隐藏导致的采样缺口。",
    })
    run = []
  }

  for (const event of perf) {
    if (fpsOf(event) >= LOW_FPS) flush()
    else run.push(event)
  }
  flush()

  produced.sort((a, b) => a.at.t - b.at.t || a.title.localeCompare(b.title))
  const kept = produced.slice(0, STALL_LIMIT)

  return kept
}

function memoryFindings(events: DiagnosticsEvent[]): Finding[] {
  return events.slice(0, MEMORY_SUSPECT_LIMIT).map((event) => {
    const data = dataOf(event)

    return {
      at: pointOf(event),
      severity: "warn" as const,
      kind: "memory.suspect",
      title: `内存疑似泄漏：${round(numberOf(data.seconds))} 秒内节点 +${round(numberOf(data.nodesPerMinute))}/min、游离节点 +${round(numberOf(data.detachedPerMinute))}/min`,
      evidence: { ...data },
      hint: "对照同一时段的 memory 事件（nodes/detached/listeners/heap）与 frames 关键帧，找重复挂载、未清理的监听器或未释放的缓存。",
    }
  })
}

function markFindings(events: DiagnosticsEvent[]): Finding[] {
  return events.map((event) => {
    const data = dataOf(event)
    const label = stringOf(data.label) || stringOf(data.name) || stringOf(data.title) || stringOf(data.id) || "mark"

    return {
      at: pointOf(event),
      severity: "info" as const,
      kind: "mark",
      title: label,
      evidence: { ...data },
      hint: "用户描述的问题通常就在这个标记前后；用 at.t 回 events 对齐 ±2 秒。",
    }
  })
}

function densestWindow(events: readonly DiagnosticsEvent[]): DiagnosticsEvent[] {
  let best: DiagnosticsEvent[] = []
  let start = 0
  for (let end = 0; end < events.length; end++) {
    while (events[end].t - events[start].t > BURST_WINDOW_MS) start++
    if (end - start + 1 <= best.length) continue
    best = events.slice(start, end + 1)
  }

  return best
}

function fingerprintOf(event: DiagnosticsEvent): string {
  const data = dataOf(event)
  if (event.type === "error" || event.type === "unhandledrejection") return stringOf(data.fingerprint)
  return requestKey(stringOf(data.method), sanitizeUrl(stringOf(data.url)))
}

function requestKey(method: string, url: string): string {
  return `${method.toUpperCase() || "GET"} ${url}`
}

function fpsOf(event: DiagnosticsEvent): number {
  return numberOf(dataOf(event).fps)
}

function pointOf(event: DiagnosticsEvent): Point {
  return { t: event.t, wall: event.wall }
}

/** How many of the sorted `times` fall inside `[at - radius, at + radius]`. */
function countWithin(times: readonly number[], at: number, radius: number): number {
  return times.filter((time) => Math.abs(time - at) <= radius).length
}

function topEntries(map: Map<string, number>, limit: number): Array<[string, number]> {
  return [...map.entries()].sort(([a, left], [b, right]) => right - left || a.localeCompare(b)).slice(0, limit)
}

/** CLS is a fraction that matters below its first decimal, so it keeps three places instead of `round`'s one. */
function decimal(value: number): number {
  return Math.round(value * 1000) / 1000
}

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function dataOf(event: DiagnosticsEvent): Rec {
  return isRecord(event.data) ? event.data : {}
}

function numberOf(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : ""
}
