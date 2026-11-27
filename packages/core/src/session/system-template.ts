export * as SessionSystemTemplate from "./system-template.js"

import type { Agent } from "@aicraft/schema/agent"
import { Model } from "@aicraft/schema/model"
import { SessionSystemPrompt } from "./system-prompt.js"

import PROMPT_GPT from "../plugin/system-prompt/gpt.txt"
import PROMPT_ASTRA from "../plugin/system-prompt/gpt-astra.txt"
import PROMPT_KIMI from "../plugin/system-prompt/kimi.txt"
import PROMPT_META from "../plugin/system-prompt/meta.txt"
import PROMPT_TRINITY from "../plugin/system-prompt/trinity.txt"
import PROMPT_ANTHROPIC from "../plugin/system-prompt/anthropic.txt"

export type Mode = "replace" | "append"

interface Rule {
  readonly matches: (model: Model.Info) => boolean
  readonly mode: Mode
  readonly template: (model: Model.Info) => string
}

// The matching rules and templates moved byte-for-byte from the removed hook registrations in
// plugin/optimize.ts: substring tests on the lowercased catalog model id, kept in the original plugin
// registration order. Where an id would match several families the first rule wins, while the old hook
// chain composed the last override on top; no shipped model id matches two families, so the orders are
// equivalent in practice.
const rules = [
  {
    matches: (model) => model.id.toLowerCase().includes("gpt"),
    mode: "replace",
    template: (model) => (model.id.toLowerCase().includes("astra") ? PROMPT_ASTRA : PROMPT_GPT),
  },
  {
    matches: (model) => model.id.toLowerCase().includes("claude"),
    mode: "append",
    template: () => PROMPT_ANTHROPIC,
  },
  { matches: (model) => model.id.toLowerCase().includes("kimi"), mode: "replace", template: () => PROMPT_KIMI },
  { matches: (model) => model.id.toLowerCase().includes("trinity"), mode: "replace", template: () => PROMPT_TRINITY },
  {
    matches: (model) => model.id.toLowerCase().includes("muse"),
    mode: "replace",
    template: (model) => PROMPT_META.replaceAll("{{MODEL_NAME}}", model.name),
  },
] as const satisfies ReadonlyArray<Rule>

/** The family template for a catalog model, or undefined when the default prompt stands. */
export const select = (model: Model.Info): { readonly mode: Mode; readonly template: string } | undefined => {
  const rule = rules.find((entry) => entry.matches(model))
  return rule && { mode: rule.mode, template: rule.template(model) }
}

/**
 * The resolved agent system text for the request's agent part: a custom agent prompt passes through
 * untouched, mirroring the removed hook's guard; otherwise the family template is rendered against the
 * offered tool names, with the Anthropic guidance appended to the default prompt.
 *
 * P4 closes the runtime override: the flows call this before `SessionModelRequest.volatileParts` and
 * substitute the result for the agent system, so the resolved template enters the frozen volatile
 * snapshot and the L1 lineage instead of replacing the assembled prefix afterwards. `model` is the
 * catalog `Model.Info` (its id and name drive the family match), not the route model.
 */
export const resolve = (input: { readonly agent: Agent.Info; readonly model: Model.Info; readonly tools: ReadonlyArray<string> }) => {
  if (input.agent.system) return input.agent.system
  const fallback = SessionSystemPrompt.make(input.tools)
  const family = select(input.model)
  if (!family) return fallback
  const rendered = SessionSystemPrompt.render(family.template, input.tools)
  return family.mode === "append" ? `${fallback}\n\n${rendered}` : rendered
}
