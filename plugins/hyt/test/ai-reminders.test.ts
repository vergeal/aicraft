import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadReminderState, pollReminders, selectDue } from "../src/ai/reminders.js"
import type { HostSchedule, ReminderPort } from "../src/ai/reminders.js"
import type { Task } from "../src/tasks.js"

const NOW = new Date("2026-11-22T10:30:00.000Z")
const EXPIRED = "2026-11-22T09:00:00.000Z"
const TOMORROW = "2026-11-23T10:00:00.000Z"
const IN_30_MINUTES = "2026-11-22T11:00:00.000Z"

function task(overrides: Partial<Task> & { id: string; title: string }): Task {
  return {
    id: overrides.id,
    title: overrides.title,
    detail: overrides.detail ?? "",
    ...(overrides.dueAt === undefined ? {} : { dueAt: overrides.dueAt }),
    source: overrides.source ?? { sessionId: "cs20254801", messageId: "12", sender: "cs20254801" },
    status: overrides.status ?? "open",
    createdAt: overrides.createdAt ?? "2026-11-22T02:00:00.000Z",
  }
}

const state = { version: 1 as const, notified: [], scheduled: [] }

describe("selectDue", () => {
  test("只选未完成、有期限且已到期的任务", () => {
    const due = selectDue(
      [
        task({ id: "a", title: "发变更单", dueAt: EXPIRED }),
        task({ id: "b", title: "明天的事", dueAt: TOMORROW }),
        task({ id: "c", title: "没期限" }),
        task({ id: "d", title: "已完成", dueAt: "2026-11-22T02:00:00.000Z", status: "done" }),
        task({ id: "e", title: "期限坏了", dueAt: "不是时间" }),
      ],
      state,
      NOW,
    )
    expect(due.map((item) => item.id)).toEqual(["a"])
  })

  test("已经提醒过的同一任务同一期限不再选；改期限会重新提醒", () => {
    const notified = {
      version: 1 as const,
      notified: [{ taskId: "a", dueAt: EXPIRED, at: "x" }],
      scheduled: [],
    }
    expect(selectDue([task({ id: "a", title: "发变更单", dueAt: EXPIRED })], notified, NOW)).toEqual([])
    expect(
      selectDue([task({ id: "a", title: "发变更单", dueAt: "2026-11-22T10:00:00.000Z" })], notified, NOW),
    ).toHaveLength(1)
  })

  test("lookahead 能提前选中快到期的事", () => {
    const soon = task({ id: "b", title: "半小时后", dueAt: IN_30_MINUTES })
    expect(selectDue([soon], state, NOW)).toEqual([])
    expect(selectDue([soon], state, NOW, 60)).toHaveLength(1)
  })
})

describe("pollReminders", () => {
  test("到期任务发一条收件箱消息，并记录已提醒", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hyt-remind-"))
    const published: { externalID: string; title: string; summary: string }[] = []
    const port: ReminderPort = {
      async publish(message) {
        published.push({ externalID: message.externalID, title: message.title, summary: message.summary })
      },
    }
    try {
      const tasks = [task({ id: "a", title: "发变更单", detail: "给刘程", dueAt: EXPIRED })]
      const first = await pollReminders({ dataDir: directory, port, now: NOW, tasks })
      expect(first.published).toEqual(["a"])
      expect(published).toHaveLength(1)
      expect(published[0]!.title).toContain("发变更单")
      expect(published[0]!.summary).toContain("已超")

      const second = await pollReminders({ dataDir: directory, port, now: NOW, tasks })
      expect(second.published).toEqual([])
      expect((await loadReminderState(directory)).notified).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("宿主排程成功时不再发收件箱消息", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hyt-remind-host-"))
    const published: string[] = []
    const scheduled: string[] = []
    const port: ReminderPort = {
      async publish(message) {
        published.push(message.externalID)
      },
    }
    const hostSchedule: HostSchedule = {
      async schedule(input) {
        scheduled.push(input.externalID)
        return true
      },
    }
    try {
      const tasks = [task({ id: "a", title: "发变更单", dueAt: EXPIRED })]
      const result = await pollReminders({ dataDir: directory, port, now: NOW, tasks, hostSchedule })
      expect(result.scheduled).toEqual(["a"])
      expect(published).toEqual([])
      expect(scheduled).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("宿主排程失败时退回本地提醒", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hyt-remind-fail-"))
    const published: string[] = []
    const port: ReminderPort = {
      async publish(message) {
        published.push(message.externalID)
      },
    }
    const hostSchedule: HostSchedule = {
      async schedule() {
        return false
      },
    }
    try {
      const tasks = [task({ id: "a", title: "发变更单", dueAt: EXPIRED })]
      const result = await pollReminders({ dataDir: directory, port, now: NOW, tasks, hostSchedule })
      expect(result.local).toEqual(["a"])
      expect(published).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
