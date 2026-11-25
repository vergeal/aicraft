import { createResource, onCleanup } from "solid-js"
import type { ExperimentalConfigUpdateInput } from "@aicraft/client/promise"
import { useServerSDK } from "@/runtime/server/client"
import { useLanguage } from "@/runtime/i18n/language"
import { showToast } from "@/shell/notifications/toast"

/** The `memory` section as the config endpoint carries it: every key optional, absent means inherit. */
type MemoryPatch = NonNullable<ExperimentalConfigUpdateInput["memory"]>

/** Retrieval channels read back into each request, cheapest first. Mirrors `ConfigMemory.AutoInject`. */
export type MemoryInjectionMode = "off" | "trigger" | "vector"

export interface MemorySettings {
  readonly auto_inject: MemoryInjectionMode
  readonly max_injected_chars: number
  readonly max_entries: number
  readonly extract: boolean
}

/**
 * What the backend uses for a key the config never writes: `fromConfig` in
 * `packages/core/src/memory/service.ts` over `DEFAULT_SETTINGS` in `packages/memory/src/types.ts`. The
 * page always writes a concrete value instead of deleting a key, so the config merge keeps any field
 * this page does not show.
 */
export const MEMORY_DEFAULTS: MemorySettings = {
  auto_inject: "vector",
  max_injected_chars: 1500,
  max_entries: 200,
  extract: true,
}

export function createMemorySettingsController() {
  const sdk = useServerSDK()
  const language = useLanguage()

  // Only the global documents: `memory` is a global section and this page writes the global config.
  const [state, actions] = createResource(
    async () => {
      const entries = await sdk.api.config.get().catch(() => [])
      const boundary = entries.findIndex((entry) => entry.type === "directory")

      const sections = (boundary === -1 ? entries : entries.slice(0, boundary)).flatMap((entry) =>
        entry.type === "document" && entry.info.memory ? [entry.info.memory] : [],
      )

      // The config chain layers documents in order, so the last document that names a key owns it.
      const latest = <Value>(pick: (memory: MemoryPatch) => Value | undefined, fallback: Value) =>
        sections
          .map(pick)
          .filter((value): value is Value => value !== undefined)
          .at(-1) ?? fallback

      return {
        auto_inject: latest((memory) => memory.auto_inject, MEMORY_DEFAULTS.auto_inject),
        max_injected_chars: latest((memory) => memory.max_injected_chars, MEMORY_DEFAULTS.max_injected_chars),
        max_entries: latest((memory) => memory.max_entries, MEMORY_DEFAULTS.max_entries),
        extract: latest((memory) => memory.extract, MEMORY_DEFAULTS.extract),
      }
    },
    { initialValue: MEMORY_DEFAULTS },
  )

  onCleanup(sdk.event.on("config.updated", () => void actions.refetch()))

  const loaded = () => state.state === "ready" || state.state === "refreshing"

  return {
    // Guarded read: the first load would otherwise suspend the whole settings panel.
    current: () => (loaded() ? state.latest : MEMORY_DEFAULTS),
    set: (patch: MemoryPatch) => {
      const previous = { ...state.latest }
      actions.mutate({ ...previous, ...patch })

      void sdk.api.experimental.config.update({ memory: patch }).catch((error) => {
        actions.mutate(previous)
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: error instanceof Error ? error.message : language.t("common.requestFailed"),
        })
      })
    },
  }
}
