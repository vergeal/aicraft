// The two values a dump takes at export time rather than from a recorder: the renderer environment and the
// DOM snapshot. Both read the live document, so they only make sense inside the renderer.

import type { DiagnosticsExtra } from "./types"

export type Clock = { timeOrigin: number; offsetMs: number }

const MAX_DOM_CHARS = 1_000_000
const DOM_EXCLUDED = "script,style,link,noscript,[data-diagnostics-ignore]"

export function environment(extra: DiagnosticsExtra, clock: Clock): Record<string, unknown> {
  const media = (query: string) => matchMedia(query).matches

  return {
    url: location.href,
    route: extra.route,
    sessionID: extra.sessionID,
    server: extra.server,
    app: extra.app,
    theme: document.documentElement.dataset.colorScheme ?? null,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    languages: Array.from(navigator.languages),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dpr: devicePixelRatio,
    screen: { width: screen.width, height: screen.height },
    viewport: { width: innerWidth, height: innerHeight },
    colorScheme: media("(prefers-color-scheme: dark)") ? "dark" : "light",
    reducedMotion: media("(prefers-reduced-motion: reduce)"),
    reducedTransparency: media("(prefers-reduced-transparency: reduce)"),
    online: navigator.onLine,
    clock,
  }
}

export function domSnapshot() {
  const clone = document.documentElement.cloneNode(true) as HTMLElement
  clone.querySelectorAll(DOM_EXCLUDED).forEach((node) => node.remove())
  const html = clone.outerHTML

  return {
    html: html.length > MAX_DOM_CHARS ? html.slice(0, MAX_DOM_CHARS) : html,
    truncated: html.length > MAX_DOM_CHARS,
    nodes: document.querySelectorAll("*").length,
  }
}
