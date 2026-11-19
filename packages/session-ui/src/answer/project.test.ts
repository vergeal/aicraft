import { describe, expect, test } from "bun:test"
import type { SessionMessageAssistant, SessionMessageInfo } from "@opencode/client/promise"
import { projectTimeline } from "./project"

type Content = SessionMessageAssistant["content"][number]

const user = (id: string, text: string, created: number) =>
  ({ id, type: "user", text, time: { created } }) satisfies SessionMessageInfo

const assistant = (id: string, created: number, content: Content[], completed?: number) => {
  const time = completed === undefined ? { created } : { created, completed }

  return {
    id,
    type: "assistant",
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content,
    time,
  } satisfies SessionMessageInfo
}

const text = (value: string): Content => ({ type: "text", text: value })

const reasoning = (value: string): Content => ({ type: "reasoning", text: value, time: { created: 1, completed: 2 } })

const tool = (id: string, name = "read"): Content => ({
  type: "tool",
  id,
  name,
  state: {
    status: "completed",
    input: { filePath: "src/a.ts" },
    content: [{ type: "text", text: "export const a = 1" }],
    metadata: {},
  },
  time: { created: 2, completed: 3 },
})

describe("answer projection", () => {
  test("folds a settled turn's process between its input and answer", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [reasoning("thinking"), tool("tool_1")], 10),
      assistant("msg_3", 11, [text("answer")], 20),
      { id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 21 } } satisfies SessionMessageInfo,
    ])

    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["node", "fold", "node"])
    expect(snapshot.children.get(1)?.map((child) => child.kind)).toEqual(["group"])
    expect([...snapshot.groups.values()].map((group) => group.counts)).toEqual([[{ kind: "read", count: 1 }]])

    const turn = snapshot.turns.get(1)
    expect(turn?.foldable).toBe(true)
    expect(turn?.processStart).toBe(1)
    expect(turn?.answer).toBe(3)
    expect(turn?.elapsedMs).toBe(19)

    // Search and part reveal address rows by the timeline's content-part identity.
    expect(snapshot.nodes.get("input:msg_1")?.partID).toBe("msg_1:text:0")
    expect(snapshot.nodes.get("reasoning:msg_2:0")?.partID).toBe("msg_2:reasoning:0")
    expect(snapshot.nodes.get("assistant:msg_3:0")?.partID).toBe("msg_3:text:0")
    expect(snapshot.nodes.get("tool:msg_2:tool_1")?.partID).toBe("tool_1")
  })

  test("ranks a group by category count and keeps one contiguous run", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant(
        "msg_2",
        2,
        [{ type: "text", text: "lead" }, tool("tool_1", "read"), tool("tool_2", "grep"), reasoning("thinking")],
        10,
      ),
      assistant("msg_3", 11, [text("answer")], 20),
    ])

    expect(snapshot.children.get(1)?.map((child) => child.kind)).toEqual(["node", "group"])
    expect([...snapshot.groups.values()].map((group) => group.counts)).toEqual([
      [
        { kind: "read", count: 1 },
        { kind: "search", count: 1 },
      ],
    ])
  })

  test("keeps a running turn open and unfolds its process", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [tool("tool_1"), text("partial")]),
    ])

    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["node", "fold", "node"])
    expect(snapshot.turns.get(1)?.status).toBe("open")
    expect(snapshot.turns.get(1)?.foldable).toBe(false)
    expect(snapshot.children.get(1)?.map((child) => child.kind)).toEqual(["group"])
    expect([...snapshot.groups.values()].map((group) => group.members.length)).toEqual([1])
  })

  test("fold step summaries into their step group", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [reasoning("thinking"), text("phase reply"), tool("tool_1"), text("answer")], 9),
    ])

    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["node", "fold", "node"])
    expect(snapshot.children.get(1)?.map((child) => child.kind)).toEqual(["group", "node", "group"])
    expect(snapshot.nodes.get("assistant:msg_2:0")?.payload).toMatchObject({ kind: "assistant", text: "phase reply" })

    const [first, second] = [...snapshot.groups.values()]
    expect(first?.members.map((key) => snapshot.nodes.get(key)?.payload.kind)).toEqual(["reasoning"])
    expect(first?.counts).toEqual([])
    expect(second?.members.map((key) => snapshot.nodes.get(key)?.payload.kind)).toEqual(["tool"])
    expect(snapshot.turns.get(1)?.answer).toBe(4)
  })

  test("keeps only the newest run of a running turn live", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [reasoning("first"), text("phase"), tool("tool_1")], 5),
      assistant("msg_3", 6, [reasoning("second"), text("partial")]),
    ])

    expect(snapshot.children.get(1)?.map((child) => child.kind)).toEqual(["group", "node", "group"])
    expect([...snapshot.groups.values()].map((group) => group.closed)).toEqual([true, false])
    expect([...snapshot.groups.values()].at(-1)?.running).toBe("thinking")
    expect(snapshot.turns.get(1)?.status).toBe("open")
  })

  test("counts only tools, never phase replies or reasoning", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant(
        "msg_2",
        2,
        [reasoning("thinking"), { type: "text", text: "phase reply" }, tool("tool_1"), { type: "text", text: "answer" }],
        9,
      ),
    ])

    expect([...snapshot.groups.values()].map((group) => group.counts)).toEqual([
      [],
      [{ kind: "read", count: 1 }],
    ])
    expect(snapshot.children.get(1)?.map((child) => child.kind)).toEqual(["group", "node", "group"])
    expect(snapshot.nodes.get("assistant:msg_2:0")?.payload).toMatchObject({ kind: "assistant", text: "phase reply" })

    const first = [...snapshot.groups.values()][0]
    expect(first?.members.map((key) => snapshot.nodes.get(key)?.payload.kind)).toEqual(["reasoning"])
  })

  test("keeps the last turn open until the server marks it idle", () => {
    const step = (id: string, created: number, completed: number) =>
      assistant(id, created, [reasoning("step"), tool("tool_1")], completed)

    const afterStepOne = projectTimeline([user("msg_1", "go", 1), step("msg_2", 2, 5)])
    expect(afterStepOne.turns.get(1)?.status).toBe("open")

    const afterStepTwo = projectTimeline([
      user("msg_1", "go", 1),
      step("msg_2", 2, 5),
      step("msg_3", 6, 9),
    ])

    expect(afterStepTwo.turns.get(1)?.status).toBe("open")

    // A completed final answer does not close the turn: the next step may still arrive, and closing
    // here would collapse the transcript between two steps.
    const afterFinal = projectTimeline([
      user("msg_1", "go", 1),
      step("msg_2", 2, 5),
      step("msg_3", 6, 9),
      assistant("msg_4", 10, [text("final answer")], 12),
    ])

    expect(afterFinal.turns.get(1)?.status).toBe("open")
  })

  test("splits one message into a group per thought and summary", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant(
        "msg_2",
        2,
        [
          reasoning("first"),
          { type: "text", text: "step one" },
          tool("tool_1"),
          reasoning("second"),
          { type: "text", text: "step two" },
          tool("tool_2", "grep"),
          { type: "text", text: "final answer" },
        ],
        9,
      ),
    ])

    const groups = [...snapshot.groups.values()]

    expect(groups.map((group) => group.members.length)).toEqual([1, 2, 1])
    expect(groups.map((group) => group.counts)).toEqual([
      [],
      [{ kind: "read", count: 1 }],
      [{ kind: "search", count: 1 }],
    ])
    expect(snapshot.children.get(1)?.map((child) => child.kind)).toEqual([
      "group",
      "node",
      "group",
      "node",
      "group",
    ])
  })

  test("keeps text produced before a call above that call", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant(
        "msg_2",
        2,
        [{ type: "text", text: "lead in" }, tool("tool_1"), { type: "text", text: "after call" }, tool("tool_2", "grep")],
        9,
      ),
      assistant("msg_3", 10, [text("final answer")], 12),
    ])

    expect(snapshot.children.get(1)?.map((child) => child.kind)).toEqual(["node", "group", "node", "group"])
    expect([...snapshot.groups.values()].map((group) => group.members.length)).toEqual([1, 1])
  })

  test("does not treat a reply followed by work as the answer", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [{ type: "text", text: "step summary" }, tool("tool_1")], 9),
    ])

    expect(snapshot.turns.get(1)?.answer).toBeNull()
    expect(snapshot.turns.get(1)?.status).toBe("open")
    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["node", "fold"])
  })

  test("closes a turn when the server marks it idle", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [{ type: "text", text: "step summary" }, tool("tool_1")], 9),
      { id: "msg_3", type: "idle", outcome: "succeeded", time: { created: 10 } } satisfies SessionMessageInfo,
    ])

    expect(snapshot.turns.get(1)?.status).toBe("closed")
    expect(snapshot.turns.get(1)?.answer).toBeNull()
  })

  test("keeps row keys stable across streamed deltas", () => {
    const before = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("par")]),
    ])

    const after = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("partial answer")]),
    ])

    expect([...after.nodes.keys()]).toEqual([...before.nodes.keys()])
    expect(after.entries).toEqual(before.entries)
  })

  test("gives an injected notice its own context group", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [tool("tool_1")], 5),
      { id: "msg_3", type: "system", text: "note", time: { created: 6 } } satisfies SessionMessageInfo,
      assistant("msg_4", 7, [text("answer")], 8),
    ])

    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["node", "fold", "node"])
    expect(snapshot.nodes.get("notice:msg_3")?.payload).toEqual({ kind: "notice", text: "note" })
    expect(snapshot.children.get(1)?.map((child) => child.kind)).toEqual(["group"])
    expect([...snapshot.groups.values()].map((group) => group.counts)).toEqual([
      [
        { kind: "read", count: 1 },
        { kind: "context", count: 1 },
      ],
    ])
  })

  test("keeps the injected context body as a notice detail", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      {
        id: "msg_2",
        type: "synthetic",
        text: "来自以下文件的指令：AGENTS.md\n\n# AGENTS\n\n先读项目说明。",
        description: "已加载 AGENTS.md",
        time: { created: 2 },
      } satisfies SessionMessageInfo,
    ])

    expect(snapshot.nodes.get("notice:msg_2")?.payload).toEqual({
      kind: "notice",
      text: "已加载 AGENTS.md",
      detail: "来自以下文件的指令：AGENTS.md\n\n# AGENTS\n\n先读项目说明。",
    })
  })

  test("keeps an injected context step when the turn has no calls", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      {
        id: "msg_2",
        type: "synthetic",
        text: "来自以下文件的指令：a\n\n第一条。",
        description: "已加载 a",
        time: { created: 2 },
      } satisfies SessionMessageInfo,
      {
        id: "msg_3",
        type: "synthetic",
        text: "来自以下文件的指令：b\n\n第二条。",
        description: "已加载 b",
        time: { created: 3 },
      } satisfies SessionMessageInfo,
    ])

    const children = snapshot.children.get(1) ?? []
    expect(children.map((child) => child.kind)).toEqual(["group"])
    const group = children[0]?.kind === "group" ? snapshot.groups.get(children[0].key) : undefined
    expect(group?.counts).toEqual([{ kind: "context", count: 2 }])
  })
})
