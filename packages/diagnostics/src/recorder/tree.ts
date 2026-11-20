// Node labels used by the dom, input and layout recorders. Everything is truncated: a label is a hint for
// reading the dump, not a selector that has to round-trip.

import { truncate } from "./format"

const TEXT_LIMIT = 40

const slotOf = (element: Element) =>
  element.getAttribute("data-slot") ?? element.getAttribute("data-ui") ?? element.getAttribute("data-component") ?? ""

export function nodeLabel(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return `#text(${truncate(node.textContent, TEXT_LIMIT)})`
  if (!(node instanceof Element)) return node.nodeName.toLowerCase()

  const tag = node.tagName.toLowerCase()
  const id = node.id ? `#${node.id}` : ""
  const classes = node.getAttribute("class")?.trim()
  const classList = classes ? `.${classes.split(/\s+/).slice(0, 3).join(".")}` : ""
  const slot = slotOf(node)

  return `${tag}${id}${classList}${slot ? `[${slot}]` : ""}`
}

export function pathOf(node: Node | null): string {
  if (!node) return ""
  let element = node instanceof Element ? node : node.parentElement
  if (!element) return "#text"

  const parts: string[] = []
  for (let depth = 0; depth < 3 && element; depth++, element = element.parentElement) {
    parts.unshift(nodeLabel(element))
  }

  return parts.join(" > ")
}

/** Everything under the diagnostics surface is excluded so the panel never records itself. */
export function ignored(node: Node | null): boolean {
  if (!node) return false
  const element = node instanceof Element ? node : node.parentElement

  return !!element?.closest("[data-diagnostics-ignore]")
}
