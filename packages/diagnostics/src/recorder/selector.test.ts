import { describe, expect, test } from "bun:test"
import { fakeElement, fakeScope, type FakeElement } from "../../test/dom"
import { stableSelector } from "./selector"

const asNode = (element: FakeElement) => element as unknown as Node

describe("stable selectors", () => {
  test("prefers a unique id", () => {
    const root = fakeElement({ tag: "div", attrs: { id: "app" } })
    const element = fakeElement({ tag: "div", attrs: { id: "timeline" }, parent: root })

    expect(stableSelector(asNode(element), fakeScope({ "#timeline": 1 }))).toEqual({
      selector: "#timeline",
      path: ["#timeline"],
      stable: true,
    })
  })

  test("falls back to a semantic attribute when the id is shared", () => {
    const element = fakeElement({ tag: "div", attrs: { id: "row", "data-slot": "message" } })

    const result = stableSelector(asNode(element), fakeScope({ "#row": 3, 'div[data-slot="message"]': 1 }))

    expect(result).toEqual({ selector: 'div[data-slot="message"]', path: ['div[data-slot="message"]'], stable: true })
  })

  test("orders data-component before aria-label", () => {
    const attrs = { "data-component": "row", "aria-label": "Delete message" }
    const element = fakeElement({ tag: "div", attrs })
    const counts = { 'div[data-component="row"]': 2, 'div[aria-label="Delete message"]': 1 }

    expect(stableSelector(asNode(element), fakeScope(counts)).selector).toBe('div[aria-label="Delete message"]')
  })

  test("narrows with the parent chain before giving up on a semantic match", () => {
    const timeline = fakeElement({ tag: "div", attrs: { "data-slot": "timeline" } })
    const message = fakeElement({ tag: "div", attrs: { "data-slot": "message" }, parent: timeline })

    const result = stableSelector(
      asNode(message),
      fakeScope({ 'div[data-slot="message"]': 3, div: 20, 'div[data-slot="timeline"] > div[data-slot="message"]': 1 }),
    )

    expect(result).toEqual({
      selector: 'div[data-slot="timeline"] > div[data-slot="message"]',
      path: ['div[data-slot="timeline"]', 'div[data-slot="message"]'],
      stable: true,
    })
  })

  test("keeps stable class tokens and drops state and hash classes", () => {
    const element = fakeElement({
      tag: "div",
      attrs: { class: "message is-active css-1x2y3z" },
    })

    expect(stableSelector(asNode(element), fakeScope({ "div.message": 1 })).selector).toBe("div.message")
  })

  test("degrades to nth-of-type when nothing else is unique", () => {
    const parent = fakeElement({ tag: "div" })
    fakeElement({ tag: "div", parent })
    const second = fakeElement({ tag: "div", parent })

    const result = stableSelector(asNode(second), fakeScope({ "div:nth-of-type(2)": 1 }))

    expect(result).toEqual({ selector: "div:nth-of-type(2)", path: ["div:nth-of-type(2)"], stable: false })
  })

  test("returns a positional fragment for a node that already left the document", () => {
    const removed = fakeElement({ tag: "span", connected: false })

    expect(stableSelector(asNode(removed), fakeScope({}))).toEqual({
      selector: "span:nth-of-type(1)",
      path: ["span:nth-of-type(1)"],
      stable: false,
    })
  })

  test("resolves a text node through its parent element", () => {
    const parent = fakeElement({ tag: "p", attrs: { "data-slot": "paragraph" } })
    const text = { nodeType: 3, parentElement: parent } as unknown as Node

    expect(stableSelector(text, fakeScope({ 'p[data-slot="paragraph"]': 1 })).selector).toBe('p[data-slot="paragraph"]')
  })
})
