import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decodeMergeText, describeMerge, mergeKindOf, parseMergeItems, readMergeFile } from "../src/chat/merge.js"

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64")
}

describe("mergeKindOf", () => {
  test("数字与字符串都按 1/4 映射", () => {
    expect(mergeKindOf(1)).toBe("text")
    expect(mergeKindOf("1")).toBe("text")
    expect(mergeKindOf(4)).toBe("image")
    expect(mergeKindOf("4")).toBe("image")
  })

  test("未知类型落到 other", () => {
    expect(mergeKindOf(undefined)).toBe("other")
    expect(mergeKindOf(9)).toBe("other")
    expect(mergeKindOf("图片")).toBe("other")
  })
})

describe("parseMergeItems", () => {
  test("保留有内容的元素，丢掉全空元素", () => {
    const items = parseMergeItems([
      {
        merge_account: "cs20254801",
        merge_content: "交换机端口不通",
        merge_messageId: "123",
        merge_time: "1742538000000",
        merge_title: "",
        merge_type: 1,
        merge_url: "",
        merge_userData: "",
      },
      { merge_content: "", merge_title: "", merge_url: "" },
      { merge_content: "截图", merge_type: "4", merge_url: "http://x/a.png" },
      "坏元素",
    ])
    expect(items).toHaveLength(2)
    expect(items[0]?.kind).toBe("text")
    expect(items[0]?.time).toBe(1742538000000)
    expect(items[0]?.title).toBe("交换机端口不通")
    expect(items[1]?.kind).toBe("image")
    expect(items[1]?.title).toBe("截图")
  })

  test("缺字段时给空字符串，不抛错", () => {
    const items = parseMergeItems([{ merge_content: "只有正文" }])
    expect(items).toEqual([
      {
        account: "",
        content: "只有正文",
        messageId: "",
        time: 0,
        title: "只有正文",
        kind: "other",
        url: "",
        userData: "",
      },
    ])
  })

  test("接受 { items } 包裹；其它形状返回空数组", () => {
    expect(parseMergeItems({ items: [{ merge_content: "a" }] })).toHaveLength(1)
    expect(parseMergeItems({ results: [{ merge_content: "a" }] })).toEqual([])
    expect(parseMergeItems(null)).toEqual([])
  })
})

describe("decodeMergeText", () => {
  test("解码 base64 JSON", () => {
    const items = decodeMergeText(encode([{ merge_content: "重启网卡", merge_type: 1 }]))
    expect(items.map((item) => item.content)).toEqual(["重启网卡"])
  })

  test("坏 base64、坏 JSON、空串都返回空数组", () => {
    expect(decodeMergeText("%%%不是 base64%%%")).toEqual([])
    expect(decodeMergeText(Buffer.from("not json").toString("base64"))).toEqual([])
    expect(decodeMergeText("   ")).toEqual([])
  })
})

describe("readMergeFile", () => {
  test("读文件并解码；文件不存在时返回空数组", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hyt-merge-"))
    try {
      const path = join(directory, "merge.txt")
      await writeFile(path, encode([{ merge_content: "先看光模块", merge_type: "1" }]), "utf8")
      expect((await readMergeFile(path)).map((item) => item.content)).toEqual(["先看光模块"])
      expect(await readMergeFile(join(directory, "missing.txt"))).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe("describeMerge", () => {
  test("空结果给可读提示，超出上限时说明剩余条数", () => {
    expect(describeMerge([])).toContain("读不到内容")
    const items = Array.from({ length: 3 }, (_, index) => ({
      account: "",
      content: `第${index + 1}条`,
      messageId: "",
      time: 0,
      title: "",
      kind: "text" as const,
      url: "",
      userData: "",
    }))
    const text = describeMerge(items, 2)
    expect(text).toContain("1. 第1条")
    expect(text).toContain("另有 1 条未列出")
  })
})
