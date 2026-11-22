import { describe, expect, test } from "bun:test"
import type { ChatMessage } from "../src/chat/message.js"
import { decideAutopilot } from "../src/ai/autopilot.js"
import { checkReplies } from "../src/ai/drafts.js"
import { collectStyleSamples } from "../src/ai/style-learn.js"
import { dedupeBatch, judge, signalScore, summarize } from "../src/ai/prefilter.js"
import { applyPreset, presetFull, presetOps } from "../src/profile/presets.js"
import type { HytProfile } from "../src/profile/schema.js"
import { defaultProfile } from "../src/profile/schema.js"

const SELF = "csT1002173"

function message(overrides: Partial<ChatMessage> & { id: number; text?: string }): ChatMessage {
  return {
    id: overrides.id,
    msgId: overrides.msgId ?? `m${overrides.id}`,
    msgType: overrides.msgType ?? 1,
    kind: overrides.kind ?? "text",
    text: overrides.text ?? "",
    sender: overrides.sender ?? "cs20254801",
    senderNick: overrides.senderNick ?? "刘程",
    receiver: overrides.receiver ?? SELF,
    sessionId: overrides.sessionId ?? "cs20254801",
    sessionType: overrides.sessionType ?? 0,
    createdAt: overrides.createdAt ?? 1_700_000_000_000 + overrides.id,
    time: overrides.time ?? "2026-11-22T08:00:00.000Z",
    isAt: overrides.isAt ?? false,
    at: overrides.at ?? [],
    fileName: overrides.fileName ?? "",
    fileUrl: overrides.fileUrl ?? "",
    fileFullPath: overrides.fileFullPath ?? "",
    groupId: overrides.groupId ?? "",
  }
}

describe("judge", () => {
  test("自己的消息、系统通知、纯表情、纯链接、太短都被丢掉", () => {
    expect(judge(message({ id: 1, sender: SELF, text: "我这边处理一下" }), { selfAccount: SELF })).toEqual({
      keep: false,
      reason: "self",
    })
    expect(judge(message({ id: 2, kind: "notice", text: "某某撤回了一条消息" }), { selfAccount: SELF })).toEqual({
      keep: false,
      reason: "system",
    })
    expect(judge(message({ id: 3, text: "😀👍🎉" }), { selfAccount: SELF })).toEqual({ keep: false, reason: "emoji" })
    expect(judge(message({ id: 4, text: "https://example.com/a/b" }), { selfAccount: SELF })).toEqual({
      keep: false,
      reason: "link",
    })
    expect(judge(message({ id: 5, text: "？" }), { selfAccount: SELF })).toEqual({ keep: false, reason: "too-short" })
  })

  test("私聊与 @我 的消息保留，并给出信号分", () => {
    const direct = judge(message({ id: 1, text: "这个怎么处理" }), { selfAccount: SELF })
    expect(direct.keep).toBe(true)
    const atMe = judge(message({ id: 2, sessionId: "g80001419326603732", text: "麻烦看下", isAt: true }), {
      selfAccount: SELF,
    })
    expect(atMe.keep).toBe(true)
    if (atMe.keep) expect(atMe.score).toBeGreaterThan(0)
  })

  test("群里没人 @ 的闲聊不进批次；开启防漏读后进", () => {
    const chatter = message({ id: 1, sessionId: "g80001419326603732", text: "我先去吃饭了" })
    expect(judge(chatter, { selfAccount: SELF })).toEqual({ keep: false, reason: "chatter" })
    expect(judge(chatter, { selfAccount: SELF, scenes: ["no-miss"] }).keep).toBe(true)
  })

  test("收到/谢谢这类寒暄即使开了防漏读也不接", () => {
    const social = message({ id: 1, sessionId: "g80001419326603732", text: "收到" })
    expect(judge(social, { selfAccount: SELF, scenes: ["no-miss"] }).keep).toBe(false)
  })

  test("图片与文件默认保留，交给模型判断", () => {
    const file = message({ id: 1, sessionId: "g80001419326603732", kind: "file", text: "" })
    expect(judge(file, { selfAccount: SELF }).keep).toBe(true)
  })})

describe("signalScore 与 summarize", () => {
  test("任务词与时间词会加分，大量表情会减分", () => {
    expect(signalScore("明天之前把这个报错处理一下")).toBeGreaterThan(signalScore("好的"))
    expect(signalScore("😀😀😀")).toBeLessThan(0)
  })

  test("summarize 统计口径与保留列表一致", () => {
    const result = summarize(
      [
        message({ id: 1, text: "这个报错怎么排查" }),
        message({ id: 2, text: "😀😀" }),
        message({ id: 3, sender: SELF, text: "我看下" }),
      ],
      { selfAccount: SELF },
    )
    expect(result.counts.keep).toBe(1)
    expect(result.counts.emoji).toBe(1)
    expect(result.counts.self).toBe(1)
    expect(result.kept).toHaveLength(1)
  })

  test("dedupeBatch 去重并只保留最近 limit 条", () => {
    const kept = dedupeBatch(
      [
        message({ id: 1, text: "同一句话问一遍" }),
        message({ id: 2, text: "同一句话问一遍" }),
        message({ id: 3, text: "另一句不同的话" }),
      ],
      1,
    )
    expect(kept.map((item) => item.id)).toEqual([3])
  })
})

describe("collectStyleSamples", () => {
  test("只学本人 MsgType=1 的文本，排除 AI 自己发出的与不可学内容", () => {
    const samples = collectStyleSamples(
      [
        message({ id: 1, sender: SELF, text: "我看下，十分钟回你" }),
        message({ id: 2, sender: SELF, text: "AI 写的这一句不算" }),
        message({ id: 3, sender: "cs20254801", text: "对方说的话不学" }),
        message({ id: 4, sender: SELF, msgType: 4, kind: "image", text: "图片说明" }),
        message({ id: 5, sender: SELF, text: "好的" }),
        message({ id: 6, sender: SELF, text: "收到，我马上处理" }),
      ],
      { selfAccount: SELF, aiSentIds: new Set(["m2"]) },
    )
    expect(samples).toEqual(["我看下，十分钟回你", "收到，我马上处理"])
  })

  test("账号为空时不学任何东西", () => {
    expect(collectStyleSamples([message({ id: 1, sender: SELF, text: "我看看" })], { selfAccount: "" })).toEqual([])
  })
})

describe("checkReplies", () => {
  test("最多 3 条，重复与空串被丢掉", () => {
    const result = checkReplies(["好的", "好的", "", "收到", "我看下", "第四句"])
    expect(result.replies).toEqual(["好的", "收到", "我看下"])
    expect(result.warnings.length).toBe(1)
  })

  test("超过 80 字按句末截断并提示", () => {
    const long = `${"先看交换机端口状态然后确认光模块是否正常".repeat(4)}。后面还有一句不该出现的内容。`
    const result = checkReplies([long])
    expect([...result.replies[0]!].length).toBeLessThanOrEqual(80)
    expect(result.warnings[0]).toContain("超过 80 字")
  })

  test("空输入给出提示而不是抛错", () => {
    expect(checkReplies([]).warnings).toContain("没有可用的草稿正文。")
  })
})

describe("decideAutopilot", () => {
  const settings = { whitelist: ["g80001419326603732"], autoReplyEnabled: true }

  test("默认关闭", () => {
    const profile = defaultProfile(SELF)
    expect(decideAutopilot({ profile, sessionId: "g80001419326603732", selfAccount: SELF, settings })).toEqual({
      send: false,
      code: "disabled",
      reason: "托管关闭：只生成草稿。",
    })
  })

  test("托管开启但设置里的开关没开", () => {
    const profile = withAutopilot(defaultProfile(SELF), { enabled: true, scope: "all", whitelist: [] })
    const decision = decideAutopilot({
      profile,
      sessionId: "g80001419326603732",
      selfAccount: SELF,
      settings: { whitelist: ["g80001419326603732"], autoReplyEnabled: false },
    })
    expect(decision.send).toBe(false)
    expect(decision.code).toBe("configuration-disabled")
  })

  test("设置白名单为空时拒绝", () => {
    const profile = withAutopilot(defaultProfile(SELF), { enabled: true, scope: "all", whitelist: [] })
    const decision = decideAutopilot({
      profile,
      sessionId: "g80001419326603732",
      selfAccount: SELF,
      settings: { whitelist: [], autoReplyEnabled: true },
    })
    expect(decision.code).toBe("empty-configuration-whitelist")
  })

  test("scope=all 且过白名单校验才允许", () => {
    const profile = withAutopilot(defaultProfile(SELF), { enabled: true, scope: "all", whitelist: [] })
    expect(
      decideAutopilot({ profile, sessionId: "g80001419326603732", selfAccount: SELF, settings }).code,
    ).toBe("allowed")
    expect(
      decideAutopilot({ profile, sessionId: "cs20254801", selfAccount: SELF, settings }).code,
    ).toBe("not-in-configuration-whitelist")
  })

  test("scope=whitelist 只允许 profile 白名单里的会话或对方账号", () => {
    const profile = withAutopilot(defaultProfile(SELF), {
      enabled: true,
      scope: "whitelist",
      whitelist: ["cs20254801"],
    })
    expect(
      decideAutopilot({
        profile,
        sessionId: "cs20254801",
        selfAccount: SELF,
        settings: { whitelist: ["*"], autoReplyEnabled: true },
      }).code,
    ).toBe("allowed")
    expect(
      decideAutopilot({
        profile,
        sessionId: "g80001419326603732",
        peerAccount: "cs20254801",
        selfAccount: SELF,
        settings: { whitelist: ["*"], autoReplyEnabled: true },
      }).code,
    ).toBe("allowed")
    expect(
      decideAutopilot({
        profile,
        sessionId: "g80001419326603732",
        selfAccount: SELF,
        settings: { whitelist: ["*"], autoReplyEnabled: true },
      }).code,
    ).toBe("not-in-profile-whitelist")
  })

  test("预设 ops 的托管默认白名单为空，等于不发", () => {
    const profile = applyPreset(presetOps.name, SELF)
    expect(profile.capabilities.autopilot.enabled).toBe(true)
    expect(profile.capabilities.autopilot.whitelist).toEqual([])
    expect(
      decideAutopilot({ profile, sessionId: "cs20254801", selfAccount: SELF, settings: { whitelist: ["*"], autoReplyEnabled: true } })
        .send,
    ).toBe(false)
  })

  test("预设 full 也遵循同样的白名单门槛", () => {
    const profile = applyPreset(presetFull.name, SELF)
    expect(
      decideAutopilot({ profile, sessionId: "cs20254801", selfAccount: SELF, settings }).code,
    ).toBe("not-in-configuration-whitelist")
    expect(
      decideAutopilot({
        profile,
        sessionId: "cs20254801",
        selfAccount: SELF,
        settings: { whitelist: ["*"], autoReplyEnabled: true },
      }).code,
    ).toBe("not-in-profile-whitelist")
  })
})

function withAutopilot(
  profile: HytProfile,
  autopilot: { enabled: boolean; scope: "off" | "whitelist" | "all"; whitelist: string[] },
): HytProfile {
  return { ...profile, capabilities: { ...profile.capabilities, autopilot } }
}
