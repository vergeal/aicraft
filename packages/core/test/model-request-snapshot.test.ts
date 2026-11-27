import { describe, expect, test } from "bun:test"
import { SystemPart } from "@aicraft/ai/effect"
import { Instructions } from "@aicraft/core/instructions/index"
import { SessionModelRequest } from "@aicraft/core/session/model-request"
import { ProjectInstructions } from "@aicraft/core/session/project-instructions"
import { SessionSystemPrompt } from "@aicraft/core/session/system-prompt"

type PartsInput = Parameters<typeof SessionModelRequest.volatileParts>[0]
type TranscriptInput = Parameters<typeof SessionModelRequest.baseTranscript>[0]
type Initial = Parameters<typeof SessionModelRequest.assembleSystem>[1]

// Expected structures below mirror the pre-snapshot implementation in git HEAD
// (baseTranscript before volatile parts were split out); they are the byte-equivalence golden.
const source = (key: string, text: string) => ({ key, chars: text.length, text })

const renderedSource = (entry: Instructions.Rendered) => ({
  key: entry.key,
  chars: entry.text.length,
  text: entry.text,
  ...(entry.parts?.length
    ? { items: entry.parts.map((part) => ({ name: part.name, chars: part.text.length, text: part.text })) }
    : {}),
})

// The session block text is fixed, so pin the bytes the original private builder produced.
const sessionBlock = (prompt: string) =>
  [
    "# Session instructions",
    "",
    "The user wrote these instructions for this session only.",
    "They apply on top of the project's instructions for as long as this session runs.",
    "",
    prompt,
  ].join("\n")

const tag = (
  text: string,
  sources: ReadonlyArray<SessionModelRequest.ContextSource>,
  extra?: Record<string, unknown>,
) => ({
  ...SystemPart.make(text),
  metadata: { ...extra, context: { sources } },
})

/** The system array exactly as HEAD built it. */
const headSystem = (
  input: { readonly customAgent: boolean; readonly project?: string; readonly sessionPrompt?: string },
  initial: Initial,
) => {
  const agentPrompt = input.customAgent ? agentCustom : SessionSystemPrompt.make(toolNames)
  const projectBlock = input.project ? ProjectInstructions.block(input.project) : undefined
  const session = input.sessionPrompt ? sessionBlock(input.sessionPrompt) : undefined
  return [
    tag(agentPrompt, [source("system", agentPrompt)]),
    ...(projectBlock ? [tag(projectBlock, [source(ProjectInstructions.key, projectBlock)])] : []),
    ...(session ? [tag(session, [source("session", session)])] : []),
    tag(Instructions.join(initial), initial.map(renderedSource), { experimental: { instructions: initial } }),
  ].filter((part) => part.text.length > 0)
}

const agentCustom = "You are a test agent."
const toolNames = ["read", "write"]
const projectText = "Build with bun."
const sessionText = "Be terse."
const initial: Initial = [
  { key: Instructions.Key.make("core/date"), text: "Today is 2026-11-27." },
  { key: Instructions.Key.make("core/environment"), text: "Platform: darwin.", parts: [{ name: "os", text: "darwin" }] },
]

const partsInput = (flags: { customAgent: boolean; project: boolean; session: boolean }): PartsInput => ({
  agent: { system: flags.customAgent ? agentCustom : undefined } as PartsInput["agent"],
  tools: { definitions: toolNames.map((name) => ({ name })) } as unknown as PartsInput["tools"],
  ...(flags.project ? { project: projectText } : {}),
  ...(flags.session ? { sessionPrompt: sessionText } : {}),
})

describe("volatileParts and assembleSystem match the original baseTranscript", () => {
  const flags = [true, false] as const
  for (const customAgent of flags)
    for (const project of flags)
      for (const session of flags) {
        const name = `agent=${customAgent ? "custom" : "default"} project=${project} session=${session}`
        test(name, () => {
          const input = partsInput({ customAgent, project, session })
          expect(SessionModelRequest.assembleSystem(SessionModelRequest.volatileParts(input), initial)).toEqual(
            headSystem(
              {
                customAgent,
                ...(project ? { project: projectText } : {}),
                ...(session ? { sessionPrompt: sessionText } : {}),
              },
              initial,
            ),
          )
        })
      }

  test("volatileParts yields agent, project and session parts in cache order", () => {
    expect(SessionModelRequest.volatileParts(partsInput({ customAgent: false, project: true, session: true }))).toEqual(
      [
        { kind: "agent", text: SessionSystemPrompt.make(toolNames) },
        { kind: "project", text: ProjectInstructions.block(projectText) },
        { kind: "session", text: sessionBlock(sessionText) },
      ],
    )
  })

  test("an empty baseline renders no part", () => {
    expect(SessionModelRequest.assembleSystem([{ kind: "agent", text: agentCustom }], [])).toEqual([
      tag(agentCustom, [source("system", agentCustom)]),
    ])
  })
})

describe("baseTranscript takes the volatile override", () => {
  test("system bytes come from the frozen parts, not the live project and session text", () => {
    const transcript = SessionModelRequest.baseTranscript({
      agent: { system: agentCustom },
      model: { model: { route: {}, provider: "provider" }, ref: {} },
      tools: { definitions: [] },
      initial,
      project: "live project text",
      sessionPrompt: "live session text",
      messages: [],
      volatile: [
        { kind: "agent", text: agentCustom },
        { kind: "project", text: "frozen project text" },
      ],
    } as unknown as TranscriptInput)
    expect(transcript.system).toEqual([
      tag(agentCustom, [source("system", agentCustom)]),
      tag("frozen project text", [source(ProjectInstructions.key, "frozen project text")]),
      tag(Instructions.join(initial), initial.map(renderedSource), { experimental: { instructions: initial } }),
    ])
    expect(SessionModelRequest.contextSources(transcript.system)).toEqual([
      source("system", agentCustom),
      source(ProjectInstructions.key, "frozen project text"),
      renderedSource(initial[0]!),
      renderedSource(initial[1]!),
    ])
  })

  test("contextSources keeps the original key order with and without the optional sources", () => {
    const full = SessionModelRequest.baseTranscript({
      agent: { system: agentCustom },
      model: { model: { route: {}, provider: "provider" }, ref: {} },
      tools: { definitions: [] },
      initial,
      project: projectText,
      sessionPrompt: sessionText,
      messages: [],
    } as unknown as TranscriptInput)
    expect(SessionModelRequest.contextSources(full.system).map((entry) => entry.key)).toEqual([
      "system",
      "core/project",
      "session",
      "core/date",
      "core/environment",
    ])
    const bare = SessionModelRequest.baseTranscript({
      agent: { system: agentCustom },
      model: { model: { route: {}, provider: "provider" }, ref: {} },
      tools: { definitions: [] },
      initial,
      messages: [],
    } as unknown as TranscriptInput)
    expect(SessionModelRequest.contextSources(bare.system).map((entry) => entry.key)).toEqual([
      "system",
      "core/date",
      "core/environment",
    ])
  })
})
