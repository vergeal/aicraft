import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  describeProfile,
  emptyProfile,
  filterSamples,
  isLearnable,
  loadProfile,
  mergeSamples,
  saveProfile,
} from "../src/style/profile.js"
import { loadSentIds, markSent } from "../src/style/sent.js"

const NOW = "2026-11-22T08:00:00.000Z"

describe("isLearnable", () => {
  test("少于 4 字、纯链接、纯表情都不可学", () => {
    expect(isLearnable("好的")).toBe(false)
    expect(isLearnable("收到收到")).toBe(true)
    expect(isLearnable("https://example.com/a")).toBe(false)
    expect(isLearnable("😀👍")).toBe(false)
    expect(isLearnable("好的，我处理一下")).toBe(true)
  })
})

describe("filterSamples", () => {
  test("AI 自己发的、批内重复、已学过的样本被丢掉", () => {
    const samples = [
      { id: 1, text: "我看下，十分钟回你" },
      { id: 2, text: "我看下，十分钟回你！" },
      { id: 3, text: "AI 写的一句完整的话" },
      { id: 4, text: "收到收到" },
      { id: 5, text: "好的" },
    ]
    const kept = filterSamples(samples, {
      aiSent: new Set(["3"]),
      seen: new Set(["收到收到"]),
    })
    expect(kept).toEqual(["我看下，十分钟回你"])
  })
})

describe("mergeSamples", () => {
  test("空批次不改档案", () => {
    const profile = emptyProfile(NOW)
    expect(mergeSamples(profile, [], NOW)).toBe(profile)
  })

  test("数值平滑、开场收尾与示例累积", () => {
    const first = mergeSamples(emptyProfile(NOW), ["好的，我马上处理", "收到，稍等"], NOW)
    expect(first.avgLength).toBe(6.5)
    expect(first.greetings).toEqual(["好的", "收到"])
    expect(first.examples).toHaveLength(2)

    const second = mergeSamples(first, ["谢谢，辛苦了"], NOW)
    expect(second.avgLength).toBe(6.35)
    expect(second.closings).toEqual(["辛苦了"])
    expect(second.examples).toHaveLength(3)
    expect(second.updatedAt).toBe(NOW)
  })

  test("示例按归一化文本去重", () => {
    const profile = mergeSamples(emptyProfile(NOW), ["这个我看下", "这个我看下！"], NOW)
    expect(profile.examples).toHaveLength(1)
  })

  test("示例最多保留最近 30 条", () => {
    const samples = Array.from({ length: 35 }, (_, index) => `这是第${index + 1}条不同的样本内容`)
    const profile = mergeSamples(emptyProfile(NOW), samples, NOW)
    expect(profile.examples).toHaveLength(30)
    expect(profile.examples.at(-1)?.text).toBe("这是第35条不同的样本内容")
  })

  test("几乎不用表情与长段落时给出不建议模仿的写法", () => {
    const profile = mergeSamples(emptyProfile(NOW), ["我看下", "稍等，马上回"], NOW)
    expect(profile.antiPatterns).toContain("不要用表情符号")
    expect(profile.antiPatterns).toContain("不要写长段落")
  })
})

describe("describeProfile", () => {
  test("空档案给可读提示；有内容时包含语气与示例", () => {
    expect(describeProfile(emptyProfile(NOW))).toContain("还没有学到")
    const profile = mergeSamples(emptyProfile(NOW), ["好的，我马上处理"], NOW)
    const text = describeProfile(profile)
    expect(text).toContain("语气：")
    expect(text).toContain("最近说法：")
  })
})

describe("档案与已发送记录", () => {
  test("保存后能读回；文件不存在时返回空档案", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hyt-style-"))
    try {
      expect((await loadProfile(directory, "csT1002173")).tone).toBe("未知")
      const profile = mergeSamples(emptyProfile(NOW), ["好的，我马上处理"], NOW)
      await saveProfile(directory, "csT1002173", profile)
      const loaded = await loadProfile(directory, "csT1002173")
      expect(loaded.avgLength).toBe(profile.avgLength)
      expect(loaded.examples).toEqual(profile.examples)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("markSent 去重并返回 id 集合", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hyt-sent-"))
    try {
      await markSent(directory, "m1", NOW)
      await markSent(directory, "m2", NOW)
      await markSent(directory, "m1", NOW)
      expect(await loadSentIds(directory)).toEqual(new Set(["m1", "m2"]))
      await markSent(directory, "   ", NOW)
      expect((await loadSentIds(directory)).size).toBe(2)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
