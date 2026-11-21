import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import manifest from "../ocplugin.json" with { type: "json" }
import * as Store from "../src/store.js"

function storage() {
  const data = new Map<string, Store.Entry>()
  const adapter = {
    async get(key: string) {
      return data.get(key)
    },
    async set(key: string, value: Store.Entry) {
      data.set(key, value)
    },
    async remove(key: string) {
      data.delete(key)
    },
    async scan(options: { prefix: string; after?: string; limit?: number }) {
      const keys = [...data.keys()]
        .filter((key) => key.startsWith(options.prefix))
        .filter((key) => options.after === undefined || key > options.after)
        .sort()
      const page = keys.slice(0, options.limit ?? 100)
      return {
        entries: page.map((key) => ({ key, value: data.get(key)! })),
        ...(keys.length > page.length ? { next: page.at(-1) } : {}),
      }
    },
  }
  return { data, adapter: adapter as unknown as Store.Storage }
}

function entry(id: string, text: string, updatedAt = "2026-01-01T00:00:00.000Z", tags: string[] = []): Store.Entry {
  return { id, text, tags, createdAt: updatedAt, updatedAt }
}

async function write(adapter: Store.Storage, scope: Store.Scope, projectID: string, item: Store.Entry) {
  await adapter.set(Store.keyFor(scope, projectID, item.id), item)
}

describe("ocplugin manifest", () => {
  test("reserves the memory namespace and ships its skill", () => {
    expect(manifest.id).toBe("changhong.memory")
    expect(manifest.display.tools).toEqual(["memory.*"])
    expect(manifest.skills.map((skill) => skill.id)).toEqual(["memory"])
    for (const skill of manifest.skills) expect(existsSync(join(import.meta.dir, "..", skill.path))).toBe(true)
  })
})

describe("store", () => {
  test("isolates project memories by project id", async () => {
    const { adapter } = storage()
    await write(adapter, "project", "project-a", entry("mem_a", "A 项目的约定"))
    await write(adapter, "project", "project-b", entry("mem_b", "B 项目的约定"))

    const a = await Store.readScope(adapter, Store.projectPrefix("project-a"), 100)
    const b = await Store.readScope(adapter, Store.projectPrefix("project-b"), 100)

    expect(a.map((item) => item.text)).toEqual(["A 项目的约定"])
    expect(b.map((item) => item.text)).toEqual(["B 项目的约定"])
  })

  test("keeps global memories separate from every project", async () => {
    const { adapter } = storage()
    await write(adapter, "global", "project-a", entry("mem_g", "回复用中文"))
    await write(adapter, "project", "project-a", entry("mem_p", "本项目用 bun"))

    const project = await Store.readScope(adapter, Store.projectPrefix("project-a"), 100)
    const global = await Store.readScope(adapter, Store.globalPrefix, 100)

    expect(project.map((item) => item.text)).toEqual(["本项目用 bun"])
    expect(global.map((item) => item.text)).toEqual(["回复用中文"])
  })

  test("encodes a project id so it cannot escape its prefix", () => {
    expect(Store.projectPrefix("a/b")).not.toContain("a/b/")
    expect(Store.keyFor("project", "a/b", "mem_1")).toBe(`${Store.projectPrefix("a/b")}mem_1`)
  })

  test("matches text and tags case-insensitively", () => {
    const item = entry("mem_1", "Prefer Bun over npm", "2026-01-01T00:00:00.000Z", ["toolchain"])
    expect(Store.matches(item, "bun")).toBe(true)
    expect(Store.matches(item, "TOOLCHAIN")).toBe(true)
    expect(Store.matches(item, "pnpm")).toBe(false)
  })

  test("pages through every entry below the cap", async () => {
    const { adapter } = storage()
    for (let index = 0; index < 250; index++) {
      await write(adapter, "project", "project-a", entry(`mem_${index}`, `记忆 ${index}`))
    }
    const entries = await Store.readScope(adapter, Store.projectPrefix("project-a"), 200)
    expect(entries).toHaveLength(200)
  })
})

describe("render", () => {
  test("groups the project and global scopes without leaking another project", () => {
    const text = Store.render({
      project: [entry("mem_p", "本项目用 bun")],
      global: [entry("mem_g", "回复用中文")],
      budget: 4_000,
    })!

    expect(text).toContain("### 项目记忆")
    expect(text).toContain("### 全局记忆")
    expect(text).toContain("本项目用 bun")
    expect(text).toContain("回复用中文")
    expect(text).not.toContain("其他项目")
  })

  test("puts the most recently updated memory first", () => {
    const text = Store.render({
      project: [
        entry("mem_old", "旧记忆", "2026-01-01T00:00:00.000Z"),
        entry("mem_new", "新记忆", "2026-02-01T00:00:00.000Z"),
      ],
      global: [],
      budget: 4_000,
    })!

    expect(text.indexOf("新记忆")).toBeLessThan(text.indexOf("旧记忆"))
  })

  test("counts entries the budget left out", () => {
    const text = Store.render({
      project: [entry("mem_1", "一条很长的记忆 ".repeat(100))],
      global: [],
      budget: 400,
    })!

    expect(text).toContain("未注入")
    expect(text.length).toBeLessThan(1_000)
  })

  test("still states the memory protocol when both scopes are empty", () => {
    const text = Store.render({ project: [], global: [], budget: 4_000 })

    expect(text).toContain("## 记忆协议")
    expect(text).toContain("memory.save")
    expect(text).toContain("判断靠语义")
    expect(text).not.toContain("### 项目记忆")
  })

  test("keeps the protocol ahead of the stored entries", () => {
    const text = Store.render({
      project: [entry("mem_p", "本项目用 bun")],
      global: [],
      budget: 4_000,
    })

    expect(text.indexOf("## 记忆协议")).toBeLessThan(text.indexOf("## 长期记忆"))
  })
})
