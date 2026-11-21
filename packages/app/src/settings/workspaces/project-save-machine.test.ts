import { expect, test } from "bun:test"
import {
  projectSaveMessage,
  projectSaveStatus,
  projectSaveTransition,
  projectSaveBusy,
  type ProjectDraft,
  type ProjectSaveEvent,
  type ProjectSaveState,
} from "./project-save-machine"

const saved: ProjectDraft = { name: "", prompt: "", startup: "bun dev" }

const initial: ProjectSaveState = { type: "editing", draft: { ...saved, name: "opencode" }, saved, attempt: 0 }

function replay(state: ProjectSaveState, events: ProjectSaveEvent[]) {
  return events.reduce<ProjectSaveState>((current, event) => projectSaveTransition(current, event).state, state)
}

test("a save starts one write and leaves editing", () => {
  const next = projectSaveTransition(initial, { type: "save", patch: { name: "opencode" } })

  expect(next.state.type).toBe("saving")
  expect(next.effects).toEqual([
    { type: "persist", attempt: 1, draft: initial.draft, patch: { name: "opencode" } },
  ])
  expect(projectSaveBusy(next.state)).toBe(true)
})

test("an empty patch never starts a write", () => {
  const next = projectSaveTransition(initial, { type: "save", patch: {} })

  expect(next.state).toBe(initial)
  expect(next.effects).toEqual([])
})

test("a second save while saving is ignored", () => {
  const saving = projectSaveTransition(initial, { type: "save", patch: { name: "opencode" } }).state
  const next = projectSaveTransition(saving, { type: "save", patch: { name: "other" } })

  expect(next.state).toBe(saving)
  expect(next.effects).toEqual([])
})

test("editing and discarding wait for the write in flight", () => {
  const saving = projectSaveTransition(initial, { type: "save", patch: { name: "opencode" } }).state

  expect(projectSaveTransition(saving, { type: "draft", field: "name", value: "x" }).state).toBe(saving)
  expect(projectSaveTransition(saving, { type: "discard" }).state).toBe(saving)
})

test("a successful write keeps the draft and marks it saved", () => {
  const saving = projectSaveTransition(initial, { type: "save", patch: { name: "opencode" } }).state

  const next = projectSaveTransition(saving, {
    type: "saved",
    attempt: 1,
    saved: { ...saved, name: "opencode" },
  })

  expect(next.state).toMatchObject({
    type: "editing",
    draft: initial.draft,
    saved: { ...saved, name: "opencode" },
    attempt: 1,
    notice: "saved",
  })
  expect(projectSaveStatus(next.state)).toBe("saved")
})

test("an answer from an older write is ignored", () => {
  const saving = projectSaveTransition(initial, { type: "save", patch: { name: "opencode" } }).state

  expect(projectSaveTransition(saving, { type: "saved", attempt: 0, saved }).state).toBe(saving)
  expect(projectSaveTransition(saving, { type: "failed", attempt: 0, message: "no" }).state).toBe(saving)
})

test("a failed write keeps the draft for a retry", () => {
  const editing = projectSaveTransition(initial, { type: "draft", field: "prompt", value: "be nice" }).state
  const saving = projectSaveTransition(editing, { type: "save", patch: { prompt: "be nice" } }).state
  const failed = projectSaveTransition(saving, { type: "failed", attempt: 1, message: "offline" }).state

  expect(failed).toMatchObject({ type: "failed", draft: { ...saved, name: "opencode", prompt: "be nice" }, message: "offline" })
  expect(projectSaveStatus(failed)).toBe("failed")
  expect(projectSaveMessage(failed)).toBe("offline")
})

test("editing after a failure clears the error", () => {
  const failed: ProjectSaveState = { type: "failed", draft: initial.draft, saved, attempt: 1, message: "offline" }
  const next = projectSaveTransition(failed, { type: "draft", field: "name", value: "renamed" })

  expect(next.state.type).toBe("editing")
  expect(projectSaveMessage(next.state)).toBeUndefined()
})

test("discard restores the saved values", () => {
  const edited = projectSaveTransition(initial, { type: "draft", field: "startup", value: "pnpm dev" }).state
  const next = projectSaveTransition(edited, { type: "discard" })

  expect(next.state).toMatchObject({ type: "editing", draft: saved, saved })
})

test("dismiss clears only the saved notice", () => {
  const savedState: ProjectSaveState = { type: "editing", draft: initial.draft, saved, attempt: 1, notice: "saved" }

  expect(projectSaveTransition(savedState, { type: "dismiss" }).state).toMatchObject({ type: "editing", notice: undefined })
  expect(projectSaveTransition(initial, { type: "dismiss" }).state).toBe(initial)
})

test("replaying a full write leaves the page clean", () => {
  const state = replay(initial, [
    { type: "draft", field: "name", value: "renamed" },
    { type: "save", patch: { name: "renamed" } },
    { type: "saved", attempt: 1, saved: { ...saved, name: "renamed" } },
    { type: "dismiss" },
  ])

  expect(state).toMatchObject({
    type: "editing",
    draft: { ...saved, name: "renamed" },
    saved: { ...saved, name: "renamed" },
  })
  expect(projectSaveStatus(state)).toBe("idle")
})
