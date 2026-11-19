import { expect, story } from "../../stories/playwright/story"

story("expands the body of an injected context step", async ({ mount }) => {
  const root = await mount("answer-page--injected-context")

  await root.locator('[data-slot="answer-fold"] [data-slot="answer-run-header"] button').click()

  const group = root.locator('[data-slot="answer-group"]').first()
  await group.locator(":scope > button").click()

  const notice = group.locator('[data-slot="answer-row"][data-kind="notice"]')
  await expect(notice).toHaveCount(1)
  await expect(notice).toContainText("已加载 AGENTS.md")

  const trigger = notice.locator("[data-disclosure-row]")
  await expect(trigger).toHaveAttribute("aria-expanded", "false")
  await trigger.click()
  await expect(trigger).toHaveAttribute("aria-expanded", "true")
  await expect(notice).toContainText("回答前先读项目说明")
})
