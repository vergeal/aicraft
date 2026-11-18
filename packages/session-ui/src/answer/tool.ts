import type { SessionMessageAssistant } from "@opencode/client/promise"
import { Predicate } from "effect"
import type { ProcessActivity } from "./types"

export type ToolPart = Extract<SessionMessageAssistant["content"][number], { type: "tool" }>

export type ToolInput = ToolPart["state"]["input"]

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

/** The DSH work category a tool call belongs to. */
export function toolActivity(name: string): ProcessActivity {
  if (name === "read") return "read"

  if (name === "read_image") return "readImage"

  if (name === "grep" || name === "glob" || name === "list" || name.endsWith("_inspect")) return "search"

  if (name === "write") return "write"

  if (name === "edit" || name === "patch" || name === "apply_patch") return "edit"

  if (["shell", "bash", "execute"].includes(name)) return "commands"

  if (name === "webfetch") return "webFetch"

  if (name === "websearch") return "webSearch"

  if (name === "subagent" || name === "task") return "subagents"

  if (["todo", "todowrite", "task_plan"].includes(name)) return "plan"

  return "tools"
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
