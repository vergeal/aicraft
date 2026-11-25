import type { MainSurface } from "@aicraft/aix/gui"

/** One contributed main surface, with the plugin that contributed it. */
export type MainSurfaceEntry = {
  readonly plugin: string
  readonly value: MainSurface
}

/** The address of a plugin's main surface: its primary-navigation row and its page. */
export function mainSurfacePath(plugin: string, id: string) {
  return `/plugins/${encodeURIComponent(plugin)}/${encodeURIComponent(id)}`
}

/**
 * The surfaces the primary navigation lists: hidden ones stay reachable by address, and the rest list by ascending
 * `order`, ties keeping contribution order.
 */
export function mainSurfaceEntries(items: readonly MainSurfaceEntry[]): readonly MainSurfaceEntry[] {
  return items
    .filter((item) => !item.value.hidden)
    .toSorted((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0))
}

/** The surface a plugin contributed under `id`, while the plugin is running and still contributes it. */
export function findMainSurface(items: readonly MainSurfaceEntry[], plugin: string, id: string) {
  return items.find((item) => item.plugin === plugin && item.value.id === id)
}
