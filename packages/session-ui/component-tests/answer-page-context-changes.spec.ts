import { expect, story } from "../../stories/playwright/story"

story("shows an injected context row only when it changes", async ({ mount }) => {
  const root = await mount("answer-page--context-changes")

  await root.locator('[data-slot="answer-fold"] [data-slot="answer-run-header"] button').click()

  const group = root.locator('[data-slot="answer-group"]').first()
  await group.locator(":scope > button").click()

  // The second step repeats the first one's context; the third changes one of its sources.
  const rows = group.locator('[data-slot="answer-row"][data-kind="context"]')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText("Injected context")
  await expect(rows.nth(1)).toContainText("Context changed")

  // The first injection lists the whole baseline.
  await rows.nth(0).locator("[data-disclosure-row]").click()
  const injected = rows.nth(0).locator('[data-slot="answer-context-sources"]')
  await expect(injected).toHaveClass(/\banswer-tree\b/)
  await expect(injected.locator(":scope > *")).toHaveCount(2)
  await expect(injected).toContainText("System prompt")
  await expect(injected).toContainText("Instruction files")
  await expect(injected.locator('[data-slot="leading-idle"] [data-slot="icon-svg"]').first()).toHaveCSS("width", "16px")

  // A change lists only the source that differs, not the sources that stayed the same.
  await rows.nth(1).locator("[data-disclosure-row]").click()
  const changed = rows.nth(1).locator('[data-slot="answer-context-sources"]')
  await expect(changed.locator(":scope > *")).toHaveCount(1)
  await expect(changed).toContainText("Instruction files")
  await expect(changed).not.toContainText("System prompt")

  await changed.locator("[data-disclosure-row]").click()
  await expect(changed).toContainText("项目指令 B")
})
