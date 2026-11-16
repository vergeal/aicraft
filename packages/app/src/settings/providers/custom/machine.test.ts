import { describe, expect, test } from "bun:test"
import { closed, transition, type CustomProviderState } from "./machine"

// Existing providers, so a create cannot shadow one.
const context = { taken: ["hongxincy"] }

const draft = {
  id: "my-gateway",
  name: "My Gateway",
  baseURL: "https://gateway.example.com/v1",
  apiKey: "sk-test",
  models: ["gpt-4o", "gpt-4o-mini"],
}

function open(attempt = 1) {
  return transition(closed, { type: "open.create", attempt }, context).state
}

function atModels(state: CustomProviderState = open()) {
  const changed = transition(state, { type: "draft.changed", patch: draft }, context).state
  return transition(changed, { type: "step.next" }, context).state
}

describe("custom provider machine", () => {
  test("creates a provider and closes after a successful save", () => {
    const ready = atModels()
    expect(ready).toMatchObject({ type: "editing", step: "models", draft: { id: "my-gateway" } })

    const submitted = transition(ready, { type: "submit.requested" }, context)
    expect(submitted.state).toMatchObject({ type: "saving", attempt: 1 })
    expect(submitted.effects).toEqual([{ type: "save.run", attempt: 1, mode: "create", draft: expect.anything() }])

    const done = transition(submitted.state, { type: "submit.succeeded", attempt: 1 }, context)
    expect(done.state).toEqual(closed)
    expect(done.effects).toEqual([{ type: "toast.created", providerName: "My Gateway" }])
  })

  test("ignores a second submit while saving", () => {
    const submitted = transition(atModels(), { type: "submit.requested" }, context)

    // The state left `editing` before the request ran, so a repeated Enter or click finds nothing to start.
    expect(transition(submitted.state, { type: "submit.requested" }, context)).toEqual({
      state: submitted.state,
      effects: [],
    })
    expect(transition(submitted.state, { type: "step.back" }, context)).toEqual({
      state: submitted.state,
      effects: [],
    })
  })

  test("returns to the models step with the failure above the footer", () => {
    const submitted = transition(atModels(), { type: "submit.requested" }, context)
    const failed = transition(
      submitted.state,
      { type: "submit.failed", attempt: 1, message: "Provider request failed" },
      context,
    )

    expect(failed.state).toMatchObject({
      type: "editing",
      step: "models",
      error: "Provider request failed",
      draft: { id: "my-gateway" },
    })
    expect(failed.effects).toEqual([])
  })

  test("drops a result from an attempt the user already left", () => {
    const second = open(2)
    expect(transition(second, { type: "submit.failed", attempt: 1, message: "late" }, context)).toEqual({
      state: second,
      effects: [],
    })
    expect(transition(second, { type: "discover.succeeded", attempt: 1, models: [{ id: "late" }] }, context)).toEqual({
      state: second,
      effects: [],
    })
  })

  test("keeps the fetched models through a save", () => {
    const discovered = transition(
      atModels(),
      { type: "discover.succeeded", attempt: 1, models: [{ id: "gpt-4o" }] },
      context,
    ).state

    const saving = transition(discovered, { type: "submit.requested" }, context).state
    expect(saving).toMatchObject({ type: "saving", discovery: { type: "ready" } })

    const failed = transition(saving, { type: "submit.failed", attempt: 1, message: "nope" }, context).state
    expect(failed).toMatchObject({ type: "editing", discovery: { type: "ready", models: [{ id: "gpt-4o" }] } })
  })

  test("confirms deletion before running it", () => {
    const confirming = transition(
      closed,
      { type: "delete.requested", attempt: 3, providerID: "hongxincy", name: "Hongxin" },
      context,
    )
    expect(confirming.state).toMatchObject({ type: "confirmingDelete", providerID: "hongxincy" })

    const cancelled = transition(confirming.state, { type: "delete.cancelled" }, context)
    expect(cancelled.state).toEqual(closed)
    expect(cancelled.effects).toEqual([])

    const confirmed = transition(confirming.state, { type: "delete.confirmed" }, context)
    expect(confirmed.state).toMatchObject({ type: "deleting", providerID: "hongxincy" })
    expect(confirmed.effects).toEqual([
      { type: "delete.run", attempt: 3, providerID: "hongxincy", name: "Hongxin" },
    ])

    const deleted = transition(confirmed.state, { type: "delete.succeeded", attempt: 3 }, context)
    expect(deleted.state).toEqual(closed)
    expect(deleted.effects).toEqual([{ type: "toast.deleted", providerName: "Hongxin" }])
  })

  test("keeps the confirmation open when deleting fails", () => {
    const confirming = transition(
      closed,
      { type: "delete.requested", attempt: 1, providerID: "hongxincy", name: "Hongxin" },
      context,
    ).state
    const deleting = transition(confirming, { type: "delete.confirmed" }, context).state
    const failed = transition(deleting, { type: "delete.failed", attempt: 1, message: "no" }, context)

    expect(failed.state).toMatchObject({ type: "confirmingDelete", providerID: "hongxincy" })
  })

  test("refuses to advance with an invalid id or endpoint", () => {
    const state = transition(open(), { type: "draft.changed", patch: { id: "Bad ID", baseURL: "nope" } }, context).state
    expect(transition(state, { type: "step.next" }, context).state).toBe(state)

    const taken = transition(open(), { type: "draft.changed", patch: { id: "hongxincy" } }, context).state
    expect(transition(taken, { type: "draft.changed", patch: draft }, context).state).toMatchObject({
      draft: { id: "my-gateway" },
    })
  })
})
