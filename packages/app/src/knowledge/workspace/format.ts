import type { useLanguage } from "@/runtime/i18n/language"
import type { KnowledgeFile, KnowledgeFileStatus } from "../store"

type Language = ReturnType<typeof useLanguage>

/** The format group a document belongs to, used by the type filter and the row badge. */
export type FileTypeGroup = "markdown" | "pdf" | "office" | "html" | "other"

export const FILE_TYPE_GROUPS: ReadonlyArray<FileTypeGroup> = ["markdown", "pdf", "office", "html", "other"]

export function fileType(file: KnowledgeFile): FileTypeGroup {
  const name = (file.source || file.name).toLocaleLowerCase()
  const ext = name.slice(name.lastIndexOf(".") + 1)

  if (ext === "md" || ext === "markdown" || ext === "txt") return "markdown"

  if (ext === "pdf") return "pdf"

  if (ext === "doc" || ext === "docx" || ext === "xls" || ext === "xlsx" || ext === "ppt" || ext === "pptx") return "office"

  if (ext === "html" || ext === "htm") return "html"

  return "other"
}

export function typeLabelKey(group: FileTypeGroup) {
  return `knowledge.workspace.type.${group}` as const
}

/** A file imported before processing state existed is readable, so it reports as indexed. */
export function fileStatus(file: KnowledgeFile): KnowledgeFileStatus {
  return file.processing?.status ?? "ready"
}

export function statusLabelKey(status: KnowledgeFileStatus) {
  return `knowledge.workspace.status.${status}` as const
}

/** The semantic tone a status dot carries: attention, progress or settled. */
export function statusTone(status: KnowledgeFileStatus) {
  if (status === "failed") return "failed"

  if (status === "ready") return "ready"

  return "busy"
}

export function fileChunks(file: KnowledgeFile) {
  return file.processing?.chunks ?? 0
}

export function fileProgress(file: KnowledgeFile) {
  return file.processing?.progress ?? 0
}

/** The name a row shows: the library's own label when the user renamed it, otherwise the file name. */
export function fullName(file: KnowledgeFile) {
  return file.label ?? file.name
}

export function fileName(file: KnowledgeFile) {
  const name = fullName(file)
  const dot = name.lastIndexOf(".")

  return dot <= 0 ? name : name.slice(0, dot)
}

/** The folder a document is filed into; an import keeps its folder path as the default. */
export function fileFolder(file: KnowledgeFile) {
  if (file.folder) return file.folder

  const slash = file.path.lastIndexOf("/")

  return slash <= 0 ? "" : file.path.slice(0, slash)
}

export function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "—"

  if (size < 1024) return `${size} B`

  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/** Recent times stay relative; anything older than a week names its date. */
export function formatWhen(at: number | undefined, language: Language) {
  if (!at) return language.t("knowledge.workspace.time.never")

  const delta = Date.now() - at

  if (delta < 60_000) return language.t("knowledge.workspace.time.justNow")

  if (delta < 3_600_000) {
    const count = Math.floor(delta / 60_000)

    return language.plural("knowledge.workspace.time.minutes", count, { count })
  }

  if (delta < 86_400_000) {
    const count = Math.floor(delta / 3_600_000)

    return language.plural("knowledge.workspace.time.hours", count, { count })
  }

  if (delta < 7 * 86_400_000) {
    const count = Math.floor(delta / 86_400_000)

    return language.plural("knowledge.workspace.time.days", count, { count })
  }

  return new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(at)
}

/** A library's own timestamp falls back to its creation time so the row is never blank. */
export function libraryUpdatedAt(library: { updatedAt?: number; createdAt: number }) {
  return library.updatedAt ?? library.createdAt
}

export function fileUpdatedAt(file: KnowledgeFile) {
  return file.updatedAt ?? file.openedAt ?? 0
}

/** What the workspace calls the source of an import, kept short for the meta row. */
export function sourceLabel(root: string) {
  const trimmed = root.replace(/[\\/]+$/, "")
  const name = trimmed.split(/[\\/]/).filter(Boolean).pop()

  return name ?? root
}
