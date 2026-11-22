import { join } from "node:path"
import { expect, story } from "../../stories/playwright/story"

const output = (name: string) => join(process.env.TEMP ?? process.env.TMPDIR ?? ".", name)

story("previews an image a tool returned when its row opens", async ({ mount, page }) => {
  const root = await mount("answer-page--tool-screenshot")
  await root.locator('[data-slot="answer-fold"]').first().locator('[data-slot="answer-run-header"] button').click()

  const groups = root.locator('[data-slot="answer-group"]')

  for (let index = 0; index < (await groups.count()); index++) {
    await groups.nth(index).locator(":scope > button").click()
  }

  const row = root.locator('[data-slot="answer-row"][data-kind="tool"]').first()
  await expect(root.locator('[data-slot="answer-tool-image-thumb"]')).toHaveCount(0)

  await row.locator("[data-disclosure-row]").click()

  const thumb = root.locator('[data-slot="answer-tool-image-thumb"]')
  await expect(thumb).toBeVisible()
  await expect(thumb).toHaveAttribute("alt", "settings.svg")
  await expect(root.locator('[data-slot="answer-io-card"]')).toHaveCount(0)

  const box = await thumb.boundingBox()
  expect(box?.height ?? 0).toBeLessThanOrEqual(360)
  await page.screenshot({ path: output("answer-tool-image.png") })
})

story("counts a read that returns an image as a picture step", async ({ mount }) => {
  const root = await mount("answer-page--read-picture")
  await root.locator('[data-slot="answer-fold"]').first().locator('[data-slot="answer-run-header"] button').click()

  const group = root.locator('[data-slot="answer-group"][data-process-activity="readImage"]')
  await expect(group).toHaveCount(1)
  await expect(group.locator(":scope > button")).toContainText("Identify image")

  await group.locator(":scope > button").click()

  const row = group.locator('[data-slot="answer-row"][data-kind="tool"]').first()
  await expect(row.locator("[data-disclosure-row]")).toContainText("Identify image")
  await row.locator("[data-disclosure-row]").click()
  await expect(row.locator('[data-slot="answer-tool-image-thumb"]')).toBeVisible()
  await expect(row.locator('[data-slot="answer-io-card"]')).toHaveCount(0)
})
