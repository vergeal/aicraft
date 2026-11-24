import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createData, type CreateDataInput } from "../src/solid"
import { Aicraft, type AicraftEvent } from "../src/promise"

const sessionID = "ses_retry"

function fixture() {
  const listeners = new Set<Parameters<CreateDataInput["event"]["listen"]>[0]>()
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
          listeners.add(handler)
          return () => listeners.delete(handler)
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
      listeners.forEach((listener) => listener({ name: event.type, details: event }))
    }
    return {
      data,
      dispose,
      step: (assistantMessageID: string) =>
        emit("session.step.started", {
          assistantMessageID,
          agent: "build",
          model: { id: "model", providerID: "provider" },
          started: seq,
        }),
      retry: (assistantMessageID: string) =>
        emit("session.retry.scheduled", {
          assistantMessageID,
          attempt: 2,
          at: seq + 10,
          error: { type: "provider.transport", message: "OpenAI Chat stream ended without finish_reason" },
        }),
      ended: (assistantMessageID: string) =>
        emit("session.step.ended", {
          assistantMessageID,
          finish: "stop",
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        }),
      settled: () => emit("session.execution.succeeded"),
      retryOf: (assistantMessageID: string) =>
        data.session.message
          .list(sessionID)
          .find((item) => item.id === assistantMessageID && item.type === "assistant")?.retry,
    }
  })
}

test("a new step retires a retry label left on another message", () => {
  const setup = fixture()
  try {
    setup.step("msg_first")
    setup.retry("msg_first")
    expect(setup.retryOf("msg_first")).toBeDefined()

    setup.step("msg_second")

    expect(setup.retryOf("msg_first")).toBeUndefined()
  } finally {
    setup.dispose()
  }
})

test("a settled step clears its own retry label", () => {
  const setup = fixture()
  try {
    setup.step("msg_first")
    setup.retry("msg_first")
    expect(setup.retryOf("msg_first")).toBeDefined()

    setup.ended("msg_first")

    expect(setup.retryOf("msg_first")).toBeUndefined()
  } finally {
    setup.dispose()
  }
})

test("a settled execution clears every retry label it left", async () => {
  const setup = fixture()
  try {
    setup.step("msg_first")
    setup.retry("msg_first")
    setup.step("msg_second")
    setup.retry("msg_second")
    setup.ended("msg_second")

    setup.settled()
    await Promise.resolve()

    expect(setup.retryOf("msg_first")).toBeUndefined()
    expect(setup.retryOf("msg_second")).toBeUndefined()
  } finally {
    setup.dispose()
  }
})
