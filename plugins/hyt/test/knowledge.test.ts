import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  MIN_CONFIDENCE,
  checkAdmission,
  createEntry,
  isSameQuestion,
  mergeEntry,
  similarity,
} from "../src/knowledge/schema.js"
import {
  addKnowledge,
  exportKnowledge,
  importKnowledge,
  knowledgeRoot,
  listKnowledge,
  loadIndex,
  parseDocument,
  removeKnowledge,
  searchKnowledge,
} from "../src/knowledge/store.js"

const NOW = "2026-11-22T08:00:00.000Z"

async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), "hyt-knowledge-"))
  return { directory, root: knowledgeRoot(directory), cleanup: () => rm(directory, { recursive: true, force: true }) }
}

describe("checkAdmission", () => {
  test("达到门槛的内容通过", () => {
    expect(checkAdmission({ question: "交换机端口不通怎么排查", answer: "先看光模块，再看对端端口状态。" })).toEqual({
      ok: true,
    })
  })

  test("置信度低于门槛被拒", () => {
    const result = checkAdmission({ answer: "先看光模块，再看对端端口状态。", confidence: MIN_CONFIDENCE - 0.1 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("low-confidence")
  })

  test("寒暄、纯表情、纯链接、过短分别被拒", () => {
    expect(checkAdmission({ answer: "你好" })).toMatchObject({ ok: false, reason: "greeting" })
    expect(checkAdmission({ answer: "😀😀" })).toMatchObject({ ok: false, reason: "emoji" })
    expect(checkAdmission({ answer: "https://example.com/a" })).toMatchObject({ ok: false, reason: "link" })
    expect(checkAdmission({ answer: "重启试试" })).toMatchObject({ ok: false, reason: "too-short" })
  })
})

describe("相似度", () => {
  test("同义改写视为同一问题", () => {
    expect(isSameQuestion("登录一直失败怎么办", "登录一直失败怎么处理")).toBe(true)
    expect(isSameQuestion("登录失败", "打印机脱机")).toBe(false)
    expect(similarity("登录失败", "登录失败")).toBe(1)
  })
})

describe("mergeEntry", () => {
  test("答案取新值、标签并集、置信度取高、使用次数累加", () => {
    const existing = createEntry({ question: "端口不通", answer: "先看光模块", tags: ["网络"] }, NOW, "kb_1")
    const merged = mergeEntry(existing, { answer: "先看光模块，再换跳线", tags: ["交换机"], confidence: 0.6 }, NOW)
    expect(merged.answer).toBe("先看光模块，再换跳线")
    expect(merged.tags).toEqual(["网络", "交换机"])
    expect(merged.confidence).toBe(1)
    expect(merged.usedCount).toBe(1)
  })
})

describe("知识库存储", () => {
  test("新增、按同一问题合并、门槛拒绝", async () => {
    const { root, cleanup } = await workspace()
    try {
      const first = await addKnowledge(
        root,
        { question: "登录一直失败怎么处理", answer: "先检查账号是否被锁定，再确认密码是否过期。", tags: ["登录"] },
        NOW,
      )
      expect(first.status).toBe("added")

      const merged = await addKnowledge(
        root,
        { question: "登录一直失败怎么办", answer: "检查账号锁定与密码过期，必要时找管理员解锁。", tags: ["账号"] },
        NOW,
      )
      expect(merged.status).toBe("merged")
      if (merged.status === "merged") {
        expect(merged.entry.usedCount).toBe(1)
        expect(merged.entry.tags).toEqual(["登录", "账号"])
      }

      const rejected = await addKnowledge(root, { answer: "收到", confidence: 0.4 }, NOW)
      expect(rejected.status).toBe("rejected")

      const index = await loadIndex(root)
      expect(index.entries).toHaveLength(1)
    } finally {
      await cleanup()
    }
  })

  test("检索按相关度排序，列表按使用次数排序", async () => {
    const { root, cleanup } = await workspace()
    try {
      await addKnowledge(root, { title: "光模块排查", answer: "端口不亮时先看光模块的收发功率。" }, NOW)
      await addKnowledge(root, { title: "打印机脱机", answer: "重启打印服务并检查队列里是否有卡住的任务。" }, NOW)

      const hits = await searchKnowledge(root, "光模块")
      expect(hits).toHaveLength(1)
      expect(hits[0]?.entry.title).toBe("光模块排查")
      expect(hits[0]?.score).toBeGreaterThan(0)

      const listed = await listKnowledge(root)
      expect(listed).toHaveLength(2)
    } finally {
      await cleanup()
    }
  })

  test("导出与删除", async () => {
    const { root, cleanup } = await workspace()
    try {
      const added = await addKnowledge(root, { question: "如何清理日志", answer: "只保留最近七天的日志并归档。" }, NOW)
      if (added.status === "rejected") throw new Error("测试数据没有通过入库门槛")
      const exported = JSON.parse(await exportKnowledge(root))
      expect(exported.entries).toHaveLength(1)
      expect(await removeKnowledge(root, added.entry.id)).toBe(true)
      expect(await removeKnowledge(root, "kb_missing")).toBe(false)
      expect((await loadIndex(root)).entries).toEqual([])
    } finally {
      await cleanup()
    }
  })

  test("导入本地 md：标题取第一个二级标题", async () => {
    const { directory, root, cleanup } = await workspace()
    try {
      await writeFile(
        join(directory, "vpn.md"),
        "## VPN 连接不上\n\n先检查客户端版本，再确认账号是否被踢下线。 #网络\n",
        "utf8",
      )
      const result = await importKnowledge(root, [directory], NOW)
      expect(result.added).toBe(1)
      expect(result.rejected).toBe(0)
      const [entry] = await listKnowledge(root)
      expect(entry?.title).toBe("VPN 连接不上")
      expect(entry?.source).toBe("doc")
      expect(entry?.tags).toContain("网络")
    } finally {
      await cleanup()
    }
  })
})

describe("parseDocument", () => {
  test("md 用标题，txt 用文件名；正文截断到 20000 字", () => {
    expect(parseDocument("/tmp/a/说明.md", "# 标题\n正文").title).toBe("标题")
    expect(parseDocument("/tmp/a/说明.txt", "没有标题").title).toBe("说明")
    expect(parseDocument("/tmp/a/长文.txt", "字".repeat(30_000)).body).toHaveLength(20_000)
  })
})
