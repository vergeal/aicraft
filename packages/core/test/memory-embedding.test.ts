import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { MemoryEmbedding } from "#memory-embedding"

/**
 * Protocol tests for the llama-embedding adapter with an injected runner: argv assembly, the
 * temp-file batch encoding (separator, query prefix, separator scrubbing), output parsing and
 * failure propagation. Real-model behavior is gated by the golden-set spike, not here.
 */
const options = { binary: "llama-embedding", model: "bge.gguf" }
const vectors = (count: number) =>
  JSON.stringify(Array.from({ length: count }, (_, batch) => Array.from({ length: 512 }, (_, i) => (batch * 512 + i) / 1_000_000)))

test("embedAll writes the batch to the temp file split by the separator and parses array output", async () => {
  const calls: { args: readonly string[]; written: string }[] = []
  const embedder = MemoryEmbedding.createLlamaEmbedder(options, async (args, file) => {
    calls.push({ args, written: await readFile(file, "utf8") })
    return { stdout: vectors(3), stderr: "", exit: 0 }
  })
  const result = await embedder.embedAll(["甲", "乙", "丙"])
  expect(result.map((vector) => vector.length)).toEqual([512, 512, 512])
  expect(embedder.version).toBe(MemoryEmbedding.RECIPE)
  expect(embedder.dimensions).toBe(512)
  expect(calls[0]!.written.split(MemoryEmbedding.SEPARATOR)).toEqual(["甲", "乙", "丙"])
  expect(calls[0]!.args).toEqual(MemoryEmbedding.buildArgs(options, calls[0]!.args[4]!))
  expect(calls[0]!.args).toContain("--embd-output-format")
})

test("embed carries the BGE query prefix; embedAll leaves passages bare", async () => {
  const written: string[] = []
  const embedder = MemoryEmbedding.createLlamaEmbedder(options, async (_args, file) => {
    written.push(await readFile(file, "utf8"))
    return { stdout: vectors(1), stderr: "", exit: 0 }
  })
  await embedder.embed("分支怎么命名")
  await embedder.embedAll(["分支怎么命名"])
  expect(written[0]).toBe(MemoryEmbedding.QUERY_PREFIX + "分支怎么命名")
  expect(written[1]).toBe("分支怎么命名")
})

test("a separator embedded in user text is scrubbed so the batch cannot split itself", async () => {
  const written: string[] = []
  const embedder = MemoryEmbedding.createLlamaEmbedder(options, async (_args, file) => {
    written.push(await readFile(file, "utf8"))
    return { stdout: vectors(1), stderr: "", exit: 0 }
  })
  await embedder.embedAll([`前${MemoryEmbedding.SEPARATOR}后`])
  expect(written[0]).toBe("前后")
})

test("non-zero exit and malformed output reject — the caller degrades the vector channel", async () => {
  const failing = MemoryEmbedding.createLlamaEmbedder(options, async () => ({ stdout: "", stderr: "model load failed", exit: 1 }))
  await expect(failing.embed("x")).rejects.toThrow("llama-embedding exited 1: model load failed")

  const short = MemoryEmbedding.createLlamaEmbedder(options, async () => ({ stdout: vectors(2), stderr: "", exit: 0 }))
  await expect(short.embedAll(["一", "二", "三"])).rejects.toThrow("2 vectors for 3 texts")

  const malformed = MemoryEmbedding.createLlamaEmbedder(options, async () => ({ stdout: "not json", stderr: "", exit: 0 }))
  await expect(malformed.embedAll(["一"])).rejects.toThrow()
})

test("the empty batch never spawns", async () => {
  let spawned = 0
  const embedder = MemoryEmbedding.createLlamaEmbedder(options, async () => {
    spawned += 1
    return { stdout: "[]", stderr: "", exit: 0 }
  })
  expect(await embedder.embedAll([])).toEqual([])
  expect(spawned).toBe(0)
})

test("resolveLlama reads env overrides and otherwise reports the channel absent", () => {
  const previous = { ...process.env }
  try {
    delete process.env.AICRAFT_LLAMA_EMBEDDING
    delete process.env.AICRAFT_EMBED_MODEL
    delete process.env.AICRAFT_BIN_DIR
    expect(MemoryEmbedding.resolveLlama()).toBeUndefined()
    process.env.AICRAFT_LLAMA_EMBEDDING = "C:\\tools\\llama-embedding.exe"
    expect(MemoryEmbedding.resolveLlama()).toBeUndefined()
    process.env.AICRAFT_EMBED_MODEL = "C:\\models\\bge.gguf"
    expect(MemoryEmbedding.resolveLlama()).toEqual({ binary: "C:\\tools\\llama-embedding.exe", model: "C:\\models\\bge.gguf" })
  } finally {
    process.env = previous
  }
})
