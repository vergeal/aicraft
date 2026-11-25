import { expect, test } from "bun:test"
import { SessionSystemPrompt } from "@aicraft/core/session/system-prompt"

test("renders the default system prompt instructions", () => {
  const prompt = SessionSystemPrompt.make(["edit", "read", "shell"])
  expect(prompt).not.toContain("${AICRAFT_TOOL_GUIDANCE}")
  expect(prompt).toContain("Use the edit tool for partial changes to existing text files")
})
