import { expect, test } from "bun:test"
import { MemoryEmbedding } from "#memory-embedding"

/**
 * Protocol tests for the llama-server embedding adapter with an injected fetch: batching, the
 * BGE query prefix, response validation and failure propagation. Real-model quality is gated
 * by `packages/memory/spike/real-vector.ts`, not here.
 */
const ok = (vectors: number[][]) => async () => ({
  status: 200,
  text: async () => "",
  json: async () => ({ data: vectors.map((embedding) => ({ embedding })) }),
})
const dim = (seed: number) => Array.from({ length: 512 }, (_, i) => (seed * 512 + i) / 1_000_000)
const options = { baseUrl: "http://127.0.0.1:18080" }

test("embedAll batches inputs and keeps vector order", async () => {
  const calls: { url: string; body: { input: string[] } }[] = []
  const embedder = MemoryEmbedding.createServerEmbedder(options, async (url, init) => {
    const body = JSON.parse(init.body) as { input: string[] }
    calls.push({ url, body })
    return {
      status: 200,
      text: async () => "",
      json: async () => ({ data: body.input.map((_, i) => ({ embedding: dim(i) })) }),
    } as never
  })
  const texts = Array.from({ length: 20 }, (_, index) => `条目 ${index}`)
  const result = await embedder.embedAll(texts)
  expect(embedder.version).toBe(MemoryEmbedding.RECIPE)
  expect(embedder.dimensions).toBe(512)
  expect(result.length).toBe(20)
  expect(calls.length).toBe(2)
  expect(calls[0]!.url).toBe("http://127.0.0.1:18080/v1/embeddings")
  expect(calls[0]!.body.input.length).toBe(16)
  expect(calls[1]!.body.input.length).toBe(4)
  expect(calls[1]!.body.input[0]).toBe("条目 16")
})

test("embed carries the BGE query prefix; embedAll leaves passages bare", async () => {
  const inputs: string[] = []
  const embedder = MemoryEmbedding.createServerEmbedder(options, async (_url, init) => {
    inputs.push(...(JSON.parse(init.body).input as string[]))
    return { status: 200, text: async () => "", json: async () => ({ data: [{ embedding: dim(1) }] }) } as never
  })
  await embedder.embed("分支怎么命名")
  await embedder.embedAll(["分支怎么命名"])
  expect(inputs[0]).toBe(MemoryEmbedding.QUERY_PREFIX + "分支怎么命名")
  expect(inputs[1]).toBe("分支怎么命名")
})

test("count, shape and status failures reject — the caller degrades the vector channel", async () => {
  const short = MemoryEmbedding.createServerEmbedder(options, async () => ({
    status: 200,
    text: async () => "",
    json: async () => ({ data: [{ embedding: dim(1) }] }),
  }))
  await expect(short.embedAll(["一", "二"])).rejects.toThrow("1 vectors for 2 texts")

  const wrongDims = MemoryEmbedding.createServerEmbedder(options, ok([[1, 2, 3]]))
  await expect(wrongDims.embed("x")).rejects.toThrow("is not 512 numbers")

  const broken = MemoryEmbedding.createServerEmbedder(options, async () => ({
    status: 503,
    text: async () => "model load failed",
    json: async () => ({}),
  }))
  await expect(broken.embed("x")).rejects.toThrow("responded 503: model load failed")
})

test("buildServerArgs carries the exact spike recipe: cls pooling, L2 normalization, quiet logs", () => {
  const args = MemoryEmbedding.buildServerArgs({ binary: "llama-server", model: "bge.gguf", port: 18081 })
  expect(args).toEqual(["llama-server", "-m", "bge.gguf", "--embedding", "--pooling", "cls", "--embd-normalize", "2", "--port", "18081", "--log-disable"])
})

test("resolveEmbedding prefers a running server, then env-managed launch, else absent", () => {
  const previous = { ...process.env }
  try {
    delete process.env.AICRAFT_EMBEDDING_URL
    delete process.env.AICRAFT_LLAMA_SERVER
    delete process.env.AICRAFT_EMBED_MODEL
    delete process.env.AICRAFT_EMBED_PORT
    expect(MemoryEmbedding.resolveEmbedding()).toBeUndefined()
    process.env.AICRAFT_EMBEDDING_URL = "http://127.0.0.1:19999"
    expect(MemoryEmbedding.resolveEmbedding()).toEqual({ baseUrl: "http://127.0.0.1:19999" })
    delete process.env.AICRAFT_EMBEDDING_URL
    process.env.AICRAFT_LLAMA_SERVER = "C:\\bin\\llama-server.exe"
    expect(MemoryEmbedding.resolveEmbedding()).toBeUndefined()
    process.env.AICRAFT_EMBED_MODEL = "C:\\bin\\bge.gguf"
    process.env.AICRAFT_EMBED_PORT = "19123"
    expect(MemoryEmbedding.resolveEmbedding()).toEqual({ binary: "C:\\bin\\llama-server.exe", model: "C:\\bin\\bge.gguf", port: 19123 })
  } finally {
    process.env = previous
  }
})
