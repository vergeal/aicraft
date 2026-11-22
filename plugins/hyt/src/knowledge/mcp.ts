import type { KnowledgeEntry } from "./schema.js"
import { createEntry } from "./schema.js"

/**
 * MCP 知识来源的预留适配器：配置里登记的工具名（如 `server.tool`），检索时调用，把返回值映射成条目。
 * 映射出来的条目 source=mcp、confidence 默认 0.6，低于入库门槛，所以检索可以用，但不会自动落库。
 */

export interface McpToolCaller {
  call(tool: string, input: Record<string, unknown>): Promise<unknown>
}

export interface RemoteSource {
  readonly tool: string
  search(query: string, limit: number): Promise<KnowledgeEntry[]>
}

export function createRemoteSources(tools: readonly string[], caller: McpToolCaller): RemoteSource[] {
  return tools
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0)
    .map((tool) => ({
      tool,
      search: async (query: string, limit: number) => {
        const result = await caller.call(tool, { query, limit }).catch(() => undefined)
        return toEntries(result, tool, query)
      },
    }))
}

/** 兼容三种常见返回：数组、带 results/items/data 字段的对象、纯文本。 */
export function toEntries(result: unknown, tool: string, query: string): KnowledgeEntry[] {
  const items = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result.results)
      ? result.results
      : isRecord(result) && Array.isArray(result.items)
        ? result.items
        : isRecord(result) && Array.isArray(result.data)
          ? result.data
          : typeof result === "string"
            ? [{ content: result }]
            : []
  return items.flatMap((item) => {
    if (typeof item === "string") return [entry(tool, query, "", item, 1)]
    if (!isRecord(item)) return []
    const title = text(item.title) || text(item.name) || text(item.question)
    const content = text(item.content) || text(item.answer) || text(item.text) || text(item.snippet)
    if (content.length === 0) return []
    const score = typeof item.score === "number" ? item.score : 0.6
    return [entry(tool, query, title, content, Math.min(1, Math.max(0, score)))]
  })
}

function entry(tool: string, query: string, title: string, content: string, confidence: number) {
  return createEntry(
    {
      kind: "doc",
      title: title.length > 0 ? title : `${tool}：${query}`,
      answer: content,
      tags: ["mcp", tool],
      source: "mcp",
      confidence,
    },
    new Date().toISOString(),
  )
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
