import { describe, expect, test } from "bun:test"
import { bestAnswer, matchAnswer, previewAdmission } from "../src/ai/knowledge.js"
import { createEntry } from "../src/knowledge/schema.js"
import type { KnowledgeEntry } from "../src/knowledge/schema.js"

const NOW = "2026-11-22T08:00:00.000Z"

function entry(question: string, answer: string): KnowledgeEntry {
  return createEntry({ kind: "qa", question, title: question, answer, confidence: 0.95 }, NOW)
}

const entries: KnowledgeEntry[] = [
  entry("交换机端口不通怎么排查", "先看光模块指示灯，再确认对端端口是否 shutdown，最后看生成树阻塞。"),
  entry("VPN 登录提示证书过期怎么处理", "在客户端重新下载证书，导入后重启客户端；仍然失败就换一台机器验证。"),
  entry("打印机卡纸怎么处理", "打开后盖取出纸张，检查滚轮，不要用蛮力拉。"),
]

describe("matchAnswer", () => {
  test("同一个问题的近似问法命中，并标记 confident", () => {
    const matches = matchAnswer(entries, "交换机端口不通怎么排查")
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0]!.confident).toBe(true)
    expect(matches[0]!.entry.question).toContain("交换机")
    expect(matches[0]!.similarity).toBeGreaterThanOrEqual(0.55)
  })

  test("换一个说法但关键词一致时仍然命中", () => {
    expect(bestAnswer(entries, "端口不通 交换机 怎么排查")?.entry.question).toContain("交换机")
  })

  test("不相关的问题不命中阈值", () => {
    const matches = matchAnswer(entries, "食堂几点开饭")
    expect(matches.every((match) => !match.confident)).toBe(true)
    expect(bestAnswer(entries, "食堂几点开饭")).toBeUndefined()
  })

  test("阈值可调：调高后同一问题也不再 confident", () => {
    const strict = matchAnswer(entries, "交换机端口不通如何排查", { threshold: 0.99 })
    expect(strict.every((match) => !match.confident)).toBe(true)
  })

  test("空查询返回空列表", () => {
    expect(matchAnswer(entries, "   ")).toEqual([])
  })
})

describe("previewAdmission", () => {
  test("寒暄被拒", () => {
    const admission = previewAdmission({ question: "在吗", answer: "在的" })
    expect(admission.ok).toBe(false)
    if (!admission.ok) expect(["greeting", "too-short"]).toContain(admission.reason)
  })

  test("置信度低于 0.8 被拒", () => {
    const admission = previewAdmission({ answer: "先看光模块，再看对端状态。", confidence: 0.6 })
    expect(admission.ok).toBe(false)
    if (!admission.ok) expect(admission.reason).toBe("low-confidence")
  })

  test("有结论的内容通过", () => {
    expect(previewAdmission({ question: "端口不通怎么排查", answer: "先看光模块，再看对端端口状态。" }).ok).toBe(true)
  })
})
