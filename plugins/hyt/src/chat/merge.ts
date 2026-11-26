/**
 * 合并转发：chatmsg 里 MsgType=245 的行没有正文，正文是一个 txt 文件（FileFullPath / FileUrl 指向它）。
 * 该 txt 的内容是 base64，解码后是 JSON 数组，元素字段为：
 * merge_account / merge_content / merge_messageId / merge_time / merge_title / merge_type / merge_url / merge_userData。
 * merge_type：1 文本、4 图片。所有解析都容错：坏 base64、缺字段、空数组都返回可用的结果，不抛错。
 */

export type MergeKind = "text" | "image" | "other"

export interface MergeItem {
  readonly account: string
  readonly content: string
  readonly messageId: string
  readonly time: number
  readonly title: string
  readonly kind: MergeKind
  readonly url: string
  /** 图片等媒体在文件服务器上的可下载地址：txt 里键名是 merge_remote_url，回落到 merge_url。 */
  readonly remoteUrl: string
  readonly userData: string
}

export function mergeKindOf(type: unknown): MergeKind {
  const value = typeof type === "number" ? type : typeof type === "string" ? Number.parseInt(type, 10) : Number.NaN
  if (value === 1) return "text"
  if (value === 4) return "image"
  return "other"
}

/** 解码合并转发的文件内容。JSON 坏掉或不是数组时返回空数组，交给调用方显示「无法读取」。 */
export function decodeMergeText(base64: string): MergeItem[] {
  const text = base64.trim()
  if (text.length === 0) return []
  return parseMergeItems(parseJson(Buffer.from(text, "base64").toString("utf8")))
}

/** 直接解析已经解开的 JSON；接受数组或带 items 字段的对象。 */
export function parseMergeItems(input: unknown): MergeItem[] {
  const items = Array.isArray(input) ? input : isObject(input) && Array.isArray(input.items) ? input.items : []
  return items.flatMap((item) => {
    if (!isObject(item)) return []
    const content = text(item.merge_content)
    const title = text(item.merge_title)
    const url = text(item.merge_url)
    // 全空的元素没有信息量，丢掉，避免列表里出现空行。
    if (content.length === 0 && title.length === 0 && url.length === 0) return []
    return [
      {
        account: text(item.merge_account),
        content,
        messageId: text(item.merge_messageId),
        time: epoch(text(item.merge_time)),
        title: title.length > 0 ? title : content,
        kind: mergeKindOf(item.merge_type),
        url,
        remoteUrl: text(item.merge_remote_url) || url,
        userData: text(item.merge_userData),
      },
    ]
  })
}

/** 读取合并转发的 txt 文件；文件缺失或内容坏掉时返回空数组。 */
export async function readMergeFile(path: string): Promise<MergeItem[]> {
  const file = Bun.file(path)
  if (!(await file.exists())) return []
  return decodeMergeText(await file.text())
}

/** 给工具输出的一段摘要，每条一行。 */
export function describeMerge(items: readonly MergeItem[], limit = 20) {
  if (items.length === 0) return "这条合并转发读不到内容（文件缺失或内容损坏）。"
  const lines = items
    .slice(0, limit)
    .map((item, index) => `${index + 1}. ${item.kind === "image" ? "[图片]" : ""}${item.content}`)
  if (items.length > limit) lines.push(`……另有 ${items.length - limit} 条未列出。`)
  return lines.join("\n")
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : ""
}

function epoch(value: string) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}
