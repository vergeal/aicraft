import { describe, expect, test } from "bun:test"
import type { ChatMessage } from "../src/chat/message.js"
import { findCandidates, formatLocal, isDue, parseDueAt, titleOf } from "../src/ai/tasks-detect.js"

const SELF = "csT1002173"
/** 2026-11-22 是周日，10:00 本地时间。 */
const SUNDAY = new Date(2026, 10, 22, 10, 0, 0)
const SUNDAY_NAMES = "周日"

function at(result: string | undefined) {
  expect(result).toBeDefined()
  return new Date(result!)
}

function expectLocal(result: string | undefined, year: number, month: number, day: number, hour: number, minute = 0) {
  const parsed = at(result)
  expect(parsed.getFullYear()).toBe(year)
  expect(parsed.getMonth()).toBe(month - 1)
  expect(parsed.getDate()).toBe(day)
  expect(parsed.getHours()).toBe(hour)
  expect(parsed.getMinutes()).toBe(minute)
}

function message(overrides: Partial<ChatMessage> & { id: number; text: string }): ChatMessage {
  return {
    id: overrides.id,
    msgId: overrides.msgId ?? `m${overrides.id}`,
    msgType: 1,
    kind: overrides.kind ?? "text",
    text: overrides.text,
    sender: overrides.sender ?? "cs20254801",
    senderNick: overrides.senderNick ?? "刘程",
    receiver: SELF,
    sessionId: overrides.sessionId ?? "cs20254801",
    sessionType: 0,
    createdAt: 1_700_000_000_000 + overrides.id,
    time: "2026-11-22T02:00:00.000Z",
    isAt: overrides.isAt ?? false,
    at: overrides.at ?? [],
    fileName: "",
    fileUrl: "",
    fileFullPath: "",
    groupId: "",
  }
}

describe("parseDueAt", () => {
  test("基准日期确认在周日", () => {
    expect(SUNDAY.getDay()).toBe(0)
    expect(SUNDAY_NAMES).toBe("周日")
  })

  test("今天 / 明天 / 后天 / 大后天", () => {
    expectLocal(parseDueAt("今天下班前给我", { now: SUNDAY }), 2026, 11, 22, 18)
    expectLocal(parseDueAt("明天之前发我", { now: SUNDAY }), 2026, 11, 23, 18)
    expectLocal(parseDueAt("后天上午处理", { now: SUNDAY }), 2026, 11, 24, 9)
    expectLocal(parseDueAt("大后天确认", { now: SUNDAY }), 2026, 11, 25, 18)
  })

  test("今天已过下班点则顺延到次日", () => {
    const evening = new Date(2026, 10, 22, 19, 30, 0)
    expectLocal(parseDueAt("今天处理完", { now: evening }), 2026, 11, 23, 18)
  })

  test("工作日：周五 / 下周五 / 下下周五", () => {
    expectLocal(parseDueAt("周五前给我", { now: SUNDAY }), 2026, 11, 27, 18)
    expectLocal(parseDueAt("下周五之前", { now: SUNDAY }), 2026, 12, 4, 18)
    expectLocal(parseDueAt("下下周五", { now: SUNDAY }), 2026, 12, 11, 18)
  })

  test("下班前与月底", () => {
    expectLocal(parseDueAt("下班前给结论", { now: SUNDAY }), 2026, 11, 22, 18)
    expectLocal(parseDueAt("月底前归档", { now: SUNDAY }), 2026, 11, 30, 18)
  })

  test("具体日期与号数", () => {
    expectLocal(parseDueAt("2026-12-01 之前", { now: SUNDAY }), 2026, 12, 1, 18)
    expectLocal(parseDueAt("11月30日交", { now: SUNDAY }), 2026, 11, 30, 18)
    expectLocal(parseDueAt("30号前", { now: SUNDAY }), 2026, 11, 30, 18)
    expectLocal(parseDueAt("12月3号", { now: SUNDAY }), 2026, 12, 3, 18)
  })

  test("已过的号数落到下个月", () => {
    expectLocal(parseDueAt("5号前给你", { now: SUNDAY }), 2026, 12, 5, 18)
  })

  test("具体时刻：下午 5 点、17:00、上午十点半", () => {
    expectLocal(parseDueAt("今天下午5点开个短会", { now: SUNDAY }), 2026, 11, 22, 17)
    expectLocal(parseDueAt("明天 09:30 开始", { now: SUNDAY }), 2026, 11, 23, 9, 30)
    expectLocal(parseDueAt("明天上午十点半", { now: SUNDAY }), 2026, 11, 23, 10, 30)
  })

  test("N 天后", () => {
    expectLocal(parseDueAt("3天后交", { now: SUNDAY }), 2026, 11, 25, 18)
  })

  test("没有任何时间词时返回 undefined", () => {
    expect(parseDueAt("这个报错怎么排查", { now: SUNDAY })).toBeUndefined()
    expect(isDue(undefined)).toBe(false)
  })

  test("formatLocal 带本地偏移且能被 Date 解析回同一时刻", () => {
    const date = new Date(2026, 10, 30, 18, 0, 0)
    const text = formatLocal(date)
    expect(new Date(text).getTime()).toBe(date.getTime())
    expect(text).toMatch(/^2026-11-30T18:00:00[+-]\d{2}:\d{2}$/)
  })
})

describe("findCandidates", () => {
  test("私聊里的任务词会被预筛出来，并带上期限", () => {
    const candidates = findCandidates([message({ id: 1, text: "麻烦你明天之前把变更单发我" })], {
      selfAccount: SELF,
      now: SUNDAY,
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.reasons).toContain("direct")
    expect(candidates[0]!.title).toBe("明天之前把变更单发我")
    expectLocal(candidates[0]!.dueAt, 2026, 11, 23, 18)
  })

  test("群里 @我 的求助算候选", () => {
    const candidates = findCandidates(
      [
        message({
          id: 2,
          sessionId: "g80001419326603732",
          text: "这个工单你跟进一下",
          isAt: true,
        }),
      ],
      { selfAccount: SELF, now: SUNDAY },
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.reasons).toContain("at-me")
  })

  test("自己发的、闲聊、纯表情都不是候选", () => {
    expect(
      findCandidates(
        [
          message({ id: 1, sender: SELF, text: "我看下明天处理" }),
          message({ id: 2, sessionId: "g80001419326603732", text: "我去吃饭了" }),
          message({ id: 3, text: "😀😀" }),
        ],
        { selfAccount: SELF, now: SUNDAY },
      ),
    ).toEqual([])
  })

  test("问句加时间词也算候选", () => {
    const candidates = findCandidates([message({ id: 1, sessionId: "g80001419326603732", text: "这个工单周五前能好吗？" })], {
      selfAccount: SELF,
      now: SUNDAY,
    })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.reasons).toContain("question-with-time")
  })
})

describe("titleOf", () => {
  test("去掉客套前缀并压掉空白", () => {
    expect(titleOf("麻烦你  明天把报告发我")).toBe("明天把报告发我")
    expect(titleOf("请在周五前完成巡检")).toBe("在周五前完成巡检")
  })

  test("过长时截断，过短时补发送人", () => {
    const long = "这是一段非常长的任务描述".repeat(6)
    expect([...titleOf(long)].length).toBeLessThanOrEqual(41)
    expect(titleOf("看下", "刘程")).toBe("刘程：看下")
    expect(titleOf("看下")).toBe("看下")
  })
})
