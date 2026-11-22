import { describe, expect, test } from "bun:test"
import type { ChatRow } from "../src/chat/message.js"
import { isOutgoing, kindOf, mentionsAll, parseAt, preview, toMessage } from "../src/chat/message.js"
import { isEmojiOnly, isLinkOnly, normalizeText } from "../src/text.js"

function row(overrides: Partial<ChatRow> = {}): ChatRow {
  return {
    Id: 1,
    MsgType: 1,
    MsgId: "msg-1",
    Msg: "你好",
    Sender: "cs20254801",
    SenderNick: "刘程",
    Receiver: "csT1002173",
    CreatedTime: "1742538000000",
    LocalTime: "20250321090000",
    SessionId: "cs20254801",
    SessionType: 0,
    UserData: null,
    FileName: null,
    FileUrl: null,
    FileFullPath: null,
    FileSize: null,
    GroupId: null,
    isAt: 0,
    ReadStatus: 1,
    ...overrides,
  }
}

describe("kindOf", () => {
  test("已知类型按表映射", () => {
    expect(kindOf(1)).toBe("text")
    expect(kindOf(11)).toBe("text")
    expect(kindOf(4)).toBe("image")
    expect(kindOf(6)).toBe("file")
    expect(kindOf(7)).toBe("file")
    expect(kindOf(25)).toBe("recall")
    expect(kindOf(245)).toBe("merge")
    expect(kindOf(246)).toBe("notice")
  })

  test("空值与未知类型落到 other，不丢消息", () => {
    expect(kindOf(null)).toBe("other")
    expect(kindOf(undefined)).toBe("other")
    expect(kindOf(999)).toBe("other")
  })
})

describe("toMessage", () => {
  test("毫秒字符串转数字与 ISO 时间，缺昵称时用账号", () => {
    const message = toMessage(row({ SenderNick: null, MsgType: 4, Msg: null }))
    expect(message.id).toBe(1)
    expect(message.kind).toBe("image")
    expect(message.text).toBe("")
    expect(message.createdAt).toBe(1742538000000)
    expect(message.time).toBe("2025-03-21T06:20:00.000Z")
    expect(message.senderNick).toBe("cs20254801")
  })

  test("坏的 CreatedTime 给 0 与空时间", () => {
    const message = toMessage(row({ CreatedTime: "abc" }))
    expect(message.createdAt).toBe(0)
    expect(message.time).toBe("")
  })

  test("isAt 只认 1", () => {
    expect(toMessage(row({ isAt: 1 })).isAt).toBe(true)
    expect(toMessage(row({ isAt: 2 })).isAt).toBe(false)
  })
})

describe("parseAt", () => {
  test("解析 @ 列表", () => {
    const at = parseAt('{"at":[{"account":"cs20254801","name":"刘程"},{"account":"g1","name":""}]}')
    expect(at).toEqual([
      { account: "cs20254801", name: "刘程" },
      { account: "g1", name: "" },
    ])
  })

  test("坏 JSON、空串、错形状都返回空数组", () => {
    expect(parseAt("{")).toEqual([])
    expect(parseAt("")).toEqual([])
    expect(parseAt(null)).toEqual([])
    expect(parseAt('{"at":"x"}')).toEqual([])
    expect(parseAt('{"at":[null,{"name":"  "}]}')).toEqual([])
  })
})

describe("mentionsAll", () => {
  test("account 等于会话 id 或名字是所有人", () => {
    expect(mentionsAll([{ account: "g1", name: "" }], "g1")).toBe(true)
    expect(mentionsAll([{ account: "x", name: "所有人" }], "g1")).toBe(true)
    expect(mentionsAll([{ account: "x", name: "刘程" }], "g1")).toBe(false)
    expect(mentionsAll([], "g1")).toBe(false)
  })
})

describe("preview", () => {
  test("文本压成一行并截断", () => {
    expect(preview(toMessage(row({ Msg: "  第一行\n第二行  " })))).toBe("第一行 第二行")
    const long = "字".repeat(80)
    expect(preview(toMessage(row({ Msg: long })), 10)).toBe(`${"字".repeat(10)}…`)
  })

  test("非文本消息用标签，文件带文件名", () => {
    expect(preview(toMessage(row({ MsgType: 4, Msg: "" })))).toBe("[图片]")
    expect(preview(toMessage(row({ MsgType: 7, Msg: "", FileName: "log.txt" })))).toBe("[文件]log.txt")
    expect(preview(toMessage(row({ MsgType: 245, Msg: "", FileName: "聊天记录" })))).toBe("[合并转发]聊天记录")
    expect(preview(toMessage(row({ MsgType: 999, Msg: "" })))).toBe("[消息]")
  })
})

describe("isOutgoing", () => {
  test("只按发送账号判定，账号为空时不算", () => {
    const message = toMessage(row())
    expect(isOutgoing(message, "cs20254801")).toBe(true)
    expect(isOutgoing(message, "")).toBe(false)
  })
})

describe("text 判定", () => {
  test("normalizeText 做全角转半角、去标点并小写", () => {
    expect(normalizeText("你好，ＡＢＣ！")).toBe("你好abc")
  })

  test("纯表情与纯链接", () => {
    expect(isEmojiOnly("😀👍")).toBe(true)
    expect(isEmojiOnly("你好🙂")).toBe(false)
    expect(isLinkOnly("https://example.com/a?b=1")).toBe(true)
    expect(isLinkOnly("看这个 https://example.com")).toBe(false)
    expect(isLinkOnly("没有链接")).toBe(false)
  })
})
