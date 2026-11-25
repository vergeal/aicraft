export * as SessionSystemPrompt from "./system-prompt.js"

import PROMPT from "./runner/prompt/system.txt"

export function make(tools: string[]) {
  return render(PROMPT, tools)
}

export function render(prompt: string, tools: string[]) {
  const instructions: string[] = []
  if (tools.includes("shell")) {
    instructions.push(
      "- Prefer the dedicated tools over shell commands; fall back to shell only when a tool cannot do what is needed.",
      "- Do not join shell commands with separators such as `echo \"====\";` or `printf '---'`; the output gets cluttered and the conversation reads worse on the user side.",
    )
  }
  if (tools.includes("write")) {
    instructions.push(
      "- Use the write tool to create a file or replace its contents entirely. Prefer the edit tool for partial changes.",
    )
  }
  if (tools.includes("edit")) {
    instructions.push(
      "- Use the edit tool for partial changes to existing text files. It replaces the exact text in `oldString` with `newString`, and the two values must differ. By default, `oldString` must match exactly once. If there are multiple matches, add more surrounding context to make it unique, or set `replaceAll` to true to replace every occurrence.",
    )
  }
  return prompt.replace("${AICRAFT_TOOL_GUIDANCE}", instructions.join("\n"))
}
