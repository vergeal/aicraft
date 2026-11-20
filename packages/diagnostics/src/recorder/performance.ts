// Frames, long tasks, long animation frames and interaction latency. This is the only recorder that publishes
// the metrics snapshot; the layout recorder contributes `cls` to the same snapshot.
//
// The startup and route timeline below is inferred from the DOM: a route switch is "settled" when mutations stop
// for `ROUTE_SETTLE_MS`, which is a lower bound on the render cost, not a framework-level commit measurement.

import {
  HEAP_SAMPLE_MS,
  createDetachedLog,
  detectLeak,
  heapSample,
  scanNodes,
  trackListeners,
  type HeapInfo,
  type MemoryPoint,
} from "../memory"
import { round } from "./format"
import { LOAF_TYPE, createSplitWindow, startLoaf, type LoafFrame } from "./loaf"
import { observe } from "./observer"
import type { Recorder } from "./types"

const FRAME_WINDOW = 120
const FRAME_REPORT_MS = 250
const RUNTIME_TICK_MS = 500
const PERF_SAMPLE_MS = 1000
const SLOW_FRAME_MS = 25
const STUTTER_FRAME_MS = 100
const MAX_FPS = 240
const MIN_FRAME_MS = 250
const SESSION_SELECTOR = "[data-session-id]"
const ROUTE_SETTLE_MS = 150
const ROUTE_TIMEOUT_MS = 3_000
const ROUTE_MUTATION_LIMIT = 5_000
const MEMORY_POINT_LIMIT = 8

type EventTimingEntry = PerformanceEntry & {
  interactionId?: number
  target?: Node | null
}

// `durationThreshold` is shipped by Chromium but missing from the DOM lib's observer init.
type EventObserverInit = PerformanceObserverInit & {
  durationThreshold?: number
}

export const performanceRecorder: Recorder = {
  name: "performance",
  start(ctx) {
    const startedAt = performance.now()
    const frames: number[] = []
    const split = createSplitWindow()
    const memoryPoints: MemoryPoint[] = []
    const detachedLog = createDetachedLog()
    const listenerMeter = trackListeners()
    let stutters = 0
    let longTasks = 0
    let longTaskMax = 0
    let input = 0
    let lag = 0
    let heapUsed = 0
    let heapLimit = 0
    let nodes = 0
    let viewport = ""
    let firstFrame = false
    let firstSession = false
    let heapStatusRecorded = false
    let suspectArmed = true
    let last = performance.now()
    let reportAt = last
    let perfAt = last

    const publish = (now: number, delta: number) => {
      const sorted = [...frames].sort((a, b) => a - b)
      const average = frames.reduce((total, value) => total + value, 0) / frames.length
      const fps = Math.min(MAX_FPS, Math.round(1000 / average))
      const metrics = ctx.metrics.publish({
        fps,
        frame: round(delta),
        p95: round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
        slow: Math.round((frames.filter((value) => value > SLOW_FRAME_MS).length / frames.length) * 100),
        stutters,
        longTasks,
        longTaskMax,
        input,
        lag,
        heapUsed,
        heapLimit,
        nodes,
        viewport,
      })

      // One compact sample per second keeps the event stream aligned with the frames it summarizes.
      if (now - perfAt < PERF_SAMPLE_MS) return
      perfAt = now
      const main = split.read()
      ctx.record("perf", {
        fps,
        frame: metrics.frame,
        p95: metrics.p95,
        slow: metrics.slow,
        stutters,
        longTasks,
        longTaskMax,
        input,
        cls: metrics.cls,
        lag,
        heapUsed,
        heapLimit,
        nodes,
        viewport,
        // Null, not zero: a second without a long frame has no split to report.
        main: main.frames > 0 ? main : null,
      })
      split.reset()
    }

    const sample = (now: number) => {
      requestAnimationFrame(sample)
      ctx.observed()
      if (!firstFrame) {
        firstFrame = true
        performance.mark("diagnostics:first-frame")
        ctx.record("perf.first-frame", { ms: round(now - startedAt) })
      }
      const delta = now - last
      last = now

      // The window was hidden or the main thread slept: restart the window instead of averaging the gap in.
      if (delta > MIN_FRAME_MS) {
        frames.length = 0
        return
      }

      if (delta > STUTTER_FRAME_MS) stutters++
      frames.push(delta)
      if (frames.length > FRAME_WINDOW) frames.shift()

      // The viewport and heap follow the coarser runtime probe; publish still happens every frame for FPS,
      // but only once per frame report interval to keep the panel cheap.
      if (now - reportAt < FRAME_REPORT_MS) return
      reportAt = now
      publish(now, delta)
    }

    requestAnimationFrame(sample)

    observe<PerformanceEntry>("longtask", { type: "longtask", buffered: false }, (entries) => {
      ctx.observed(entries.length)
      for (const entry of entries) {
        longTasks++
        longTaskMax = Math.max(longTaskMax, round(entry.duration))
        ctx.record("longtask", { ms: round(entry.duration), name: entry.name })
      }
    })

    const eventInit: EventObserverInit = { type: "event", durationThreshold: 16, buffered: false }
    observe<EventTimingEntry>("event", eventInit, (entries) => {
      ctx.observed(entries.length)
      const interactions = entries.filter((entry) => (entry.interactionId ?? 0) > 0)
      if (interactions.length === 0) return
      for (const entry of interactions) {
        input = Math.max(input, round(entry.duration))
        ctx.record("input.latency", {
          ms: round(entry.duration),
          name: entry.name,
          target: entry.target instanceof Node ? ctx.pathOf(entry.target) : undefined,
        })
      }
    })

    const onFrame = (frame: LoafFrame) => {
      ctx.observed()
      split.add(frame)
      ctx.record("long.frame", {
        duration: frame.duration,
        blockingDuration: frame.blockingDuration,
        renderStart: frame.renderStart,
        styleAndLayoutStart: frame.styleAndLayoutStart,
        scripts: frame.scripts,
        scriptsTruncated: frame.scriptCount > frame.scripts.length,
        attribution: frame.attribution,
      })
    }

    // An unsupported entry type is stated once instead of being papered over with an empty split.
    if (!startLoaf(onFrame)) {
      ctx.observed()
      ctx.record("perf.loaf", {
        availability: "unavailable",
        reason:
          typeof PerformanceObserver === "undefined"
            ? "PerformanceObserver is not available"
            : `${LOAF_TYPE} is not a supported entry type`,
      })
    }

    let firstSessionObserver: MutationObserver | undefined
    const checkSession = (alreadyVisible: boolean) => {
      if (firstSession) return
      const node = document.querySelector(SESSION_SELECTOR)
      if (!node) return

      firstSession = true
      firstSessionObserver?.disconnect()
      performance.mark("diagnostics:first-session")
      ctx.observed()
      ctx.record("perf.first-session", {
        ms: round(performance.now() - startedAt),
        alreadyVisible,
        target: ctx.pathOf(node),
      })
    }

    firstSessionObserver = new MutationObserver(() => checkSession(false))
    firstSessionObserver.observe(document.documentElement, { childList: true, subtree: true })
    // The capture can start after the first session is already on screen; the first frame tells the two apart.
    requestAnimationFrame(() => checkSession(true))

    let routeStart = 0
    let routeURL = ""
    let routeMark = ""
    let routeMutations = 0
    let routeLastMutationAt = 0
    let routeIndex = 0
    let routeTimer: ReturnType<typeof setTimeout> | undefined
    let routeObserver: MutationObserver | undefined

    const flushRoute = (settled: boolean) => {
      if (routeStart === 0) return
      // The settle window is quiet time, not render time: measure to the last mutation it waited on.
      const end = settled && routeLastMutationAt > routeStart ? routeLastMutationAt : performance.now()
      const ms = round(end - routeStart)
      const url = routeURL
      const mark = routeMark
      const mutations = routeMutations
      routeStart = 0
      routeMutations = 0
      routeLastMutationAt = 0
      if (routeTimer !== undefined) {
        clearTimeout(routeTimer)
        routeTimer = undefined
      }
      routeObserver?.disconnect()
      routeObserver = undefined
      performance.measure("diagnostics:route", mark)
      ctx.observed()
      ctx.record("route.render", { url, ms, mutations, settled })
    }

    const scheduleRoute = (delay: number, settled: boolean) => {
      if (routeTimer !== undefined) clearTimeout(routeTimer)
      routeTimer = setTimeout(() => flushRoute(settled), delay)
    }

    const watchRoute = (url: string) => {
      if (routeStart !== 0) flushRoute(false)
      routeStart = performance.now()
      routeURL = url
      routeMutations = 0
      routeIndex++
      routeMark = `diagnostics:route:${routeIndex}`
      performance.mark(routeMark)
      routeObserver?.disconnect()
      routeObserver = new MutationObserver((records) => {
        if (routeStart === 0) return
        routeMutations += records.length
        routeLastMutationAt = performance.now()
        if (routeMutations > ROUTE_MUTATION_LIMIT) return flushRoute(false)
        scheduleRoute(ROUTE_SETTLE_MS, true)
      })
      routeObserver.observe(document.documentElement, { childList: true, subtree: true })
      scheduleRoute(ROUTE_TIMEOUT_MS, false)
    }

    const push = history.pushState.bind(history)
    const replace = history.replaceState.bind(history)
    history.pushState = (...args) => {
      watchRoute(String(args[2] ?? location.pathname))

      return push(...args)
    }
    history.replaceState = (...args) => {
      watchRoute(String(args[2] ?? location.pathname))

      return replace(...args)
    }
    window.addEventListener("popstate", () => watchRoute(location.pathname))

    detachedLog.start(document.documentElement)

    const memoryInfo = () => (performance as Performance & { memory?: HeapInfo }).memory
    let expected = performance.now() + RUNTIME_TICK_MS

    setInterval(() => {
      const now = performance.now()
      const drift = now - expected
      expected = now + RUNTIME_TICK_MS
      const info = memoryInfo()
      lag = drift > RUNTIME_TICK_MS * 2 ? 0 : round(Math.max(0, drift))
      heapUsed = info ? round(info.usedJSHeapSize / 1024 / 1024) : 0
      heapLimit = info ? Math.round(info.jsHeapSizeLimit / 1024 / 1024) : 0
      nodes = document.querySelectorAll("*").length
      // Chromium reports a fractional ratio (1.1000000238…), which turns a one-glance metric into a clipped string.
      viewport = `${innerWidth}×${innerHeight} @${Math.round(devicePixelRatio * 100) / 100}x`
    }, RUNTIME_TICK_MS)

    // One memory point every ten seconds: node growth, detached nodes, listener growth and the heap share a
    // timeline, so a leak suspect is read from the same samples the panel shows.
    setInterval(() => {
      const t = ctx.now()
      const scan = scanNodes(document)
      const removed = detachedLog.stats()
      const bound = listenerMeter.stats()
      const heap = heapSample(memoryInfo())
      memoryPoints.push({ t, nodes: scan.nodes, detached: removed.alive })
      if (memoryPoints.length > MEMORY_POINT_LIMIT) memoryPoints.shift()

      ctx.observed()
      ctx.record("memory", {
        nodes: scan.nodes,
        scan: {
          sampled: scan.sampled,
          limit: scan.limit,
          truncated: scan.truncated,
          detachedInScan: scan.detachedInScan,
        },
        detached: removed,
        listeners: bound,
        heap,
        // `performance.memory` is off by default in some builds; say so once instead of on every sample.
        ...(heap || heapStatusRecorded ? {} : { heapStatus: "unavailable" }),
      })
      if (!heap) heapStatusRecorded = true

      const verdict = detectLeak(memoryPoints)
      if (verdict && suspectArmed) {
        suspectArmed = false
        ctx.observed()
        ctx.record("memory.suspect", verdict)
      }
      if (!verdict) suspectArmed = true
    }, HEAP_SAMPLE_MS)
  },
}
