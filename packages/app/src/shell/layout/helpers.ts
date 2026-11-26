import type { SessionInfo } from "@aicraft/client/promise"
import { pathKey } from "@/workspaces/path-key"
import { isProjectDirectory } from "@/workspaces/paths"
import type { ServerConnection } from "@/runtime/server/registry"
import type { HomeProjectSelection } from "@/shell/state/layout"

export function compareSessionTime(a: SessionInfo, b: SessionInfo) {
  const updated = (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created)

  if (updated !== 0) return updated

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// The server keeps `time.updated` behind the idle marker when a run ends, so
// `idle >= updated` means the successful completion is the session's last word;
// a newer prompt advances `updated` and drops it back into plain time order.
export function sessionAwaitingReview(session: SessionInfo) {
  const idle = session.time.idle

  return session.outcome === "succeeded" && idle !== undefined && idle >= (session.time.updated ?? session.time.created)
}

// A finished run waits at the top of its list (below pinned rows) so the user
// finds it without hunting through recent activity. Newer completions pass it;
// it keeps its rank until newer activity in the session itself overtakes it.
export function promoteAwaitingReview<T>(items: T[], sessionOf: (item: T) => SessionInfo) {
  const completed = items.filter((item) => sessionAwaitingReview(sessionOf(item)))

  if (completed.length === 0) return items

  const promoted = new Set(completed.map((item) => sessionOf(item).id))
  const byCompletion = (a: T, b: T) => {
    const idle = (sessionOf(b).time.idle ?? 0) - (sessionOf(a).time.idle ?? 0)

    return idle || compareSessionTime(sessionOf(a), sessionOf(b))
  }

  return [...completed.toSorted(byCompletion), ...items.filter((item) => !promoted.has(sessionOf(item).id))]
}

export function toggleHomeProjectSelection(
  current: HomeProjectSelection | undefined,
  server: ServerConnection.Key,
  directory: string,
): HomeProjectSelection {
  if (current?.server === server && current.directory === directory) return { server }

  return { server, directory }
}

export function homeProjectDirectories(result: string | string[] | null) {
  if (!result) return []

  return Array.isArray(result) ? result : [result]
}

export function projectForSession<T extends { id?: string; worktree: string; sandboxes?: string[] }>(
  session: SessionInfo,
  projects: T[],
) {
  const matching = projects.filter((project) => project.id === session.projectID)

  if (matching.length === 1) return matching[0]

  if (matching.length > 1) {
    const directory = pathKey(session.location.directory)

    const exact =
      matching.find((project) => pathKey(project.worktree) === directory) ??
      matching.find((project) => project.sandboxes?.some((sandbox) => pathKey(sandbox) === directory))

    if (exact) return exact

    return (
      matching
        .filter((project) => isProjectDirectory(project, session.location.directory))
        .sort((a, b) => b.worktree.length - a.worktree.length)[0] ?? matching.at(-1)
    )
  }

  const directory = pathKey(session.location.directory)

  const exact =
    projects.find((project) => pathKey(project.worktree) === directory) ??
    projects.find((project) => project.sandboxes?.some((sandbox) => pathKey(sandbox) === directory))

  if (exact) return exact

  return projects
    .filter((project) => isProjectDirectory(project, session.location.directory))
    .sort((a, b) => b.worktree.length - a.worktree.length)[0]
}

export const errorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data

    if (data?.message) return data.message
  }

  if (err instanceof Error) return err.message

  return fallback
}
