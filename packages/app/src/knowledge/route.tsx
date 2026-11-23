import { createMemo, Show } from "solid-js"
import { ServerProvider } from "@/runtime/server/current"
import { useServers } from "@/runtime/server/registry"
import { WorkspaceProvider } from "./workspace/context"
import { WorkspaceScreen } from "./workspace/screen"

/**
 * The knowledge destination owns its whole surface: a library sidebar beside a content workspace.
 * The app's global rail and titlebar stay outside this route.
 *
 * The workspace reads the current server's projects and SDK, so it brings its own `ServerProvider`
 * the same way the other module routes do; no session route sits above it to supply one.
 */
export function KnowledgeScreen() {
  const servers = useServers()
  const connection = createMemo(() => servers.list[0])

  return (
    <Show when={connection()} keyed fallback={<div class="min-h-0 flex-1" aria-busy="true" />}>
      {(conn) => (
        <ServerProvider conn={conn}>
          <WorkspaceProvider>
            <WorkspaceScreen />
          </WorkspaceProvider>
        </ServerProvider>
      )}
    </Show>
  )
}
