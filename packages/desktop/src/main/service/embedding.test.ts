import { expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import path from "node:path"
import { EMBEDDING_TARGETS, bundledEmbeddingEnv, serverFileName } from "./embedding"
import { MODEL_FILE, compatLinks, isIncludedEntry, rootFileNames, stagedFileNames } from "../../../script/embedding-assets"

/**
 * The installer ships a per-target file set and the main process points the core embedder at files
 * inside it. Both halves were written apart from each other, so the shared names, the runtime subsets
 * and the tarballs' symlink rule are asserted here rather than in comments.
 */
const ROOT = path.join("C:", "inst", "resources")

const MODEL = path.join(ROOT, "embedding", MODEL_FILE)

const present = () => true

const missing = () => false

// One row per bundled build target; the table and EMBEDDING_TARGETS must not drift apart.
const matrix = [
  { platform: "win32", cpu: "x64", server: "llama-server.exe" },
  { platform: "darwin", cpu: "arm64", server: "llama-server" },
  { platform: "darwin", cpu: "x64", server: "llama-server" },
  { platform: "linux", cpu: "x64", server: "llama-server" },
] as const

test("the env wiring matrix covers exactly the bundled targets", () => {
  expect(matrix.map(({ platform, cpu }) => `${platform}-${cpu}`).sort()).toEqual([...EMBEDDING_TARGETS].sort())
})

const cases = [
  ...matrix.map(({ platform, cpu, server }) => ({
    name: `a packaged ${platform}-${cpu} install wires both variables`,
    input: { platform, cpu, packaged: true, resourcesPath: ROOT, exists: present, env: {} },
    expected: { AICRAFT_LLAMA_SERVER: path.join(ROOT, "embedding", `${platform}-${cpu}`, server), AICRAFT_EMBED_MODEL: MODEL },
  })),
  {
    name: "a source checkout carries no bundle",
    input: { platform: "win32", cpu: "x64", packaged: false, resourcesPath: ROOT, exists: present, env: {} },
    expected: {},
  },
  {
    name: "an architecture outside the matrix degrades instead of guessing",
    input: { platform: "win32", cpu: "arm64", packaged: true, resourcesPath: ROOT, exists: present, env: {} },
    expected: {},
  },
  {
    name: "a stripped or damaged install degrades instead of misconfiguring",
    input: { platform: "linux", cpu: "x64", packaged: true, resourcesPath: ROOT, exists: missing, env: {} },
    expected: {},
  },
  {
    name: "an explicit runtime pairing keeps precedence over the bundle",
    input: {
      platform: "darwin",
      cpu: "arm64",
      packaged: true,
      resourcesPath: ROOT,
      exists: present,
      env: { AICRAFT_LLAMA_SERVER: "/opt/own/llama-server" },
    },
    expected: {},
  },
  {
    name: "a remote embedder url keeps precedence over the bundle",
    input: {
      platform: "linux",
      cpu: "x64",
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

test("each staged file set contains the server binary the env wiring spawns", () => {
  for (const target of EMBEDDING_TARGETS)
    expect(stagedFileNames(target)).toContain(serverFileName(target.split("-")[0]))
})

test("the accepted set keeps every CPU dispatch variant, including one a newer build adds", () => {
  expect(isIncludedEntry("win32-x64", "ggml-cpu-zen4.dll")).toBe(true)
  expect(isIncludedEntry("win32-x64", "ggml-cpu-future.dll")).toBe(true)
  expect(isIncludedEntry("linux-x64", "libggml-cpu-haswell.so")).toBe(true)
  expect(isIncludedEntry("linux-x64", "libggml-cpu-future.so")).toBe(true)

  // Darwin picks one fat CPU library, so an ISA plugin name there means a layout the bundle never had.
  expect(isIncludedEntry("darwin-arm64", "ggml-cpu-future.dylib")).toBe(false)
})

test("the bundle drops every binary that cannot serve embeddings", () => {
  expect(isIncludedEntry("win32-x64", "llama-cli.exe")).toBe(false)
  expect(isIncludedEntry("win32-x64", "llama-bench.exe")).toBe(false)
  expect(isIncludedEntry("win32-x64", "ggml-rpc-server.exe")).toBe(false)
  expect(isIncludedEntry("darwin-arm64", "llama-cli")).toBe(false)
  expect(isIncludedEntry("darwin-arm64", "libllama-cli-impl.dylib")).toBe(false)
  expect(isIncludedEntry("linux-x64", "llama-quantize")).toBe(false)
  expect(isIncludedEntry("linux-x64", "libllama-bench-impl.so")).toBe(false)
})

test("compatLinks recreates the loader-visible names the tarballs shipped as symlinks", () => {
  expect(
    compatLinks("darwin-arm64", [
      "ggml-metal-tuning",
      "libggml.1.0.0.dylib",
      "libllama-server-impl.dylib",
      "llama-server",
    ]),
  ).toEqual([
    { link: "libggml.1.dylib", to: "libggml.1.0.0.dylib" },
    { link: "libggml.dylib", to: "libggml.1.0.0.dylib" },
  ])

  // libggml-rpc.so has no versioned name to link from, and the dlopen'd ISA plugins keep their own.
  expect(compatLinks("linux-x64", ["libggml-cpu-x64.so", "libggml-rpc.so", "libllama.so.1.0.0"])).toEqual([
    { link: "libllama.so.1", to: "libllama.so.1.0.0" },
  ])

  expect(compatLinks("win32-x64", ["llama.dll", "llama-server.exe"])).toEqual([])
})

// The runtime assets ship in the repo, so an accidental deletion or a half-regenerated directory fails
// here instead of silently downgrading an installer's vector channel on some platform.
test("resources/embedding carries the committed runtime layout", () => {
  const root = path.join(import.meta.dirname, "../../../resources/embedding")

  expect(readdirSync(root).sort()).toEqual([...rootFileNames(), ...EMBEDDING_TARGETS].sort())

  for (const target of EMBEDDING_TARGETS)
    expect(readdirSync(path.join(root, target)).sort()).toEqual([...stagedFileNames(target)].sort())
})
