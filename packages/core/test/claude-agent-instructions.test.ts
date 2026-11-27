import { describe, expect, test } from "bun:test"
import type { SystemPart } from "@aicraft/ai/effect"
import { ClaudeInstructions } from "../src/plugin/provider/claude-agent/instructions"
import { ClaudeSystemPrompt } from "../src/plugin/provider/claude-agent/language-model/system-prompt"

// Characterization of the claude-agent provider's system reassembly (DESIGN §7, P4): the provider does not
// send the core `assembleSystem` array as-is — it drops the first part (Claude Code's preset replaces AI
// Craft's prompt), expands baseline parts through their `experimental.instructions` metadata while filtering
// the blocks Claude writes itself, and passes every other part's text through. This test pins the mapping so
// assembly-side tagging changes surface here instead of silently altering provider requests.

const plainPart = (text: string): SystemPart => ({ type: "text", text })

const volatilePart = (text: string): SystemPart => ({
  ...plainPart(text),
  metadata: { context: { sources: [{ key: "system", chars: text.length, text }] } },
})

const baselinePart = (
  text: string,
  sources: ReadonlyArray<{ key: string; text: string }>,
): SystemPart => ({
  ...plainPart(text),
  metadata: {
    experimental: { instructions: sources.map((source) => ({ ...source })) },
    context: { sources: sources.map((source) => ({ key: source.key, chars: source.text.length, text: source.text })) },
  },
})

describe("ClaudeInstructions.instructions", () => {
  test("drops the first part and joins the rest in order", () => {
    const system = [volatilePart("AI CRAFT PROMPT"), plainPart("PROJECT BLOCK"), plainPart("SESSION BLOCK")]
    expect(ClaudeInstructions.instructions(system)).toEqual("PROJECT BLOCK\n\nSESSION BLOCK")
  })

  test("baseline parts expand through experimental instructions with Claude-owned keys filtered", () => {
    const system = [
      volatilePart("AI CRAFT PROMPT"),
      baselinePart("joined baseline", [
        { key: "core/language", text: "LANGUAGE RULES" },
        { key: "core/date", text: "Today is somewhere" },
        { key: "core/environment", text: "cwd /elsewhere" },
        { key: "core/instructions", text: "AGENTS.md CONTENT" },
      ]),
      plainPart("L4 NOTICE"),
    ]
    // core/date and core/environment never reach Claude Code; declaration order survives.
    expect(ClaudeInstructions.instructions(system)).toEqual("LANGUAGE RULES\n\nAGENTS.md CONTENT\n\nL4 NOTICE")
  })

  test("a baseline that only holds Claude-supplied sources contributes nothing", () => {
    const system = [
      volatilePart("AI CRAFT PROMPT"),
      baselinePart("dates only", [
        { key: "core/date", text: "Today" },
        { key: "core/environment", text: "Env" },
      ]),
    ]
    expect(ClaudeInstructions.instructions(system)).toEqual("")
  })

  test("an empty system yields an empty instructions string", () => {
    expect(ClaudeInstructions.instructions([])).toEqual("")
  })
})

describe("ClaudeSystemPrompt", () => {
  test("make keeps the claude_code preset and appends runtime info, role, then instructions", () => {
    const prompt = ClaudeSystemPrompt.make("Build agent", "PROJECT BLOCK") as {
      type: "preset"
      preset: string
      snapshot: boolean
      append: string
    }
    expect(prompt.type).toEqual("preset")
    expect(prompt.preset).toEqual("claude_code")
    expect(prompt.snapshot).toBe(false)
    const blocks = prompt.append.split("\n\n")
    expect(blocks[0]).toContain("<runtime_info>")
    expect(blocks[1]).toEqual("# Agent role (from AI Craft)\nBuild agent")
    expect(blocks[2]).toEqual("PROJECT BLOCK")
  })

  test("make omits absent role and instruction blocks", () => {
    const prompt = ClaudeSystemPrompt.make(undefined, undefined) as { append: string }
    expect(prompt.append.split("\n\n")).toHaveLength(1)
  })

  test("utility flattens system-role prompt messages and has a default fallback", () => {
    const flat = ClaudeSystemPrompt.utility([
      { role: "system", content: "A" },
      { role: "user", content: "hi" },
      { role: "system", content: "B" },
    ] as never)
    expect(flat).toEqual("A\n\nB")
    expect(ClaudeSystemPrompt.utility([] as never)).toContain("text generation assistant")
  })
})
