import { useQuery } from "@tanstack/solid-query"
import { createMemo } from "solid-js"
import type { ExperimentalServerKnowledgeSearchOutput } from "@opencode/client/promise"
import { usePlatform } from "@/runtime/platform/platform"
import { useServer } from "@/runtime/server/current"
import { normalizeAgentList } from "@/runtime/server/global-sync/utils"
import type { Knowledge } from "../model"
import { linkKnowledgeLibrary } from "../link"
import type { KnowledgeLibrary } from "../store"

export type SearchHit = ExperimentalServerKnowledgeSearchOutput[number]

/**
 * The server owns indexing and retrieval, so search and assignment go through its SDK while the
 * documents themselves stay in desktop storage. A library is readable by this project's Agents only
 * after it is assigned here.
 *
 * The knowledge page has no session, so the project it acts for is the last one this window used,
 * falling back to the first one the server lists.
 */
export function createWorkspaceData(knowledge: Knowledge) {
  const platform = usePlatform()
  const server = useServer()
  const ctx = server.ctx

  const project = () => ctx.projects.last() ?? ctx.projects.list()[0]
  const projectID = () => project()?.id
  const directory = () => project()?.worktree ?? ""
  const connected = () => server.ctx.sdk.connection.status() === "connected" && !!projectID()
  const sdk = () => server.ctx.sdk

  const agents = createMemo(() =>
    normalizeAgentList(ctx.data.location.agent.list({ directory: directory() }) ?? []).filter(
      (agent) => agent.mode !== "subagent" && !agent.hidden,
    ),
  )

  const assigned = useQuery(() => ({
    queryKey: [sdk().scope, "knowledge-workspace-assigned", projectID()],
    enabled: connected(),
    queryFn: () => sdk().api.experimental["server.knowledge"].assigned({ projectID: projectID()! }),
  }))

  const assignedRows = createMemo(() => assigned.data ?? [])
  const assignedIDs = createMemo(() => new Set(assignedRows().map((row) => row.id)))
  const infoOf = (libraryID: string) => assignedRows().find((row) => row.id === libraryID)
  const isLinked = (libraryID: string) => assignedIDs().has(libraryID)

  /** Desktop storage owns the content, so the workspace reads it back instead of trusting a cached list. */
  const refreshLibrary = async (libraryID: string) => {
    const stored = await platform.listKnowledgeFiles?.({ libraryID }).catch(() => undefined)

    if (stored) knowledge.libraries.setFiles(libraryID, stored.files)
  }

  const link = async (library: KnowledgeLibrary) => {
    if (!projectID() || !connected()) throw new Error("knowledge-workspace-unavailable")

    await linkKnowledgeLibrary({ api: sdk().api, platform, library, projectID: projectID()! })
    await assigned.refetch()
  }

  const unlink = async (libraryID: string) => {
    if (!projectID()) throw new Error("knowledge-workspace-unavailable")

    await sdk().api.experimental["server.knowledge"].unassign({ projectID: projectID()!, libraryID })
    await assigned.refetch()
  }

  const search = async (query: string) => {
    if (!query.trim()) return []

    return sdk().api.experimental["server.knowledge"].search({
      query,
      projectID: projectID(),
      limit: 30,
    })
  }

  const exportText = async (libraryID: string, path: string, name: string) => {
    const save = platform.saveFile

    if (!save) return false
    const result = await platform.readKnowledgeFile?.({ libraryID, path })
    const text = result?.text ?? ""

    return save({ defaultPath: name.endsWith(".md") ? name : `${name}.md` }, text)
  }

  const reveal = async (path: string, source: string) => {
    const revealPath = platform.revealPath

    if (!revealPath) return false

    return revealPath(source || path)
  }

  return {
    agents,
    projectID,
    connected,
    assigned,
    assignedRows,
    infoOf,
    isLinked,
    refreshLibrary,
    link,
    unlink,
    search,
    exportText,
    reveal,
  }
}

export type WorkspaceData = ReturnType<typeof createWorkspaceData>
