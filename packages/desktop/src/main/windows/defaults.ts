import { resolveThemeVariant } from "@opencode/ui/theme/resolve"
import type { DesktopTheme } from "@opencode/ui/theme/types"
import { desktopZoomFactor, desktopZoomLevels } from "@opencode/app/desktop-menu"
import { nativeTheme, type BrowserWindowConstructorOptions } from "electron"
import { Predicate } from "effect"
import oc2ThemeJson from "../../../../ui/src/theme/themes/oc-2.json"
import { BACKGROUND_COLOR_KEY, ZOOM_LEVEL_KEY } from "../storage/keys"
import { getStore } from "../storage/store"

// Frame defaults shared by the early window (created on ready, before the renderer exists) and the
// full window setup in appearance.ts, so both draw the same frame.

// SAFETY: oc-2.json is the bundled default theme, which the UI package loads as a DesktopTheme too.
const oc2Theme = oc2ThemeJson as DesktopTheme

// Windows draws a 32px caption, so the overlay is that tall and its controls line up with every other window.
export const titlebarHeight = 32

export function tone() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light"
}

// The colour the renderer reported on its last run, or the default theme's for the system tone, so
// a window shown before the renderer paints already has the right background. Resolving a palette
// costs tens of milliseconds before the first window, so it only happens when nothing is stored.
export function storedBackgroundColor() {
  const saved = savedBackgroundColor()

  if (saved !== undefined) return saved
  const dark = tone() === "dark"

  return resolveThemeVariant(dark ? oc2Theme.dark : oc2Theme.light, dark)["background-base"]
}

// The colour the renderer reported on its last run, if it ever did.
export function savedBackgroundColor() {
  const stored = getStore().get(BACKGROUND_COLOR_KEY)

  return Predicate.isString(stored) ? stored : undefined
}

// The zoom level chosen in settings or with Zoom In and Zoom Out, or 100% when none was saved.
export function storedZoomLevel() {
  const stored = getStore().get(ZOOM_LEVEL_KEY)

  return desktopZoomLevels.find((level) => level === stored) ?? 1
}

// The web contents zoom factor that level renders at. Chrome sizing takes this factor, never the level.
export function storedZoomFactor() {
  return desktopZoomFactor(storedZoomLevel())
}

export function titlebarOverlay(mode: "light" | "dark" = tone(), factor = 1) {
  return {
    color: "#00000000",
    symbolColor: mode === "dark" ? "white" : "black",
    height: Math.max(titlebarHeight, Math.round(titlebarHeight * factor)),
  }
}

// macOS and Windows hide the titlebar; Windows draws its window controls in an overlay sized to the zoom factor.
export function platformFrame(mode: "light" | "dark", factor: number) {
  const frame: BrowserWindowConstructorOptions = {}

  if (process.platform === "darwin") {
    frame.titleBarStyle = "hidden"
    frame.trafficLightPosition = { x: 14, y: 14 }
    // The replica shell draws its own translucent window frame, so the desktop shows through it. The sidebar
    // material desaturates the wallpaper instead of letting its colours bleed into the chrome, and the effect
    // follows focus so a background window recedes the way a native one does.
    frame.vibrancy = "sidebar"
    frame.visualEffectState = "followWindow"
  }

  if (process.platform === "win32") {
    frame.frame = false
    frame.titleBarStyle = "hidden"
    frame.titleBarOverlay = titlebarOverlay(mode, factor)
    // The replica shell is a square sheet on Windows, so Windows should not round the window underneath it.
    frame.roundedCorners = false
  }

  return frame
}
