import { expect, story } from "../../stories/playwright/story"

story("names the skills an @mention loaded above the prompt bubble", async ({ mount }) => {
  const root = await mount("answer-page--skill-mention")

  const row = root.locator('[data-slot="user-message-skills"]')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText("Loaded 图标设计 skill")
  await expect(row.locator('[data-slot="icon-svg"]')).toHaveCount(1)
})

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

story("shows injected memory as one entry, not one row per record id", async ({ mount }) => {
  const root = await mount("answer-page--memory-flow")

  await root.locator('[data-slot="answer-fold"] [data-slot="answer-run-header"] button').click()

  const group = root.locator('[data-slot="answer-group"]').first()
  await group.locator(":scope > button").click()

  const row = group.locator('[data-slot="answer-row"][data-kind="context"]').first()
  // The collapsed summary is the assertion: it names what was injected. A per-record split lists the ids
  // here instead, so one name means the block stayed whole.
  await expect(row).toContainText("Injected memory")
  await expect(row).not.toContainText("mem_0a1b")
  await expect(row).not.toContainText("mem_0a1c")

  await row.locator("[data-disclosure-row]").click()
  const sources = row.locator('[data-slot="answer-context-sources"]')
  await expect(sources.locator(":scope > *")).toHaveCount(1)

  // Opened, it is the block the model read, rendered as markdown: the section header proves the body is the
  // real text rather than a list of record ids.
  await sources.locator("[data-disclosure-row]").click()
  await expect(sources).toContainText("Relevant memory")
  await expect(sources).not.toContainText("mem_0a1b")
})
