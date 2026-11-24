import { expect, test } from "bun:test"
import { Aicraft } from "../src/promise/index"
import { formatTraceparent, TRACEPARENT, withTraceparent } from "../src/trace"

const traceID = "4bf92f3577b34da6a3ce929d0e0e4736"
const spanID = "00f067aa0ba902b7"

test("formats a sampled W3C traceparent", () => {
  expect(formatTraceparent({ traceID, spanID })).toBe(`00-${traceID}-${spanID}-01`)
  expect(formatTraceparent({ traceID, spanID, sampled: false })).toBe(`00-${traceID}-${spanID}-00`)
})

test("forwards requests untouched without a trace context", async () => {
  const seen: Array<Headers | undefined> = []
  const fetch = withTraceparent(
    async (_input, init) => {
      seen.push(init?.headers === undefined ? undefined : new Headers(init.headers))
      return Response.json({})
    },
    () => undefined,
  )

  await fetch("http://localhost/api/info", { headers: { authorization: "Basic secret" } })

  expect(seen[0]?.has(TRACEPARENT)).toBe(false)
  expect(seen[0]?.get("authorization")).toBe("Basic secret")
})

test("injects traceparent on every client request", async () => {
  const seen: Array<string | null> = []
  const client = Aicraft.make({
    baseUrl: "http://localhost:3000",
    fetch: async (_input, init) => {
      seen.push(new Headers(init?.headers).get(TRACEPARENT))
      return Response.json({})
    },
    trace: () => ({ traceID, spanID }),
  })

  await client.server.info()
  await client.server.info()

  expect(seen).toEqual([`00-${traceID}-${spanID}-01`, `00-${traceID}-${spanID}-01`])
})

test("keeps a traceparent the caller already set", async () => {
  const seen: Array<string | null> = []
  const fetch = withTraceparent(
    async (_input, init) => {
      seen.push(new Headers(init?.headers).get(TRACEPARENT))
      return Response.json({})
    },
    () => ({ traceID, spanID: "1111111111111111" }),
  )

  await fetch("http://localhost/api/info", {
    headers: { traceparent: `00-${traceID}-${spanID}-01` },
  })

  expect(seen).toEqual([`00-${traceID}-${spanID}-01`])
})
