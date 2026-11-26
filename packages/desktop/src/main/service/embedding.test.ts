import { expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import path from "node:path"
import { bundledEmbeddingEnv } from "./embedding"
import { LLAMA_SERVER_FILE, MODEL_FILE, isIncludedEntry, stagedFileNames } from "../../../script/embedding-assets"

/**
 * The installer ships a file set and the main process points the core embedder at files inside it. Both
 * halves were written apart from each other, so the shared names and the runtime subset are asserted
 * here rather than in comments.
 */
const ROOT = path.join("C:", "inst", "resources")

const SERVER = path.join(ROOT, "embedding", LLAMA_SERVER_FILE)

const MODEL = path.join(ROOT, "embedding", MODEL_FILE)

const present = () => true

const missing = () => false

const cases = [
  {
    name: "a packaged windows install wires both variables",
    input: { platform: "win32", packaged: true, resourcesPath: ROOT, exists: present, env: {} },
    expected: { AICRAFT_LLAMA_SERVER: SERVER, AICRAFT_EMBED_MODEL: MODEL },
  },
  {
    name: "a source checkout carries no bundle",
    input: { platform: "win32", packaged: false, resourcesPath: ROOT, exists: present, env: {} },
    expected: {},
  },
  {
    name: "other platforms have no windows bundle",
    input: { platform: "darwin", packaged: true, resourcesPath: ROOT, exists: present, env: {} },
    expected: {},
  },
  {
    name: "a stripped or damaged install degrades instead of misconfiguring",
    input: { platform: "win32", packaged: true, resourcesPath: ROOT, exists: missing, env: {} },
    expected: {},
  },
  {
    name: "an explicit runtime pairing keeps precedence over the bundle",
    input: {
      platform: "win32",
      packaged: true,
      resourcesPath: ROOT,
      exists: present,
      env: { AICRAFT_LLAMA_SERVER: "D:\\own\\llama-server.exe" },
    },
    expected: {},
  },
  {
    name: "a remote embedder url keeps precedence over the bundle",
    input: {
      platform: "win32",
      packaged: true,
      resourcesPath: ROOT,
      exists: present,
      env: { AICRAFT_EMBEDDING_URL: "http://127.0.0.1:18080" },
    },
    expected: {},
  },
] as const

test.each(cases)("bundledEmbeddingEnv: $name", ({ input, expected }) => {
  expect(bundledEmbeddingEnv(input)).toEqual(expected)
})

test("the staged file set contains what the env wiring references", () => {
  const staged = stagedFileNames()

  expect(staged).toContain(LLAMA_SERVER_FILE)
  expect(staged).toContain(MODEL_FILE)

  // Every ISA dispatch variant must ship: the ggml CPU backend picks one at runtime by instruction set.
  for (const name of ["ggml-cpu-x64.dll", "ggml-cpu-zen4.dll", "ggml-cpu-sse42.dll", "ggml-cpu-alderlake.dll"])
    expect(isIncludedEntry(name)).toBe(true)
})

test("the bundle drops every binary that cannot serve embeddings", () => {
  for (const name of [
    "llama-cli.exe",
    "llama-cli-impl.dll",
    "llama-bench.exe",
    "llama-batched-bench-impl.dll",
    "llama-perplexity.exe",
    "llama-quantize.exe",
    "llama-mtmd-cli.exe",
    "llama.exe",
    "llama-connect.exe",
    "ggml-rpc-server.exe",
  ])
    expect(isIncludedEntry(name)).toBe(false)
})

// The runtime assets ship in the repo, so an accidental deletion or a half-regenerated directory fails
// here instead of silently downgrading every Windows installer's vector channel.
test("resources/embedding carries the committed runtime file set", () => {
  const staged = readdirSync(path.join(import.meta.dirname, "../../../resources/embedding")).sort()

  expect(staged).toEqual([...stagedFileNames()].sort())
})
