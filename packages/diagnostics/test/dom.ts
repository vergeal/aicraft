// The selector builder talks to a tiny slice of the DOM: element identity, attributes, siblings and one
// uniqueness query. Tests declare which selectors are unique instead of reimplementing CSS matching, so a
// case states the environment it wants and asserts only what the builder chose.

export type ElementCounts = Record<string, number>

export type FakeElement = {
  nodeType: 1
  tagName: string
  isConnected?: boolean
  parentElement: FakeElement | null
  previousElementSibling: FakeElement | null
  getAttribute(name: string): string | null
}

const children = new WeakMap<FakeElement, FakeElement[]>()

/** A `querySelectorAll` stand-in that answers from the declared counts. */
export function fakeScope(counts: ElementCounts): ParentNode {
  const scope = { querySelectorAll: (selector: string) => ({ length: counts[selector] ?? 0 }) }

  return scope as unknown as ParentNode
}

export function fakeElement(input: {
  tag: string
  attrs?: Record<string, string>
  parent?: FakeElement
  connected?: boolean
}): FakeElement {
  const attrs = input.attrs ?? {}
  const siblings = input.parent ? (children.get(input.parent) ?? []) : []
  const element: FakeElement = {
    nodeType: 1,
    tagName: input.tag.toUpperCase(),
    isConnected: input.connected ?? true,
    parentElement: input.parent ?? null,
    previousElementSibling: siblings[siblings.length - 1] ?? null,
    getAttribute: (name) => attrs[name] ?? null,
  }

  if (input.parent) {
    siblings.push(element)
    children.set(input.parent, siblings)
  }

  return element
}
