import { describe, expect, test } from "bun:test"
import type { SessionInfo } from "@aicraft/client/promise"
import type { LocalProject } from "@/shell/state/layout"
import { buildHomeSessionRecords, homeSessionLocation } from "./records"

const session = (id: string, directory: string, projectID: string) =>
  ({
    id,
    projectID,
    title: id,
    location: { directory },
    time: { created: 1, updated: 1 },
  }) as SessionInfo

describe("buildHomeSessionRecords", () => {
  const opened = { id: "project-a", worktree: "/repo/a" } as LocalProject
  const sessions = [session("a", "/repo/a", "project-a"), session("b", "/repo/b", "project-b")]

  const finished = (
    id: string,
    time: { updated: number; idle?: number },
    outcome?: "succeeded" | "failed" | "interrupted",
  ) => ({ ...session(id, "/repo/a", "project-a"), outcome, time: { created: 1, ...time } })

  const finishedSessions = [
    finished("busy", { updated: 10 }),
    finished("failed", { updated: 11, idle: 9 }, "failed"),
    finished("done-new", { updated: 6, idle: 7 }, "succeeded"),
    finished("done-old", { updated: 4, idle: 5 }, "succeeded"),
    finished("done-then-prompted", { updated: 12, idle: 8 }, "succeeded"),
  ]

  test("includes sessions outside added projects when unfiltered", () => {
    const records = buildHomeSessionRecords({
      sessions: () => sessions,
      projectDirectories: () => undefined,
      projects: () => [opened],
    })

    expect(records.map((record) => record.session.id)).toEqual(["a", "b"])
    expect(records[1]?.project).toMatchObject({ id: "project-b", worktree: "/repo/b" })
  })

  test("filters sessions when a project is selected", () => {
    const records = buildHomeSessionRecords({
      sessions: () => sessions,
      projectDirectories: () => ["/repo/a"],
      projects: () => [opened],
    })

    expect(records.map((record) => record.session.id)).toEqual(["a"])
  })

  test("labels a worktree session with its project before that project's inventory has loaded", () => {
    const records = buildHomeSessionRecords({
      sessions: () => [session("w", "/repo/a/.worktrees/feature", "project-a")],
      projectDirectories: () => undefined,
      projects: () => [{ ...opened, name: "Project A" }],
    })

    expect(records[0]?.project).toMatchObject({ id: "project-a", worktree: "/repo/a" })
    expect(records[0]?.projectName).toBe("Project A")
  })

  test("prefers the added project whose directory matches over a sibling entry with the same ID", () => {
    const nested = { id: "project-a", worktree: "/repo/a/packages/app" } as LocalProject

    const records = buildHomeSessionRecords({
      sessions: () => [session("n", "/repo/a/packages/app", "project-a")],
      projectDirectories: () => undefined,
      projects: () => [opened, nested],
    })

    expect(records[0]?.project.worktree).toBe("/repo/a/packages/app")
  })

  test("orders by update time and uses the id only to break equal timestamps", () => {
    const at = (id: string, updated: number) => ({
      ...session(id, "/repo/a", "project-a"),
      time: { created: 1, updated },
    })

    const records = buildHomeSessionRecords({
      sessions: () => [at("ses_z", 2), at("ses_old", 1), at("ses_a", 2)],
      projectDirectories: () => undefined,
      projects: () => [opened],
    })

    expect(records.map((record) => record.session.id)).toEqual(["ses_a", "ses_z", "ses_old"])
  })

  test("pins finished sessions to the top of the selected project's list", () => {
    const records = buildHomeSessionRecords({
      sessions: () => finishedSessions,
      projectDirectories: () => ["/repo/a"],
      projects: () => [opened],
    })

    expect(records.map((record) => record.session.id)).toEqual([
      "done-new",
      "done-old",
      "done-then-prompted",
      "failed",
      "busy",
    ])
  })

  test("keeps finished sessions in plain time order when no project is selected", () => {
    const records = buildHomeSessionRecords({
      sessions: () => finishedSessions,
      projectDirectories: () => undefined,
      projects: () => [opened],
    })

    expect(records.map((record) => record.session.id)).toEqual([
      "done-then-prompted",
      "failed",
      "busy",
      "done-new",
      "done-old",
    ])
  })
})

test("homeSessionLocation returns the worktree directory name and branch when known", () => {
  expect(homeSessionLocation("/repo/.worktrees/crisp-cactus", "feature/home")).toEqual({
    worktree: "crisp-cactus",
    branch: "feature/home",
  })
  expect(homeSessionLocation("/repo/.worktrees/crisp-cactus")).toEqual({ worktree: "crisp-cactus", branch: undefined })
})
