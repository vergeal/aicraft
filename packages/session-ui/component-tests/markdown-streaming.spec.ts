import { expect, sourceURL, story } from "../../stories/playwright/story"

// The streamedReply shape from packages/app/perf/fixtures/timeline.ts: prose paragraphs, a table and a
// code fence growing delta by delta, plus the heal cases a live parser hits (unclosed bold, a table
// row arriving in fragments, an unclosed fence, a link closing late).
const chunks = [
  "Streaming **bold analysis",
  " continues across three",
  " or four word",
  " provider deltas and",
  " closes in this fragment**. <!-- stream-0 -->\n\n",
  "| Concern | State",
  " | Verification |\n|",
  " --- | ---",
  " | --- |\n|",
  " markdown | incremental |",
  " painted frames | <!-- stream-1 -->\n\n",
  "```tsx\nconst row: SessionRow",
  " = rows[index] ??",
  " fallback\nconst title =",
  " row.title.toLocaleUpperCase(locale)\n",
  "const selected = createMemo(()",
  " => row.id ===",
  " activeID()) // stream-2\n",
  "// stream-3\n```\n\n### Iteration 1\n\nSee [the docs](https://example.com) and ",
]

const DELTAS = 160

/** The full streamed reply: the 19-shape chunk cycle repeated to `DELTAS` deltas, each one appended. */
function streamedDeltas() {
  const deltas: string[] = []
  let text = ""

  for (let index = 0; index < DELTAS; index++) {
    text += chunks[index % chunks.length]!
    deltas.push(text)
  }

  return deltas
}

// A prose-only reply: every delta grows an existing paragraph (or heals the unclosed bold), so the
// DOM work per delta should be a text update, not a subtree rebuild. This isolates the characterData
// share from the necessary mounts a mixed reply adds (new blocks, freshly highlighted code tokens).
const proseWords = [
  "Streaming", "**bold", "analysis**", "continues", "across", "three", "or", "four", "word",
  "provider", "deltas", "and", "closes", "in", "this", "fragment.", "Second", "paragraph",
  "grows", "incrementally,", "with", "[a link](https://example.com)", "and", "more", "text",
  "that", "keeps", "flowing", "until", "the", "stream", "ends", "here.",
]

function proseDeltas(total: number) {
  const deltas: string[] = []
  let text = ""

  for (let index = 0; index < total; index++) {
    text += ` ${proseWords[index % proseWords.length]!}`
    deltas.push(text)
  }

  return deltas
}

const fixture = sourceURL(new URL("./markdown.fixture.tsx", import.meta.url))

story.beforeEach(async ({ mount }) => {
  await mount("components-markdown--complete-response")
})

/** Streams the given deltas into the fixture's textarea, one per frame, collecting mutation counts. */
async function stream(page: import("@playwright/test").Page, deltas: string[]) {
  return page.evaluate(
    async ({ fixture, deltas }) => {
      const { mountMarkdown } = await import(fixture)
      await mountMarkdown({ text: deltas[0]!, streaming: true })
      const markdown = document.querySelector<HTMLElement>('[data-testid="markdown-fixture"] [data-component="markdown"]')!

      // Let the worker projection replace the synchronous fallback blocks before observing, so the
      // window measures streamed deltas and not the one-off initial mount.
      for (let index = 0; index < 60 && !markdown.firstElementChild; index++)
        await new Promise((resolve) => requestAnimationFrame(resolve))

      const records: MutationRecord[] = []
      const observer = new MutationObserver((batch) => records.push(...batch))
      observer.observe(markdown, { childList: true, attributes: true, characterData: true, subtree: true })

      // The textarea drives the same signal the timeline's streamed deltas drive; each fill is one delta.
      const input = document.querySelector<HTMLTextAreaElement>('[aria-label="Markdown text"]')!
      const set = (value: string) => {
        input.value = value
        input.dispatchEvent(new Event("input", { bubbles: true }))
      }

      for (const delta of deltas.slice(1)) {
        set(delta)
        // The worker projection lands on a macrotask after the input event; a frame alone can outrun
        // it, and two deltas then collapse into one projection where a text update degenerates into a
        // swap. 25ms keeps every delta its own projection, matching the timeline's realistic cadence.
        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      await new Promise((resolve) => setTimeout(resolve, 100))
      observer.disconnect()

      const count = (type: MutationRecord["type"]) => records.filter((record) => record.type === type).length
      const childList = count("childList")
      const characterData = count("characterData")
      const attributes = count("attributes")

      return {
        childList,
        attributes,
        characterData,
        // The share that matters is over the DOM's structural work: every streamed delta also
        // rewrites state attributes (the block hash moves every delta), which is bookkeeping, not
        // rebuilding, and would dilute the share without telling us anything about the subtree.
        characterDataShare: childList + characterData === 0 ? 0 : characterData / (childList + characterData),
      }
    },
    { fixture, deltas },
  )
}

story("streams 160 mixed deltas into the existing DOM instead of rebuilding it", async ({ page }) => {
  const result = await stream(page, streamedDeltas())

  // The pre-fix renderer re-keyed every sibling on each heal, so Solid re-mounted the whole tail of
  // every open block per delta: 1458 childList records over these 160 deltas. Blocks that genuinely
  // appear and code tokens that genuinely highlight still have to mount, so a bounded remainder is
  // the budget, not zero.
  expect(result.childList).toBeLessThanOrEqual(450)
})

story("streams prose deltas as text updates, not paragraph rebuilds", async ({ page }) => {
  const result = await stream(page, proseDeltas(120))

  // Growing a streamed paragraph updates the text node it already holds. Before the fix every delta
  // re-parsed the paragraph into word spans and re-mounted them (childList dominated, characterData
  // was 0), so both bounds fail there and pass here.
  expect(result.characterDataShare).toBeGreaterThanOrEqual(0.6)
  expect(result.childList).toBeLessThanOrEqual(60)
})

story("keeps the text node of a streamed paragraph across deltas", async ({ page }) => {
  const deltas = proseDeltas(40)
  const result = await page.evaluate(
    async ({ fixture, deltas }) => {
      const { mountMarkdown } = await import(fixture)
      await mountMarkdown({ text: deltas[0]!, streaming: true })
      const markdown = document.querySelector<HTMLElement>('[data-testid="markdown-fixture"] [data-component="markdown"]')!

      // Same projection wait as the mutation test: the text node recorded here must belong to the
      // worker's live block, not the synchronous fallback that the first frame still shows.
      for (let index = 0; index < 60 && !markdown.firstElementChild; index++)
        await new Promise((resolve) => requestAnimationFrame(resolve))

      const identity = new WeakMap<Node, number>()
      let serial = 0
      const firstParagraph = markdown.querySelector("p")!
      const firstText = firstParagraph.childNodes[0]!
      identity.set(firstText, ++serial)

      const input = document.querySelector<HTMLTextAreaElement>('[aria-label="Markdown text"]')!
      const set = (value: string) => {
        input.value = value
        input.dispatchEvent(new Event("input", { bubbles: true }))
      }

      let survived = 0
      for (const delta of deltas.slice(1)) {
        set(delta)
        await new Promise((resolve) => requestAnimationFrame(resolve))

        const paragraph = markdown.querySelector("p")!
        const node = paragraph.childNodes[0]!
        if (!identity.has(node)) identity.set(node, ++serial)
        if (identity.get(node) === 1) survived++
      }

      await new Promise((resolve) => setTimeout(resolve, 100))

      const paragraph = markdown.querySelector("p")!
      return {
        updates: deltas.length - 1,
        survived,
        sameNode: identity.get(paragraph.childNodes[0]!) === 1,
        startsWith: paragraph.textContent!.trimStart().startsWith("Streaming bold analysis continues"),
      }
    },
    { fixture, deltas },
  )

  // The paragraph's leading text node keeps its identity through every delta: the live renderer
  // updates its data in place instead of swapping the subtree.
  expect(result.survived).toBe(result.updates)
  expect(result.sameNode).toBe(true)
  expect(result.startsWith).toBe(true)
})

story("settles a streamed reply into the same DOM a completed render builds", async ({ page }) => {
  const deltas = streamedDeltas()
  const last = deltas[deltas.length - 1]!

  const streamed = await page.evaluate(
    async ({ fixture, deltas }) => {
      const { mountMarkdown } = await import(fixture)
      await mountMarkdown({ text: deltas[0]!, streaming: true })
      const markdown = document.querySelector('[data-testid="markdown-fixture"] [data-component="markdown"]')!

      const input = document.querySelector<HTMLTextAreaElement>('[aria-label="Markdown text"]')!
      const set = (value: string) => {
        input.value = value
        input.dispatchEvent(new Event("input", { bubbles: true }))
      }

      for (const delta of deltas.slice(1)) {
        set(delta)
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }

      // End the stream the way the timeline does: the message completes and the part stops streaming.
      const checkbox = document.querySelector<HTMLInputElement>('[aria-label="Streaming"]')!
      checkbox.checked = false
      checkbox.dispatchEvent(new Event("change", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 200))

      const shape = (root: Element) => ({
        paragraphs: root.querySelectorAll("p").length,
        headings: Array.from(root.querySelectorAll("h1, h2, h3, h4")).map((node) => node.textContent),
        tableRows: root.querySelectorAll("tr").length,
        codeText: root.querySelector("pre code")?.textContent,
        links: Array.from(root.querySelectorAll("a")).map((node) => node.getAttribute("href")),
        strongs: Array.from(root.querySelectorAll("strong")).map((node) => node.textContent),
        text: root.textContent,
      })

      return shape(markdown)
    },
    { fixture, deltas },
  )

  const completed = await page.evaluate(
    async ({ fixture, text }) => {
      const { mountMarkdown } = await import(fixture)
      await mountMarkdown({ text })
      const markdown = document.querySelector('[data-testid="markdown-fixture"] [data-component="markdown"]')!

      const shape = (root: Element) => ({
        paragraphs: root.querySelectorAll("p").length,
        headings: Array.from(root.querySelectorAll("h1, h2, h3, h4")).map((node) => node.textContent),
        tableRows: root.querySelectorAll("tr").length,
        codeText: root.querySelector("pre code")?.textContent,
        links: Array.from(root.querySelectorAll("a")).map((node) => node.getAttribute("href")),
        strongs: Array.from(root.querySelectorAll("strong")).map((node) => node.textContent),
        text: root.textContent,
      })

      return shape(markdown)
    },
    { fixture, text: last },
  )

  // The streamed reply must land on the same structure a cold completed render builds: no lost,
  // duplicated or re-ordered blocks, and the late-closing link keeps its href.
  expect(streamed.paragraphs).toBe(completed.paragraphs)
  expect(streamed.headings).toEqual(completed.headings)
  expect(streamed.tableRows).toBe(completed.tableRows)
  expect(streamed.codeText).toBe(completed.codeText)
  expect(streamed.links).toEqual(completed.links)
  expect(streamed.strongs).toEqual(completed.strongs)
  expect(streamed.text).toBe(completed.text)
  expect(streamed.links).toContain("https://example.com")
})
