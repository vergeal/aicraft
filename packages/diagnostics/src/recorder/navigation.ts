// Where the app started and every route change afterwards. The session banner is recorded first so a dump
// always opens with the url it was taken in.

import type { Recorder } from "./types"

export const navigationRecorder: Recorder = {
  name: "navigation",
  start(ctx) {
    ctx.observed()
    ctx.record("session.start", {
      url: location.href,
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight },
    })

    const push = history.pushState.bind(history)
    const replace = history.replaceState.bind(history)

    history.pushState = (...args: Parameters<History["pushState"]>) => {
      ctx.observed()
      ctx.record("navigation", { url: String(args[2] ?? "") })
      return push(...args)
    }
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      ctx.observed()
      ctx.record("navigation.replace", { url: String(args[2] ?? "") })
      return replace(...args)
    }
    window.addEventListener("popstate", () => {
      ctx.observed()
      ctx.record("navigation.pop", { url: location.pathname })
    })
  },
}
