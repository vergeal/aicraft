import { existsSync } from "node:fs"
import { join } from "node:path"

/**
 * 图片 / 文件的本地定位。客户端把收到的文件放在 `<CHFile>/<account>/RecvFiles/<yyyyMM>/` 下，命中顺序：
 * 1. FileFullPath（客户端自己记的绝对路径，最可靠）；
 * 2. RecvFiles/<消息月份>/<FileName>；
 * 3. RecvFiles/<消息月份>/<FileUrl 的文件名>；
 * 4. RecvFiles/<FileUrl 的文件名>。
 * FileUrl 还可能是 http 地址，那就只给远程地址，不去猜本地路径。
 */

export interface MediaLocation {
  readonly fileName: string
  readonly localPath?: string
  readonly remoteUrl?: string
  readonly exists: boolean
}

export interface MediaInput {
  readonly fileUrl?: string | null
  readonly fileName?: string | null
  readonly fileFullPath?: string | null
  readonly createdAt?: number
  readonly recvRoot: string
}

export function resolveMedia(input: MediaInput, options: { exists?: (path: string) => boolean } = {}): MediaLocation {
  const exists = options.exists ?? existsSync
  const fileUrl = (input.fileUrl ?? "").trim()
  const remoteUrl = /^https?:\/\//i.test(fileUrl) ? fileUrl : undefined
  const fromUrl = baseName(fileUrl)
  const fileName = (input.fileName ?? "").trim() || fromUrl

  const candidates = [
    (input.fileFullPath ?? "").trim(),
    join(input.recvRoot, monthKey(input.createdAt), (input.fileName ?? "").trim()),
    join(input.recvRoot, monthKey(input.createdAt), fromUrl),
    join(input.recvRoot, fromUrl),
  ].filter((path) => path.length > 0 && !path.endsWith("/") && !path.endsWith("\\"))
  // RecvFiles 下的相对拼接只对真实存在的目录有意义；路径里带 http 的一律跳过。
  const localPath = candidates.find((path) => !/^https?:/i.test(path) && exists(path))

  return { fileName: fileName.length > 0 ? fileName : "未命名文件", localPath, remoteUrl, exists: localPath !== undefined }
}

/** 消息时间对应的 RecvFiles 月目录，例如 2026-03 → 202603。 */
export function monthKey(epochMs: number | undefined) {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs) || epochMs <= 0) return ""
  const date = new Date(epochMs)
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`
}

function baseName(value: string) {
  const normalized = value.replace(/\\/g, "/")
  const clean = normalized.split("?")[0] ?? normalized
  return clean.slice(clean.lastIndexOf("/") + 1).trim()
}
