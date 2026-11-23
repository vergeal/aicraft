import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.OPENCODE_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

const appNames: Record<string, string> = {
  dev: "aicraft Dev",
  beta: "aicraft Beta",
  prod: "aicraft",
}

const appIDs: Record<string, string> = {
  dev: "changhong.aicraft.desktop.dev",
  beta: "changhong.aicraft.desktop.beta",
  prod: "changhong.aicraft.desktop",
}

// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "aicraft Dev"

export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "changhong.aicraft.desktop.dev"
