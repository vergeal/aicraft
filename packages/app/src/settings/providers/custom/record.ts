/**
 * Reads the provider records the editor may change. Kept apart from the editor's component module so the composer's
 * model-picker path can import the reader without pulling a settings form into its bundle.
 */
export function customProvidersFrom(entries: readonly unknown[]) {
  return (entries as Array<{
    type?: string
    writable?: boolean
    info?: {
      providers?: Record<
        string,
        { name?: string; settings?: Record<string, unknown>; models?: Record<string, unknown> }
      >
    }
  }>).flatMap((entry) => {
    if (entry.type !== "document" || !entry.writable) return []

    return Object.entries(entry.info?.providers ?? {}).map(([id, provider]) => {
      const baseURL = provider.settings?.baseURL

      return {
        id,
        name: provider.name ?? id,
        baseURL: typeof baseURL === "string" ? baseURL : undefined,
        models: Object.keys(provider.models ?? {}),
        info: provider,
      }
    })
  })
}

/** Providers a document declares but the editor cannot change: a project file, a managed policy. */
export function readOnlyProvidersFrom(entries: readonly unknown[]) {
  return new Set(
    // SAFETY: `entries` is the `config.get` JSON view of `Config.Entry[]`; only the document fields read here exist on
    // it, and a directory entry simply has neither `writable` nor `info.providers`.
    (entries as Array<{ type?: string; writable?: boolean; info?: { providers?: Record<string, unknown> } }>).flatMap(
      (entry) => (entry.type !== "document" || entry.writable ? [] : Object.keys(entry.info?.providers ?? {})),
    ),
  )
}

export type CustomProvider = ReturnType<typeof customProvidersFrom>[number]
