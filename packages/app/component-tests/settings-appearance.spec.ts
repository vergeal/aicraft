import type { Page } from "@playwright/test"
import { expect, story } from "../../stories/playwright/story"

const options = (page: Page) => page.locator('[data-slot="font-picker-option"]')

const optionNames = (page: Page) => options(page).locator('[data-slot="font-picker-option-name"]')

const readStack = (page: Page, variable: string) =>
  page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name), variable)

story(
  "lists installed families with Default first, filters as the search grows, and restores focus on Escape",
  async ({ mount, page }) => {
    const root = await mount("app-dialog-settings--appearance")
    const trigger = root.locator('[data-action="settings-ui-font"]')

    await expect(trigger).toHaveText("Default")

    await trigger.click()
    const panel = page.locator('[data-slot="font-picker-panel"]')

    await expect(panel).toBeVisible()
    // The story's enumerated families: Default first, then every name alphabetically.
    await expect(optionNames(page)).toHaveText([
      "Default",
      "Arial",
      "Consolas",
      "Courier New",
      "Georgia",
      "Inter",
      "Menlo",
    ])

    const search = page.getByRole("combobox", { name: "UI Font", exact: true })

    await expect(search).toBeFocused()
    await search.fill("men")
    await expect(optionNames(page)).toHaveText(["Menlo"])

    await search.press("Escape")
    await expect(panel).toBeHidden()
    await expect(trigger).toBeFocused()
  },
)

story("code font lists monospace families before the proportional ones", async ({ mount, page }) => {
  const root = await mount("app-dialog-settings--appearance")

  await root.locator('[data-action="settings-code-font"]').click()

  const list = await options(page).evaluateAll((elements) =>
    elements.map((element) => ({
      family: element.querySelector('[data-slot="font-picker-option-name"]')?.textContent ?? "",
      monospace: element.hasAttribute("data-monospace"),
    })),
  )

  expect(list[0].family).toBe("Default")

  // Which names read as monospace is measured on the machine, so the contract is the ordering, not the split.
  const firstProportional = list.slice(1).findIndex((item) => !item.monospace)

  expect(list.slice(1, firstProportional + 1).every((item) => item.monospace)).toBe(true)
  expect(list.slice(firstProportional + 1).every((item) => !item.monospace)).toBe(true)
})

story(
  "choosing a family prepends it to the role's stack, and Default falls back to the built-in stack",
  async ({ mount, page }) => {
    const root = await mount("app-dialog-settings--appearance")
    const trigger = root.locator('[data-action="settings-ui-font"]')

    await trigger.click()
    await options(page).filter({ hasText: "Georgia" }).click()
    await expect(trigger).toHaveText("Georgia")
    await expect
      .poll(() => readStack(page, "--font-family-sans"))
      .toContain('"Georgia", -apple-system, BlinkMacSystemFont')

    await trigger.click()
    await options(page).first().click()
    await expect(trigger).toHaveText("Default")
    // No family chosen: the variable holds the built-in stack with nothing prepended.
    await expect
      .poll(() => readStack(page, "--font-family-sans"))
      .toMatch(/-apple-system, BlinkMacSystemFont/)
    expect(await readStack(page, "--font-family-sans")).not.toContain("Georgia")
  },
)
