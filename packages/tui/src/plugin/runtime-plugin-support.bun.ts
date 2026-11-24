import { ensurePluginRuntime, provides } from "@aicraft/plugin/runtime"
import { Plugin, PluginContextProvider, usePlugin } from "@aicraft/plugin/tui"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"

ensurePluginRuntime()
ensureRuntimePluginSupport({
  additional: {
    "@aicraft/plugin/tui": { Plugin, PluginContextProvider, usePlugin },
  },
  preserve: provides,
})
