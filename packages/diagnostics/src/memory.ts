// Memory evidence for a dump: node count versus removed-but-reachable nodes, listener growth, the JS heap when
// the renderer exposes it, and a verdict when the two counts climb together.
//
// Detached nodes cannot be enumerated from the document: `querySelectorAll` walks the connected tree only. The
// detached number therefore comes from a removal log (MutationObserver + WeakRef), which counts nodes that were
// removed, are still alive, and are still outside the document. The scan reports what it can see from the
// document side plus whether its sample was truncated, so neither number is presented as an exact census.

import { round, truncate } from "./recorder/format"

export const NODE_SAMPLE_LIMIT = 5_000
export const DETACHED_LIMIT = 5_000
export const LISTENER_LIMIT = 20
export const LISTENER_TYPE_LIMIT = 5
export const HEAP_SAMPLE_MS = 10_000
export const LEAK_SPANS = 3
export const LEAK_THRESHOLD = { nodes: 40, detached: 8 } as const

const LABEL_LIMIT = 32
const MEGABYTE = 1024 * 1024

export type HeapInfo = {
  usedJSHeapSize: number
  jsHeapSizeLimit: number
}

/** `used` and `limit` in megabytes; null when the renderer does not expose `performance.memory`. */
export type HeapSample = { used: number; limit: number }

export function heapSample(info: HeapInfo | undefined): HeapSample | null {
  if (!info) return null
  if (!Number.isFinite(info.usedJSHeapSize) || !Number.isFinite(info.jsHeapSizeLimit)) return null
  if (info.jsHeapSizeLimit <= 0) return null

  return {
    used: round(info.usedJSHeapSize / MEGABYTE),
    limit: Math.round(info.jsHeapSizeLimit / MEGABYTE),
  }
}

export type NodeScan = {
  /** Every node the document currently reports, before the sampling limit. */
  nodes: number
  sampled: number
  limit: number
  truncated: boolean
  connected: number
  /** Nodes the scan reached that were already detached; normally 0, see the note above. */
  detachedInScan: number
}

export function scanNodes(root: ParentNode, limit = NODE_SAMPLE_LIMIT): NodeScan {
  const all = root.querySelectorAll("*")
  const sampled = Math.min(all.length, Math.max(0, limit))
  let connected = 0
  let detachedInScan = 0

  for (let index = 0; index < sampled; index++) {
    if (all[index].isConnected) connected++
    else detachedInScan++
  }

  return { nodes: all.length, sampled, limit, truncated: all.length > limit, connected, detachedInScan }
}

type CountableNode = { isConnected: boolean }

/** Nodes the removal log still holds that are no longer in the document. */
export function countDetached(refs: readonly WeakRef<CountableNode>[]): number {
  return refs.reduce((total, ref) => {
    const node = ref.deref()
    return node && !node.isConnected ? total + 1 : total
  }, 0)
}

export type DetachedStats = {
  /** Removed nodes the log still tracks. */
  tracked: number
  /** Tracked nodes still alive outside the document: the detached estimate. */
  alive: number
  /** Tracked nodes the GC already collected, which were not leaks. */
  collected: number
  /** Whether old removals were pushed out of the log to stay under its limit. */
  truncated: boolean
}

export type DetachedLog = {
  /** Attaches the removal observer to a subtree root. False when `MutationObserver` is missing. */
  start(target: Node): boolean
  stats(): DetachedStats
  stop(): void
}

/**
 * Remembers removed nodes weakly. Each node is only logged the first time it leaves the document, so a node
 * that is re-inserted and removed again is not double counted; the estimate stays conservative.
 */
export function createDetachedLog(limit = DETACHED_LIMIT): DetachedLog {
  const refs: Array<WeakRef<CountableNode>> = []
  const seen = new WeakSet<CountableNode>()
  let observer: MutationObserver | null = null
  let dropped = 0

  const add = (node: Node) => {
    if (seen.has(node)) return
    seen.add(node)
    refs.push(new WeakRef(node))
    if (refs.length <= limit) return
    refs.shift()
    dropped++
  }

  return {
    start(target) {
      if (typeof MutationObserver === "undefined") return false
      observer = new MutationObserver((records) => {
        for (const record of records) for (const node of record.removedNodes) add(node)
      })
      observer.observe(target, { childList: true, subtree: true })

      return true
    },
    stats() {
      const alive = countDetached(refs)

      return { tracked: refs.length, alive, collected: refs.length - alive, truncated: dropped > 0 }
    },
    stop() {
      observer?.disconnect()
      observer = null
    },
  }
}

export type ListenerTypeCount = { type: string; count: number }

/** Listeners grouped by the tag (or target class) they are bound to. */
export type ListenerGroup = { target: string; count: number; types: ListenerTypeCount[] }

export type ListenerStats = {
  /** Net number of registered listeners across every target. */
  bound: number
  /** Top `LISTENER_LIMIT` targets by listener count; the rest are omitted. */
  groups: ListenerGroup[]
}

/**
 * A counting sink for the wrapped `addEventListener`/`removeEventListener`. Counts are net additions: a target
 * that is collected without removing its listeners keeps its count, which is exactly the stale binding this is
 * meant to surface.
 */
export function createListenerTally(limit = LISTENER_LIMIT) {
  const counts = new Map<string, Map<string, number>>()
  let bound = 0

  return {
    add(target: string, type: string) {
      const types = counts.get(target) ?? new Map<string, number>()
      types.set(type, (types.get(type) ?? 0) + 1)
      counts.set(target, types)
      bound++
    },
    remove(target: string, type: string) {
      const types = counts.get(target)
      const current = types?.get(type) ?? 0
      if (!types || current === 0) return
      bound--
      if (current === 1) types.delete(type)
      else types.set(type, current - 1)
      if (types.size === 0) counts.delete(target)
    },
    stats(): ListenerStats {
      const groups = Array.from(counts, ([target, types]) => ({
        target,
        count: Array.from(types.values()).reduce((total, value) => total + value, 0),
        types: Array.from(types, ([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
          .slice(0, LISTENER_TYPE_LIMIT),
      }))
        .sort((a, b) => b.count - a.count || a.target.localeCompare(b.target))
        .slice(0, limit)

      return { bound, groups }
    },
  }
}

/** The shortest stable name for a listener target: `window`, `#document`, or the lowercased tag name. */
export function listenerLabel(target: EventTarget): string {
  const nodeName = (target as { nodeName?: unknown }).nodeName
  if (typeof nodeName === "string" && nodeName) return truncate(nodeName.toLowerCase(), LABEL_LIMIT) || "node"

  const name = Object.getPrototypeOf(target)?.constructor?.name
  if (typeof name !== "string" || !name) return "object"

  return truncate(name.toLowerCase(), LABEL_LIMIT) || "object"
}

export type ListenerMeter = { stats(): ListenerStats; stop(): void }

let tracking = false

/**
 * Wraps `EventTarget.prototype` once so every registration after this call is counted. Targets that were bound
 * before the wrap are invisible, which is why the dump records `bound` as a delta from the capture start.
 */
export function trackListeners(limit = LISTENER_LIMIT): ListenerMeter {
  const tally = createListenerTally(limit)
  if (tracking) return { stats: () => tally.stats(), stop: () => {} }
  tracking = true

  const proto = EventTarget.prototype
  const originalAdd = proto.addEventListener
  const originalRemove = proto.removeEventListener
  const owners = new WeakMap<EventTarget, Map<string, number>>()
  const ids = new WeakMap<EventListenerOrEventListenerObject, number>()
  let nextID = 0

  const idOf = (listener: EventListenerOrEventListenerObject | null) => {
    if (!listener) return 0
    const existing = ids.get(listener)
    if (existing !== undefined) return existing
    nextID++
    ids.set(listener, nextID)

    return nextID
  }

  // The same listener added twice for one target and capture flag is a no-op in the DOM, so it must not count twice.
  const keyOf = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) => {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture)

    return `${type}\u0000${capture ? 1 : 0}\u0000${idOf(listener)}`
  }

  const patchedAdd = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    const key = keyOf(type, listener, options)
    const owned = owners.get(this) ?? new Map<string, number>()
    const seen = owned.get(key) ?? 0
    if (seen === 0) tally.add(listenerLabel(this), type)
    owned.set(key, seen + 1)
    owners.set(this, owned)

    return originalAdd.call(this, type, listener, options)
  }

  const patchedRemove = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    const key = keyOf(type, listener, options)
    const owned = owners.get(this)
    const seen = owned?.get(key) ?? 0
    if (owned && seen > 0) {
      if (seen === 1) {
        owned.delete(key)
        tally.remove(listenerLabel(this), type)
      } else {
        owned.set(key, seen - 1)
      }
    }

    return originalRemove.call(this, type, listener, options)
  }

  proto.addEventListener = patchedAdd
  proto.removeEventListener = patchedRemove

  return {
    stats: () => tally.stats(),
    stop() {
      proto.addEventListener = originalAdd
      proto.removeEventListener = originalRemove
      tracking = false
    },
  }
}

/** One point on the memory timeline: node count versus removed-but-reachable node count. */
export type MemoryPoint = { t: number; nodes: number; detached: number }

export type LeakVerdict = {
  /** Consecutive rising spans behind the verdict. */
  spans: number
  seconds: number
  nodes: number
  detached: number
  nodesPerMinute: number
  detachedPerMinute: number
}

/**
 * A leak suspect is a strict rise in node count across `spans` consecutive sample gaps while the detached count
 * also grows, with both rises above `threshold` so ordinary list churn does not trip it. Returns null otherwise.
 */
export function detectLeak(
  points: readonly MemoryPoint[],
  spans = LEAK_SPANS,
  threshold: { nodes: number; detached: number } = LEAK_THRESHOLD,
): LeakVerdict | null {
  if (spans < 1 || points.length < spans + 1) return null
  const tail = points.slice(-(spans + 1))

  for (let index = 1; index < tail.length; index++) {
    if (tail[index].nodes <= tail[index - 1].nodes) return null
  }

  const first = tail[0]
  const last = tail[tail.length - 1]
  const grown = last.nodes - first.nodes
  const freed = last.detached - first.detached
  if (grown < threshold.nodes || freed < threshold.detached) return null

  const minutes = Math.max((last.t - first.t) / 60_000, 1 / 60_000)

  return {
    spans,
    seconds: round((last.t - first.t) / 1000),
    nodes: last.nodes,
    detached: last.detached,
    nodesPerMinute: round(grown / minutes),
    detachedPerMinute: round(freed / minutes),
  }
}
