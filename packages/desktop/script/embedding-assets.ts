#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { mkdir, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { BlobReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js"

/**
 * Maintenance tool for the committed `resources/embedding` directory: downloads the pinned llama.cpp
 * CPU-only `llama-server` file set (the smallest set that boots and answers `/v1/embeddings`, verified
 * against b12728) plus the bge-small-zh-v1.5 Q8_0 GGUF that `spike/real-vector.ts` calibrated
 * (threshold 0.4, recall 1.0 on the golden set), and rewrites the directory. Run it only when the model
 * or the llama build changes; packaging never downloads anything — the directory ships in the repo.
 *
 * Every artifact is sha256-pinned, and the model tries hf-mirror.com too because builds may run on
 * networks where huggingface.co is unreachable. Downloads cache under `dist/.embedding`. The runtime
 * side is `src/main/service/embedding.ts` (env wiring) and `packages/core/src/memory/embedding.bun.ts`
 * (spawn); missing files degrade to the trigger + lexical channels, by design.
 */
export const EMBEDDING_VERSION = "llama-b12728-bge-small-zh-v1.5-q8_0"

export const LLAMA_SERVER_FILE = "llama-server.exe"

export const MODEL_FILE = "bge-small-zh-v1.5-q8_0.gguf"

export const VERSION_FILE = "embedding.version"

const LLAMA_LICENSE_COMMIT = "ea7229481"

const LLAMA_ZIP = {
  name: "llama-b12728-bin-win-cpu-x64.zip",
  urls: ["https://github.com/ggml-org/llama.cpp/releases/download/b12728/llama-b12728-bin-win-cpu-x64.zip"],
  sha256: "a8ace09d44bb10e2617268c55c3f2db0e0adeedd9c1ba722969920665a3ae698",
}

const MODEL = {
  urls: [
    `https://huggingface.co/CompendiumLabs/bge-small-zh-v1.5-gguf/resolve/main/${MODEL_FILE}`,
    `https://hf-mirror.com/CompendiumLabs/bge-small-zh-v1.5-gguf/resolve/main/${MODEL_FILE}`,
  ],
  sha256: "5a88d266870fbd27c6f329df60de80e2d4cf3bbd5e6f080bd5c1b2e5abb12039",
}

const LICENSE = {
  url: `https://raw.githubusercontent.com/ggml-org/llama.cpp/${LLAMA_LICENSE_COMMIT}/LICENSE`,
  sha256: "94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d",
  file: "LICENSE-llama.cpp.txt",
}

/** `llama-server.exe` is only a loader for `llama-server-impl.dll`, so both ship, with the ggml core
 *  and the OpenMP runtime it links. Every other binary in the release is a bench, quantizer or CLI. */
const ZIP_KEEP = [
  LLAMA_SERVER_FILE,
  "llama-server-impl.dll",
  "llama.dll",
  "llama-common.dll",
  "ggml.dll",
  "ggml-base.dll",
  "ggml-rpc.dll",
  "libomp.dll",
  "mtmd.dll",
  "LICENSE-LLVM-OpenMP",
]

// The CPU backend dispatches to an ISA-specific library at runtime, so every variant ships; an older
// CPU aborts without its match. Pinned for b12728, which is what the committed directory holds.
const CPU_BACKENDS = [
  "ggml-cpu-alderlake.dll",
  "ggml-cpu-cannonlake.dll",
  "ggml-cpu-cascadelake.dll",
  "ggml-cpu-cooperlake.dll",
  "ggml-cpu-haswell.dll",
  "ggml-cpu-icelake.dll",
  "ggml-cpu-ivybridge.dll",
  "ggml-cpu-piledriver.dll",
  "ggml-cpu-sandybridge.dll",
  "ggml-cpu-sapphirerapids.dll",
  "ggml-cpu-skylakex.dll",
  "ggml-cpu-sse42.dll",
  "ggml-cpu-x64.dll",
  "ggml-cpu-zen4.dll",
]

/** The accepted set stays open to a `ggml-cpu-*` name a newer llama build adds, so upgrading the
 *  pinned release only means re-running this script. */
const KEPT = new Set([...ZIP_KEEP, ...CPU_BACKENDS])

export function isIncludedEntry(name: string): boolean {
  return KEPT.has(name) || /^ggml-cpu-[a-z0-9]+\.dll$/.test(name)
}

/** What `resources/embedding` must hold, asserted by the packaging contract test. */
export function stagedFileNames(): string[] {
  return [...KEPT, LICENSE.file, MODEL_FILE, VERSION_FILE]
}

export async function stageEmbedding(options?: { dest?: string; cache?: string }) {
  const root = path.resolve(import.meta.dirname, "..")
  const dest = path.resolve(options?.dest ?? path.join(root, "resources", "embedding"))
  const cache = path.resolve(options?.cache ?? path.join(root, "dist", ".embedding"))
  const unpacked = path.join(cache, "llama")

  await mkdir(cache, { recursive: true })

  if (!(await isCurrent(dest))) {
    await unpackLlama(cache, unpacked)
    await fetchAsset(MODEL.urls, path.join(cache, MODEL_FILE), MODEL.sha256)
    await fetchAsset([LICENSE.url], path.join(cache, LICENSE.file), LICENSE.sha256)
    await copyStaged(unpacked, dest, cache)
    console.log(`Staged embedding runtime ${EMBEDDING_VERSION} at ${dest}`)
  }

  await verifyStaging(dest)
}

/** A matching version marker alone is not enough: a partial copy must be rebuilt. */
async function isCurrent(dest: string) {
  const [version, names] = await Promise.all([
    Bun.file(path.join(dest, VERSION_FILE)).text().catch(() => ""),
    listNames(dest),
  ])

  return version === EMBEDDING_VERSION && stagedFileNames().every((name) => names.includes(name))
}

async function unpackLlama(cache: string, unpacked: string) {
  if ((await listNames(unpacked)).includes(LLAMA_SERVER_FILE)) return

  const archive = path.join(cache, LLAMA_ZIP.name)

  await fetchAsset(LLAMA_ZIP.urls, archive, LLAMA_ZIP.sha256)
  await rm(unpacked, { recursive: true, force: true })
  await mkdir(unpacked, { recursive: true })

  // Pure JS (@zip.js is already a desktop dependency): a Linux host cross-packaging Windows has no
  // guarantee of an `unzip` binary. The release is flat, so entries keep their basename.
  const entries = await new ZipReader(new BlobReader(new Blob([await Bun.file(archive).bytes()]))).getEntries()
  const wanted = entries.filter((entry) => !entry.directory && entry.filename && isIncludedEntry(entry.filename))

  await Promise.all(
    wanted.map(async (entry) =>
      writeFile(
        path.join(unpacked, path.basename(entry.filename!)),
        await entry.getData!(new Uint8ArrayWriter()),
      ),
    ),
  )
}

async function fetchAsset(urls: readonly string[], dest: string, sha256: string) {
  if (await matches(dest, sha256)) return

  const failures: string[] = []

  for (const url of urls) {
    const failure = await download(url, dest, sha256)

    if (!failure) return
    failures.push(failure)
  }

  throw new Error(`failed to download ${path.basename(dest)}: ${failures.join("; ")}`)
}

/** Returns nothing on success and the reason on failure, so one unreachable mirror moves to the next. */
async function download(url: string, dest: string, sha256: string) {
  const response = await fetch(url).catch(() => undefined)

  if (!response) return `${url}: unreachable`

  if (!response.ok) return `${url}: HTTP ${response.status}`

  // The digest is computed while writing so a tampered mirror never reaches the bundle, and a partial
  // or mismatched file is deleted instead of left for the next run to trust.
  const hash = createHash("sha256")
  const sink = Bun.file(dest).writer()

  try {
    for await (const chunk of response.body!) {
      hash.update(chunk)
      await sink.write(chunk)
    }

    await sink.end()
  } catch (error) {
    await sink.end().catch(() => {})
    await rm(dest, { force: true })

    return `${url}: ${String(error)}`
  }

  if (hash.digest("hex") !== sha256) {
    await rm(dest, { force: true })

    return `${url}: sha256 mismatch`
  }
}

async function matches(dest: string, sha256: string) {
  const file = Bun.file(dest)

  if (!(await file.exists())) return false

  return createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex") === sha256
}

async function copyStaged(unpacked: string, dest: string, cache: string) {
  const names = (await listNames(unpacked)).filter(isIncludedEntry)

  await rm(dest, { recursive: true, force: true })
  await mkdir(dest, { recursive: true })
  await Promise.all(names.map((name) => Bun.write(path.join(dest, name), Bun.file(path.join(unpacked, name)))))
  await Promise.all(
    [MODEL_FILE, LICENSE.file].map((name) => Bun.write(path.join(dest, name), Bun.file(path.join(cache, name)))),
  )
  await writeFile(path.join(dest, VERSION_FILE), EMBEDDING_VERSION)
}

/** An installer ships exactly this directory, so a missing or empty file is a build failure. */
async function verifyStaging(dest: string) {
  const names = await listNames(dest)
  const missing = stagedFileNames().filter((name) => !names.includes(name))

  if (missing.length) throw new Error(`embedding staging is missing: ${missing.join(", ")}`)

  const sizes = await Promise.all(names.map(async (name) => [name, await Bun.file(path.join(dest, name)).size] as const))
  const empty = sizes.filter(([, size]) => size === 0).map(([name]) => name)

  if (empty.length) throw new Error(`embedding staging shipped empty files: ${empty.join(", ")}`)
}

async function listNames(dir: string): Promise<string[]> {
  return readdir(dir).catch(() => [])
}

if (import.meta.main) await stageEmbedding()
