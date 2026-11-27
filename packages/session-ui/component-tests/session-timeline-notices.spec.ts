import { expect, story } from "../../stories/playwright/story"

// A background wake that opens its own turn reads as a collapsible completion block: the command and
// the captured output ride with the notice, because the call it interrupts sits folded far above.
story("renders a background wake notice as an expandable completion block", async ({ mount }) => {
  const timeline = await mount("current-session-timeline-rows--background-wake-after-answered-turn")
  const notice = timeline.locator('[data-slot="session-timeline-notice"][data-wake="true"]')

  await expect(notice).toHaveCount(1)
  await expect(notice).toContainText("Shell finished")
  await expect(notice).toContainText("bash jk_watch.sh")
  await expect(notice.locator('[data-slot="bash-pre"]')).toHaveCount(0)

  await notice.locator('[data-slot="collapsible-trigger"]').click()
  await expect(notice.locator('[data-slot="bash-command"]')).toContainText("bash jk_watch.sh")
  await expect(notice.locator('[data-slot="bash-result"]')).toContainText("#563 DONE SUCCESS")
})

// Moved from packages/app/e2e/regression/session-timeline-notices.spec.ts
story("renders the moved location notice as a timeline divider", async ({ mount, page }) => {
  const directory = `/Users/usrnk1/Developer/aicraft/${"nested-directory/".repeat(24)}session`
  await page.setViewportSize({ width: 480, height: 720 })
  const timeline = await mount("current-session-timeline-rows--conversation", { args: { scenario: "location" } })
  const notice = timeline.locator('[data-slot="session-timeline-notice"][data-type="location-switched"]')
  const label = notice.locator('[data-slot="session-timeline-notice-label"]')
  const value = notice.locator('[data-slot="session-timeline-notice-value"]')
  const tooltipTrigger = notice.locator('[data-component="tooltip-v2-trigger"]')

  await expect(label).toHaveText("Moved to")
  await expect(value).toHaveText(directory)
  await expect(notice).not.toContainText("·")
  await expect(notice.locator("svg")).toHaveCount(0)
  await expect(notice).toHaveCSS("padding-top", "8px")
  await expect(notice).toHaveCSS("padding-bottom", "8px")
  await expect(label).toHaveCSS("font-size", "15px")
  await expect(label).toHaveCSS("font-weight", "400")
  await expect(label).toHaveCSS("line-height", "20px")
  await expect(value).toHaveCSS("font-size", "15px")
  await expect(value).toHaveCSS("font-weight", "400")
  await expect(value).toHaveCSS("line-height", "20px")
  await expect(value).toHaveCSS("text-overflow", "ellipsis")
  await expect(value).toHaveCSS("white-space", "nowrap")
  await expect(value).toHaveAttribute("dir", "ltr")
  await expect.poll(() => value.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)

  const tooltip = page.getByText("Session working directory changed", { exact: true })
  await label.hover()
  await expect(tooltip).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(tooltip).toBeHidden()
  await tooltipTrigger.focus()
  await expect(tooltipTrigger).toBeFocused()
  await expect(tooltip).toBeVisible()
})
