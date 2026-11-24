import path from "node:path"
import { AICRAFT_CHANNEL } from "./version"

export function databasePath(data: string) {
  const filename =
    process.env.AICRAFT_DB ??
    (["latest", "dev", "beta", "next", "prod"].includes(AICRAFT_CHANNEL) ||
    process.env.AICRAFT_DISABLE_CHANNEL_DB === "1" ||
    process.env.AICRAFT_DISABLE_CHANNEL_DB === "true"
      ? "aicraft.db"
      : `aicraft-${AICRAFT_CHANNEL.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
  return filename === ":memory:" ? filename : path.resolve(data, filename)
}
