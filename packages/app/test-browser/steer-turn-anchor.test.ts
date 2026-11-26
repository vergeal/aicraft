import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { Predicate } from "effect"
import { createData } from "@aicraft/client/solid"
import { Aicraft, type AicraftEvent, type SessionStatus } from "@aicraft/client/promise"
import { Timeline } from "@aicraft/session-ui/timeline/projection"
import { visibleTimelineMessages } from "../src/session/timeline/controller-projection"

// Regression for the steer anchor lag: after the server delivers a steer at a step boundary, the working
// indicator must move to the steer's bubble, and the next step's first visible work (a tool call, before any
// text body) must render under the steer, not under the previous user message.
const sessionID = "ses_steer_anchor"

function fixture() {
  const listeners = new Set<Parameters<Parameters<typeof createData>[0]["event"]["listen"]>[0] extends infer H
    ? H extends (event: infer E) => void
      ? (event: E) => void
      : never
    : never>()
  const api = Aicraft.make({
    baseUrl: "http://aicraft.local",
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      return request.method === "GET" ? Response.json({ data: [] }) : Response.json({ data: {} })
    },
  })
  let seq = 0

  return createRoot((dispose) => {
    const data = createData({
      api: () => api,
      directory: "/project",
      event: {
        on: () => () => {},
        listen(handler) {
          listeners.add(handler as never)
          return () => listeners.delete(handler as never)
        },
      },
    })
    const emit = (type: string, payload: Record<string, unknown> = {}) => {
      seq++
      const event = {
        id: `evt_${seq}`,
        type,
        created: seq,
        durable: { aggregateID: sessionID, seq, version: 1 },
        data: { sessionID, ...payload },
      } as AicraftEvent
      listeners.forEach((listener) => (listener as (event: { name: string; details: AicraftEvent }) => void)({ name: event.type, details: event }))
      return seq
    }
    const enqueue = (id: string, text: string, delivery: "steer" | "queue" = "steer") =>
      emit("session.inbox.enqueued", { inboxID: id, item: { type: "user", delivery, payload: { text } } })
    const deliver = (id: string) => emit("session.inbox.delivered", { inboxID: id })
    const stepStarted = (assistantMessageID: string, started: number) =>
      emit("session.step.started", {
        assistantMessageID,
        started,
        agent: "build",
        model: { id: "model", providerID: "provider" },
      })
    const toolCall = (assistantMessageID: string, id: string, name: string) => {
      emit("session.tool.input.started", { assistantMessageID, id, name })
      emit("session.tool.called", { assistantMessageID, id, input: {} })
    }
    const textBody = (assistantMessageID: string, text: string) => {
      emit("session.text.started", { assistantMessageID })
      emit("session.text.delta", { assistantMessageID, delta: text })
    }
    const stepEnded = (assistantMessageID: string) =>
      emit("session.step.ended", { assistantMessageID, finish: "stop" })

    // Mirrors the controller: inputs waiting behind delivered work never own a turn.
    const pendingInputIDs = () => {
      const pending = data.session.pending.list(sessionID)

      return new Set(
        pending.flatMap((item) =>
          (item.type === "user" && item.delivery === "steer" && data.session.pending.status(sessionID, item.id) !== "starting") ||
          item.type === "synthetic"
            ? [item.id]
            : [],
        ),
      )
    }

    const status = (): SessionStatus =>
      data.session.status(sessionID) === "running" ? ({ type: "busy" } as SessionStatus) : ({ type: "idle" } as SessionStatus)

    const view = () =>
      Timeline.constructSessionMessageRows(
        visibleTimelineMessages(data.session.message.list(sessionID), data.session.pending.list(sessionID), undefined),
        true,
        status(),
        pendingInputIDs(),
      )

    const ownerOf = (assistantMessageID: string) =>
      view().rows.find((row) => {
        if (!Predicate.isTagged(row, "AssistantPart")) return false
        const group = row.group

        return group.type === "part" ? group.ref.messageID === assistantMessageID : group.refs.some((ref) => ref.messageID === assistantMessageID)
      })

    return { data, dispose, seq: () => seq, enqueue, deliver, stepStarted, toolCall, textBody, stepEnded, view, ownerOf }
  })
}

test("a steer waiting behind running work keeps the anchor on the previous turn", () => {
  const setup = fixture()
  try {
    setup.enqueue("u1", "first task")
    setup.deliver("u1")
    setup.data.session.setStatus(sessionID, "running")
    setup.stepStarted("a1", setup.seq() + 1)
    setup.toolCall("a1", "t1", "read")
    setup.enqueue("u2", "steer text")

    // The steer is admitted but undelivered: its bubble is visible, the old work keeps the anchor.
    expect(setup.view().activeMessageID).toBe("u1")
    expect(setup.data.session.pending.status(sessionID, "u2")).toBe("steering")
  } finally {
    setup.dispose()
  }
})

test("the delivered steer owns the next step from its first visible tool call", () => {
  const setup = fixture()
  try {
    setup.enqueue("u1", "first task")
    setup.deliver("u1")
    setup.data.session.setStatus(sessionID, "running")
    setup.stepStarted("a1", setup.seq() + 1)
    setup.toolCall("a1", "t1", "read")
    setup.textBody("a1", "Working on the first task.")
    setup.enqueue("u2", "steer text")
    setup.stepEnded("a1")

    // Step boundary: the server promotes the steer before the next stream call.
    setup.deliver("u2")
    expect(setup.view().activeMessageID).toBe("u2")

    setup.stepStarted("a2", setup.seq() + 1)
    setup.toolCall("a2", "t2", "grep")

    // The new step's first visible work exists before any text body, so the step list must already
    // render it under the steer, not under the previous user message.
    const row = setup.ownerOf("a2")
    expect(row?.userMessageID).toBe("u2")
    expect(setup.view().turnPhaseByID.get("u2")?.status).toBe("working")
    expect(setup.view().turnPhaseByID.get("u1")?.status).toBe("idle")
  } finally {
    setup.dispose()
  }
})
