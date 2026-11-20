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
    const rect = (node: HTMLElement) => node.getBoundingClientRect()

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

story("renders every loaded row instead of a window", async ({ mount, page }) => {
  await mount("answer-page--windowed")
  const viewport = page.getByTestId("answer-window")
  const rows = viewport.locator("[data-answer-key]")

  // Forty settled turns are all in the document, so a DOM-based search sees the whole transcript.
  await expect.poll(() => rows.count()).toBeGreaterThan(60)
  await expect(viewport.locator('[data-slot="user-message-text"]').last()).toContainText("第 40 个问题")

  const mounted = await rows.count()

  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })

  await expect.poll(() => viewport.locator('[data-slot="user-message-text"]').last().textContent()).toContain("第 40 个问题")
  // Scrolling mounts and unmounts nothing: the row count does not change.
  expect(await rows.count()).toBe(mounted)
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
