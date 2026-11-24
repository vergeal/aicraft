import { chromium } from "@playwright/test"

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { noDefaults: true })
const pages = browser.contexts().flatMap((context) => context.pages())

console.log(`pages: ${pages.length}`)

for (const page of pages) {
  const info = await page
    .evaluate(() => ({
      url: location.href,
      title: document.title,
      fontsStatus: document.fonts.status,
      sans: getComputedStyle(document.documentElement).getPropertyValue("--font-family-sans").trim(),
      mono: getComputedStyle(document.documentElement).getPropertyValue("--font-family-mono").trim(),
      contentFontSize: getComputedStyle(document.documentElement).getPropertyValue("--content-font-size").trim(),
      bodyFont: getComputedStyle(document.body).fontFamily,
      loadedFaces: [...document.fonts].map((face) => `${face.family} ${face.weight} ${face.status}`),
      resourceFonts: performance
        .getEntriesByType("resource")
        .filter((entry) => /\.(woff2?|ttf|otf)/.test(entry.name))
        .map((entry) => ({ name: entry.name.split("/").pop(), start: Math.round(entry.startTime), duration: Math.round(entry.duration) })),
    }))
    .catch((error: unknown) => ({ error: String(error) }))

  console.log(JSON.stringify(info, null, 2))
}

await browser.close()
