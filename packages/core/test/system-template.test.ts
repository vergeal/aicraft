import { describe, expect, test } from "bun:test"
import type { Agent } from "@aicraft/schema/agent"
import { Model } from "@aicraft/schema/model"
import { Provider } from "@aicraft/core/provider"
import { SessionSystemPrompt } from "../src/session/system-prompt"
import { SessionSystemTemplate } from "../src/session/system-template"

import PROMPT_GPT from "../src/plugin/system-prompt/gpt.txt"
import PROMPT_ASTRA from "../src/plugin/system-prompt/gpt-astra.txt"
import PROMPT_KIMI from "../src/plugin/system-prompt/kimi.txt"
import PROMPT_META from "../src/plugin/system-prompt/meta.txt"
import PROMPT_TRINITY from "../src/plugin/system-prompt/trinity.txt"
import PROMPT_ANTHROPIC from "../src/plugin/system-prompt/anthropic.txt"

// Characterization of the OptimizePlugin hooks removed in P4 (DESIGN §7): the old hook chain rewrote
// event.system[0] after assembly; `SessionSystemTemplate.resolve` must produce byte-identical text for
// every family rule, computed against the old formula (render of the raw template against the tool
// names, append mode concatenating the default prompt).

const modelInfo = (id: string, name = id) =>
  Model.Info.make({ ...Model.Info.default(Provider.ID.make("test"), Model.ID.make(id)), name })

const agentWithoutSystem = { system: undefined } as Agent.Info
const agentWithEmptySystem = { system: "" } as Agent.Info
const agentWithCustomSystem = { system: "custom agent prompt" } as Agent.Info

const tools = ["shell", "write", "edit", "read"]

describe("SessionSystemTemplate.resolve", () => {
  test("no family match keeps the default prompt byte-identical", () => {
    expect(SessionSystemTemplate.resolve({ agent: agentWithoutSystem, model: modelInfo("llama-3"), tools })).toEqual(
      SessionSystemPrompt.make(tools),
    )
  })

  test("gpt family replaces the system part with the rendered gpt template", () => {
    expect(SessionSystemTemplate.resolve({ agent: agentWithoutSystem, model: modelInfo("gpt-5"), tools })).toEqual(
      SessionSystemPrompt.render(PROMPT_GPT, tools),
    )
  })

  test("astra ids select the gpt-astra template", () => {
    expect(
      SessionSystemTemplate.resolve({ agent: agentWithoutSystem, model: modelInfo("gpt-5-astra-mini"), tools }),
    ).toEqual(SessionSystemPrompt.render(PROMPT_ASTRA, tools))
  })

  test("claude family appends the rendered template to the default prompt", () => {
    expect(
      SessionSystemTemplate.resolve({ agent: agentWithoutSystem, model: modelInfo("claude-opus-4-5"), tools }),
    ).toEqual(`${SessionSystemPrompt.make(tools)}\n\n${SessionSystemPrompt.render(PROMPT_ANTHROPIC, tools)}`)
  })

  test("kimi family replaces with the kimi template", () => {
    expect(SessionSystemTemplate.resolve({ agent: agentWithoutSystem, model: modelInfo("kimi-k2"), tools })).toEqual(
      SessionSystemPrompt.render(PROMPT_KIMI, tools),
    )
  })

  test("trinity family replaces with the trinity template", () => {
    expect(
      SessionSystemTemplate.resolve({ agent: agentWithoutSystem, model: modelInfo("trinity-large"), tools }),
    ).toEqual(SessionSystemPrompt.render(PROMPT_TRINITY, tools))
  })

  test("muse family substitutes the model name placeholder before rendering", () => {
    // Old hook: PROMPT_META.replaceAll("{{MODEL_NAME}}", model.name) — display name, not the raw id.
    expect(
      SessionSystemTemplate.resolve({ agent: agentWithoutSystem, model: modelInfo("muse-pro", "Muse Pro"), tools }),
    ).toEqual(SessionSystemPrompt.render(PROMPT_META.replaceAll("{{MODEL_NAME}}", "Muse Pro"), tools))
  })

  test("a custom agent system passes through untouched, mirroring the old hook guard", () => {
    expect(
      SessionSystemTemplate.resolve({ agent: agentWithCustomSystem, model: modelInfo("gpt-5"), tools }),
    ).toEqual("custom agent prompt")
  })

  test("an empty-string agent system is treated as absent, like the old falsy check", () => {
    expect(
      SessionSystemTemplate.resolve({ agent: agentWithEmptySystem, model: modelInfo("gpt-5"), tools }),
    ).toEqual(SessionSystemPrompt.render(PROMPT_GPT, tools))
  })
})

describe("SessionSystemTemplate.select", () => {
  test("family matching is case-insensitive on the catalog id", () => {
    expect(SessionSystemTemplate.select(modelInfo("GPT-5"))?.mode).toEqual("replace")
    expect(SessionSystemTemplate.select(modelInfo("Claude-Sonnet"))?.mode).toEqual("append")
  })

  test("unknown families select nothing so the default prompt stands", () => {
    expect(SessionSystemTemplate.select(modelInfo("mixtral-8x7b"))).toBeUndefined()
  })
})
