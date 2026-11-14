import { describe, expect, test } from "bun:test"
import { providerPluginsFor } from "@opencode/core/plugin/provider"

const ids = (input: { named: ReadonlySet<string>; env?: Record<string, string> }) =>
  providerPluginsFor({ named: input.named, env: (name) => input.env?.[name] }).map((plugin) => plugin.id)

describe("provider plugin registration", () => {
  test("registers only the core providers when the user named none", () => {
    const registered = ids({ named: new Set() })

    expect(registered).toContain("opencode.provider.openai")
    expect(registered).toContain("opencode.provider.opencode")
    expect(registered).not.toContain("opencode.provider.cerebras")
    expect(registered).not.toContain("opencode.provider.xai")
    expect(registered).not.toContain("opencode.provider.kilo")
  })

  test("registers a dormant provider once config or a credential names it", () => {
    expect(ids({ named: new Set(["cerebras"]) })).toContain("opencode.provider.cerebras")
    expect(ids({ named: new Set(["kilo"]) })).toContain("opencode.provider.kilo")
  })

  test("registers a dormant provider once its environment variable is set", () => {
    expect(ids({ named: new Set(), env: { XAI_API_KEY: "test" } })).toContain("opencode.provider.xai")
    expect(ids({ named: new Set(), env: { CEREBRAS_API_KEY: "test" } })).toContain("opencode.provider.cerebras")
  })

  test("keeps every core provider when a dormant one is enabled", () => {
    const registered = ids({ named: new Set(["xai"]) })

    expect(registered).toContain("opencode.provider.openai")
    expect(registered).toContain("opencode.provider.openrouter")
    expect(registered).toContain("opencode.provider.xai")
  })
})
