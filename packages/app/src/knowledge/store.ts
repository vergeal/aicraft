import { Schema } from "effect"
import { uuid } from "@aicraft/util/uuid"
import type { KnowledgeDiscard } from "@/runtime/platform/platform"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"

export type KnowledgeFileKind = "document" | "spreadsheet" | "text"

/** The processing lifecycle a document is in, as the workspace shows it. */
export type KnowledgeFileStatus = "pending" | "parsing" | "indexing" | "ready" | "failed"

/** Present once a document has been queued, indexed or has failed; a document without it is readable. */
export type KnowledgeFileProcessing = {
  status: KnowledgeFileStatus
  /** 0-100 while parsing or indexing. */
  progress?: number
  /** Slices the index holds for this document, when the server reports them. */
  chunks?: number
  error?: string
  /** When the last processing run touched the document. */
  at?: number
}

/** What one import looked at, kept and dropped. */
export type KnowledgeImportStats = {
  scanned: number
  kept: number
  /** Files whose content already existed in the library. */
  duplicates: number
  /** Files whose content nearly matched an existing document. */
  similar: number
  /** Non-documents, empty files and documents whose text could not be read. */
  skipped: number
}

export type KnowledgeFile = {
  path: string
  name: string
  /** Display name inside the library; the original file on disk keeps its own name. */
  label?: string
  size: number
  kind: KnowledgeFileKind
  /** Folder the document was imported from; empty for a file imported on its own. */
  root: string
  /** Absolute path of the original document, kept to show where it came from. */
  source: string
  /** Folder the document was filed into inside the library; absent means the imported folder. */
  folder?: string
  favorite?: boolean
  /** Last time the document was opened, for the recent list. */
  openedAt?: number
  /** Last time the entry changed, for sorting; absent falls back to the array order. */
  updatedAt?: number
  /** Set while the document sits in the trash; it keeps its entry so restore loses nothing. */
  deletedAt?: number
  processing?: KnowledgeFileProcessing
}

/** One Agent allowed to read a library. `write` is a local preference; the server index stays read-only. */
export type KnowledgeAgentGrant = {
  agentID: string
  name: string
  write: boolean
  addedAt: number
}

/** A document the import judged off-topic for the library's own description. */
export type KnowledgeFlag = {
  /** Library path of the flagged document. */
  path: string
  reason: string
}

export type KnowledgeLibrary = {
  id: string
  name: string
  summary: string
  /** What the library is for, written when it is created; imports judge documents against it. */
  description?: string
  createdAt: number
  files: KnowledgeFile[]
  /** Folders and files this library took content from. */
  sources: string[]
  /** Totals from the imported documents, summed across imports. */
  stats?: KnowledgeImportStats
  /** Every file an import left out, so the library can explain each decision. */
  discards?: KnowledgeDiscard[]
  /** Documents that may not belong; the user decides whether to remove them. */
  flags?: KnowledgeFlag[]
  favorite?: boolean
  /** Last time the library was opened, for the recent list. */
  openedAt?: number
  updatedAt?: number
  agents?: KnowledgeAgentGrant[]
  /** Folders the user created to file documents into, beyond the imported roots. */
  folders?: string[]
}

const FileProcessing = Persistence.struct({
  status: Schema.Literals(["pending", "parsing", "indexing", "ready", "failed"]),
  progress: Persistence.optional(Schema.Finite),
  chunks: Persistence.optional(Schema.Finite),
  error: Persistence.optional(Schema.String),
  at: Persistence.optional(Schema.Finite),
})

const LibraryFile = Persistence.struct({
  path: Schema.String,
  name: Schema.String,
  label: Persistence.optional(Schema.String),
  size: Schema.Finite,
  kind: Schema.Literals(["document", "spreadsheet", "text"]),
  root: Schema.String,
  source: Schema.String,
  folder: Persistence.optional(Schema.String),
  favorite: Persistence.optional(Schema.Boolean),
  openedAt: Persistence.optional(Schema.Finite),
  updatedAt: Persistence.optional(Schema.Finite),
  deletedAt: Persistence.optional(Schema.Finite),
  processing: Persistence.optional(FileProcessing),
})

const ImportStats = Persistence.struct({
  scanned: Schema.Finite,
  kept: Schema.Finite,
  duplicates: Schema.Finite,
  similar: Schema.Finite,
  skipped: Schema.Finite,
})

const Discard = Persistence.struct({
  reason: Schema.Literals(["duplicate", "similar", "unsupported", "noise", "tooLarge", "empty"]),
  path: Schema.String,
  name: Schema.String,
  matched: Schema.optional(Schema.String),
})

const Flag = Persistence.struct({
  path: Schema.String,
  reason: Schema.String,
})

const AgentGrant = Persistence.struct({
  agentID: Schema.String,
  name: Schema.String,
  write: Schema.Boolean,
  addedAt: Schema.Finite,
})

const Library = Persistence.struct({
  id: Schema.String,
  name: Schema.String,
  summary: Schema.String,
  description: Persistence.optional(Schema.String),
  createdAt: Schema.Finite,
  files: Persistence.array(LibraryFile),
  sources: Persistence.array(Schema.String),
  stats: Persistence.optional(ImportStats),
  discards: Persistence.optional(Persistence.array(Discard)),
  flags: Persistence.optional(Persistence.array(Flag)),
  favorite: Persistence.optional(Schema.Boolean),
  openedAt: Persistence.optional(Schema.Finite),
  updatedAt: Persistence.optional(Schema.Finite),
  agents: Persistence.optional(Persistence.array(AgentGrant)),
  folders: Persistence.optional(Persistence.array(Schema.String)),
})

const Libraries = Persistence.struct({ libraries: Persistence.array(Library) })

const EMPTY_STATS: KnowledgeImportStats = { scanned: 0, kept: 0, duplicates: 0, similar: 0, skipped: 0 }

// One store for every surface: the navigation entry, the library grid and the browser all read the same list.
export function useKnowledgeLibraries() {
  const [state, setState] = persisted({ ...Persist.global("knowledge.libraries"), sync: true }, Libraries, {
    libraries: [],
  })

  const update = (id: string, patch: Partial<Omit<KnowledgeLibrary, "id">>) =>
    setState("libraries", (current) =>
      current.map((library) => (library.id === id ? { ...library, ...patch } : library)),
    )

  return {
    libraries: () => state.libraries,
    get: (id: string) => state.libraries.find((library) => library.id === id),
    create: (name: string, description: string) => {
      const library: KnowledgeLibrary = {
        id: uuid(),
        name,
        summary: "",
        description,
        createdAt: Date.now(),
        files: [],
        sources: [],
        discards: [],
        flags: [],
      }

      setState("libraries", (current) => [...current, library])

      return library.id
    },
    rename: (id: string, name: string) => update(id, { name }),
    remove: (id: string) => setState("libraries", (current) => current.filter((library) => library.id !== id)),
    /**
     * Adds what an import kept and folds its counters into the library's totals, so the card can
     * report what has been deduplicated since the library was created.
     */
    addImported: (
      id: string,
      imported: {
        files: ReadonlyArray<KnowledgeFile>
        sources: ReadonlyArray<string>
        stats: KnowledgeImportStats
        discards: ReadonlyArray<KnowledgeDiscard>
      },
    ) =>
      setState("libraries", (current) =>
        current.map((library) => {
          if (library.id !== id) return library
          const known = new Set(library.files.map((file) => file.path))

          const added = imported.files
            .filter((file) => !known.has(file.path))
            .map((file) => ({ ...file, updatedAt: Date.now(), processing: { status: "ready" as const, at: Date.now() } }))

          const seen = new Set((library.discards ?? []).map(discardKey))

          const discards = [
            ...(library.discards ?? []),
            ...imported.discards.filter((discard) => !seen.has(discardKey(discard))),
          ]

          return {
            ...library,
            files: [...library.files, ...added],
            sources: [...new Set([...library.sources, ...imported.sources])],
            stats: sum(library.stats ?? EMPTY_STATS, imported.stats),
            discards,
          }
        }),
      ),
    /** Replaces the file list from desktop storage, which owns the content a library holds. */
    setFiles: (id: string, files: ReadonlyArray<KnowledgeFile>) =>
      setState("libraries", (current) =>
        current.map((library) => {
          if (library.id !== id) return library

          // Desktop storage owns the content, while the workspace owns filing, favorites and processing
          // state, so a refresh keeps the local extras instead of dropping them.
          const known = new Map(library.files.map((file) => [file.path, file]))

          return {
            ...library,
            files: files.map((file) => {
              const previous = known.get(file.path)

              if (!previous) return file

              return {
                ...file,
                label: previous.label,
                folder: previous.folder,
                favorite: previous.favorite,
                openedAt: previous.openedAt,
                updatedAt: previous.updatedAt,
                deletedAt: previous.deletedAt,
                processing: previous.processing,
              }
            }),
          }
        }),
      ),
    /** Changes one document's entry without touching the stored content. */
    patchFile: (
      id: string,
      path: string,
      patch: Partial<Omit<KnowledgeFile, "path" | "name" | "size" | "kind" | "root" | "source">>,
    ) =>
      setState("libraries", (current) =>
        current.map((library) =>
          library.id === id
            ? {
                ...library,
                files: library.files.map((file) => (file.path === path ? { ...file, ...patch } : file)),
                updatedAt: Date.now(),
              }
            : library,
        ),
      ),
    /** Applies the same change to several documents, one store write for the batch. */
    patchFiles: (
      id: string,
      paths: ReadonlyArray<string>,
      patch: Partial<Omit<KnowledgeFile, "path" | "name" | "size" | "kind" | "root" | "source">>,
    ) => {
      const changed = new Set(paths)

      return setState("libraries", (current) =>
        current.map((library) =>
          library.id === id
            ? {
                ...library,
                files: library.files.map((file) => (changed.has(file.path) ? { ...file, ...patch } : file)),
                updatedAt: Date.now(),
              }
            : library,
        ),
      )
    },
    /** A document keeps its entry while trashed, so restoring it brings the filing back too. */
    trashFiles: (id: string, paths: ReadonlyArray<string>) =>
      setState("libraries", (current) =>
        current.map((library) =>
          library.id === id
            ? {
                ...library,
                files: library.files.map((file) =>
                  paths.includes(file.path) && !file.deletedAt ? { ...file, deletedAt: Date.now() } : file,
                ),
                updatedAt: Date.now(),
              }
            : library,
        ),
      ),
    restoreFiles: (id: string, paths: ReadonlyArray<string>) =>
      setState("libraries", (current) =>
        current.map((library) =>
          library.id === id
            ? {
                ...library,
                files: library.files.map((file) =>
                  paths.includes(file.path) ? { ...file, deletedAt: undefined } : file,
                ),
                updatedAt: Date.now(),
              }
            : library,
        ),
      ),
    /** Favorites and recent lists read the same flags the workspace toggles. */
    setFavorite: (id: string, favorite: boolean) => update(id, { favorite }),
    setFileFavorite: (id: string, path: string, favorite: boolean) =>
      setState("libraries", (current) =>
        current.map((library) =>
          library.id === id
            ? {
                ...library,
                files: library.files.map((file) => (file.path === path ? { ...file, favorite } : file)),
              }
            : library,
        ),
      ),
    markOpened: (id: string) => update(id, { openedAt: Date.now() }),
    markFileOpened: (id: string, path: string) =>
      setState("libraries", (current) =>
        current.map((library) =>
          library.id === id
            ? {
                ...library,
                files: library.files.map((file) =>
                  file.path === path ? { ...file, openedAt: Date.now() } : file,
                ),
              }
            : library,
        ),
      ),
    addFolder: (id: string, folder: string) =>
      setState("libraries", (current) =>
        current.map((library) =>
          library.id === id && !(library.folders ?? []).includes(folder)
            ? { ...library, folders: [...(library.folders ?? []), folder], updatedAt: Date.now() }
            : library,
        ),
      ),
    setAgents: (id: string, agents: ReadonlyArray<KnowledgeAgentGrant>) => update(id, { agents: [...agents] }),
    removeFiles: (id: string, paths: ReadonlyArray<string>) => {
      const removed = new Set(paths)

      return setState("libraries", (current) =>
        current.map((library) =>
          library.id === id
            ? {
                ...library,
                files: library.files.filter((file) => !removed.has(file.path)),
                flags: (library.flags ?? []).filter((flag) => !removed.has(flag.path)),
              }
            : library,
        ),
      )
    },
    setSummary: (id: string, summary: string) => update(id, { summary }),
    /** Adds the flags an import found; a later import replaces the reason for the same document. */
    setFlags: (id: string, flags: ReadonlyArray<KnowledgeFlag>) =>
      setState("libraries", (current) =>
        current.map((library) => {
          if (library.id !== id) return library
          const merged = new Map((library.flags ?? []).map((flag) => [flag.path, flag]))

          for (const flag of flags) merged.set(flag.path, flag)

          const paths = new Set(library.files.map((file) => file.path))

          return { ...library, flags: [...merged.values()].filter((flag) => paths.has(flag.path)) }
        }),
      ),
    clearFlag: (id: string, path: string) =>
      setState("libraries", (current) =>
        current.map((library) =>
          library.id === id
            ? { ...library, flags: (library.flags ?? []).filter((flag) => flag.path !== path) }
            : library,
        ),
      ),
    /** Clears the mark from several documents at once. */
    clearFlags: (id: string, paths: ReadonlyArray<string>) => {
      const removed = new Set(paths)

      return setState("libraries", (current) =>
        current.map((library) =>
          library.id === id
            ? { ...library, flags: (library.flags ?? []).filter((flag) => !removed.has(flag.path)) }
            : library,
        ),
      )
    },
  }
}

/** Repeated imports leave the same files out; one row per decision is enough. */
function discardKey(discard: KnowledgeDiscard) {
  return `${discard.reason}\u0000${discard.path}`
}

function sum(left: KnowledgeImportStats, right: KnowledgeImportStats): KnowledgeImportStats {
  return {
    scanned: left.scanned + right.scanned,
    kept: left.kept + right.kept,
    duplicates: left.duplicates + right.duplicates,
    similar: left.similar + right.similar,
    skipped: left.skipped + right.skipped,
  }
}
