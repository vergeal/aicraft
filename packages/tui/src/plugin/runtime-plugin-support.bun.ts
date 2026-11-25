import { ensurePluginRuntime, provides } from "@aicraft/aix/runtime"
import { Plugin, PluginContextProvider, usePlugin } from "@aicraft/aix/tui"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"

ensurePluginRuntime()
ensureRuntimePluginSupport({
  additional: {
    "@aicraft/aix/tui": { Plugin, PluginContextProvider, usePlugin },
  },
  preserve: provides,
})
