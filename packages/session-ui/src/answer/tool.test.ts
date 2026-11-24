import { describe, expect, test } from "bun:test"
import type { SessionMessageAssistant } from "@aicraft/client/promise"
import { toolDetail, toolError, toolOutput, toolSummary } from "./tool"

type Tool = Extract<SessionMessageAssistant["content"][number], { type: "tool" }>

const tool = (name: string, input: Record<string, string>): Tool => ({
  type: "tool",
  id: `tool_${name}`,
  name,
  state: {
    status: "completed",
    input,
    content: [{ type: "text", text: "ok" }],
    metadata: {},
  },
  time: { created: 1, completed: 2 },
})

describe("answer tool rows", () => {
  test("names a call by its own input field", () => {
    expect(toolSummary(tool("shell", { command: "bun test" }))).toBe("shell bun test")
    expect(toolSummary(tool("edit", { filePath: "src/a.ts", oldString: "a" }))).toBe("edit src/a.ts")
    expect(toolSummary(tool("grep", { pattern: "TODO" }))).toBe("grep TODO")
  })

  test("reads the completed output and error", () => {
    expect(toolOutput(tool("read", { filePath: "src/a.ts" }))).toBe("ok")
    expect(toolError(tool("read", { filePath: "src/a.ts" }))).toBeUndefined()
  })

  test("expands to input and output", () => {
    const detail = toolDetail(tool("shell", { command: "bun test" }))

    expect(detail).toContain('"command": "bun test"')
    expect(detail).toContain("ok")
  })
})
