import { expect, test } from "bun:test"
import { Model } from "@aicraft/core/model"
import { Provider } from "@aicraft/core/provider"
import { SessionMessage } from "@aicraft/core/session/message"
import { Agent } from "@aicraft/core/agent"
import { toLLMMessages } from "@aicraft/core/session/runner/to-llm-message"
import { DateTime } from "effect"

// L3 replay purification (P2.5, DESIGN §1.1): completed turns never carry
// reasoning; interrupted turns replay merged annotated reasoning or a
// termination note. These fixtures drive toLLMMessages directly against the
// projected message shapes the runner persists.

const created = DateTime.makeUnsafe(0)
const id = (value: string) => SessionMessage.ID.make(`msg_${value}`)
const model = Model.Ref.make({ id: Model.ID.make("model"), providerID: Provider.ID.make("provider") })
const build = Agent.defaultID

const REASONING_NOTE =
  "Note: the following is the assistant's private reasoning from an interrupted turn, not part of its final answer."

const text = (value: string) => SessionMessage.AssistantText.make({ type: "text", text: value })
const reasoning = (value: string, over?: Record<string, unknown>) =>
  SessionMessage.AssistantReasoning.make({ type: "reasoning", text: value, ...over })
const tool = (value: string) =>
  SessionMessage.AssistantTool.make({
    type: "tool",
    id: value,
    name: "read",
    state: SessionMessage.ToolStateCompleted.make({
      status: "completed",
      input: { path: "README.md" },
      content: [{ type: "text", text: `result of ${value}` }],
    }),
    time: { created, completed: created },
  })
const user = (value: string) =>
  SessionMessage.User.make({ id: id(value), type: "user", text: value, time: { created } })
const assistant = (
  value: string,
  content: SessionMessage.Assistant["content"],
  over?: Partial<SessionMessage.Assistant>,
) =>
  SessionMessage.Assistant.make({
    id: id(value),
    type: "assistant",
    agent: build,
    model,
    content,
    finish: "stop",
    time: { created, completed: created },
    ...over,
  })

test("completed turns replay body and tools but zero reasoning parts", () => {
  const messages = toLLMMessages(
    [
      user("ask"),
      assistant("turn", [
        reasoning("first thought"),
        tool("call-1"),
        reasoning("second thought", { native: { signature: "sig" } }),
        text("Final answer"),
      ]),
      user("again"),
      assistant("turn-2", [reasoning("other thought"), text("Second answer")], {
        model: { id: Model.ID.make("other"), providerID: Provider.ID.make("other") },
      }),
    ],
    model,
  )

  expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "user", "assistant"])
  expect(messages.flatMap((message) => (message.content as Array<{ type: string }>).filter((p) => p.type === "reasoning")))
    .toEqual([])
  const replayed = messages[1]?.content as Array<{ type: string; text?: string; id?: string; providerMetadata?: unknown }>
  expect(replayed.map((part) => [part.type, part.text ?? part.id])).toEqual([
    ["tool-call", "call-1"],
    ["text", "Final answer"],
  ])
  expect(replayed[0]?.providerMetadata).toBeUndefined()
})

test("cross-provider completed turns replay no reasoning and no reasoning-turned-text leftovers", () => {
  const messages = toLLMMessages(
    [
      assistant("foreign", [reasoning("Foreign thought"), text("Foreign answer")], {
        model: { id: Model.ID.make("other"), providerID: Provider.ID.make("other") },
      }),
    ],
    model,
  )

  // The old mapping converted cross-provider reasoning into a readable text
  // part; DESIGN §1.1 rule 1 drops it entirely instead.
  expect(messages[0]?.content).toEqual([
    { type: "text", text: "Foreign answer", providerMetadata: undefined },
  ])
})

test("interrupted turn merges every reasoning segment into one annotated text part", () => {
  const messages = toLLMMessages(
    [
      assistant("cut", [reasoning("think one"), reasoning("think two"), reasoning("think three")], {
        finish: "error",
        error: { type: "provider.transport", message: "Stream died" },
      }),
    ],
    model,
  )

  expect(messages).toHaveLength(1)
  expect(messages[0]?.content).toEqual([
    { type: "text", text: `${REASONING_NOTE}\n\nthink one\n\nthink two\n\nthink three` },
  ])
})

test("interrupted turn keeps a half-written answer beside the annotated reasoning", () => {
  const messages = toLLMMessages(
    [
      assistant("cut", [reasoning("plan"), text("Half-writ")], {
        finish: "error",
        error: { type: "unknown", message: "Step interrupted" },
      }),
    ],
    model,
  )

  expect(messages[0]?.content).toEqual([
    { type: "text", text: `${REASONING_NOTE}\n\nplan` },
    { type: "text", text: "Half-writ", providerMetadata: undefined },
  ])
})

test("empty interrupted turn notes the termination mode", () => {
  const aborted = toLLMMessages(
    [
      assistant("user-cut", [text("")], {
        finish: "error",
        error: { type: "aborted", message: "Step interrupted" },
      }),
    ],
    model,
  )
  const failed = toLLMMessages(
    [
      assistant("err-cut", [reasoning("")], {
        finish: "error",
        error: { type: "provider.rate-limit", message: "Slow down" },
      }),
    ],
    model,
  )

  expect(aborted[0]?.content).toEqual([
    { type: "text", text: "This turn produced no output before it was terminated by the user." },
  ])
  expect(failed[0]?.content).toEqual([
    { type: "text", text: "This turn produced no output before it was terminated by an error." },
  ])
})

test("orphan reasoning fragments from a hard kill read as no reasoning", () => {
  // No error, no finish, no completed time: the process died mid-stream after
  // reasoning started but before any delta landed.
  const messages = toLLMMessages(
    [assistant("killed", [reasoning("", { time: { created } })], { finish: undefined, time: { created } })],
    model,
  )

  expect(messages[0]?.content).toEqual([
    { type: "text", text: "This turn produced no output before it was terminated by an error." },
  ])
  expect(messages[0]?.content).not.toEqual([{ type: "text", text: "" }])
})

test("partless retry carrier stays invisible to preserve the request prefix", () => {
  const before = toLLMMessages([user("prompt")], model)
  const during = toLLMMessages(
    [
      user("prompt"),
      assistant("carrier", [], {
        finish: undefined,
        time: { created },
        retry: { attempt: 1, at: created, error: { type: "provider.transport", message: "gone" } },
      }),
    ],
    model,
  )

  expect(during).toEqual(before)
})

test("undo replays the exact message prefix, byte-stable against the longer history", () => {
  const full = [
    user("one"),
    assistant("a1", [reasoning("dropped"), text("Answer one"), tool("call-a")]),
    user("two"),
    assistant("a2", [reasoning("cut thought"), text("half")], {
      finish: "error",
      error: { type: "aborted", message: "Step interrupted" },
    }),
    user("three"),
  ]
  const all = toLLMMessages(full, model)
  for (const cut of [0, 1, 2, 4, 5]) {
    const reverted = toLLMMessages(full.slice(0, cut), model)
    expect(JSON.stringify(reverted)).toEqual(JSON.stringify(all.slice(0, reverted.length)))
    expect(reverted.length).toBeLessThanOrEqual(all.length)
  }
})
