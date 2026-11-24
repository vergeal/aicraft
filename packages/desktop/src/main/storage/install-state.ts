export function hasExistingAppState(entries: Array<{ name: string; directory: boolean }>) {
  return entries.some((entry) => {
    if (entry.name === "aicraft.settings" || entry.name === "aicraft.settings") return true

    if (entry.name.endsWith(".dat")) return true

    if (entry.name === "drafts.sqlite") return true

    if (/^window-state-.+\.json$/.test(entry.name)) return true

    return entry.directory && (entry.name === "aicraft" || entry.name === "opencode")
  })
}
