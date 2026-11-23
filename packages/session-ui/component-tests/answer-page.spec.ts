import { join } from "node:path"
import type { Locator } from "@playwright/test"
import { expect, story } from "../../stories/playwright/story"

const output = (name: string) => join(process.env.TEMP ?? process.env.TMPDIR ?? ".", name)

const expandTurn = (scope: Locator, index = 0) =>
  scope
    .locator('[data-slot="answer-fold"]')
    .nth(index)
    .locator('[data-slot="answer-run-header"] button')

story("lays a settled turn out as rows, then folds it again", async ({ mount, page }) => {
  const root = await mount("answer-page--settled")
  const trigger = expandTurn(root)

  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await expect(root.locator('[data-slot="answer-disclosure"]')).toHaveCount(0)
  await page.screenshot({ path: output("answer-settled.png") })

  await trigger.click()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  const groups = root.locator('[data-slot="answer-fold"]').first().locator('[data-slot="answer-group"]')

  await expect(groups).toHaveCount(1)
  await expect(groups.first().locator(":scope > button")).toHaveAttribute("aria-expanded", "false")
  await groups.first().locator(":scope > button").click()
  await expect(root.locator('[data-slot="answer-disclosure"]')).toHaveCount(3)
  await expect(root.locator('[data-slot="answer-row"][data-kind="reasoning"]')).toHaveCount(1)
  await expect(root.locator('[data-slot="answer-row"][data-kind="tool"]')).toHaveCount(2)

  // A short group takes the cap but stays below it: no scrollport, no reserved gutter.
  await expect(root.locator('[data-slot="answer-group-body"]')).toHaveAttribute("data-capped", "")
  await expect(root.locator('[data-slot="answer-group-body"]')).not.toHaveAttribute("data-overflowing", "")
  // Not a scrollport at all: the wheel must keep reaching the transcript under the pointer.
  await expect(root.locator('[data-slot="answer-group-body"]')).toHaveCSS("overflow-y", "hidden")

  await expect(root.locator('[data-slot="user-message-text"]').first()).toHaveCSS("padding", "8px 12px")
  await expect(root.locator('[data-slot="user-message-text"]').first()).toHaveCSS("border-radius", "14px")
  await expect(root.locator('[data-slot="user-message-text"]').first()).toHaveCSS("font-size", "14px")
  await expect(root.locator('[data-slot="user-message-body"]').first()).toHaveCSS("max-width", /min\(82%/)
  await expect(root.locator('[data-slot="text-part-body"]').first()).toBeAttached()
  await expect(root.locator("[data-timeline-part-id]").first()).toBeAttached()
  await page.screenshot({ path: output("answer-settled-open.png") })

  await expect(root.locator('[data-slot="answer-io-card"]')).toHaveCount(0)
  await root.locator('[data-slot="answer-disclosure"]').nth(1).locator("[data-disclosure-row]").click()
  await expect(root.locator('[data-slot="answer-io-card"]')).toHaveCount(1)
  await expect(root.locator('[data-slot="answer-inspect"]')).toHaveCount(1)
  await page.screenshot({ path: output("answer-tools.png") })

  await expect(root.locator('[data-component="text-shimmer"][data-active="true"]')).toHaveCount(0)
  await expect(root.locator('[data-slot="answer-reasoning-spinner"]')).toHaveCount(0)

  await trigger.click()
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await expect(root.locator('[data-slot="answer-group"]')).toHaveCount(0)

  // Reopening the turn keeps the reader's disclosure state: the group is still open.
  await trigger.click()
  await expect(root.locator('[data-slot="answer-group"]').first().locator(":scope > button")).toHaveAttribute(
    "aria-expanded",
    "true",
  )
})

story("caps a long settled run and resumes where the reader stopped", async ({ mount }) => {
  const root = await mount("answer-page--capped-panel")
  await expandTurn(root).click()

  const group = root.locator('[data-slot="answer-group"]').first()
  const heading = group.locator(":scope > button")

  await expect(heading).toHaveAttribute("aria-expanded", "false")
  await expect(group.locator('[data-slot="answer-group-body"]')).toHaveCount(0)

  await heading.click()
  const body = group.locator('[data-slot="answer-group-body"]')
  await expect(body).toHaveAttribute("data-capped", "")
  await expect(body).toHaveAttribute("data-overflowing", "")
  await expect(body).toHaveAttribute("role", "region")

  // The panel is a scrollport: the body overflows it while the transcript keeps its own height.
  const metrics = await body.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
  expect(metrics.scroll).toBeGreaterThan(metrics.client)
  await expect(body).not.toHaveAttribute("data-can-scroll-up", "")
  await expect(body).toHaveAttribute("data-can-scroll-down", "")

  // Read the offset back instead of assuming one: the panel's floor is whatever the settled rows overflow by.

  const stopped = await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight

    return el.scrollTop
  })

  expect(stopped).toBeGreaterThan(0)
  await expect(body).toHaveAttribute("data-can-scroll-up", "")

  // A reopened panel resumes at the stored offset instead of jumping back to the first row.
  await heading.click()
  await expect(body).toHaveCount(0)
  await heading.click()
  await expect(body).toHaveAttribute("data-capped", "")
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(stopped)
})

story("caps a running step and follows its newest row", async ({ mount, page }) => {
  const root = await mount("answer-page--live-capped")
  const body = root.locator('[data-slot="answer-group-body"][data-capped]').first()

  await expect(body).toHaveAttribute("data-overflowing", "")
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)

  const metrics = await body.evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
    top: el.scrollTop,
  }))

  expect(metrics.scroll).toBeGreaterThan(metrics.client)

  // A running run stays at its newest row: the panel is not left behind by the content it is streaming.
  expect(metrics.top + metrics.client).toBeGreaterThanOrEqual(metrics.scroll - 1)

  // Scrolling up takes the follow intent away, so growth below must not drag the reader back down.
  await body.evaluate((el) => {
    el.scrollTop = 0
    el.dispatchEvent(new Event("scroll"))
    const spacer = document.createElement("div")
    spacer.style.height = "240px"
    el.firstElementChild!.appendChild(spacer)
  })
  await page.waitForTimeout(300)
  expect(await body.evaluate((el) => el.scrollTop)).toBe(0)
})

story("keeps a running step's thought out of its heading once open", async ({ mount }) => {
  const root = await mount("answer-page--live-thinking-group")
  const group = root.locator('[data-slot="answer-group"]').first()
  const heading = group.locator(":scope > button")

  // A running step opens itself, and the thought row inside already carries the text it is thinking.
  await expect(heading).toHaveAttribute("aria-expanded", "true")
  await expect(
    root.locator('[data-slot="answer-row"][data-kind="reasoning"] [data-slot="answer-row-summary"]'),
  ).toContainText("第 40 段")
  await expect(heading).not.toContainText("第 40 段")

  // Collapsed, the heading is the only place the running line can speak.
  await heading.click()
  await expect(heading).toHaveAttribute("aria-expanded", "false")
  await expect(heading).toContainText("第 40 段")
})

story("caps a long thought and scrolls it in place", async ({ mount, page }) => {
  const root = await mount("answer-page--long-thinking")
  await expandTurn(root).click()

  const thinking = root.locator('[data-slot="answer-row"][data-kind="reasoning"]')
  await thinking.locator("[data-disclosure-row]").first().click()

  const box = root.locator('[data-slot="answer-reasoning-body"]')
  await expect(box).toBeVisible()
  // The markdown streams in after the reveal, so wait for the laid-out text before measuring.
  await expect.poll(() => box.evaluate((el) => el.scrollHeight)).toBeGreaterThan(228)

  // Ten lines stay visible; the rest scrolls inside the box instead of stretching the turn.
  const metrics = await box.evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
    page: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
    top: el.scrollTop,
  }))

  expect(metrics.scroll).toBeGreaterThan(metrics.client)
  // Ten content lines plus the box's own 8px padding.
  expect(metrics.client).toBe(228)
  expect(metrics.page).toBeLessThanOrEqual(metrics.viewport + 1)

  // A finished thought opens at its first line, not its last.
  expect(metrics.top).toBe(0)
  await expect(box).toHaveAttribute("data-can-scroll-down", "")
  await expect(box).not.toHaveAttribute("data-can-scroll-up", "")

  await box.evaluate((el) => {
    el.scrollTop = el.scrollHeight
    el.dispatchEvent(new Event("scroll"))
  })
  await expect(box).toHaveAttribute("data-can-scroll-up", "")
  await expect(box).not.toHaveAttribute("data-can-scroll-down", "")

  // The wheel must keep reaching the transcript once the box bottoms out.
  await expect(box).toHaveCSS("overflow-y", "auto")
  await page.waitForTimeout(50)
})

story("follows a streaming thought until the reader scrolls up", async ({ mount, page }) => {
  const root = await mount("answer-page--live-thinking")
  const thinking = root.locator('[data-slot="answer-row"][data-kind="reasoning"]')
  await thinking.locator("[data-disclosure-row]").first().click()

  const box = root.locator('[data-slot="answer-reasoning-body"]')
  await expect(box).toBeVisible()
  await expect.poll(() => box.evaluate((el) => el.scrollHeight)).toBeGreaterThan(228)

  // A streaming thought stays at its newest paragraph.
  await expect.poll(() => box.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)

  // Scrolling up takes the follow intent away, so growth below must not drag the reader back down.
  await box.evaluate((el) => {
    el.scrollTop = 0
    el.dispatchEvent(new Event("scroll"))
    const spacer = document.createElement("div")
    spacer.style.height = "240px"
    el.firstElementChild!.appendChild(spacer)
  })
  await page.waitForTimeout(300)
  expect(await box.evaluate((el) => el.scrollTop)).toBe(0)
})

story("caps a long tool result inside its own step", async ({ mount }) => {
  const root = await mount("answer-page--long-output")
  await expandTurn(root).click()

  const disclosure = root.locator('[data-slot="answer-disclosure"]').first()
  await disclosure.locator("[data-disclosure-row]").click()

  const output = root.locator('[data-slot="answer-io-output"]')
  await expect(output).toHaveCount(1)

  // The output half scrolls in place; the input half keeps its full size.
  const metrics = await output.evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
    head: getComputedStyle(el.querySelector('[data-slot="answer-io-output-head"]')!).position,
  }))

  expect(metrics.client).toBe(150)
  expect(metrics.scroll).toBeGreaterThan(metrics.client)
  expect(metrics.head).toBe("sticky")

  await output.evaluate((el) => {
    el.scrollTop = 200
  })
  await expect.poll(() => output.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
})

story("wraps a pasted fenced block inside the prompt bubble", async ({ mount }) => {
  const root = await mount("answer-page--code-prompt")
  const bubble = root.locator('[data-slot="user-message-body"]').first()
  const pre = bubble.locator("pre")

  // The bubble renders the fence as code, and the long line breaks inside it rather than scrolling sideways.
  await expect(pre).toBeAttached()
  await expect(pre).toHaveCSS("white-space", "pre-wrap")

  const geometry = await bubble.evaluate((el) => {
    const block = el.querySelector("pre") as HTMLElement
    const row = el.closest('[data-slot="answer-row"]') as HTMLElement
    const rect = (node: Element) => node.getBoundingClientRect()

    return {
      viewport: innerWidth,
      docScroll: document.documentElement.scrollWidth,
      bubble: Math.round(rect(el).width),
      rowRight: Math.round(rect(row).right),
      pre: Math.round(rect(block).width),
      preRight: Math.round(rect(block).right),
      preScroll: block.scrollWidth,
      preClient: block.clientWidth,
    }
  })

  expect(geometry.preScroll).toBeLessThanOrEqual(geometry.preClient + 1)
  expect(geometry.pre).toBeLessThanOrEqual(geometry.bubble)
  expect(geometry.preRight).toBeLessThanOrEqual(geometry.rowRight + 1)
  expect(geometry.docScroll).toBeLessThanOrEqual(geometry.viewport)
})

story("hides the settled reasoning preview in compact and keeps it in detailed", async ({ mount, page }) => {
  const compact = await mount("answer-page--compact")

  await expandTurn(compact).click()
  await compact.locator('[data-slot="answer-group"] button').first().click()
  const compactReasoning = compact.locator('[data-slot="answer-row"][data-kind="reasoning"]').first()

  await expect(compactReasoning).toContainText(/Thinking|思考/)
  await expect(compactReasoning).not.toContainText("·")
  await page.screenshot({ path: output("answer-compact.png") })

  const detailed = await mount("answer-page--detailed")

  await expandTurn(detailed).click()
  await detailed.locator('[data-slot="answer-group"] button').first().click()
  const detailedReasoning = detailed.locator('[data-slot="answer-row"][data-kind="reasoning"]').first()

  await expect(detailedReasoning).toContainText(/Thinking|思考/)
  await expect(detailedReasoning).toContainText("·")
  await page.screenshot({ path: output("answer-detailed.png") })
})

story("keeps only the final answer once a turn folds", async ({ mount }) => {
  const fallback = await mount("answer-page--folded-default")

  await expect(fallback.getByText("最终答案：投影层决定折叠边界，渲染层只负责展开状态。")).toBeVisible()
  await expect(fallback.getByText("阶段结论：折叠逻辑在投影层。")).toHaveCount(0)

  const final = await mount("answer-page--settled-final")

  await expect(final.getByText("最终答案：投影层决定折叠边界，渲染层只负责展开状态。")).toBeVisible()
  await expect(final.getByText("阶段结论：折叠逻辑在投影层。")).toHaveCount(0)

  const all = await mount("answer-page--settled-all")

  await expect(all.getByText("阶段结论：折叠逻辑在投影层。")).toHaveCount(0)
  await expect(all.getByText("最终答案：投影层决定折叠边界，渲染层只负责展开状态。")).toBeVisible()
})

story("shows process rows without headers in verbose and never folds the turn", async ({ mount, page }) => {
  const root = await mount("answer-page--verbose")
  const fold = root.locator('[data-slot="answer-fold"]').first()
  const header = fold.locator('[data-slot="answer-run-header"] button')

  await expect(header).toHaveAttribute("aria-expanded", "true")
  await expect(header).toBeDisabled()
  await expect(root.locator('[data-slot="answer-group"] button').first()).toBeHidden()
  await expect(fold.locator('[data-slot="answer-disclosure"]').first()).toBeVisible()
  await page.screenshot({ path: output("answer-verbose.png") })
})

story("titles the group that follows a step reply", async ({ mount }) => {
  const root = await mount("answer-page--two-kinds")

  await expandTurn(root).click()
  const title = root.locator('[data-slot="answer-group"] button').first()

  await expect(title).toContainText("Read files and ran commands")
  await expect(title).not.toContainText("{")
})

story("titles a one-call step by its own row and a multi-row step by its group", async ({ mount }) => {
  const root = await mount("answer-page--flow-sequence")

  await expandTurn(root).click()

  const groupTitles = await root
    .locator('[data-slot="answer-group"] [data-component="text-shimmer"]')
    .evaluateAll((elements: Element[]) => elements.map((element) => element.getAttribute("aria-label")))
  const rowTitles = await root
    .locator('[data-slot="answer-row"] [data-slot="answer-row-title"]')
    .evaluateAll((elements: Element[]) => elements.map((element) => element.textContent))

  expect(groupTitles).toEqual(["Read files"])
  expect(rowTitles).toEqual(["Thinking", "Run command"])
})

story("copies tool output and the inspected call", async ({ mount, page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])

  const root = await mount("answer-page--settled")

  await expandTurn(root).click()
  await root.locator('[data-slot="answer-group"] button').first().click()
  await root.locator('[data-slot="answer-disclosure"]').nth(1).locator("[data-disclosure-row]").click()

  const copyButton = root.locator('[data-slot="answer-io-card"] [data-slot="answer-copy"]').first()

  await copyButton.click()
  await expect(copyButton).toHaveText(/Copied|已复制/)
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("ok")

  await root.locator('[data-slot="answer-inspect"]').first().click()
  const dialog = root.locator('[data-slot="answer-inspect-dialog"]')

  await expect(dialog).toBeVisible()
  const dialogCopy = dialog.locator('[data-slot="answer-copy"]')

  await dialogCopy.click()
  await expect(dialogCopy).toHaveText(/Copied|已复制/)
})

story("uses the DSH list rhythm inside the answer column", async ({ mount }) => {
  const root = await mount("answer-page--lists")
  const list = root.locator(".answer-markdown ul").first()

  await expect(list).toHaveCSS("margin-top", "16px")
  await expect(list).toHaveCSS("margin-bottom", "0px")
  await expect(list).toHaveCSS("padding-inline-start", "18px")
  await expect(list.locator("li").first()).toHaveCSS("margin-bottom", "0px")

  const ordered = root.locator(".answer-markdown ol").first()

  await expect(ordered).toHaveCSS("margin-top", "16px")
  await expect(ordered).toHaveCSS("padding-inline-start", "18px")
})

story("swaps the leading icon for a chevron on hover", async ({ mount }) => {
  const root = await mount("answer-page--two-kinds")

  await expandTurn(root).click()
  const button = root.locator('[data-slot="answer-group"] button').first()
  const idle = button.locator('[data-slot="leading-idle"]')
  const chevron = button.locator('[data-leading="chevron"]')

  await expect(idle).toHaveCSS("opacity", "1")
  await expect(chevron).toHaveCSS("opacity", "0")

  await button.hover()
  await expect(idle).toHaveCSS("opacity", "0")
  await expect(chevron).toHaveCSS("opacity", "1")

  await button.click()
  await expect(chevron).toHaveClass(/rotate-180/)
})

story("keeps step summaries outside every group", async ({ mount }) => {
  const root = await mount("answer-page--flow-sequence")

  await expandTurn(root).click()
  await expect(root.locator('[data-slot="answer-row"][data-kind="assistant"]').first()).toBeVisible()
  await expect(root.locator('[data-slot="answer-group"] [data-slot="answer-row"][data-kind="assistant"]')).toHaveCount(0)
})

story("keeps a running row's title clear of a long detail", async ({ mount, page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const root = await mount("answer-page--long-detail")
  const row = root.locator('[data-slot="answer-row"] [data-disclosure-row]').first()
  const title = row.locator('[data-slot="answer-row-title"]')
  const summary = row.locator('[data-slot="answer-row-summary"]')
  // The row measures text, so the comparison below is only meaningful once the face behind it has loaded.
  await page.evaluate(() => document.fonts.ready)
  const before = await summary.boundingBox()
  const icon = await row.locator('[data-slot="leading-idle"]').boundingBox()

  // A long detail truncates its own text instead of squeezing the icon slot or the title.
  expect(icon?.width ?? 0).toBeGreaterThanOrEqual(17)
  expect(before?.x ?? 0).toBeGreaterThanOrEqual((icon ? icon.x + icon.width : 0) - 1)
  await expect(title).toBeVisible()

  await page.waitForTimeout(400)
  const after = await summary.boundingBox()

  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(1)
  await expect(summary).toHaveCSS("overflow", "hidden")
})

story("renders the running turn without a settled header", async ({ mount, page }) => {
  const root = await mount("answer-page--streaming")
  const running = root.locator('[data-slot="answer-fold"]').last()

  await expect(running.locator('[data-slot="answer-run-header"]')).toHaveCount(0)
  await expect(root.locator('[data-slot="answer-running"]')).toHaveCount(1)
  await expect(root.locator('[data-component="text-shimmer"][data-active="true"]').first()).toBeVisible()

  // The running step opens itself, so its rows are already in the document.
  await expect(running.locator('[data-slot="answer-group"] button').first()).toHaveAttribute("aria-expanded", "true")
  await running.locator("[data-disclosure-row]").first().click()
  await expect(root.locator('[data-slot="answer-disclosure"][data-state="running"]')).toHaveCount(1)
  await expect(root.locator('[data-slot="answer-reasoning-spinner"]')).toHaveCount(1)
  await page.screenshot({ path: output("answer-streaming.png") })

  const offset = await root.evaluate((host: Element) => {
    const spinner = host.querySelector('[data-slot="answer-reasoning-spinner"]')
    const row = spinner?.closest("[data-disclosure-row]")

    if (!spinner || !row) return 99

    const leading = spinner.getBoundingClientRect()
    const line = row.getBoundingClientRect()

    return Math.abs(leading.top + leading.height / 2 - (line.top + line.height / 2))
  })

  expect(offset).toBeLessThanOrEqual(1)
})

story("mounts the rows near the viewport and reserves the rest", async ({ mount, page }) => {
  await mount("answer-page--windowed")
  const viewport = page.getByTestId("answer-window")
  const rows = viewport.locator("[data-answer-key]")
  const text = viewport.locator('[data-slot="user-message-text"]')

  // Every row keeps its box, so a DOM-based search still reaches the whole transcript and no offset is a guess.
  await expect.poll(() => rows.count()).toBeGreaterThan(60)
  await expect(viewport.locator('[data-slot="user-message-text"]').last()).toContainText("第 40 个问题")

  // Only the window around the viewport renders its content; the rest only reserves the height it measured at.
  expect(await text.count()).toBeLessThan((await rows.count()) / 2)

  const middle = viewport.locator('[data-answer-key="node:input:msg_user_long_19"]')

  expect(await middle.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(0)
  expect(await middle.locator('[data-slot="user-message-text"]').count()).toBe(0)

  // Reaching the row mounts its content. Scrolling never changes how many boxes the transcript holds.
  await middle.evaluate((element) => element.scrollIntoView({ block: "center" }))
  await expect(middle.locator('[data-slot="user-message-text"]')).toContainText("第 20 个问题")
  expect(await rows.count()).toBeGreaterThan(60)
})

story("opens at a restored row instead of the first message", async ({ mount, page }) => {
  await mount("answer-page--windowed-restore")
  const viewport = page.getByTestId("answer-window")
  const row = viewport.locator('[data-message-id="msg_user_long_29"]')

  await expect(row).toBeVisible()

  const offset = await row.evaluate((element) => {
    const host = element.closest("[data-testid='answer-window']")

    if (!host) return 999

    return element.getBoundingClientRect().top - host.getBoundingClientRect().top
  })

  expect(Math.abs(offset)).toBeLessThan(40)
  expect(await viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
})

story("does not record a restore the loaded transcript cannot reach", async ({ mount, page }) => {
  await mount("answer-page--windowed-restore-unreachable")

  // An unreachable offset waits for more rows before giving up, past the deadline that ends the attempt. A clamped
  // write that claimed success would have reported the top row it landed on long before that.
  await page.waitForTimeout(2000)

  const recorded = await page.evaluate(
    () => (globalThis as unknown as { __answerPositions?: unknown[] }).__answerPositions?.length ?? 0,
  )

  expect(recorded).toBe(0)
})

story("keeps the reading position when the cached view is detached and reattached", async ({ mount, page }) => {
  await mount("answer-page--windowed")
  const viewport = page.getByTestId("answer-window")

  await expect.poll(() => viewport.locator("[data-answer-key]").count()).toBeGreaterThan(0)

  await viewport.evaluate((element) => {
    element.scrollTop = Math.round(element.scrollHeight / 3)
  })

  const probe = () =>
    viewport.evaluate(async (element) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const frame = element.getBoundingClientRect()
      const top = [...element.querySelectorAll("[data-answer-key]")].find(
        (node) => node.getBoundingClientRect().bottom > frame.top + 1,
      )

      return { scrollTop: element.scrollTop, topKey: top?.getAttribute("data-answer-key") ?? undefined }
    })

  const before = await probe()

  // A session switch deactivates the cached view and removes it from its parent, which zeroes the scroll offset.
  await page.evaluate(() => {
    const host = document.querySelector('[data-testid="answer-window"]')

    if (!(host instanceof HTMLElement) || !host.parentElement) return
    ;(globalThis as unknown as { __setAnswerActive?: (next: boolean) => void }).__setAnswerActive?.(false)
    const parent = host.parentElement
    const next = host.nextSibling

    host.remove()
    ;(globalThis as unknown as { __reattach?: () => void }).__reattach = () => parent.insertBefore(host, next)
  })

  await expect.poll(() => page.locator('[data-testid="answer-window"]').count()).toBe(0)

  // Coming back re-inserts the node and reactivates it, which is the moment the host re-reads the saved row.
  await page.evaluate(() => {
    const state = globalThis as unknown as {
      __reattach?: () => void
      __setAnswerActive?: (next: boolean) => void
    }

    state.__reattach?.()
    state.__setAnswerActive?.(true)
  })

  const after = await probe()

  // Every row is a measured box, so both the offset and the row under the top edge survive the reattach.
  expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(4)
  expect(after.topKey).toBe(before.topKey)
})

story("folds a long prompt and shows all of it on request", async ({ mount }) => {
  const root = await mount("answer-page--folded-prompt")
  const fold = root.locator('[data-slot="user-message-fold"]').first()
  const toggle = root.locator('[data-slot="user-message-fold-toggle"]').first()

  await expect(fold).toHaveAttribute("data-folded", "")
  await expect(toggle).toHaveAttribute("aria-expanded", "false")

  const folded = await fold.evaluate((element) => element.getBoundingClientRect().height)
  const whole = await fold.evaluate(
    (element) => (element.firstElementChild as HTMLElement).getBoundingClientRect().height,
  )

  // The fold clips the prompt to its first lines; it never hides a line or two, and the rest stays reachable.
  expect(folded).toBeLessThan(whole)

  await toggle.click()
  await expect(fold).not.toHaveAttribute("data-folded", "")
  await expect(toggle).toHaveAttribute("aria-expanded", "true")
  expect(await fold.evaluate((element) => element.getBoundingClientRect().height)).toBeCloseTo(whole, 0)

  await toggle.click()
  await expect(fold).toHaveAttribute("data-folded", "")
})

story("folds a burst of identical steps into one row", async ({ mount }) => {
  const root = await mount("answer-page--repeated-edits")

  await expandTurn(root).click()

  const group = root.locator('[data-slot="answer-group"]').first()
  await group.locator(":scope > button").click()

  // Two edits to one file collapse into a single row; the read and the other edit stay their own rows.
  const rows = group.locator(":scope > div > *")
  await expect(rows).toHaveCount(3)

  const repeat = rows.first()
  await expect(repeat).toContainText(/Edit|编辑/)
  await expect(repeat).toContainText("×2")

  // The members are their own disclosure rows once open, so target this run's own trigger.
  const trigger = repeat.locator(":scope > [data-disclosure-row]")
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await trigger.click()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await expect(repeat.locator('[data-slot="answer-row"][data-kind="tool"]')).toHaveCount(2)
})

story("keeps reads of different files as their own rows", async ({ mount }) => {
  const root = await mount("answer-page--reads-across-files")

  await expandTurn(root).click()

  const group = root.locator('[data-slot="answer-group"]').first()
  await group.locator(":scope > button").click()

  // Same tool, different targets: the steps are not identical, so each read keeps its own row.
  const rows = group.locator(":scope > div > *")
  await expect(rows).toHaveCount(3)
  await expect(group).not.toContainText("×")
})

story("lists the files a turn changed under its answer", async ({ mount }) => {
  const root = await mount("answer-page--edit-diff")

  const changes = root.locator('[data-slot="answer-changes"]')
  await expect(changes).toHaveCount(1)
  await expect(changes.locator('[data-slot="answer-changes-heading"]')).toHaveText("1 Changed file")
  await expect(changes).toContainText("project.ts")
  await expect(changes).toContainText("+1")
  await expect(changes).toContainText("-1")

  // The whole row is the target, and it opens the file it names.
  const row = changes.locator('[data-slot="answer-change"]')
  await expect(row).toHaveCount(1)
  await expect(row).toHaveAttribute("aria-label", "packages/session-ui/src/answer/project.ts")
  await expect(row).toHaveCSS("border-radius", "6px")
  await expect(row).toHaveCSS("cursor", "pointer")

  // The icon is a fixed square, centred on the text line, so the row reads as one line rather than icon above text.
  const icon = row.locator('[data-component="file-icon"]')
  await expect(icon).toHaveCSS("width", "16px")
  await expect(icon).toHaveCSS("height", "16px")
  const boxes = await Promise.all([icon.boundingBox(), row.locator('[data-slot="answer-change-name"]').boundingBox()])
  expect(boxes[0] && boxes[1] && Math.abs(boxes[0].y + boxes[0].height / 2 - (boxes[1].y + boxes[1].height / 2))).toBeLessThan(1)

  // The row answers the pointer before it opens anything.
  await expect(row).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await row.hover()
  await expect(row).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)")

  await row.click()
  await expect(root.locator('[data-slot="opened-file"]')).toHaveText("packages/session-ui/src/answer/project.ts")

  // Opening the process moves the answer under the steps; the change list stays with it, exactly once.
  await expandTurn(root).click()
  await expect(changes).toHaveCount(1)
  await expect(changes).toContainText("project.ts")
})

story("waits for the answer to close the turn before listing its files", async ({ mount }) => {
  const root = await mount("answer-page--edit-running")

  // The edit already recorded its files, but the turn is still running: the list belongs to the closing answer.
  await expect(root.locator('[data-slot="answer-changes"]')).toHaveCount(0)
})

story("shows an edit as a diff instead of input and output", async ({ mount }) => {
  const root = await mount("answer-page--edit-diff")

  await expandTurn(root).click()

  const row = root.locator("[data-disclosure-row]").first()
  await row.click()

  await expect(root.locator('[data-slot="answer-diff"]')).toHaveCount(1)
  await expect(root.locator('[data-slot="answer-io-card"]')).toHaveCount(0)

  // GitHub-style lines: one removal, one addition, and syntax tokens inside them.
  const added = root.locator('[data-slot="answer-diff"] [data-line][data-line-type="change-addition"]')
  await expect(added).toHaveCount(1)
  await expect(added).toContainText("of every kind")
  await expect(root.locator('[data-slot="answer-diff"] [data-line][data-line-type="change-deletion"]')).toContainText(
    "same activity on the same target.",
  )
  await expect(root.locator('[data-slot="answer-diff"] [data-line] [style*="--syntax-"]')).not.toHaveCount(0)
})

story("keeps a turn open when the reader opened a step inside it", async ({ mount, page }) => {
  await page.setViewportSize({ width: 360, height: 420 })
  await mount("answer-page--reader-opened-step")
  const window = page.getByTestId("answer-window")

  await window.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  const running = window.locator('[data-slot="answer-running"]')
  const top = await running.evaluate((element) => element.getBoundingClientRect().top)

  // The reader scrolled into the steps, so the turn's own header is above the viewport.
  expect(top).toBeLessThan(0)

  const row = window.locator('[data-slot="answer-row"][data-kind="tool"] [data-disclosure-row]').last()
  await row.click()
  await expect(window.locator('[data-slot="answer-io-card"]')).toHaveCount(1)

  await page.evaluate(() => {
    ;(globalThis as unknown as { __finishAnswerTurn?: () => void }).__finishAnswerTurn?.()
  })

  // Settling the turn folds it by default, but the step the reader opened is still being read: the turn stays open.
  const header = window.locator('[data-slot="answer-run-header"] button')
  await expect(header).toHaveAttribute("aria-expanded", "true")
  await expect(window.locator('[data-slot="answer-io-card"]')).toHaveCount(1)
})

story("keeps the retry reason behind a button on the answer page", async ({ mount }) => {
  const root = await mount("answer-page--retrying")
  const row = root.locator('[data-slot="answer-retry"]')
  const reason = "Rate limit reached for requests"

  await expect(row.locator('[data-slot="answer-retry-view"]')).toBeVisible()
  await expect(row.getByText(reason)).not.toBeVisible()

  await row.locator('[data-slot="answer-retry-view"]').click()
  const dialog = root.locator('[data-slot="answer-retry-dialog"]')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(reason)
})
