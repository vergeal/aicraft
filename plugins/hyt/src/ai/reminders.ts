import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Task } from "../tasks.js"
import { loadTasks } from "../tasks.js"
import { isDue } from "./tasks-detect.js"

/**
 * 到期提醒。宿主目前没有把 experimental.schedule 暴露给插件（Context 里只有 terminal / generate / artifact），
 * 所以默认走插件内的定时器 + 收件箱消息；如果将来注入 HostSchedule，就先排宿主定时，排失败再退回本地。
 * 取舍写在 src/ai/README.md 的「到期提醒」一节。
 */

export interface ReminderPort {
  publish(message: {
    externalID: string
    title: string
    summary: string
    status?: "pending" | "done" | "failed"
    payload?: unknown
  }): Promise<unknown>
}

/** 宿主定时能力的窄接口。返回 true 表示已经排进宿主，本地不再重复提醒。 */
export interface HostSchedule {
  schedule(input: { externalID: string; title: string; at: string; taskId: string }): Promise<boolean>
}

export interface ReminderState {
  readonly version: 1
  readonly notified: ReadonlyArray<{ readonly taskId: string; readonly dueAt: string; readonly at: string }>
  readonly scheduled: ReadonlyArray<{ readonly taskId: string; readonly dueAt: string }>
}

export const REMIND_WINDOW_MINUTES = 0

export function remindedPath(dataDir: string) {
  return join(dataDir, "hyt", "ai", "reminded.json")
}

export async function loadReminderState(dataDir: string): Promise<ReminderState> {
  const file = Bun.file(remindedPath(dataDir))
  if (!(await file.exists())) return { version: 1, notified: [], scheduled: [] }
  const parsed = await file.json().catch(() => undefined)
  if (!isRecord(parsed)) return { version: 1, notified: [], scheduled: [] }
  return {
    version: 1,
    notified: Array.isArray(parsed.notified) ? parsed.notified.flatMap((item) => pair(item)) : [],
    scheduled: Array.isArray(parsed.scheduled)
      ? parsed.scheduled.flatMap((item) => {
          const value = pair(item)
          return value.map((entry) => ({ taskId: entry.taskId, dueAt: entry.dueAt }))
        })
      : [],
  }
}

export async function saveReminderState(dataDir: string, state: ReminderState) {
  await mkdir(join(dataDir, "hyt", "ai"), { recursive: true })
  const path = remindedPath(dataDir)
  await writeFile(`${path}.tmp`, JSON.stringify(state, null, 2) + "\n", "utf8")
  await rename(`${path}.tmp`, path)
}

/**
 * 选出该提醒的任务：仍未完成、有期限、期限已到（或落在 lookahead 窗口内）、且这个「任务 + 期限」没提醒过。
 * 改过期限的任务会用新的 dueAt 重新提醒一次，这是刻意的。
 */
export function selectDue(
  tasks: readonly Task[],
  state: ReminderState,
  now: Date,
  lookaheadMinutes = REMIND_WINDOW_MINUTES,
) {
  const horizon = now.getTime() + lookaheadMinutes * 60_000
  const done = new Set(state.notified.map((item) => key(item.taskId, item.dueAt)))
  return tasks.filter((task) => {
    if (task.status !== "open" || task.dueAt === undefined) return false
    if (done.has(key(task.id, task.dueAt))) return false
    const due = Date.parse(task.dueAt)
    if (!Number.isFinite(due)) return false
    return due <= horizon
  })
}

export interface PollResult {
  readonly published: readonly string[]
  readonly scheduled: readonly string[]
  readonly local: readonly string[]
}

/**
 * 跑一轮提醒。有宿主定时能力时优先排进宿主；没排上的（能力缺失或调用失败）在本轮直接发收件箱消息，
 * 不等到下一分钟——期限已经过了，再等只会更晚。
 */
export async function pollReminders(input: {
  readonly dataDir: string
  readonly port: ReminderPort
  readonly hostSchedule?: HostSchedule
  readonly now?: Date
  readonly lookaheadMinutes?: number
  readonly tasks?: readonly Task[]
}): Promise<PollResult> {
  const now = input.now ?? new Date()
  const at = now.toISOString()
  const tasks = input.tasks ?? (await loadTasks(input.dataDir))
  const state = await loadReminderState(input.dataDir)
  const due = selectDue(tasks, state, now, input.lookaheadMinutes ?? REMIND_WINDOW_MINUTES)
  if (due.length === 0) return { published: [], scheduled: [], local: [] }

  const scheduled: ReminderState["scheduled"][number][] = []
  const published: string[] = []
  const local: string[] = []
  for (const task of due) {
    const dueAt = task.dueAt!
    const externalID = key(task.id, dueAt)
    const host =
      input.hostSchedule === undefined
        ? false
        : await input.hostSchedule
            .schedule({ externalID, title: task.title, at: dueAt, taskId: task.id })
            .catch(() => false)
    if (host) {
      scheduled.push({ taskId: task.id, dueAt })
      continue
    }
    await input.port.publish({
      externalID,
      title: `任务到期：${task.title}`,
      summary: summaryOf(task, now),
      payload: { kind: "hyt-task-reminder", taskId: task.id, dueAt, sessionId: task.source.sessionId, messageId: task.source.messageId },
    })
    published.push(task.id)
    local.push(task.id)
  }

  await saveReminderState(input.dataDir, {
    version: 1,
    notified: [
      ...state.notified,
      ...due.map((task) => ({ taskId: task.id, dueAt: task.dueAt!, at })),
    ].slice(-500),
    scheduled: [...state.scheduled, ...scheduled].slice(-500),
  })
  return { published, scheduled: scheduled.map((item) => item.taskId), local }
}

export function reminderText(task: Task, now = new Date()) {
  if (task.dueAt === undefined) return task.title
  const due = Date.parse(task.dueAt)
  const late = Number.isFinite(due) ? Math.round((now.getTime() - due) / 60_000) : 0
  const suffix = late > 0 ? `（已超 ${formatMinutes(late)}）` : ""
  return `「${task.title}」${suffix}`
}

/** 启动提醒定时器；每一轮先读任务台账，任务被标记完成后自然不再提醒。 */
export function startReminders(input: {
  readonly dataDir: string
  readonly port: ReminderPort
  readonly hostSchedule?: HostSchedule
  readonly intervalMs?: number
  readonly lookaheadMinutes?: number
  readonly onError?: (error: unknown) => void
  readonly now?: () => Date
}) {
  let running = false
  let stopped = false
  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      await pollReminders({
        dataDir: input.dataDir,
        port: input.port,
        ...(input.hostSchedule === undefined ? {} : { hostSchedule: input.hostSchedule }),
        ...(input.lookaheadMinutes === undefined ? {} : { lookaheadMinutes: input.lookaheadMinutes }),
        ...(input.now === undefined ? {} : { now: input.now() }),
      })
    } catch (error) {
      input.onError?.(error)
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => void tick(), Math.max(10_000, input.intervalMs ?? 60_000))
  timer.unref?.()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}

function summaryOf(task: Task, now: Date) {
  const parts = [task.detail.trim(), task.source.sender.length > 0 ? `来自 ${task.source.sender}` : "", reminderText(task, now)]
  return parts.filter(Boolean).join("｜")
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  return `${Math.floor(hours / 24)} 天`
}

function key(taskId: string, dueAt: string) {
  return `${taskId}@${dueAt}`
}

function pair(item: unknown) {
  if (!isRecord(item) || typeof item.taskId !== "string" || typeof item.dueAt !== "string") return []
  return [{ taskId: item.taskId, dueAt: item.dueAt, at: typeof item.at === "string" ? item.at : "" }]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export { isDue }
