import { BrowserWindow } from "electron"
import { desktopZoomLevelFactor, nextDesktopZoomLevel, type DesktopMenuAction } from "@aicraft/app/desktop-menu"
import { setZoomLevel } from "../windows"

export type DesktopMenuActionHandlers = Partial<{
  installCli: () => void
  createWindow: () => void
  relaunch: () => void
}>

export function runDesktopMenuAction(
  win: BrowserWindow | null,
  action: DesktopMenuAction,
  handlers: DesktopMenuActionHandlers = {},
) {
  switch (action) {
    case "app.installCli":
      handlers.installCli?.()

      return
    case "app.relaunch":
      handlers.relaunch?.()

      return
    case "window.new":
      handlers.createWindow?.()

      return
    case "window.close":
      win?.close()

      return
    case "window.minimize":
      win?.minimize()

      return
    case "window.toggleMaximize":
      if (win?.isMaximized()) {
        win.unmaximize()

        return
      }

      win?.maximize()

      return
    case "view.reload":
      win?.reload()

      return
    case "view.toggleDevTools":
      if (!win) return
      // Windows paints its window controls over the whole window, so a docked DevTools loses the buttons
      // in its top-right corner underneath them. Open it in its own window there instead.
      if (win.webContents.isDevToolsOpened()) return win.webContents.closeDevTools()
      win.webContents.openDevTools({ mode: process.platform === "win32" ? "detach" : "right" })

      return
    case "view.resetZoom":
      setZoomLevel(1)

      return
    case "view.zoomIn":
      if (win) setZoomLevel(nextDesktopZoomLevel(desktopZoomLevelFactor(win.webContents.getZoomFactor()), "in"))

      return
    case "view.zoomOut":
      if (win) setZoomLevel(nextDesktopZoomLevel(desktopZoomLevelFactor(win.webContents.getZoomFactor()), "out"))

      return
    case "view.toggleFullscreen":
      win?.setFullScreen(!win.isFullScreen())

      return
    case "edit.undo":
      win?.webContents.undo()

      return
    case "edit.redo":
      win?.webContents.redo()

      return
    case "edit.cut":
      win?.webContents.cut()

      return
    case "edit.copy":
      win?.webContents.copy()

      return
    case "edit.paste":
      win?.webContents.paste()

      return
    case "edit.delete":
      win?.webContents.delete()

      return
    case "edit.selectAll":
      win?.webContents.selectAll()

      return
  }
}
