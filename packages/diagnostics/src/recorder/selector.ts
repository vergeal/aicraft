// Stable CSS selectors for DOM evidence. A dump outlives its document, so a selector is only useful when it
// still identifies the same element at export time: every candidate is validated against the live document,
// and the builder narrows with ancestors before it falls back to a positional `:nth-of-type` match.

/** A selector together with how much it can be trusted. */
export type StableSelector = {
  /** One selector that matched exactly one element when it was built, otherwise a positional fallback. */
  selector: string
  /** Ancestor-to-self fragments the selector was assembled from. */
  path: string[]
  /** False when the result leans on `:nth-of-type`, i.e. it moves with the DOM. */
  stable: boolean
}

/** `Node.ELEMENT_NODE`, spelled out so this module needs no DOM global. */
const ELEMENT_NODE = 1

const IDENT = /^[A-Za-z_][\w-]*$/
const ATTR_NAMES = ["data-slot", "data-testid", "data-component", "aria-label"]
// A class token is only a hint: lowercase kebab segments identify a component, while CSS-in-JS hashes
// (`css-1x2y3z`) and interaction states (`is-active`) change between renders.
const CLASS_SHAPE = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/
const CLASS_SEGMENT = /^([a-z]+|\d{1,3})$/
const STATE_CLASS = /(^|[-_])(is|has|js|state)([-_]|$)|[0-9a-f]{6,}/
const MAX_CLASSES = 2
const MAX_ANCESTORS = 5
// Longer attribute values are either prose (an `aria-label`) or generated; neither survives a rename.
const MAX_VALUE = 60

export function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE
}

/**
 * Builds the strongest selector that resolves to `node` alone.
 *
 * Priority: `#id`, then `[data-slot]` / `[data-testid]` / `[data-component]` / `[aria-label]`, then stable
 * class tokens, then the bare tag. A candidate that matches more than one element is rejected and the next
 * one is tried; when every candidate is ambiguous the builder prepends ancestor fragments, and only if the
 * whole chain stays ambiguous does it degrade to `tag:nth-of-type(n)` with `stable: false`.
 */
export function stableSelector(node: Node | null, scope?: ParentNode): StableSelector {
  const element = elementOf(node)
  if (!element) return { selector: "", path: [], stable: false }

  // A removed node is already outside the document: nothing can match it, so a positional fragment is the
  // honest answer and it costs no query.
  if (element.isConnected === false) {
    const fragment = positionalFragment(element)
    return { selector: fragment, path: [fragment], stable: false }
  }

  const root = scope ?? element.ownerDocument ?? document
  const unique = (selector: string) => root.querySelectorAll(selector).length === 1

  for (const candidate of candidates(element)) {
    if (unique(candidate)) return { selector: candidate, path: [candidate], stable: true }
  }

  const ancestors = ancestorChain(element)
  const semantic = narrow([...ancestors.map(fragmentOf), fragmentOf(element)], unique)
  if (semantic) return { selector: semantic.join(" > "), path: semantic, stable: true }

  const positional = [...ancestors.map(positionalFragment), positionalFragment(element)]
  const fallback = narrow(positional, unique) ?? positional
  return { selector: fallback.join(" > "), path: fallback, stable: false }
}

function elementOf(node: Node | null): Element | null {
  if (!node) return null
  if (isElement(node)) return node
  return node.parentElement
}

/** Candidate selectors for one element, strongest first. */
function candidates(element: Element): string[] {
  const tag = element.tagName.toLowerCase()
  const id = usable(element.getAttribute("id"))
  const list = id ? [IDENT.test(id) ? `#${id}` : `${tag}[id="${escapeValue(id)}"]`] : []

  for (const name of ATTR_NAMES) {
    const value = usable(element.getAttribute(name))
    if (value) list.push(`${tag}[${name}="${escapeValue(value)}"]`)
  }

  const classes = stableClasses(element)
  if (classes.length > 0) list.push(`${tag}.${classes.join(".")}`)
  list.push(tag)

  return list
}

const fragmentOf = (element: Element) => candidates(element)[0]

function stableClasses(element: Element): string[] {
  const tokens = (element.getAttribute("class") ?? "").trim().split(/\s+/)

  return tokens
    .filter(
      (token) =>
        token.length <= 32 &&
        CLASS_SHAPE.test(token) &&
        !STATE_CLASS.test(token) &&
        token.split(/[-_]/).every((segment) => CLASS_SEGMENT.test(segment)),
    )
    .slice(0, MAX_CLASSES)
}

/** Ancestors from the outermost readable level down to the direct parent. */
function ancestorChain(element: Element): Element[] {
  const chain: Element[] = []
  for (let parent = element.parentElement; parent && chain.length < MAX_ANCESTORS; parent = parent.parentElement)
    chain.unshift(parent)

  return chain
}

/** Shortest suffix of `fragments` that resolves to exactly one element. */
function narrow(fragments: string[], unique: (selector: string) => boolean): string[] | undefined {
  for (let depth = 1; depth <= fragments.length; depth++) {
    const path = fragments.slice(fragments.length - depth)
    if (unique(path.join(" > "))) return path
  }

  return undefined
}

function positionalFragment(element: Element): string {
  return `${element.tagName.toLowerCase()}:nth-of-type(${position(element)})`
}

function position(element: Element): number {
  let index = 1
  for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling)
    if (sibling.tagName === element.tagName) index++

  return index
}

const usable = (value: string | null): string | undefined => (value && value.length <= MAX_VALUE ? value : undefined)

const escapeValue = (value: string) => value.replace(/["\\]/g, (char) => `\\${char}`)
