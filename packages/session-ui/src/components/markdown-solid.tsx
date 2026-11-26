import { createRenderEffect, For, onMount } from "solid-js"
import { createStore, reconcile, unwrap } from "solid-js/store"
import { Dynamic, render } from "solid-js/web"

type MarkdownNode =
  | {
      key: string
      type: "element"
      tag: string
      attributes: Record<string, string>
      children: MarkdownNode[]
      animate?: true
    }
  | { key: string; type: "text"; text: string; animate?: true }
  | { key: string; type: "word"; text: string; animate?: true }

export function createMarkdownRenderer(root: HTMLDivElement, source: ParentNode) {
  const [nodes, setNodes] = createStore(parseMarkdownNodes(source, false))
  let ready = false

  const dispose = render(
    () => <For each={nodes}>{(node) => <MarkdownDomNode node={node} animate={() => ready} />}</For>,
    root,
  )

  ready = true

  return {
    update(next: ParentNode, animate = true) {
      const parsed = parseMarkdownNodes(next, false, animate)
      // The live parser heals (an unclosed bold closes, a table gains columns): the positional keys
      // the first render keyed every node with then shift for the whole tail of the paragraph, and
      // Solid's For would move every already-mounted node instead of only appending the fresh tail.
      // Carrying the previous tree's keys over the common prefix makes the reconcile mutate in place.
      carryKeys(unwrap(nodes), parsed)
      setNodes(reconcile(parsed, { key: "key" }))
    },
    dispose,
  }
}

/**
 * Keys the fresh parse with the previous tree's keys over the shared prefix. The prefix ends at the
 * first node whose identity changes (a different tag, or a text/element boundary); from there on the
 * fresh keys stand and Solid mounts the tail as new nodes.
 */
function carryKeys(previous: readonly MarkdownNode[], next: MarkdownNode[]): void {
  const shared = Math.min(previous.length, next.length)

  for (let index = 0; index < shared; index++) {
    const old = previous[index]!
    const fresh = next[index]!

    if (!sameShape(old, fresh)) return
    fresh.key = old.key

    if (old.type === "element" && fresh.type === "element") carryKeys(old.children, fresh.children)
  }
}

function sameShape(old: MarkdownNode, fresh: MarkdownNode): boolean {
  if (old.type !== fresh.type) return false

  if (old.type === "element" && fresh.type === "element") return old.tag === fresh.tag

  return true
}

function MarkdownDomNode(props: { node: MarkdownNode; animate: () => boolean }) {
  // Text binds through `props.node.text`, never through a local `const node = props.node`: the JSX
  // compiler only turns a member expression rooted at `props` into a reactive getter, so a local
  // alias would insert the text once and a streamed delta could never reach it as characterData.
  // A node's type never changes under one key (text nodes carry the `t` prefix), so the static
  // branch here is safe.
  if (props.node.type === "element") return <ElementNode node={props.node} animate={props.animate} />
  if (props.node.type === "word") return <span data-markdown-word="">{props.node.text}</span>

  // A plain text node renders through its own Text node, whose data a render effect writes in place.
  // JSX text interpolation goes through Solid's insert, whose array reconciliation replaces the text
  // node instead of mutating it — the streamed path needs the characterData update, not a swap.
  const node = props.node
  const text = document.createTextNode(node.text)

  createRenderEffect(() => {
    const value = node.text

    if (text.data !== value) text.data = value
  })

  return text
}

function ElementNode(props: {
  node: Extract<MarkdownNode, { type: "element" }>
  animate: () => boolean
}) {
  let ref: HTMLElement | undefined
  onMount(() => {
    if (props.animate() && props.node.animate) ref?.setAttribute("data-markdown-enter", "")
  })

  return (
    <Dynamic component={props.node.tag} ref={ref} {...props.node.attributes}>
      <For each={props.node.children}>{(node) => <MarkdownDomNode node={node} animate={props.animate} />}</For>
    </Dynamic>
  )
}

export function parseMarkdownNodes(source: ParentNode, words: boolean, animate = false) {
  return Array.from(source.childNodes).flatMap((node, index) => parseNode(node, `${index}`, words, animate))
}

function parseNode(node: Node, key: string, words: boolean, animate: boolean, inlineCode = false): MarkdownNode[] {
  if (node instanceof Text) {
    // A live update parses ordinary text as one node, so its reconcile lands as characterData on the
    // text node the paragraph already holds instead of mounting a span per streamed word. The first
    // render still splits words for the fade-in, and inline code keeps per-character spans.
    if (!words && !inlineCode) return [{ key: `t${key}`, type: "text", text: node.data }]

    return (inlineCode ? Array.from(node.data) : node.data.split(/(\s+)/)).flatMap((text, index): MarkdownNode[] => {
      if (!text) return []

      if (/^\s+$/.test(text)) return [{ key: `t${key}:${index}`, type: "text", text }]
      const word: Extract<MarkdownNode, { type: "word" }> = { key: `${key}:${index}`, type: "word", text }

      if (animate) word.animate = true

      return [word]
    })
  }

  if (!(node instanceof Element)) return []
  const code = node.tagName === "CODE" && node.parentElement?.tagName !== "PRE"

  const element: Extract<MarkdownNode, { type: "element" }> = {
    key,
    type: "element",
    tag: node.tagName.toLowerCase(),
    attributes: Object.fromEntries(Array.from(node.attributes).map((attribute) => [attribute.name, attribute.value])),
    children: Array.from(node.childNodes).flatMap((child, index) =>
      parseNode(child, `${key}.${index}`, words, animate, inlineCode || code),
    ),
  }

  if (words && animate && code) element.animate = true

  return [element]
}
