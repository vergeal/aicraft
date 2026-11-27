import { expect, test } from "bun:test"
import { SystemPart } from "@aicraft/ai/effect"
import { Agent } from "@aicraft/core/agent"
import { IdentityPlugin } from "@aicraft/core/plugin/identity"
import { Plugin } from "@aicraft/core/plugin"
import { PluginHooks } from "@aicraft/core/plugin/hooks"
import { PluginHost } from "@aicraft/core/plugin/host"
import { Session } from "@aicraft/core/session"
import type { SessionHooks } from "@aicraft/aix/effect/session"
import { Model } from "@aicraft/schema/model"
import { Provider } from "@aicraft/core/provider"
import { Effect } from "effect"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

test("formats the model identity part", () => {
  expect(
    IdentityPlugin.identity({
      name: "GPT-4o mini",
      ref: Model.Ref.make({ providerID: Provider.ID.make("openai"), id: Model.ID.make("gpt-4o-mini") }),
    }),
  ).toBe(["# Your Model", "- Name: GPT-4o mini", "- Provider ID: openai", "- Model ID: gpt-4o-mini"].join("\n"))
})

const context = (id: string): SessionHooks["context"] => ({
  sessionID: Session.ID.make("ses_model_identity"),
  agent: Agent.ID.make("build"),
  model: Model.Ref.make({ providerID: Provider.ID.make("test"), id: Model.ID.make(id) }),
  system: [SystemPart.make("Agent prompt"), SystemPart.make("Initial context")],
  messages: [],
  tools: {},
  options: {},
})

// P4 removed the identity session hook: the "# Your Model" block is an instruction-ledger source now
// (instructions/model-identity.ts), rendered into the epoch baseline by SessionContext.select. The plugin
// definition stays activated by internal.ts for compatibility but must register nothing and leave the
// assembled system array untouched.
it.effect("activates inertly and no longer rewrites the system prefix", () =>
  Effect.gen(function* () {
    const hooks = yield* PluginHooks.Service
    const plugins = yield* Plugin.Service
    const pluginHost = yield* PluginHost.make(plugins, "test")
    yield* IdentityPlugin.Plugin.effect(pluginHost)

    const event = context("meta/muse-spark-1.1")
    yield* hooks.trigger("session", "context", event)
    expect(event.system.map((part) => part.text)).toEqual(["Agent prompt", "Initial context"])
  }),
)
