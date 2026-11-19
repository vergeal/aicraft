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

story("groups multiple injected contexts into one expandable step", async ({ mount }) => {
  const root = await mount("answer-page--injected-context-multiple")

  await root.locator('[data-slot="answer-fold"] [data-slot="answer-run-header"] button').click()

  const groups = root.locator('[data-slot="answer-group"]')
  await expect(groups).toHaveCount(1)
  const trigger = groups.first().locator(":scope > button")
  await expect(trigger).toHaveAttribute("aria-expanded", "false")

  await trigger.click()
  const notices = groups.first().locator('[data-slot="answer-row"][data-kind="notice"]')
  await expect(notices).toHaveCount(3)
  await expect(notices.nth(0)).toContainText("/a/AGENTS.md")
  await expect(notices.nth(2)).toContainText("/c/AGENTS.md")

  await notices.nth(1).locator("[data-disclosure-row]").click()
  await expect(notices.nth(1)).toContainText("第二条规则")
})
