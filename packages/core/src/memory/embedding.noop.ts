export * as MemoryEmbedding from "./embedding.noop.js"

import type { Embedder } from "@aicraft/memory"
import type { FetchLike, ManagedOptions, ServerOptions } from "./embedding.bun.js"

/** Non-bun runtimes (workerd) have no subprocess story for llama-server: the vector channel is
 *  simply absent there, and the subsystem keeps trigger + lexical. See `embedding.bun.ts`. */
export type { FetchInit, FetchLike, ManagedOptions, ServerOptions } from "./embedding.bun.js"

export const RECIPE = "bge-small-zh-v1.5-cls-l2-zh-query-prefix-1"
export const DIMENSIONS = 512
export const QUERY_PREFIX = ""

export function createServerEmbedder(_options: ServerOptions, _fetchImpl?: FetchLike): Embedder {
  throw new Error("memory embedding is unavailable on this runtime")
}

export function buildServerArgs(options: ManagedOptions): string[] {
  return ["llama-server-unavailable", options.model]
}

export async function createManagedEmbedder(_options: ManagedOptions): Promise<{ embedder: Embedder; stop: () => void }> {
  throw new Error("memory embedding is unavailable on this runtime")
}

export function resolveEmbedding(): { baseUrl: string } | ManagedOptions | undefined {
  return undefined
}

export async function createEmbedder(): Promise<{ embedder: Embedder; stop: () => void } | undefined> {
  return undefined
}
