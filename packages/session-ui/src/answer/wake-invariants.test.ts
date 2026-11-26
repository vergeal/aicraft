import { describe, expect, test } from "bun:test"
import type { SessionMessageAssistant, SessionMessageInfo } from "@aicraft/client/promise"
import { flowGapPx, isWakeBanner, projectTimeline } from "./project"
import type { Snapshot } from "./types"

type Content = SessionMessageAssistant["content"][number]

const user = (id: string, text: string, created: number) =>
  ({ id, type: "user", text, time: { created } }) satisfies SessionMessageInfo

const assistant = (id: string, created: number, content: Content[], completed?: number) =>
  ({
    id,
    type: "assistant",
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content,
    time: completed === undefined ? { created } : { created, completed },
  }) satisfies SessionMessageInfo

const text = (value: string): Content => ({ type: "text", text: value })

const tool = (id: string, name = "read"): Content => ({
  type: "tool",
  id,
  name,
  state: { status: "completed", input: {}, content: [{ type: "text", text: "result" }], metadata: {} },
  time: { created: 2, completed: 3 },
})

const idle = (id: string, created: number, outcome: "succeeded" | "failed" | "interrupted" = "succeeded") =>
  ({ id, type: "idle", outcome, time: { created } }) satisfies SessionMessageInfo

const shellWake = (id: string, created: number, state = "completed") =>
  ({
    id,
    type: "synthetic",
    text: `<shell id="sh_${id}" state="${state}" command="npm test 2>&1">\n1 passing\n</shell>`,
    description: "npm test 2>&1",
    metadata: { source: "shell", state, shellID: `sh_${id}` },
    time: { created },
  }) satisfies SessionMessageInfo

const subagentWake = (id: string, created: number, state = "completed") =>
  ({
    id,
    type: "synthetic",
    text: `<subagent id="sub_${id}" state="${state}">\nfound 3 sites\n</subagent>`,
    description: "explore the auth flow",
    metadata: { source: "subagent", state, agent: "explore" },
    time: { created },
  }) satisfies SessionMessageInfo

/* Twelve transcripts spanning the shapes a background report arrives in. */
const samples: Record<string, () => { messages: SessionMessageInfo[]; pending?: Set<string> }> = {
  "split after a settled answer": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [tool("tool_1"), text("answer")], 10),
      idle("idle_1", 11),
      shellWake("msg_w", 12),
      assistant("msg_3", 13, [tool("tool_2"), text("woke reply")], 20),
      idle("idle_2", 21),
    ],
  }),
  "rides a bare prompt with no work": () => ({
    messages: [
      user("msg_1", "go", 1),
      shellWake("msg_w", 2),
      assistant("msg_2", 3, [tool("tool_1"), text("answer")], 10),
      idle("idle_1", 11),
    ],
  }),
  "batched wakes share one banner": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      idle("idle_1", 11),
      shellWake("msg_a", 12),
      shellWake("msg_b", 12),
      assistant("msg_3", 13, [text("woke reply")], 20),
    ],
  }),
  "a queued wake never opens a segment": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      idle("idle_1", 11),
      shellWake("msg_w", 12),
    ],
    pending: new Set(["msg_w"]),
  }),
  "a failed report banners in red": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      idle("idle_1", 11),
      shellWake("msg_w", 12, "error"),
      assistant("msg_3", 13, [text("saw the failure")], 20),
    ],
  }),
  "a cancelled report keeps its own segment": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      idle("idle_1", 11),
      shellWake("msg_w", 12, "cancelled"),
      assistant("msg_3", 13, [text("noted the cancel")], 20),
    ],
  }),
  "a subagent report splits like a shell": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      idle("idle_1", 11),
      subagentWake("msg_w", 12),
      assistant("msg_3", 13, [text("merged the findings")], 20),
    ],
  }),
  "a prompt delivered after the wake joins its segment": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      idle("idle_1", 11),
      shellWake("msg_w", 12),
      user("msg_3", "follow up", 13),
      assistant("msg_4", 14, [text("final reply")], 20),
      idle("idle_2", 21),
    ],
  }),
  "a wake lands on a run still working": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [tool("tool_1")], undefined),
      shellWake("msg_w", 3),
      assistant("msg_3", 4, [text("woke mid-run")], 10),
      idle("idle_1", 11),
    ],
  }),
  "two wakes after two answers split twice": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      idle("idle_1", 11),
      shellWake("msg_a", 12),
      assistant("msg_3", 13, [text("woke reply")], 20),
      idle("idle_2", 21),
      subagentWake("msg_b", 22),
      assistant("msg_4", 23, [text("second woke reply")], 30),
      idle("idle_3", 31),
    ],
  }),
  "a wake with no reply keeps the segment open": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [text("answer")], 10),
      idle("idle_1", 11),
      shellWake("msg_w", 12),
      assistant("msg_3", 13, [tool("tool_1"), text("streaming…")], undefined),
    ],
  }),
  "a wake follows a change-carrying fold": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [tool("tool_1")], 10),
      idle("idle_1", 11),
      shellWake("msg_w", 12),
      assistant("msg_3", 13, [text("woke reply")], 20),
      idle("idle_2", 21),
    ],
  }),
  "a wake follows an interrupted answer": () => ({
    messages: [
      user("msg_1", "go", 1),
      assistant("msg_2", 2, [tool("tool_1"), text("half an answer")], 10),
      idle("idle_1", 11, "interrupted"),
      shellWake("msg_w", 12),
      assistant("msg_3", 13, [text("recovered")], 20),
      idle("idle_2", 21),
    ],
  }),
}

/** Every row key the flow reaches: top level, fold children, and the members merged into a group. */
const referencedKeys = (snapshot: Snapshot) => {
  const keys = new Set<string>()

  for (const entry of snapshot.entries) {
    if (entry.kind === "node") keys.add(entry.key)
    else
      for (const child of entry.children)
        keys.add(child.kind === "group" ? child.key.slice("group:".length) : child.key)
  }

  // A merged run lays out under its head: every member stands reachable through the group.
  for (const group of snapshot.groups.values()) for (const member of group.members) keys.add(member)

  return keys
}

/** The node keys one message contributes to the projection. */
const keysOf = (message: SessionMessageInfo) => {
  if (message.type === "user") return [`input:${message.id}`]
  if (message.type === "synthetic") return [`notice:${message.id}`]
  if (message.type !== "assistant") return []

  let ordinal = 0

  return message.content.map((content) =>
    content.type === "tool" ? `tool:${message.id}:${content.id}` : `assistant:${message.id}:${ordinal++}`,
  )
}

describe.each(Object.entries(samples))("wake invariants: %s", (_name, build) => {
  const caseOf = () => {
    const { messages, pending } = build()

    return { messages, snapshot: projectTimeline(messages, undefined, pending) }
  }

  test("no message is lost", () => {
    const { messages, snapshot } = caseOf()
    const laid = referencedKeys(snapshot)
    const visible = messages.filter((message) => ["user", "assistant", "synthetic"].includes(message.type))

    for (const message of visible) {
      const keys = keysOf(message)
      for (const key of keys) expect(snapshot.nodes.has(key), `${message.id} ${key}`).toBe(true)
      // At least one row of the message is reachable from the flow (a group head stands for its run).
      expect(keys.some((key) => laid.has(key)), `unreachable ${message.id}`).toBe(true)
    }
  })

  test("rows follow delivery order", () => {
    const { messages, snapshot } = caseOf()
    const seq = new Map(messages.map((message, index) => [message.id, index]))
    const seqOf = (key: string) => {
      const id = snapshot.nodes.get(key)?.messageID

      return id === undefined ? -1 : (seq.get(id) ?? -1)
    }

    let last = -1

    for (const entry of snapshot.entries) {
      const head = entry.kind === "node" ? entry.key : (entry.children[0]?.key.slice("group:".length) ?? "")
      const at = seqOf(head)
      if (at < 0) continue
      expect(at, `inverted at ${entry.kind} ${head} after ${last}`).toBeGreaterThanOrEqual(last)
      last = Math.max(last, at)

      // Inside a fold, members keep their delivery order too.
      if (entry.kind === "fold")
        for (const child of entry.children) {
          const childKey = child.kind === "group" ? child.key.slice("group:".length) : child.key
          const childAt = seqOf(childKey)
          if (childAt >= 0)
            expect(childAt, `fold member out of order ${child.key}`).toBeGreaterThanOrEqual(seqOf(head))
        }
    }
  })

  test("the final answer is never buried in a fold", () => {
    const { snapshot } = caseOf()
    const flat = snapshot.entries.flatMap((entry) => (entry.kind === "node" ? [entry.key] : []))

    for (const turn of snapshot.turns.values()) {
      if (!turn.answer) continue
      expect(flat, `answer not flat turn ${turn.turn}`).toContain(turn.answer)
    }
  })

  test("the answer lands after its steps and after the banner", () => {
    const { snapshot } = caseOf()
    const index = new Map<string, number>()
    snapshot.entries.forEach((entry, at) => {
      if (entry.kind === "node") index.set(entry.key, at)
      else index.set(`fold>${entry.turn}`, at)
    })
    const foldOf = (turn: number) => index.get(`fold>${turn}`) ?? -1

    for (const turn of snapshot.turns.values()) {
      if (!turn.answer) continue
      const answer = index.get(turn.answer) ?? -1
      expect(answer, `answer missing from flow, turn ${turn.turn}`).toBeGreaterThanOrEqual(0)

      // Only one fold per turn is laid out in these samples; its steps precede the reply.
      expect(answer, `answer before its steps, turn ${turn.turn}`).toBeGreaterThan(foldOf(turn.turn))

      const banner = snapshot.entries.findIndex(
        (entry) =>
          entry.kind === "node" &&
          isWakeBanner(snapshot, entry) &&
          snapshot.nodes.get(entry.key)?.turn === turn.turn,
      )
      if (banner >= 0) expect(answer, `answer before its banner, turn ${turn.turn}`).toBeGreaterThan(banner)
    }
  })

  test("banner spacing is one fixed pair of values", () => {
    const { snapshot } = caseOf()
    const gaps = snapshot.entries.map((_, i) => flowGapPx(snapshot, snapshot.entries, i))
    const kinds = (entry: Snapshot["entries"][number] | undefined) =>
      entry === undefined
        ? undefined
        : entry.kind === "fold"
          ? "fold"
          : snapshot.nodes.get((entry as any).key)?.payload.kind

    let found = false

    snapshot.entries.forEach((entry, i) => {
      if (!isWakeBanner(snapshot, entry)) return
      found = true
      const previous = kinds(snapshot.entries[i - 1])
      const next = kinds(snapshot.entries[i + 1])

      // The rules the banner was designed around, identical in every scenario:
      // under a settled answer it rides that reply's 28px hover-action strip (0 flow gap);
      // after a bubble it keeps the prompt's 26px rhythm; below it every row keeps the same
      // 24px breathing room, so the bar never hugs the work it introduces.
      if (previous === "assistant") expect(gaps[i], `gap under ${previous}`).toBe(0)
      if (previous === "input") expect(gaps[i], `gap under ${previous}`).toBe(26)
      if (previous === "fold") expect(gaps[i], `gap under a fold`).toBe(24)
      if (next === "fold") expect(gaps[i + 1], `gap over fold`).toBe(24)
      if (next === "assistant") expect(gaps[i + 1], `gap over reply`).toBe(24)
      if (next === "input") expect(gaps[i + 1], `gap over prompt`).toBe(24)
    })

    // The rides/queued shapes carry no banner; the split shapes must carry exactly the reports.
    if (!found) {
      const wakes = snapshot.entries.filter((entry) => entry.kind === "node" && String(entry.key).startsWith("notice:"))
      for (const entry of wakes) expect(isWakeBanner(snapshot, entry), entry.key).toBe(false)
    }
  })
})
