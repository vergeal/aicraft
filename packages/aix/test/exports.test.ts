import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const packageJson = JSON.parse(readFileSync(path.join(import.meta.dir, "..", "package.json"), "utf8")) as {
  name: string
  exports: Record<string, unknown>
}

// The AIX rename must not change the SDK surface: these are the export subpaths the pre-rename
// `@aicraft/plugin` package published (baseline 8b3ec8016f), kept as the golden set.
const baselineSubpaths = [
  ".",
  "./effect",
  "./host",
  "./runtime",
  "./tui",
  "./gui",
  "./gui/main",
  "./gui/host",
  "./gui/builtin",
  "./gui/file",
  "./gui/review",
  "./gui/browser",
  "./gui/updater",
  "./gui/vite",
  "./gui/*",
  "./*",
]

test("the aix package exports exactly the subpaths the old plugin SDK did", () => {
  expect(Object.keys(packageJson.exports).sort()).toEqual([...baselineSubpaths].sort())
})

test("the package publishes under the renamed name", () => {
  expect(packageJson.name).toBe("@aicraft/aix")
})
