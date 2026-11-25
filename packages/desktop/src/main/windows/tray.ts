import { Menu, Tray, nativeImage } from "electron"
import { nativeT, onNativeTranslations } from "../native/translations"

/**
 * The notification-area icon Windows relies on once closing a window only hides it: a click restores the
 * last focused window, and the right-click menu carries the only direct way to quit.
 */
export function createTray(input: {
  readonly iconPath: string
  readonly restore: () => void
  readonly quit: () => void
}) {
  const tray = new Tray(nativeImage.createFromPath(input.iconPath))

  const contextMenu = () =>
    Menu.buildFromTemplate([
      { label: nativeT("desktop.tray.show"), click: input.restore },
      { type: "separator" },
      { label: nativeT("desktop.tray.quit"), click: input.quit },
    ])

  const translate = () => {
    tray.setToolTip(nativeT("desktop.tray.tooltip"))
    tray.setContextMenu(contextMenu())
  }

  translate()
  tray.on("click", input.restore)
  tray.on("double-click", input.restore)

  // A language switch lands after the menu was built, so rebuild the native copy.
  const unsubscribe = onNativeTranslations(translate)

  return {
    dispose() {
      unsubscribe()
      tray.destroy()
    },
  }
}
