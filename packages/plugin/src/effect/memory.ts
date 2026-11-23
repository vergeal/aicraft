import type { Effect } from "effect"

/**
 * One memory a plugin saved for itself. Plugin memories are isolated per plugin and never join the user's global or
 * project scopes, so a plugin cannot read another plugin's entries or the user's own memories.
 */
export interface MemoryEntry {
  readonly id: string
  readonly text: string
  readonly tags: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

export interface MemoryDomain {
  /** This plugin's memories, newest first. */
  readonly list: () => Effect.Effect<readonly MemoryEntry[]>
  /** Matches text and tags, newest first. `limit` defaults to 20. */
  readonly search: (
    query: string,
    options?: { readonly limit?: number },
  ) => Effect.Effect<readonly MemoryEntry[]>
  /** Saves a memory, merging tags into an entry with the same text. Undefined when the text is blank. */
  readonly save: (input: {
    readonly text: string
    readonly tags?: readonly string[]
  }) => Effect.Effect<MemoryEntry | undefined>
  /** Undefined when the id is not this plugin's. Omitted fields keep their current value. */
  readonly update: (input: {
    readonly id: string
    readonly text?: string
    readonly tags?: readonly string[]
  }) => Effect.Effect<MemoryEntry | undefined>
  readonly forget: (id: string) => Effect.Effect<boolean>
}
