import { NodeFileSystem, NodePath, NodeRuntime } from "@effect/platform-node"
import { app } from "electron"
import { Effect, Layer } from "effect"
import { Plugins } from "./plugin"
import { Ipc } from "./ipc"
import { DesktopInitialization } from "./lifecycle/desktop-initialization"
import { installContextMenu } from "./lifecycle/environment"
import { ApplicationLifecycle } from "./lifecycle"
import { DesktopLogging } from "./native/logging"
import { mainDiagnostics } from "./native/diagnostics"
import { BackgroundService } from "./service/background-service"
import { DesktopCli } from "./service/desktop-cli"
import { installBundledDistribution } from "./distribution"
import { marks } from "./lifecycle/marks"

// Everything above has been loaded and evaluated by now; the layers start below.
marks.bundle = Date.now()

const runIpc = Effect.fn("Desktop.runIpc")(function* () {
  // The Explore catalog and the skill loader read the user's ~/.distribution, so the bundled copy
  // must land before the first IPC reply. The copy itself starts while the first window loads.
  yield* Effect.tryPromise({ try: installBundledDistribution, catch: (error) => error }).pipe(
    Effect.catch((error) => Effect.logWarning("failed to install bundled plugins and skills", { error })),
  )
  const lifecycle = yield* ApplicationLifecycle.Service
  const plugins = yield* Plugins.Service
  marks.layers = Date.now()
  yield* Effect.logInfo("layers ready", { marks })
  // Before the IPC port is handed out, so the first replies are measured too.
  yield* Effect.sync(() => mainDiagnostics.start())
  yield* Effect.addFinalizer(() => Effect.sync(() => mainDiagnostics.stop()))
  const ipc = yield* Ipc.registerIpcHandlers
  // Main GUI plugins start with the window: servers they restore feed the first paint's server
  // list, and menu items they contribute are present at startup. Their heavy modules load lazily on
  // first use.
  yield* Effect.forkScoped(plugins.start)

  if (lifecycle.restoreWindows().length) ipc.installMenu()
  // The first window's renderer now has its IPC port and is hydrating its stores over it. The crash
  // reporter (spawns a process) and the context menu (a dependency tree) are not worth answering late.
  yield* Effect.sleep("500 millis")
  const logging = yield* DesktopLogging.Service
  yield* logging.startCrashReporter
  yield* installContextMenu
  yield* Effect.callback<void>((resume) => {
    const quit = () => resume(Effect.void)
    app.once("will-quit", quit)

    return Effect.sync(() => app.off("will-quit", quit))
  })
})

runIpc().pipe(
  Effect.provide(Ipc.layer),
  Effect.provide(BackgroundService.layer),
  Effect.provide(DesktopCli.layer),
  Effect.provide(DesktopInitialization.layer),
  Effect.provide(ApplicationLifecycle.layer),
  Effect.provide(Layer.merge(NodeFileSystem.layer, NodePath.layer)),
  Effect.scoped,
  NodeRuntime.runMain,
)
