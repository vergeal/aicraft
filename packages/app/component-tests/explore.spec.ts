import { expect, sourceURL, story } from "../../stories/playwright/story"

const fixture = sourceURL(new URL("./explore.fixture.tsx", import.meta.url))

// Any story loads the app runtime; the fixture mounts the real plugin cards beside it.
story.beforeEach(async ({ mount, page }) => {
  await mount("ui-line-comment--editor")

  // Load the fixture before the test mounts it: Vite must not reload the page to optimize its dependencies mid-fixture.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.evaluate((url) => import(url), fixture)

      return
    } catch (error) {
      if (attempt >= 2) throw error

      await page.waitForLoadState("networkidle")
    }
  }
})

story("lists the available plugins and opens one on its own page", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { mountExplorePlugins } = await import(fixture)
    const mounted = mountExplorePlugins()

    const frame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    await frame()

    // SAFETY: mountExplorePlugins builds its host with document.createElement("div").
    const host = mounted.host as HTMLDivElement
    const cards = () => Array.from(host.querySelectorAll<HTMLElement>(".module-card"))
    const names = () =>
      cards().map((card) => card.querySelector(".module-card-title strong")?.textContent?.trim() ?? "")

    const initial = {
      cards: cards().length,
      names: names(),
      noHorizontalOverflow: host.scrollWidth <= host.clientWidth,
    }

    cards()[0]?.querySelector<HTMLButtonElement>(".module-card-head")?.click()
    await frame()
    const opened = {
      about: host.querySelector(".explore-catalog-about")?.textContent?.trim(),
      hasFacts: !!host.querySelector(".explore-catalog-facts"),
      detail: !!host.querySelector(".explore-detail"),
      cards: cards().length,
    }

    mounted.unmount()

    return { initial, opened }
  }, fixture)

  expect(result.initial.cards).toBe(3)
  expect(result.initial.names).toEqual(["alpha-plugin", "beta-plugin", "gamma-plugin"])
  expect(result.initial.noHorizontalOverflow).toBe(true)
  expect(result.opened.about).toBe("The full alpha introduction.")
  expect(result.opened.hasFacts).toBe(true)
  expect(result.opened.detail).toBe(true)
  expect(result.opened.cards).toBe(0)
})

story("shows a catalog bundle and hides it once installed", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { webwrightCatalog, webwrightInstalled, mountExplorePlugins } = await import(fixture)

    const frame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    const read = async (input: { catalog: unknown; installed?: unknown }) => {
      const mounted = mountExplorePlugins(input as never)
      // SAFETY: mountExplorePlugins builds its host with document.createElement("div").
      const host = mounted.host as HTMLDivElement
      await frame()

      const card = host.querySelector<HTMLElement>(".module-card")
      const state = {
        cards: host.querySelectorAll(".module-card").length,
        name: card?.querySelector(".module-card-title strong")?.textContent?.trim() ?? "",
      }

      card?.querySelector<HTMLButtonElement>(".module-card-head")?.click()
      await frame()

      const labels = Array.from(host.querySelectorAll("button")).map((button) => button.textContent?.trim() ?? "")
      const detail = {
        type: host.querySelector(".explore-catalog-facts dd")?.textContent?.trim() ?? "",
        hasInstall: labels.includes("Install plugin"),
        hasUninstall: labels.includes("Uninstall"),
      }

      mounted.unmount()

      return { state, detail }
    }

    return {
      catalogOnly: await read({ catalog: webwrightCatalog }),
      installed: await read({ catalog: webwrightCatalog, installed: webwrightInstalled }),
    }
  }, fixture)

  expect(result.catalogOnly.state).toEqual({ cards: 1, name: "Webwright" })
  expect(result.catalogOnly.detail.type).toContain("~/.distribution/plugins/opencode.webwright")
  expect(result.catalogOnly.detail.hasInstall).toBe(true)

  expect(result.installed.state).toEqual({ cards: 1, name: "Webwright" })
  expect(result.installed.detail.hasInstall).toBe(false)
  expect(result.installed.detail.hasUninstall).toBe(true)
})

story("keeps a failed plugin's error folded, with its reference, inside its card", async ({ page }) => {
  const result = await page.evaluate(async (fixture) => {
    const { failedInstalled, mountExplorePlugins } = await import(fixture)
    const mounted = mountExplorePlugins({ installed: failedInstalled, selected: failedInstalled[0] })

    const frame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    await frame()

    // SAFETY: mountExplorePlugins builds its host with document.createElement("div").
    const host = mounted.host as HTMLDivElement
    const block = host.querySelector<HTMLElement>(".explore-plugin-error")!
    const details = host.querySelector<HTMLDetailsElement>(".explore-plugin-error-details")
    const buttons = () => Array.from(host.querySelectorAll("button")).map((button) => button.textContent ?? "")

    const folded = {
      summary: host.querySelector(".explore-plugin-error-summary")?.textContent?.trim(),
      hasDetails: !!details,
      open: details?.open ?? false,
      reference: host.querySelector(".explore-plugin-error-ref")?.textContent?.trim(),
      hasCopy: buttons().some((label) => label.includes("Copy reference")),
      hasExport: buttons().some((label) => label.includes("Export logs")),
      noOverflow: block.scrollWidth <= block.clientWidth,
    }

    details?.querySelector("summary")?.click()
    await frame()

    const expanded = {
      open: details?.open ?? false,
      full: host.querySelector(".explore-plugin-error-pre")?.textContent ?? "",
      noOverflow: block.scrollWidth <= block.clientWidth,
      pageNoOverflow: host.scrollWidth <= host.clientWidth,
    }

    mounted.unmount()

    return { folded, expanded }
  }, fixture)

  expect(result.folded.summary).toBe("Tool transform failed: acme.search has no input schema")
  expect(result.folded.hasDetails).toBe(true)
  expect(result.folded.open).toBe(false)
  expect(result.folded.reference).toBe("err_1a2b3c4d")
  expect(result.folded.hasCopy).toBe(true)
  // A web window offers no debug-log export, so the button must stay away.
  expect(result.folded.hasExport).toBe(false)
  expect(result.folded.noOverflow).toBe(true)
  expect(result.expanded.open).toBe(true)
  expect(result.expanded.full).toContain("at Tool.transform")
  expect(result.expanded.noOverflow).toBe(true)
  expect(result.expanded.pageNoOverflow).toBe(true)
})
