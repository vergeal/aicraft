export * as MemoryEmbedding from "./embedding.bun.js"

import type { Embedder } from "@aicraft/memory"

/**
 * The `@aicraft/memory` Embedder port over llama.cpp's `llama-server` in embedding mode
 * (`--embedding --pooling cls`), which speaks the OpenAI-compatible `/v1/embeddings` API. The
 * official Windows prebuilds stopped shipping the `llama-embedding` CLI, and a resident server
 * is the faster path anyway: the turn pipeline embeds once per turn and a loaded model stays
 * warm (~70 ms per batch versus a full model load per spawn).
 *
 * The recipe is part of every stored vector (`embed_version`): pooling, normalization or the
 * query prefix changing invalidates rows instead of silently corrupting cosine scores. The
 * spike that calibrated the operating point lives in `packages/memory/spike/real-vector.ts`.
 */
export interface ServerOptions {
  readonly baseUrl: string
  /** bge-small-* fixed size; kept explicit so a model swap cannot misreport dimensions. */
  readonly dimensions?: number
  readonly timeoutMs?: number
  /** Sent as `model` in the request body; llama-server only logs it. */
  readonly model?: string
}

export interface FetchInit {
  readonly method: string
  readonly headers: Record<string, string>
  readonly body: string
}
export type FetchLike = (url: string, init: FetchInit) => Promise<{ status: number; text: () => Promise<string>; json: () => Promise<unknown> }>

/** Model + pooling + normalization + query-prefix recipe. The version stamped on every vector. */
export const RECIPE = "bge-small-zh-v1.5-cls-l2-zh-query-prefix-1"
export const DIMENSIONS = 512
const BATCH = 16
/** BGE Chinese retrieval expects this instruction prefix on queries, not on passages. */
export const QUERY_PREFIX = "为这个句子生成表示以用于检索相关文章："

export function createServerEmbedder(options: ServerOptions, fetchImpl?: FetchLike): Embedder {
  const dimensions = options.dimensions ?? DIMENSIONS
  const timeout = options.timeoutMs ?? 30_000
  const fetch: FetchLike = fetchImpl ?? ((url, init) => globalThis.fetch(url, { ...init, signal: AbortSignal.timeout(timeout) }))
  const embedBatch = async (texts: readonly string[]): Promise<readonly number[][]> => {
    const out: number[][] = []
    for (let start = 0; start < texts.length; start += BATCH) {
      const response = await fetch(`${options.baseUrl}/v1/embeddings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: texts.slice(start, start + BATCH), model: options.model ?? "bge-small-zh-v1.5" }),
      })
      if (response.status < 200 || response.status >= 300)
        throw new Error(`embedding server ${options.baseUrl} responded ${response.status}: ${(await response.text()).slice(0, 200)}`)
      const body = (await response.json()) as { data?: { embedding?: unknown }[] }
      out.push(...parseVectors(body.data, Math.min(BATCH, texts.length - start), dimensions))
    }
    return out
  }
  return {
    dimensions,
    version: RECIPE,
    embed: async (text) => (await embedBatch([QUERY_PREFIX + text]))[0] ?? [],
    embedAll: async (texts) => embedBatch(texts),
  }
}

type VectorRow = { embedding?: unknown }

/** One array per input, in order; a mismatch means the server batched differently than we asked,
 *  which would silently misalign stored vectors against their rows. */
function parseVectors(rows: VectorRow[] | undefined, expected: number, dimensions: number): readonly number[][] {
  if (!Array.isArray(rows) || rows.length !== expected)
    throw new Error(`embedding server returned ${Array.isArray(rows) ? rows.length : "??"} vectors for ${expected} texts`)
  return rows.map((row, index) => {
    const vector = row.embedding
    if (!Array.isArray(vector) || vector.length !== dimensions || vector.some((value) => typeof value !== "number"))
      throw new Error(`embedding server vector ${index} is not ${dimensions} numbers`)
    return vector as number[]
  })
}

/**
 * Managed mode: launch `llama-server` ourselves over the GGUF the installer ships, then return
 * an embedder bound to it. `stop()` tears the process down. Callers treat a missing binary or a
 * failed boot as "no vector channel" — the subsystem keeps trigger + lexical, which is the
 * designed fallback, not an error.
 */
export interface ManagedOptions {
  readonly binary: string
  readonly model: string
  readonly port: number
  readonly readyTimeoutMs?: number
}

export function buildServerArgs(options: ManagedOptions): string[] {
  return [
    options.binary,
    "-m",
    options.model,
    "--embedding",
    "--pooling",
    "cls",
    "--embd-normalize",
    "2",
    "--port",
    String(options.port),
    "--log-disable",
  ]
}

export async function createManagedEmbedder(options: ManagedOptions): Promise<{ embedder: Embedder; stop: () => void }> {
  const child = Bun.spawn(buildServerArgs(options), { stdout: "ignore", stderr: "ignore" })
  const deadline = Date.now() + (options.readyTimeoutMs ?? 20_000)
  const baseUrl = `http://127.0.0.1:${options.port}`
  while (true) {
    try {
      const probe = await fetch(`${baseUrl}/v1/models`)
      if (probe.ok) break
    } catch {}
    if (Date.now() > deadline) {
      child.kill()
      throw new Error(`llama-server did not become ready on port ${options.port}`)
    }
    await Bun.sleep(200)
  }
  return {
    embedder: createServerEmbedder({ baseUrl, dimensions: DIMENSIONS }),
    stop: () => child.kill(),
  }
}

/**
 * Resolution order: an already-running server (`AICRAFT_EMBEDDING_URL`, development and the
 * spike), then the app-managed pair (`AICRAFT_LLAMA_SERVER` + `AICRAFT_EMBED_MODEL`, later the
 * installer-owned paths). Undefined means the vector channel is absent and the subsystem
 * degrades to trigger + lexical.
 */
export function resolveEmbedding(): { baseUrl: string } | ManagedOptions | undefined {
  const url = process.env.AICRAFT_EMBEDDING_URL
  if (url !== undefined && url !== "") return { baseUrl: url }
  const binary = process.env.AICRAFT_LLAMA_SERVER
  const model = process.env.AICRAFT_EMBED_MODEL
  if (binary !== undefined && model !== undefined) return { binary, model, port: Number(process.env.AICRAFT_EMBED_PORT ?? 18081) }
  return undefined
}

/** Best-effort bridge between the two resolution shapes; undefined stays undefined. */
export async function createEmbedder(): Promise<{ embedder: Embedder; stop: () => void } | undefined> {
  const target = resolveEmbedding()
  if (target === undefined) return undefined
  if ("baseUrl" in target) return { embedder: createServerEmbedder(target), stop: () => {} }
  return createManagedEmbedder(target)
}
