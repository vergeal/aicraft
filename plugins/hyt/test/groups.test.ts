import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { resolveGroupNames } from "../src/chat/groups.js"

/** 造一个只有 `Config` 的数据根目录，跑完删掉。 */
function withRoot(files: Readonly<Record<string, string>>, run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "hyt-groups-"))
  mkdirSync(join(root, "Config"), { recursive: true })
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, "Config", name), text, "utf8")
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe("群名解析", () => {
  test("手动映射优先于桥接缓存、keepgroup 与成员默认名", () => {
    withRoot(
      {
        "newhyt.ini": "[Client]\nUseTest=false\n\n[Groups]\ng1=手动名\n",
        "newhyt-groups.json": JSON.stringify({ groups: [{ groupId: "g1", name: "桥接名" }] }),
      },
      (root) => {
        const names = resolveGroupNames({
          root,
          keepgroup: new Map([["g1", "保留名"]]),
          members: new Map([["g1", ["刘程", "唐宇"]]]),
        })
        expect(names.get("g1")).toBe("手动名")
      },
    )
  })

  test("桥接缓存优先于 keepgroup", () => {
    withRoot(
      { "newhyt-groups.json": JSON.stringify([{ groupId: "g2", name: "运维值班群" }]) },
      (root) => {
        const names = resolveGroupNames({
          root,
          keepgroup: new Map([["g2", "刘程、罗添胜"]]),
          members: new Map(),
        })
        expect(names.get("g2")).toBe("运维值班群")
      },
    )
  })

  test("没有配置时用 keepgroup，再退到成员昵称拼出的默认名", () => {
    withRoot({}, (root) => {
      const names = resolveGroupNames({
        root,
        keepgroup: new Map([["g3", "办公系统运维巡检群"]]),
        members: new Map([
          ["g3", ["刘程"]],
          ["g4", ["唐宇", "唐宇", "文鹏", "周欢明", "杨万宝"]],
        ]),
      })
      expect(names.get("g3")).toBe("办公系统运维巡检群")
      expect(names.get("g4")).toBe("唐宇、文鹏、周欢明")
    })
  })

  test("配置文件损坏时按没有处理，不影响默认名", () => {
    withRoot({ "newhyt.ini": "[Groups\ng1=坏行\n", "newhyt-groups.json": "{" }, (root) => {
      const names = resolveGroupNames({ root, keepgroup: new Map(), members: new Map([["g1", ["田杰"]]]) })
      expect(names.get("g1")).toBe("田杰")
    })
  })
})
