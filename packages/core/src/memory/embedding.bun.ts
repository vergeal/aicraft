export * as MemoryEmbedding from "./embedding.bun.js"

import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Embedder } from "@aicraft/memory"

/**
 * The `@aicraft/memory` Embedder port over the llama.cpp `llama-embedding` CLI. One process per
 * batch: the model is small (bge-small, ~100 MB resident) and the turn pipeline embeds once per
 * turn, so a resident server would add lifecycle complexity without saving measurable latency.
 *
 * Text reaches the binary through a temp file, not argv: Windows caps command lines at ~32k
 * characters and memory text is user content. A rare separator splits the batch, and the output
 * is `--embd-output-format array` (`[[x, ...], ...]`), which is pure JSON — no prefix parsing.
 *
 * The recipe is part of every stored vector (`embed_version`): changing pooling, prefix or model
 * invalidates rows instead of silently corrupting cosine scores.
 */
export interface LlamaOptions {
  readonly binary: string
  readonly model: string
  /** `bge-small*` fixed size; kept explicit so a model swap cannot misreport dimensions. */
  readonly dimensions?: number
  readonly timeoutMs?: number
}

export interface EmbeddingRun {
  readonly stdout: string
  readonly stderr: string
  readonly exit: number
}
export type EmbeddingRunner = (args: readonly string[], batchFile: string, timeoutMs: number) => Promise<EmbeddingRun>

/** Model + pooling + normalization + query-prefix recipe. The version stamped on every vector. */
export const RECIPE = "bge-small-zh-v1.5-cls-l2-zh-query-prefix-1"
export const DIMENSIONS = 512
export const SEPARATOR = "<#aicraft-emb-sep#>"
const TIMEOUT_MS = 30_000
/** BGE Chinese retrieval expects this instruction prefix on queries, not on passages. */
export const QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："

export function buildArgs(options: LlamaOptions, batchFile: string): string[] {
  return [
    options.binary,
    "-m",
    options.model,
    "-f",
    batchFile,
    "--embd-separator",
    SEPARATOR,
    "--embd-output-format",
    "array",
    "--embd-normalize",
    "2",
    "--log-disable",
  ]
}

const bunRunner: EmbeddingRunner = async (args, _batchFile, timeoutMs) => {
  const child = Bun.spawn(args as string[], { stdout: "pipe", stderr: "pipe" })
  const timer = setTimeout(() => child.kill(), timeoutMs)
  try {
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { stdout, stderr, exit }
  } finally {
    clearTimeout(timer)
  }
}

export function createLlamaEmbedder(options: LlamaOptions, runner: EmbeddingRunner = bunRunner): Embedder {
  const dimensions = options.dimensions ?? DIMENSIONS
  const embedBatch = async (texts: readonly string[], prefix: string): Promise<readonly number[][]> => {
    if (texts.length === 0) return []
    const directory = await mkdtemp(path.join(tmpdir(), "aicraft-emb-"))
    const file = path.join(directory, "batch.txt")
    try {
      await writeFile(file, texts.map((text) => prefix + text.replaceAll(SEPARATOR, "")).join(SEPARATOR), "utf8")
      const result = await runner(buildArgs(options, file), file, options.timeoutMs ?? TIMEOUT_MS)
      if (result.exit !== 0)
        throw new Error(`llama-embedding exited ${result.exit}: ${result.stderr.slice(0, 400)}`)
      return parseVectors(result.stdout, texts.length, dimensions)
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => {})
    }
  }
  return {
    dimensions,
    version: RECIPE,
    embed: async (text) => (await embedBatch([text], QUERY_PREFIX))[0] ?? [],
    embedAll: async (texts) => embedBatch(texts, ""),
  }
}

/** `[[0.1, ...], [0.2, ...]]` — one array per separator-split input; a count mismatch means the
 *  binary split the text differently than we did, which would silently misalign stored vectors. */
export function parseVectors(output: string, expected: number, dimensions: number): readonly number[][] {
  const parsed: unknown = JSON.parse(output)
  if (!Array.isArray(parsed) || parsed.length !== expected)
    throw new Error(`llama-embedding returned ${Array.isArray(parsed) ? parsed.length : "??"} vectors for ${expected} texts`)
  return parsed.map((vector, index) => {
    if (!Array.isArray(vector) || vector.length !== dimensions || vector.some((value) => typeof value !== "number"))
      throw new Error(`llama-embedding vector ${index} is not ${dimensions} numbers`)
    return vector as number[]
  })
}

/**
 * Where the binary and model live: environment first (spike and development), then the
 * app-owned binary directory the installer populates. Undefined means the vector channel is
 * absent — the subsystem then degrades to trigger + lexical, which is the designed fallback.
 */
export function resolveLlama(): LlamaOptions | undefined {
  const binary = process.env.AICRAFT_LLAMA_EMBEDDING ?? appBinary("llama-embedding")
  const model = process.env.AICRAFT_EMBED_MODEL ?? appBinary("bge-small-zh-v1.5.gguf")
  if (binary === undefined || model === undefined) return undefined
  return { binary, model }
}

function appBinary(name: string): string | undefined {
  const root = process.env.AICRAFT_BIN_DIR
  return root === undefined ? undefined : path.join(root, process.platform === "win32" ? `${name}.exe` : name)
}
