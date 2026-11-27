import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"

// P4 channel guard (DESIGN §5, PLAN P4①): the session flows must build model-request system arrays only
// through the kernel (`SessionModelRequest.assembleSystem` / `baseTranscript`). Bypasses start as one
// hand-built `SystemPart` — this test greps the source tree so a new dark channel fails CI instead of
// code review. The allowlist encodes today's sanctioned edges; extend it only with a DESIGN argument.

const SESSION_DIR = path.join(import.meta.dir, "../src/session")
const MODEL_REQUEST = "model-request.ts"
// A title request is a lightweight kernel flow (no baseline, no L4, no tools): it tags its single agent
// part locally because `withContext` is module-private. Sanctioned by DESIGN §5's kind table.
const SYSTEM_PART_ALLOWLIST = new Set([MODEL_REQUEST, "title.ts"])

const sourceFiles = async (dir: string): Promise<Array<{ name: string; text: string }>> => {
  const nested = await Promise.all(
    (await fs.readdir(dir, { withFileTypes: true })).map(async (entry) => {
      if (entry.isDirectory()) return sourceFiles(path.join(dir, entry.name))
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) return []
      const text = await Bun.file(path.join(dir, entry.name)).text()
      return [{ name: entry.name, text }]
    }),
  )
  return nested.flat()
}

const matchers = {
  assemble: /\bassembleSystem\s*\(/,
  systemPart: /SystemPart\.make\s*\(/,
  systemMessage: /Message\.system\s*\(/,
}

const offenders = async (pattern: RegExp, allowed: ReadonlySet<string>) =>
  (await sourceFiles(SESSION_DIR))
    .filter((file) => !allowed.has(file.name))
    .filter((file) => file.text.split("\n").some((line) => pattern.test(line) && !line.trimStart().startsWith("//")))
    .map((file) => file.name)

describe("context channel guard", () => {
  test("assembleSystem is only invoked from the model-request kernel", async () => {
    expect(await offenders(matchers.assemble, new Set([MODEL_REQUEST]))).toEqual([])
  })

  test("hand-built system parts stay inside the allowlist", async () => {
    expect(await offenders(matchers.systemPart, SYSTEM_PART_ALLOWLIST)).toEqual([])
  })

  test("instruction updates never ride a system-role message (the pre-P4 generate channel)", async () => {
    // to-llm-message maps a stored compaction summary into a system-role message — a legitimate L3 replay
    // mapping, not an assembly bypass.
    expect(await offenders(matchers.systemMessage, new Set(["to-llm-message.ts"]))).toEqual([])
  })
})
