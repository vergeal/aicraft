import { describe, expect, test } from "bun:test"
import type { SessionMessageAssistant, SessionMessageInfo } from "@aicraft/client/promise"
import { flowGapPx, projectTimeline } from "./project"
import type { Snapshot } from "./types"

type Content = SessionMessageAssistant["content"][number]

/** The rows the turn's folds lay out, in order. A prompt steered into a running turn splits it into stretches. */
const childrenOf = (snapshot: Snapshot, turn: number) =>
  snapshot.entries.flatMap((entry) => (entry.kind === "fold" && entry.turn === turn ? entry.children : []))

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
    expect(childrenOf(snapshot, 1).map((child) => child.kind)).toEqual(["group", "node"])
    expect([...snapshot.groups.values()].map((group) => group.counts)).toEqual([[{ kind: "read", count: 1 }]])

    const turn = snapshot.turns.get(1)
    expect(turn?.foldable).toBe(true)
    expect(turn?.processStart).toBe("reasoning:msg_2:0")
    expect(turn?.answer).toBe("assistant:msg_3:0")
    expect(turn?.elapsedMs).toBe(19)

    // Search and part reveal address rows by the timeline's content-part identity.
    expect(snapshot.nodes.get("input:msg_1")?.partID).toBe("msg_1:text:0")
    expect(snapshot.nodes.get("reasoning:msg_2:0")?.partID).toBe("msg_2:reasoning:0")
    expect(snapshot.nodes.get("assistant:msg_3:0")?.partID).toBe("msg_3:text:0")
    expect(snapshot.nodes.get("tool:msg_2:tool_1")?.partID).toBe("tool_1")
  })

  test("reuses the payload of every row a delta did not touch", () => {
    const toolContent = tool("tool_1")
    const settled = [user("msg_1", "go", 1), assistant("msg_2", 2, [toolContent], 10)]
    const first = projectTimeline([...settled, assistant("msg_3", 11, [text("answer")])])
    const second = projectTimeline([...settled, assistant("msg_3", 11, [text("answer, streamed further")])], first)

    // Same text in a rebuilt message object still reuses the payload: the check is by value.
    expect(second.nodes.get("input:msg_1")?.payload).toBe(first.nodes.get("input:msg_1")?.payload)
    expect(second.nodes.get("tool:msg_2:tool_1")?.payload).toBe(first.nodes.get("tool:msg_2:tool_1")?.payload)
    expect(second.nodes.get("assistant:msg_3:0")?.payload).not.toBe(first.nodes.get("assistant:msg_3:0")?.payload)
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

    expect(childrenOf(snapshot, 1).map((child) => child.kind)).toEqual(["node", "group", "node"])
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
    expect(childrenOf(snapshot, 1).map((child) => child.kind)).toEqual(["group", "node"])
    expect([...snapshot.groups.values()].map((group) => group.members.length)).toEqual([1])
  })

  test("a delivered steer joins the running turn instead of settling the step it interrupts", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("progress")], 5),
      user("msg_3", "steer", 6),
      assistant("msg_4", 7, [text("answer")], 10),
    ])

    // The turn ends at the idle marker, so the stepped-in prompt never closes the work before it and
    // the mid-run text never poses as the answer.
    expect(snapshot.turns.size).toBe(1)
    expect(snapshot.turns.get(1)?.status).toBe("open")
    expect(snapshot.turns.get(1)?.answer).toBe("assistant:msg_4:0")

    const nodes = snapshot.entries.filter((entry) => entry.kind === "node").map((entry) => entry.key)
    expect(nodes).toEqual(["input:msg_1", "input:msg_3", "assistant:msg_4:0"])
  })

  // What the reader reported: after a steer the run kept working above their own prompt, so it read as though the
  // prompt had never landed. The prompt cuts the process, and the work it set off lies below it.
  test("a steered prompt splits the work the run does after it", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [tool("tool_1")], 5),
      user("msg_3", "steer", 6),
      assistant("msg_4", 7, [tool("tool_2"), text("answer")], 10),
    ])

    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["node", "fold", "node", "fold", "node"])
    expect(snapshot.turns.get(1)?.interleaved).toBe(true)

    const folds = snapshot.entries.flatMap((entry) => (entry.kind === "fold" ? [entry] : []))

    // The messages each stretch lays out: the work the prompt set off belongs to the stretch below it.
    const stretched = folds.map((fold) =>
      fold.children.flatMap((child) =>
        child.kind === "node"
          ? [snapshot.nodes.get(child.key)?.messageID]
          : (snapshot.groups.get(child.key)?.members ?? []).map((key) => snapshot.nodes.get(key)?.messageID),
      ),
    )

    expect(folds.map((fold) => fold.turn)).toEqual([1, 1])
    expect(stretched).toEqual([["msg_2"], ["msg_4", "msg_4"]])
  })

  // What the reader reported: the run took a steered prompt up with work before it said anything, and that work
  // stayed in the stretch above the bubble until the step's first words landed.
  test("a steered prompt splits work that has no reply text yet", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("progress"), tool("tool_1")], 5),
      user("msg_3", "steer", 6),
      assistant("msg_4", 7, [tool("tool_2")], 8),
    ])

    const stretched = (from: number) =>
      snapshot.entries.slice(from).flatMap((entry) =>
        entry.kind === "fold"
          ? entry.children.flatMap((child) =>
              child.kind === "node"
                ? [snapshot.nodes.get(child.key)?.messageID]
                : (snapshot.groups.get(child.key)?.members ?? []).map((key) => snapshot.nodes.get(key)?.messageID),
            )
          : [],
      )

    const steer = snapshot.entries.findIndex((entry) => entry.kind === "node" && entry.key === "input:msg_3")

    // The step the prompt set off belongs below it, and the stretch above keeps only the work before it.
    expect(steer).toBeGreaterThanOrEqual(0)
    expect(stretched(steer + 1)).toEqual(["msg_4"])
    expect(stretched(0).slice(0, -1)).toContain("msg_2")
  })

  test("an interrupted turn still settles on its last text, footer and all", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      { ...assistant("msg_2", 2, [text("stopped mid-way")], 5), error: { type: "abort", message: "aborted" } },
    ])

    expect(snapshot.turns.get(1)?.status).toBe("stopped")
    expect(snapshot.turns.get(1)?.answer).toBe("assistant:msg_2:0")
  })

  // What the reader reported: a run stopped while it was reading images left its step commentary holding the footer.
  test("a turn stopped inside a tool call has no closing reply to act on", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("渲染跑通了，两栏都没裁切。看实际画面。"), tool("tool_1")], 5),
      { ...assistant("msg_3", 6, [tool("tool_2")], 8), error: { type: "abort", message: "aborted" } },
    ])

    expect(snapshot.turns.get(1)?.status).toBe("stopped")
    expect(snapshot.turns.get(1)?.answer).toBeNull()
  })

  test("a closed turn keeps its last text as the reply when tools ran beside it", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("先看切分逻辑。"), tool("tool_1")], 4),
      assistant("msg_3", 5, [text("改好了，回归测试也补上了。"), tool("tool_2")], 7),
      { id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 8 } } satisfies SessionMessageInfo,
    ])

    expect(snapshot.turns.get(1)?.status).toBe("closed")
    expect(snapshot.turns.get(1)?.answer).toBe("assistant:msg_3:0")
  })

  test("a steer still waiting for delivery sits below the streaming reply", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("streaming")]),
      user("msg_3", "steer", 3),
    ])

    expect(snapshot.turns.size).toBe(1)
    expect(snapshot.turns.get(1)?.status).toBe("open")

    const nodes = snapshot.entries.filter((entry) => entry.kind === "node").map((entry) => entry.key)
    expect(nodes).toEqual(["input:msg_1", "assistant:msg_2:0", "input:msg_3"])

    // Nothing answered it yet, so it splits no stretch of the process: one fold holds the work in flight.
    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["node", "fold", "node", "node"])
  })

  test("fold step summaries into their step group", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [reasoning("thinking"), text("phase reply"), tool("tool_1"), text("answer")], 9),
    ])

    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["node", "fold", "node"])
    expect(childrenOf(snapshot, 1).map((child) => child.kind)).toEqual(["group", "node", "group", "node"])
    expect(snapshot.nodes.get("assistant:msg_2:0")?.payload).toMatchObject({ kind: "assistant", text: "phase reply" })

    const [first, second] = [...snapshot.groups.values()]
    expect(first?.members.map((key) => snapshot.nodes.get(key)?.payload.kind)).toEqual(["reasoning"])
    expect(first?.counts).toEqual([])
    expect(second?.members.map((key) => snapshot.nodes.get(key)?.payload.kind)).toEqual(["tool"])
    expect(snapshot.turns.get(1)?.answer).toBe("assistant:msg_2:1")
  })

  test("keeps only the newest run of a running turn live", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [reasoning("first"), text("phase"), tool("tool_1")], 5),
      assistant("msg_3", 6, [reasoning("second"), text("partial")]),
    ])

    expect(childrenOf(snapshot, 1).map((child) => child.kind)).toEqual(["group", "node", "group", "node"])
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
    expect(childrenOf(snapshot, 1).map((child) => child.kind)).toEqual(["group", "node", "group", "node"])
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

  // The idle marker closes a busy period, not the turn: a doorbell successor (a background job settling,
  // a subagent report, a moved or compacted continuation) keeps working with no input row in between.
  test("a successor step after the idle marker reopens the turn", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 5),
      { id: "msg_idle_1", type: "idle", outcome: "succeeded", time: { created: 6 } } satisfies SessionMessageInfo,
      assistant("msg_3", 7, [tool("tool_1")]),
    ])

    expect(snapshot.turns.size).toBe(1)
    expect(snapshot.turns.get(1)?.status).toBe("open")
  })

  test("the successor's own marker closes the turn again", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 5),
      { id: "msg_idle_1", type: "idle", outcome: "succeeded", time: { created: 6 } } satisfies SessionMessageInfo,
      assistant("msg_3", 7, [text("follow-up")], 9),
      { id: "msg_idle_2", type: "idle", outcome: "succeeded", time: { created: 10 } } satisfies SessionMessageInfo,
    ])

    expect(snapshot.turns.size).toBe(1)
    expect(snapshot.turns.get(1)?.status).toBe("closed")
    expect(snapshot.turns.get(1)?.answer).toBe("assistant:msg_3:0")
  })

  test("an execution-level failed marker reads as a failed turn", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [tool("tool_1")], 5),
      {
        id: "msg_idle",
        type: "idle",
        outcome: "failed",
        error: { type: "exhausted", message: "Execution was interrupted repeatedly and will not be resumed." },
        time: { created: 6 },
      } satisfies SessionMessageInfo,
    ])

    expect(snapshot.turns.get(1)?.status).toBe("failed")
    expect(snapshot.nodes.get("error:msg_idle")?.payload.kind).toBe("error")
  })

  test("an interrupted marker with no step error reads as stopped", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("cut short")], 5),
      { id: "msg_idle", type: "idle", outcome: "interrupted", time: { created: 6 } } satisfies SessionMessageInfo,
    ])

    expect(snapshot.turns.get(1)?.status).toBe("stopped")
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
    expect(childrenOf(snapshot, 1).map((child) => child.kind)).toEqual([
      "group",
      "node",
      "group",
      "node",
      "group",
      "node",
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

    expect(childrenOf(snapshot, 1).map((child) => child.kind)).toEqual(["node", "group", "node", "group", "node"])
    expect([...snapshot.groups.values()].map((group) => group.members.length)).toEqual([1, 1])
  })

  test("treats the last reply with text as the answer even when work follows", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [{ type: "text", text: "step summary" }, tool("tool_1")], 9),
    ])

    expect(snapshot.turns.get(1)?.answer).toBe("assistant:msg_2:0")
    expect(snapshot.turns.get(1)?.status).toBe("open")
    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["node", "fold", "node"])
  })

  test("keeps the reply as the answer when a notice trails the turn", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 4),
      {
        id: "msg_3",
        type: "system",
        text: "指令有变化：core/project",
        description: "Instructions updated: core/project",
        metadata: { notice: "instructions" },
        time: { created: 5 },
      } satisfies SessionMessageInfo,
      { id: "msg_4", type: "idle", outcome: "succeeded", time: { created: 6 } } satisfies SessionMessageInfo,
    ])

    expect(snapshot.turns.get(1)?.answer).toBe("assistant:msg_2:0")
    expect(snapshot.turns.get(1)?.status).toBe("closed")
    expect(snapshot.entries.map((entry) => entry.kind)).toEqual(["node", "fold", "node"])
  })

  test("closes a turn when the server marks it idle", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [{ type: "text", text: "step summary" }, tool("tool_1")], 9),
      { id: "msg_3", type: "idle", outcome: "succeeded", time: { created: 10 } } satisfies SessionMessageInfo,
    ])

    expect(snapshot.turns.get(1)?.status).toBe("closed")
    expect(snapshot.turns.get(1)?.answer).toBe("assistant:msg_2:0")
  })

  test("keeps row keys stable across streamed deltas", () => {
    const before = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("par")]),
    ])

    const after = projectTimeline(
      [
        user("msg_1", "go", 1),
        assistant("msg_2", 2, [text("partial answer")]),
      ],
      before,
    )

    expect([...after.nodes.keys()]).toEqual([...before.nodes.keys()])
    expect(after.entries).toEqual(before.entries)
    // A delta replaces only the row it touched. Everything else keeps its object, which is what stops mounted
    // rows from re-rendering on every streamed frame.
    expect(after.entries).toBe(before.entries)
    expect(after.nodes.get("input:msg_1")).toBe(before.nodes.get("input:msg_1"))
    expect(after.nodes.get("assistant:msg_2:0")).not.toBe(before.nodes.get("assistant:msg_2:0"))
    expect(after.turns.get(1)).toBe(before.turns.get(1))
  })

  test("keeps legacy context sources recorded before injected text was captured", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      {
        ...assistant("msg_2", 2, [tool("tool_1")], 5),
        metadata: {
          context: [
            { key: "system", chars: 1000 },
            { key: "core/instructions", chars: 17325 },
          ],
        },
      } satisfies SessionMessageInfo,
    ])

    expect(snapshot.nodes.get("context:msg_2")?.payload).toEqual({
      kind: "context",
      change: "inject",
      sources: [
        { key: "system", chars: 1000 },
        { key: "core/instructions", chars: 17325 },
      ],
    })
  })

  test("shows an instruction update through localized notice copy", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      {
        id: "msg_2",
        type: "system",
        text: "指令有变化：core/project",
        description: "Instructions updated: core/project",
        metadata: { notice: "instructions" },
        time: { created: 2 },
      } satisfies SessionMessageInfo,
      assistant("msg_3", 3, [text("answer")], 4),
    ])

    expect(snapshot.nodes.get("notice:msg_2")?.payload).toEqual({
      kind: "notice",
      text: "",
      detail: "指令有变化：core/project",
      notice: "instructions-updated",
    })
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
    expect(childrenOf(snapshot, 1).map((child) => child.kind)).toEqual(["group", "node"])
    expect([...snapshot.groups.values()].map((group) => group.counts)).toEqual([
      [
        { kind: "read", count: 1 },
        { kind: "context", count: 1 },
      ],
    ])
  })

  test("shows the context a step injected from its assistant message", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      {
        ...assistant("msg_2", 2, [tool("tool_1")], 5),
        metadata: {
          context: [
            {
              key: "core/instructions",
              chars: 12,
              text: "来自 a.md 的指令",
              items: [{ name: "a.md", chars: 8, text: "项目说明" }],
            },
            { key: "session", chars: 30, text: "会话说明" },
          ],
        },
      } satisfies SessionMessageInfo,
    ])

    expect(snapshot.nodes.get("context:msg_2")?.payload).toEqual({
      kind: "context",
      change: "inject",
      sources: [
        {
          key: "core/instructions",
          chars: 12,
          text: "来自 a.md 的指令",
          items: [{ name: "a.md", chars: 8, text: "项目说明" }],
        },
        { key: "session", chars: 30, text: "会话说明" },
      ],
    })
    expect(childrenOf(snapshot, 1).map((child) => child.kind)).toEqual(["group"])
    expect([...snapshot.groups.values()][0]?.counts).toEqual([
      { kind: "context", count: 1 },
      { kind: "read", count: 1 },
    ])
  })

  test("reports the injected context only when it changes", () => {
    const sources = (instructions: string) => [
      { key: "system", chars: 4, text: "sys\n" },
      { key: "core/instructions", chars: instructions.length, text: instructions },
    ]

    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      { ...assistant("msg_2", 2, [tool("tool_1")], 3), metadata: { context: sources("a") } } satisfies SessionMessageInfo,
      { ...assistant("msg_3", 4, [tool("tool_2")], 5), metadata: { context: sources("a") } } satisfies SessionMessageInfo,
      { ...assistant("msg_4", 6, [tool("tool_3")], 7), metadata: { context: sources("b") } } satisfies SessionMessageInfo,
    ])

    // The first injection lists the whole baseline; a change lists only the source that differs.
    expect(snapshot.nodes.get("context:msg_2")?.payload).toMatchObject({
      change: "inject",
      sources: sources("a"),
    })
    expect(snapshot.nodes.has("context:msg_3")).toBe(false)
    expect(snapshot.nodes.get("context:msg_4")?.payload).toMatchObject({
      change: "change",
      sources: [{ key: "core/instructions", chars: 1, text: "b" }],
    })
  })

  test("keeps the injected context body as a notice detail", () => {    const snapshot = projectTimeline([
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

    const children = childrenOf(snapshot, 1)
    expect(children.map((child) => child.kind)).toEqual(["group"])
    const group = children[0]?.kind === "group" ? snapshot.groups.get(children[0].key) : undefined
    expect(group?.counts).toEqual([{ kind: "context", count: 2 }])
  })

  test("folds consecutive identical steps into one repeat item", () => {
    const edit = (id: string, filePath: string): Content => ({
      type: "tool",
      id,
      name: "edit",
      state: { status: "completed", input: { filePath }, content: [{ type: "text", text: "ok" }], metadata: {} },
      time: { created: 2, completed: 3 },
    })

    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant(
        "msg_2",
        2,
        [edit("tool_1", "src/a.ts"), edit("tool_2", "src/a.ts"), edit("tool_3", "src/b.ts"), edit("tool_4", "src/b.ts"), edit("tool_5", "src/b.ts")],
        10,
      ),
      assistant("msg_3", 11, [text("answer")], 20),
    ])

    const group = [...snapshot.groups.values()][0]

    expect(group?.items.map((item) => item.kind)).toEqual(["repeat", "repeat"])
    expect(group?.items.map((item) => (item.kind === "repeat" ? item.members.length : 1))).toEqual([2, 3])
    // Folding the rows does not change what the step counted: five edits stay five.
    expect(group?.counts).toEqual([{ kind: "edit", count: 5 }])
  })

  test("folds consecutive identical steps of every kind, not only edits", () => {
    const call = (id: string, name: string, input: Record<string, string>): Content => ({
      type: "tool",
      id,
      name,
      state: { status: "completed", input, content: [{ type: "text", text: "ok" }], metadata: {} },
      time: { created: 2, completed: 3 },
    })

    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant(
        "msg_2",
        2,
        [
          call("read_1", "read", { filePath: "src/a.ts" }),
          call("read_2", "read", { filePath: "src/a.ts" }),
          call("grep_1", "grep", { pattern: "needle" }),
          call("grep_2", "grep", { pattern: "needle" }),
          call("shell_1", "shell", { command: "bun test" }),
          call("shell_2", "shell", { command: "bun test" }),
          reasoning("first"),
          reasoning("second"),
        ],
        10,
      ),
      assistant("msg_3", 11, [text("answer")], 20),
    ])

    const group = [...snapshot.groups.values()][0]

    expect(group?.items.map((item) => item.kind)).toEqual(["repeat", "repeat", "repeat", "repeat"])
    expect(group?.items.map((item) => (item.kind === "repeat" ? item.members.length : 1))).toEqual([2, 2, 2, 2])
  })

  test("keeps a different neighbour out of a repeat run", () => {
    const edit = (id: string): Content => ({
      type: "tool",
      id,
      name: "edit",
      state: { status: "completed", input: { filePath: "src/a.ts" }, content: [{ type: "text", text: "ok" }], metadata: {} },
      time: { created: 2, completed: 3 },
    })

    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [edit("tool_1"), edit("tool_2"), reasoning("thinking"), edit("tool_3")], 10),
      assistant("msg_3", 11, [text("answer")], 20),
    ])

    const group = [...snapshot.groups.values()][0]

    // Only the two adjacent edits fold; reasoning breaks the run and the third edit stands alone.
    expect(group?.items.map((item) => item.kind)).toEqual(["repeat", "row", "row"])
    expect(group?.items[0]?.kind === "repeat" ? group.items[0].members.length : 0).toBe(2)
  })

  test("lets a later step replace an earlier step's failure", () => {
    const failed = {
      ...assistant("msg_2", 2, [], 3),
      error: { type: "ProviderError", message: "OpenAI Chat stream ended without finish_reason" },
    } satisfies SessionMessageInfo

    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      failed,
      assistant("msg_3", 4, [text("continuing")]),
    ])

    expect([...snapshot.nodes.values()].map((node) => node.payload.kind)).toEqual(["input", "assistant"])
    expect(snapshot.turns.get(1)?.status).toBe("open")
  })

  test("keeps the last step's failure", () => {
    const failed = {
      ...assistant("msg_2", 2, [], 3),
      error: { type: "ProviderError", message: "OpenAI Chat stream ended without finish_reason" },
    } satisfies SessionMessageInfo

    const snapshot = projectTimeline([user("msg_1", "go", 1), failed])

    expect([...snapshot.nodes.values()].map((node) => node.payload.kind)).toEqual(["input", "error"])
    expect(snapshot.turns.get(1)?.status).toBe("failed")
  })

  test("drops a retry label once the execution settles", () => {
    const retrying = {
      ...assistant("msg_2", 2, []),
      retry: {
        attempt: 2,
        at: 100,
        error: { type: "ProviderError", message: "OpenAI Chat stream ended without finish_reason" },
      },
    } satisfies SessionMessageInfo

    const pending = projectTimeline([user("msg_1", "go", 1), retrying])
    expect(pending.nodes.get("retry:msg_2")?.payload.kind).toBe("retry")

    const settled = projectTimeline([
      user("msg_1", "go", 1),
      retrying,
      { id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 4 } } satisfies SessionMessageInfo,
    ])

    expect([...settled.nodes.values()].map((node) => node.payload.kind)).toEqual(["input"])
  })

  test("sums the files a turn changed once, and keeps the list a delta did not touch", () => {
    const edit = (id: string, file: string, additions: number, deletions: number): Content => ({
      type: "tool",
      id,
      name: "edit",
      state: {
        status: "completed",
        input: { filePath: file },
        content: [{ type: "text", text: "ok" }],
        metadata: { files: [{ file, patch: "", additions, deletions, status: "modified" }] },
      },
      time: { created: 2, completed: 3 },
    })

    const rows = [edit("tool_1", "src/a.ts", 2, 1), edit("tool_2", "src/a.ts", 3, 0), edit("tool_3", "src/b.ts", 1, 4)]
    const before = projectTimeline([user("msg_1", "go", 1), assistant("msg_2", 2, rows, 10)])

    // One path counts once per turn, summed across every step that recorded it.
    expect(before.changes.get(1)).toEqual([
      { path: "src/a.ts", additions: 5, deletions: 1 },
      { path: "src/b.ts", additions: 1, deletions: 4 },
    ])

    const after = projectTimeline([user("msg_1", "go", 1), assistant("msg_2", 2, [...rows, text("more")], 10)], before)

    expect(after.changes.get(1)).toBe(before.changes.get(1))
  })

  const shellWake = (id: string, created: number, state = "completed") => ({
    id,
    type: "synthetic",
    text: `<shell id="sh_1" state="${state}" command="npm test 2>&1">\n1 passing\n</shell>`,
    description: "npm test 2>&1",
    metadata: { source: "shell", state, shellID: "sh_1" },
    time: { created },
  }) satisfies SessionMessageInfo

  test("a background wake after the answer owns its block, so the prompt keeps its reply", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      { id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 11 } } satisfies SessionMessageInfo,
      shellWake("msg_wake", 12),
      assistant("msg_3", 13, [tool("tool_1"), text("woke reply")], 20),
      { id: "msg_idle2", type: "idle", outcome: "succeeded", time: { created: 21 } } satisfies SessionMessageInfo,
    ])

    // The report opens a turn of its own; the run it wakes hangs off it instead of off the question.
    expect(snapshot.turns.get(1)?.answer).toBe("assistant:msg_2:0")
    expect(snapshot.nodes.get("notice:msg_wake")?.turn).toBe(2)
    expect(snapshot.turns.get(2)?.answer).toBe("assistant:msg_3:0")

    // The block lays flat above the folded process, so the reader sees what woke the segment closed.
    expect(snapshot.entries.some((entry) => entry.kind === "node" && entry.key === "notice:msg_wake")).toBe(true)
    const fold = snapshot.entries.find((entry) => entry.kind === "fold" && entry.turn === 2)
    expect(fold?.kind === "fold" && fold.children.some((child) => child.key === "notice:msg_wake")).toBe(false)

    // The block carries the call and the captured output for the reader to expand.
    const notice = snapshot.nodes.get("notice:msg_wake")?.payload
    expect(notice?.kind === "notice" && notice.wake?.source).toBe("shell")
    expect(notice?.kind === "notice" && notice.wake?.command).toBe("npm test 2>&1")
    expect(notice?.kind === "notice" && notice.wake?.output).toBe("1 passing")
  })

  test("a queued background wake rides the settled turn until delivery", () => {
    const snapshot = projectTimeline(
      [
        user("msg_1", "go", 1),
        assistant("msg_2", 2, [text("answer")], 10),
        { id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 11 } } satisfies SessionMessageInfo,
        shellWake("msg_wake", 12),
      ],
      undefined,
      new Set(["msg_wake"]),
    )

    // Undelivered, it is queued input: the question keeps its answer slot and the wake stays one line.
    expect(snapshot.nodes.get("notice:msg_wake")?.turn).toBe(1)
    const notice = snapshot.nodes.get("notice:msg_wake")?.payload
    expect(notice?.kind === "notice" && notice.wake).toBeUndefined()
  })

  test("batched wakes share the one block the first opened", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      { id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 11 } } satisfies SessionMessageInfo,
      shellWake("msg_wake_a", 12),
      shellWake("msg_wake_b", 12),
      assistant("msg_3", 13, [text("woke reply")], 20),
    ])

    // Only a report interrupting finished work splits: the second arrives while its segment has no
    // work yet, so it rides the first wake's turn instead of opening another block.
    expect(snapshot.nodes.get("notice:msg_wake_a")?.turn).toBe(2)
    expect(snapshot.nodes.get("notice:msg_wake_b")?.turn).toBe(2)
    const second = snapshot.nodes.get("notice:msg_wake_b")?.payload
    expect(second?.kind === "notice" && second.wake).toBeUndefined()
  })

  // A long mixed session: an answered turn, a wake that splits its own segment, and a later plain prompt.
  const mixed = () => [
    user("msg_1", "go", 1),
    assistant("msg_2", 2, [tool("tool_1"), text("answer")], 10),
    { id: "idle_1", type: "idle", outcome: "succeeded", time: { created: 11 } } satisfies SessionMessageInfo,
    shellWake("msg_wake", 12),
    assistant("msg_3", 13, [tool("tool_2"), text("woke reply")], 20),
    { id: "idle_2", type: "idle", outcome: "succeeded", time: { created: 21 } } satisfies SessionMessageInfo,
    user("msg_4", "next", 22),
    assistant("msg_5", 23, [text("last answer")], 30),
  ]

  /** The top-level rows of the flow, folds named by the turn they belong to. */
  const flowKeys = (snapshot: Snapshot) =>
    snapshot.entries.map((entry) => (entry.kind === "node" ? entry.key : `fold>t${entry.turn}`))

  const flowGaps = (snapshot: Snapshot) =>
    snapshot.entries.map((_, index) => flowGapPx(snapshot, snapshot.entries, index))

  test("a wake loses no message and invents none", () => {
    const snapshot = projectTimeline(mixed())

    // Exactly one node per visible part: the two prompts, three replies, three tools, one report.
    expect([...snapshot.nodes.keys()].sort()).toEqual(
      [
        "assistant:msg_2:0",
        "assistant:msg_3:0",
        "assistant:msg_5:0",
        "input:msg_1",
        "input:msg_4",
        "notice:msg_wake",
        "tool:msg_2:tool_1",
        "tool:msg_3:tool_2",
      ].sort(),
    )
  })

  test("a wake keeps the transcript in message order, question to answer", () => {
    const snapshot = projectTimeline(mixed())

    expect(flowKeys(snapshot)).toEqual([
      "input:msg_1",
      "fold>t1",
      "assistant:msg_2:0",
      "notice:msg_wake",
      "fold>t2",
      "assistant:msg_3:0",
      "input:msg_4",
      "fold>t3",
      "assistant:msg_5:0",
    ])
  })

  test("a wake answers its own segment and never steals the prompt's reply", () => {
    const snapshot = projectTimeline(mixed())

    // Each question still owns the answer it asked for; the report anchors the run it woke.
    expect(snapshot.turns.get(1)?.answer).toBe("assistant:msg_2:0")
    expect(snapshot.turns.get(2)?.answer).toBe("assistant:msg_3:0")
    expect(snapshot.turns.get(3)?.answer).toBe("assistant:msg_5:0")
  })

  test("a wake never buries a final answer inside a fold", () => {
    const snapshot = projectTimeline(mixed())
    const flat = snapshot.entries.flatMap((entry) => (entry.kind === "node" ? [entry.key] : []))
    const answers = [...snapshot.turns.values()].map((turn) => turn.answer).filter((key) => key !== null)

    // Every closing reply lays flat in the flow, below the process fold of its own segment.
    expect(answers.length).toBe(3)
    for (const answer of answers) expect(flat).toContain(answer)
    expect(flat.indexOf("assistant:msg_3:0")).toBeGreaterThan(flat.indexOf("notice:msg_wake"))
  })

  test("only background reports split: other synthetics stay one line", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      { id: "idle_1", type: "idle", outcome: "succeeded", time: { created: 11 } } satisfies SessionMessageInfo,
      {
        id: "msg_note",
        type: "synthetic",
        text: "context compacted",
        metadata: { source: "compaction" },
        time: { created: 12 },
      } satisfies SessionMessageInfo,
    ])

    // A non-background notice rides the settled turn as a plain line: no new segment, no banner payload.
    expect(snapshot.nodes.get("notice:msg_note")?.turn).toBe(1)
    const payload = snapshot.nodes.get("notice:msg_note")?.payload
    expect(payload?.kind === "notice" && payload.wake).toBeUndefined()
  })

  const subagentWake = (id: string, created: number) => ({
    id,
    type: "synthetic",
    text: `<subagent id="sub_1" state="completed">\nfound 3 sites\n</subagent>`,
    description: "explore the auth flow",
    metadata: { source: "subagent", state: "completed", agent: "explore" },
    time: { created },
  }) satisfies SessionMessageInfo

  test("a subagent report carries its agent, task line, and result", () => {
    const snapshot = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      { id: "idle_1", type: "idle", outcome: "succeeded", time: { created: 11 } } satisfies SessionMessageInfo,
      subagentWake("msg_sub", 12),
    ])

    const payload = snapshot.nodes.get("notice:msg_sub")?.payload

    expect(payload?.kind === "notice" && payload.wake?.source).toBe("subagent")
    expect(payload?.kind === "notice" && payload.wake?.agent).toBe("explore")
    // A subagent ran no command line: the task text rides the row's summary instead.
    expect(payload?.kind === "notice" && payload.wake?.command).toBeUndefined()
    expect(payload?.kind === "notice" && payload.text).toBe("explore the auth flow")
    expect(payload?.kind === "notice" && payload.wake?.output).toBe("found 3 sites")
  })

  test("the wake banner keeps one fixed gap above and below through streaming", () => {    // Above the banner: the answer's own 28px hover-action strip, no extra. Below: the same breathing room,
    // so the bar reads centered in its segment instead of hugging the work it introduces.
    expect(flowGaps(projectTimeline(mixed()))).toEqual([0, 26, 16, 0, 24, 16, 24, 26, 16])

    // Mid-stream, before the woke run replies, the banner holds the same place and the same gaps.
    const streaming = projectTimeline([
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [tool("tool_1"), text("answer")], 10),
      { id: "idle_1", type: "idle", outcome: "succeeded", time: { created: 11 } } satisfies SessionMessageInfo,
      shellWake("msg_wake", 12),
      assistant("msg_3", 13, [tool("tool_2")], undefined),
    ])
    expect(flowKeys(streaming)).toEqual(["input:msg_1", "fold>t1", "assistant:msg_2:0", "notice:msg_wake", "fold>t2"])
    expect(flowGaps(streaming)).toEqual([0, 26, 16, 0, 24])

    // The reply landing on the streamed snapshot shifts nothing above the banner: spacing never jumps.
    const settled = projectTimeline(mixed().slice(0, 5), streaming)
    expect(flowKeys(settled).slice(0, 5)).toEqual(flowKeys(streaming))
    expect(flowGaps(settled).slice(0, 5)).toEqual(flowGaps(streaming))
  })
})
