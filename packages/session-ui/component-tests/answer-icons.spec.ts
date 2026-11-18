import { join } from "node:path"
import { expect, story } from "../../stories/playwright/story"

const output = (name: string) => join(process.env.TEMP ?? process.env.TMPDIR ?? ".", name)

story("renders every answer icon on the light and dark surfaces", async ({ mount, page }) => {
  const root = await mount("answer-icons--grids")
  const icons = root.locator('[data-slot="answer-icons"]')

  await expect(icons.locator("svg")).toHaveCount(17)
  await page.evaluate(() => document.documentElement.style.colorScheme = "light")
  await icons.screenshot({ path: output("answer-icons-light.png") })

  await page.evaluate(() => document.documentElement.style.colorScheme = "dark")
  await icons.screenshot({ path: output("answer-icons-dark.png") })
})
