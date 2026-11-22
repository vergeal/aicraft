import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * 任务台账：<plugin data>/hyt/tasks.json。
 * 任务来自聊天里被识别的「要你跟进的事」，也可以由用户手动登记。
 */

export type TaskStatus = "open" | "done" | "dismissed"

export interface TaskSource {
  readonly sessionId: string
  readonly messageId: string
  readonly sender: string
}

export interface Task {
  readonly id: string
  readonly title: string
  readonly detail: string
  /** ISO 时间；没有期限时省略。 */
  readonly dueAt?: string
  readonly source: TaskSource
  readonly status: TaskStatus
  readonly createdAt: string
}

export interface NewTask {
  readonly title: string
  readonly detail?: string
  readonly dueAt?: string
  readonly source?: Partial<TaskSource>
}

const STATUS: readonly TaskStatus[] = ["open", "done", "dismissed"]

export function tasksPath(dataDir: string) {
  return join(dataDir, "hyt", "tasks.json")
}

export async function loadTasks(dataDir: string): Promise<Task[]> {
  const file = Bun.file(tasksPath(dataDir))
  if (!(await file.exists())) return []
  const parsed = await file.json().catch(() => undefined)
  if (!isRecord(parsed) || !Array.isArray(parsed.tasks)) return []
  return parsed.tasks.flatMap((item) => {
    if (!isRecord(item)) return []
    const title = text(item.title)
    if (title.length === 0) return []
    const status = STATUS.find((value) => value === item.status) ?? "open"
    return [
      {
        id: text(item.id) || newId(),
        title,
        detail: text(item.detail),
        ...(text(item.dueAt).length > 0 ? { dueAt: text(item.dueAt) } : {}),
        source: {
          sessionId: isRecord(item.source) ? text(item.source.sessionId) : "",
          messageId: isRecord(item.source) ? text(item.source.messageId) : "",
          sender: isRecord(item.source) ? text(item.source.sender) : "",
        },
        status,
        createdAt: text(item.createdAt) || new Date(0).toISOString(),
      },
    ]
  })
}

export async function saveTasks(dataDir: string, tasks: readonly Task[]) {
  const path = tasksPath(dataDir)
  await mkdir(join(dataDir, "hyt"), { recursive: true })
  await writeFile(`${path}.tmp`, JSON.stringify({ version: 1, tasks }, null, 2) + "\n", "utf8")
  await rename(`${path}.tmp`, path)
}

/** 登记一条任务；同标题且仍打开的旧任务不重复登记。 */
export async function addTask(dataDir: string, input: NewTask, now: string) {
  const title = input.title.trim()
  if (title.length === 0) throw new Error("任务标题不能为空。")
  const tasks = await loadTasks(dataDir)
  const duplicate = tasks.find((task) => task.status === "open" && task.title === title)
  if (duplicate !== undefined) return { task: duplicate, duplicate: true }
  const task: Task = {
    id: newId(),
    title,
    detail: input.detail?.trim() ?? "",
    ...(input.dueAt !== undefined && input.dueAt.trim().length > 0 ? { dueAt: input.dueAt.trim() } : {}),
    source: {
      sessionId: input.source?.sessionId ?? "",
      messageId: input.source?.messageId ?? "",
      sender: input.source?.sender ?? "",
    },
    status: "open",
    createdAt: now,
  }
  await saveTasks(dataDir, [...tasks, task])
  return { task, duplicate: false }
}

export async function setTaskStatus(dataDir: string, id: string, status: TaskStatus) {
  const tasks = await loadTasks(dataDir)
  const target = tasks.find((task) => task.id === id)
  if (target === undefined) return undefined
  const updated: Task = { ...target, status }
  await saveTasks(dataDir, tasks.map((task) => (task.id === id ? updated : task)))
  return updated
}

export async function listTasks(dataDir: string, options: { status?: TaskStatus | "all" } = {}) {
  const tasks = await loadTasks(dataDir)
  const status = options.status ?? "open"
  const filtered = status === "all" ? tasks : tasks.filter((task) => task.status === status)
  return [...filtered].sort((left, right) => (left.createdAt < right.createdAt ? 1 : left.createdAt > right.createdAt ? -1 : 0))
}

function newId() {
  return `task_${crypto.randomUUID()}`
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
