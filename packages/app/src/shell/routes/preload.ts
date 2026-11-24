import { lazy } from "solid-js"

/**
 * Every screen the app can open is one lazy chunk. Which chunk a route needs is decided here so an entry point can
 * warm it before the user commits: a click that also has to fetch and compile a page lands later than one that does
 * not, and under the dev server that gap is the page's whole module graph.
 *
 * The dynamic import shares the module cache with the route's own `lazy()`, so warming never loads a chunk twice.
 */
export const File = lazy(() => import("@aicraft/session-ui/file").then((module) => ({ default: module.File })))

export const DraftRoute = lazy(() => import("@/new-session/route").then((module) => ({ default: module.DraftRoute })))

export const SettingsScreen = lazy(() =>
  import("@/settings/shell").then((module) => ({ default: module.SettingsScreen })),
)

export const KnowledgeScreen = lazy(() =>
  import("@/knowledge/route").then((module) => ({ default: module.KnowledgeScreen })),
)

export const ExploreScreen = lazy(() =>
  import("@/explore/route").then((module) => ({ default: module.ExploreScreen })),
)

export const ScheduledScreen = lazy(() =>
  import("@/scheduled/route").then((module) => ({ default: module.ScheduledScreen })),
)

export const InboxScreen = lazy(() => import("@/inbox/route").then((module) => ({ default: module.InboxScreen })))

export const PluginSurfaceScreen = lazy(() =>
  import("@/shell/routes/plugin-surface").then((module) => ({ default: module.PluginSurfaceScreen })),
)

const loadSessionRoute = () => Promise.all([import("@/session/route"), File.preload()]).then(([module]) => module)

export const TargetSessionRouteContent = lazy(() =>
  loadSessionRoute().then((module) => ({ default: module.TargetSessionRouteContent })),
)

/** Warm the chunk behind `url`; navigating there later renders instead of waiting for the download. */
export function preloadRoute(url: string) {
  const pathname = url.split(/[?#]/, 1)[0]

  if (pathname === "/new-session") return DraftRoute.preload().then(() => undefined)

  if (pathname === "/settings") return SettingsScreen.preload().then(() => undefined)

  if (pathname === "/knowledge") return KnowledgeScreen.preload().then(() => undefined)

  if (pathname === "/explore" || pathname.startsWith("/explore/")) return ExploreScreen.preload().then(() => undefined)

  if (pathname === "/scheduled") return ScheduledScreen.preload().then(() => undefined)

  if (pathname === "/inbox") return InboxScreen.preload().then(() => undefined)

  if (/^\/plugins\/[^/]+\/[^/]+$/.test(pathname)) return PluginSurfaceScreen.preload().then(() => undefined)

  if (/^\/server\/[^/]+\/session\/[^/]+$/.test(pathname))
    return TargetSessionRouteContent.preload().then(() => undefined)

  return Promise.resolve()
}

/**
 * Warm a list of routes one chunk at a time. Fanned out in parallel they compete with the work the window is already
 * doing — the first paint, the session list, the plugin bundles — which all matter sooner than a page the user has
 * not asked for yet. A chunk that fails to load is skipped: that route still loads it when it renders, and the rest
 * of the list keeps its warm-up.
 */
export function preloadRoutes(paths: readonly string[]) {
  return paths.reduce((chain, path) => chain.then(() => preloadRoute(path).catch(() => undefined)), Promise.resolve())
}
