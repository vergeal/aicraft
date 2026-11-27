import { describe, expect, test } from "bun:test"
import path from "path"

const root = path.resolve(import.meta.dirname, "..")

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g

async function collect(): Promise<ReadonlyArray<string>> {
  const files: string[] = []
  for await (const file of new Bun.Glob("src/**/*.ts").scan({ cwd: root })) files.push(file)
  return files.toSorted((a, b) => a.localeCompare(b))
}

describe("import guard", () => {
  test("src has files to guard", async () => {
    expect(await collect()).not.toBeEmpty()
  })

  test("kernel never depends on host packages", async () => {
    const offenders: string[] = []
    for (const file of await collect()) {
      const text = await Bun.file(path.join(root, file)).text()
      for (const match of text.matchAll(SPECIFIER)) {
        const spec = match[1]
        if (spec.startsWith("@aicraft/") && spec !== "@aicraft/context") offenders.push(`${file} -> ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test("relative imports never escape the package src", async () => {
    const offenders: string[] = []
    const srcDir = path.join(root, "src")
    for (const file of await collect()) {
      const text = await Bun.file(path.join(root, file)).text()
      for (const match of text.matchAll(SPECIFIER)) {
        const spec = match[1]
        if (!spec.startsWith(".")) continue
        const resolved = path.resolve(path.dirname(path.join(root, file)), spec)
        if (!resolved.startsWith(srcDir + path.sep) && resolved !== srcDir) offenders.push(`${file} -> ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
