export * as MemoryEmbedding from "./embedding.noop.js"

import type { Embedder } from "@aicraft/memory"
import type { EmbeddingRunner, LlamaOptions } from "./embedding.bun.js"

/** Non-bun runtimes have no subprocess story for the embedding binary: the vector channel is
 *  simply absent there, and the subsystem keeps trigger + lexical. See `embedding.bun.ts`. */
export type { EmbeddingRunner, LlamaOptions } from "./embedding.bun.js"

export const RECIPE = "bge-small-zh-v1.5-cls-l2-zh-query-prefix-1"
export const DIMENSIONS = 512
export const SEPARATOR = "<#aicraft-emb-sep#>"
export const QUERY_PREFIX = ""

export function buildArgs(_options: LlamaOptions, batchFile: string): string[] {
  return ["llama-embedding-unavailable", batchFile]
}

export function createLlamaEmbedder(_options: LlamaOptions, _runner?: EmbeddingRunner): Embedder {
  throw new Error("memory embedding is unavailable on this runtime")
}

export function parseVectors(): readonly number[][] {
  throw new Error("memory embedding is unavailable on this runtime")
}

export function resolveLlama(): LlamaOptions | undefined {
  return undefined
}
