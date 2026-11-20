// DOM mutations, batched per observer callback. Each batch becomes one event so a busy renderer cannot
// flood the ring buffer one mutation at a time.

import { truncate } from "./format"
import { keyframeAfterMutation } from "./frames"
import { isElement, stableSelector } from "./selector"
import type { Recorder } from "./types"

const MAX_MUTATIONS = 150
const MAX_NODE_LIST = 20
const ATTRIBUTE_LIMIT = 120
const VALUE_LIMIT = 200
const MAX_SELECTORS = 40

type NodeSelector = { selector: string; stable: boolean }

export const domRecorder: Recorder = {
  name: "dom",
  start(ctx) {
    const observer = new MutationObserver((list) => {
      ctx.observed(list.length)
      const entries: unknown[] = []
      // One batch often touches the same element more than once; resolve its selector once and stop paying
      // for it after the per-batch budget is gone.
      const cache = new WeakMap<Element, NodeSelector | null>()
      let budget = MAX_SELECTORS

      const describe = (node: Node): NodeSelector | null => {
        const element = isElement(node) ? node : node.parentElement
        if (!element) return null
        const known = cache.get(element)
        if (known !== undefined) return known
        if (budget <= 0) return null
        budget--

        const value = stableSelector(element)
        const found = value.selector ? { selector: value.selector, stable: value.stable } : null
        cache.set(element, found)
        return found
      }

      for (const mutation of list) {
        if (entries.length >= MAX_MUTATIONS) break
        if (ctx.ignored(mutation.target)) continue
        const target = ctx.pathOf(mutation.target)

        if (mutation.type === "childList") {
          const added = Array.from(mutation.addedNodes)
            .filter((node) => !ctx.ignored(node))
            .slice(0, MAX_NODE_LIST)
          const removed = Array.from(mutation.removedNodes)
            .filter((node) => !ctx.ignored(node))
            .slice(0, MAX_NODE_LIST)
          if (added.length === 0 && removed.length === 0) continue
          entries.push({
            kind: "childList",
            target,
            added: added.map((node) => ctx.nodeLabel(node)),
            removed: removed.map((node) => ctx.nodeLabel(node)),
            addedCount: mutation.addedNodes.length,
            removedCount: mutation.removedNodes.length,
            // Aligned with `added`/`removed`; `null` means the batch's selector budget ran out.
            addedSelectors: added.map(describe),
            removedSelectors: removed.map(describe),
          })
          continue
        }

        if (mutation.type === "attributes") {
          const name = mutation.attributeName
          const value = name && isElement(mutation.target) ? mutation.target.getAttribute(name) : ""
          const found = describe(mutation.target)
          entries.push({
            kind: "attributes",
            target,
            attribute: name,
            old: truncate(mutation.oldValue, ATTRIBUTE_LIMIT),
            next: truncate(value, ATTRIBUTE_LIMIT),
            oldValue: truncate(mutation.oldValue, VALUE_LIMIT),
            newValue: truncate(value, VALUE_LIMIT),
            selector: found?.selector,
            stable: found?.stable,
          })
          continue
        }

        entries.push({
          kind: "characterData",
          target,
          old: truncate(mutation.oldValue),
          next: truncate(mutation.target.textContent),
        })
      }

      if (entries.length === 0) return
      ctx.record("dom", { mutations: entries, total: list.length })
      if (list.some((mutation) => mutation.type === "childList")) keyframeAfterMutation(ctx)
    })

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true,
    })
  },
}
