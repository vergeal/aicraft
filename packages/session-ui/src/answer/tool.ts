import type { SessionMessageAssistant } from "@opencode/client/promise"
import { Predicate } from "effect"
import type { ProcessActivity } from "./types"

export type ToolPart = Extract<SessionMessageAssistant["content"][number], { type: "tool" }>

export type ToolInput = ToolPart["state"]["input"]

/** Names that share another tool's mark, so parts recorded before `icon` existed still resolve. */
const MARK_ALIASES: Record<string, string> = { execute: "shell", bash: "shell" }

/**
 * The catalog mark a tool declares on `Tool.Info.icon`, or the key its advertised name implies.
 * Parts recorded before that field existed carry no icon, so history resolves by the same convention.
 */
export function toolMark(tool: Pick<ToolPart, "name" | "icon">): string {
  if (tool.icon) return tool.icon

  const label = toolLabel(tool.name)

  return `tool-${(MARK_ALIASES[label] ?? label).replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

/** The advertised tool name without its `opencode_` namespace prefix, for display and catalog keys. */
export function toolLabel(name: string): string {
  return name.replace(/^opencode_/, "")
}

/** A tool's input: an object when parsed, raw text while it streams. */
export function toolInput(tool: ToolPart): ToolInput {
  return tool.state.input
}

export function toolOutput(tool: ToolPart): string | undefined {
  if (tool.state.status === "running") {
    const output = tool.state.metadata.output

    return Predicate.isString(output) ? output : undefined
  }

  if (!("content" in tool.state) || !tool.state.content) return undefined
  const text = tool.state.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("\n")

  return text || undefined
}

export function toolError(tool: ToolPart): string | undefined {
  if (tool.state.status !== "error") return undefined

  return tool.state.error.message
}

/** An image a tool returned beside its text, such as a screenshot or a read image. */
export type ToolImage = { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string | null }

/** The image attachments of a tool result, in the order the tool returned them. */
export function toolImages(tool: Pick<ToolPart, "state">): ToolImage[] {
  if (!("content" in tool.state) || !tool.state.content) return []

  return tool.state.content.flatMap((part) => (part.type === "file" && part.mime.startsWith("image/") ? [part] : []))
}

/**
 * The file a tool result's images came from, when the tool names one. The client drops stored image payloads from
 * message content, so a picture step falls back to reading the file the tool itself read.
 */
export function toolImagePath(tool: Pick<ToolPart, "name" | "state">): string | undefined {
  const input = tool.state.input

  if (Predicate.isString(input)) return undefined

  return inputField(input, inputKeys(tool.name))
}

const PATH_TOOLS = new Set(["edit", "write", "patch", "apply_patch", "read"])

function inputKeys(name: string) {
  if (PATH_TOOLS.has(name)) return ["filePath", "path"]

  if (name === "shell" || name === "bash" || name === "execute") return ["command", "code"]

  if (name === "grep" || name === "glob") return ["pattern"]

  if (name === "websearch") return ["query"]

  if (name === "webfetch") return ["url"]

  return ["filePath", "path", "command", "query", "url", "description"]
}

function inputField(input: Exclude<ToolInput, string>, keys: readonly string[]) {
  for (const key of keys) {
    const value = input[key]

    if (Predicate.isString(value) && value.trim()) return value.trim()
  }

  return undefined
}

/** One line naming the call, for the collapsed row. */
export function toolSummary(tool: ToolPart): string {
  const input = toolInput(tool)

  if (Predicate.isString(input)) return input.trim() || tool.name
  const detail = inputField(input, inputKeys(tool.name))

  return detail ? `${tool.name} ${detail}` : tool.name
}

/** The DSH work category a tool call belongs to. A read that brings back an image counts as reading pictures. */
export function toolActivity(tool: Pick<ToolPart, "name" | "state">): ProcessActivity {
  if (tool.name === "read_image") return "readImage"

  if (tool.name === "read") return readsImage(tool) ? "readImage" : "read"

  if (tool.name === "grep" || tool.name === "glob" || tool.name === "list" || tool.name.endsWith("_inspect")) return "search"

  if (tool.name === "write") return "write"

  if (tool.name === "edit" || tool.name === "patch" || tool.name === "apply_patch") return "edit"

  if (["shell", "bash", "execute"].includes(tool.name)) return "commands"

  if (tool.name === "webfetch") return "webFetch"

  if (tool.name === "websearch") return "webSearch"

  if (tool.name === "subagent" || tool.name === "task") return "subagents"

  if (["todo", "todowrite", "task_plan"].includes(tool.name)) return "plan"

  return "tools"
}

/** The image extensions the read tool returns as media rather than text. */
const IMAGE_PATH = /\.(png|jpe?g|gif|webp)$/i

/**
 * Whether a read call shows a picture: once its result carries an image, or, while it still runs, when its path
 * names one. The result decides because the read tool detects media from the file's bytes.
 */
function readsImage(tool: Pick<ToolPart, "name" | "state">) {
  if (toolImages(tool).length > 0) return true

  const input = tool.state.input

  if (Predicate.isString(input)) return false
  const path = input.path ?? input.filePath

  return Predicate.isString(path) && IMAGE_PATH.test(path)
}

/** The argument text a row shows beside its action, preferring a written description. */
export function toolDescription(tool: ToolPart): string | undefined {
  const input = toolInput(tool)

  if (Predicate.isString(input)) return input.trim() || undefined

  const keys =
    tool.name === "skill"
      ? ["name", "skill"]
      : ["description", "command", "cmd", "filePath", "path", "pattern", "url", "query", "task"]

  return inputField(input, keys)
}

/** Multi-line text for the expanded body. */
export function toolDetail(tool: ToolPart): string {
  const input = toolInput(tool)
  const body = Predicate.isString(input) ? input : JSON.stringify(input, null, 2)
  const output = toolOutput(tool)
  const error = toolError(tool)

  return [body, error ?? output].filter(Boolean).join("\n\n")
}
