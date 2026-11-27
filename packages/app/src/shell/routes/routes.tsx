import { Route, useParams } from "@solidjs/router"
import { createMemo, lazy, Show, Suspense, type ParentProps } from "solid-js"
import { Home } from "@/home/route"
import { ServerProvider } from "@/runtime/server/current"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { isServerUnauthorized } from "@/runtime/server/health-machine"
import { SessionPanelFrame, SessionRouteFrame } from "@/session/session-frame"
import { ServerSignedOutPanel } from "@/session/server-unavailable-panel"
import { LayoutProvider } from "@/shell/state/layout"
import { SettingsSurfaceProvider } from "@/settings/surface"
import Shell from "@/shell/shell"
import { routeServerKey } from "./session"
import { PluginAttachment } from "@/runtime/plugin/root"
import {
  DraftRoute,
  ExploreScreen,
  InboxScreen,
  KnowledgeScreen,
  PluginSurfaceScreen,
  ScheduledScreen,
  SettingsScreen,
  TargetSessionRouteContent,
} from "./preload"

const ConnectServerScreen = lazy(() =>
  import("@/servers/connect/screen").then((module) => ({ default: module.ConnectServerScreen })),
)

// The dev server and Beta only. Both are fixed at build time, so other builds, prod included, drop the import and never
// contain the lab, its stories or knobs. Beta loads it as its own chunk, only when /components opens.
const ComponentsLab =
  import.meta.env.DEV || import.meta.env.VITE_AICRAFT_CHANNEL === "beta"
    ? lazy(() => import("@/components-lab/lab"))
    : undefined

export function AppRoutes() {
  return (
    <Route component={AppLayout}>
      <Route path="/" component={Home} />
      <Route path="/settings" component={SettingsScreen} />
      <Route path="/knowledge" component={KnowledgeScreen} />
      <Route path="/explore" component={ExploreScreen} />
      <Route path="/explore/:section" component={ExploreScreen} />
      <Route path="/explore/:section/:id" component={ExploreScreen} />
      <Route path="/scheduled" component={ScheduledScreen} />
      <Route path="/inbox" component={InboxScreen} />
      <Route path="/plugins/:plugin/:surface" component={PluginSurfaceScreen} />
      <Route
        path="/server/:serverKey/session/:id"
        component={() => (
          <SessionRouteFrame>
            <Suspense
              fallback={
                <div
                  class="flex min-h-0 flex-1 ps-0 pe-[var(--shell-inline-inset,8px)] pb-[var(--shell-bottom-inset,8px)] pt-[var(--shell-top-inset,8px)]"
                >
                  <SessionPanelFrame raised />
                </div>
              }
            >
              <TargetServerRoute>
                <TargetSessionRouteContent />
              </TargetServerRoute>
            </Suspense>
          </SessionRouteFrame>
        )}
      />
      <Route path="/new-session" component={DraftRoute} />
      {ComponentsLab && <Route path="/components" component={ComponentsLab} />}
    </Route>
  )
}

function TargetServerRoute(props: ParentProps) {
  const params = useParams<{ serverKey: string }>()
  const global = useGlobal()

  // The registry merges stored and provided connections into fresh objects whenever any of its inputs are written,
  // including writes that leave this server's connection unchanged (a session switch touches the store). The keyed
  // Show below remounts the whole routed subtree on an identity change, which would throw away the cached timelines,
  // so the memo only moves on a content change.
  const connection = createMemo(
    () => global.servers.list().find((item) => ServerConnection.key(item) === routeServerKey(params.serverKey)),
    undefined,
    {
      equals: (previous, next) =>
        previous === next ||
        (!!previous &&
          !!next &&
          ServerConnection.key(previous) === ServerConnection.key(next) &&
          JSON.stringify(previous) === JSON.stringify(next)),
    },
  )

  return (
    <Show when={connection()} keyed>
      {(connection) => (
        <ServerProvider
          conn={connection}
          signedOut={
            <div class="flex min-h-0 flex-1 ps-0 pe-[var(--shell-inline-inset,8px)] pb-[var(--shell-bottom-inset,8px)] pt-[var(--shell-top-inset,8px)]">
              <SessionPanelFrame raised>
                <ServerSignedOutPanel conn={connection} />
              </SessionPanelFrame>
            </div>
          }
        >
          {props.children}
        </ServerProvider>
      )}
    </Show>
  )
}

function AppLayout(props: ParentProps) {
  const servers = useServers()
  const global = useGlobal()

  // A lone server that rejects our credentials (e.g. the web app before pairing) has nothing else to show.
  const signedOut = () => {
    const only = servers.list.length === 1 ? servers.list[0] : undefined

    if (only?.type !== "http") return

    return isServerUnauthorized(global.servers.health[ServerConnection.key(only)]) ? only : undefined
  }

  return (
    <Show when={servers.list.length > 0 && !signedOut()} fallback={<ConnectServerScreen url={signedOut()?.http.url} />}>
      <LayoutProvider>
        <SettingsSurfaceProvider>
          <PluginAttachment>
            <Shell>{props.children}</Shell>
          </PluginAttachment>
        </SettingsSurfaceProvider>
      </LayoutProvider>
    </Show>
  )
}
