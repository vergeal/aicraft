#!/usr/bin/env bun

import { createHash } from "node:crypto"
import { mkdir, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { BlobReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js"
import { EMBEDDING_TARGETS, type EmbeddingTarget, serverFileName } from "../src/main/service/embedding"

/**
 * Maintenance tool for the committed `resources/embedding` directory: downloads the pinned llama.cpp
 * server file set per build target (the smallest set that boots and answers `/v1/embeddings`, verified
 * against b12728 for win-cpu-x64, macOS arm64 with Metal, macOS x64 and Ubuntu x64) plus the
 * bge-small-zh-v1.5 Q8_0 GGUF that `spike/real-vector.ts` calibrated (threshold 0.4, recall 1.0 on the
 * golden set), then rewrites the layout: shared model, license and version marker at the top, one
 * native directory per target. Run it only when the model or the llama build changes; packaging never
 * downloads anything — the directory ships in the repo.
 *
 * Every artifact is sha256-pinned, and the model tries hf-mirror.com too because builds may run on
 * networks where huggingface.co is unreachable. Downloads cache under `dist/.embedding`. The runtime
 * side is `src/main/service/embedding.ts` (env wiring) and `packages/core/src/memory/embedding.bun.ts`
 * (spawn); missing files degrade to the trigger + lexical channels, by design. The tarballs' loader-side
 * symlinks stay out of git on purpose (a Windows checkout would drop them): `compatLinks` is the rule
 * `electron-builder.config.ts` uses to recreate them at afterPack time.
 */
export const EMBEDDING_VERSION = "llama-b12728-bge-small-zh-v1.5-q8_0"

const RELEASE = "b12728"

export const MODEL_FILE = "bge-small-zh-v1.5-q8_0.gguf"

export const VERSION_FILE = "embedding.version"

export const LICENSE_FILE = "LICENSE-llama.cpp.txt"

/** What the top of `resources/embedding` holds, shared by every target directory. */
export function rootFileNames(): string[] {
  return [MODEL_FILE, LICENSE_FILE, VERSION_FILE]
}

const LLAMA_LICENSE_COMMIT = "ea7229481"

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
}

const ARCHIVES: Record<EmbeddingTarget, { name: string; kind: "zip" | "tgz"; sha256: string }> = {
  "win32-x64": {
    name: `llama-${RELEASE}-bin-win-cpu-x64.zip`,
    kind: "zip",
    sha256: "a8ace09d44bb10e2617268c55c3f2db0e0adeedd9c1ba722969920665a3ae698",
  },
  "darwin-arm64": {
    name: `llama-${RELEASE}-bin-macos-arm64.tar.gz`,
    kind: "tgz",
    sha256: "001140842db7fa5253e57f891c14db5377937faf07d955a2646b471df0e7d9bd",
  },
  "darwin-x64": {
    name: `llama-${RELEASE}-bin-macos-x64.tar.gz`,
    kind: "tgz",
    sha256: "817b0faa91432ff32ccd6895a7b11a19f0d6ee57d3800c75e93c7d78265c1a9d",
  },
  "linux-x64": {
    name: `llama-${RELEASE}-bin-ubuntu-x64.tar.gz`,
    kind: "tgz",
    sha256: "7c8d787ff15384423d6742a42fad8e7e453d61b94a9c4cd85296e800d538b178",
  },
}

// `llama-server` is only a loader for the server-impl library, so both ship with the llama/ggml core
// they link and the OpenMP runtime the Windows build needs. Every other binary in a release is a bench,
// quantizer or chat CLI. The CPU backend dispatches to an ISA-specific library at runtime, so every
// variant ships; an older CPU aborts without its match.
const WIN_KEEP = [
  "llama-server.exe",
  "llama-server-impl.dll",
  "llama.dll",
  "llama-common.dll",
  "ggml.dll",
  "ggml-base.dll",
  "ggml-rpc.dll",
  "libomp.dll",
  "mtmd.dll",
  "LICENSE-LLVM-OpenMP",
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

// Darwin dylibs carry versioned real files (`libggml.1.0.0.dylib`) that the loader reaches through the
// `@rpath/libggml.1.dylib` compatibility links `compatLinks` recreates. arm64 adds the Metal backend
// and its tuning payload; the x64 build runs on Accelerate BLAS alone.
const DARWIN_KEEP = [
  "llama-server",
  "libllama-server-impl.dylib",
  "libllama.1.0.0.dylib",
  "libllama-common.1.0.0.dylib",
  "libggml.1.0.0.dylib",
  "libggml-base.1.0.0.dylib",
  "libggml-cpu.1.0.0.dylib",
  "libggml-blas.1.0.0.dylib",
  "libggml-rpc.1.0.0.dylib",
  "libmtmd.1.0.0.dylib",
]

const LINUX_KEEP = [
  "llama-server",
  "libllama-server-impl.so",
  "libllama.so.1.0.0",
  "libllama-common.so.1.0.0",
  "libggml.so.1.0.0",
  "libggml-base.so.1.0.0",
  "libggml-rpc.so",
  "libmtmd.so.1.0.0",
  "libggml-cpu-alderlake.so",
  "libggml-cpu-cannonlake.so",
  "libggml-cpu-cascadelake.so",
  "libggml-cpu-cooperlake.so",
  "libggml-cpu-haswell.so",
  "libggml-cpu-icelake.so",
  "libggml-cpu-ivybridge.so",
  "libggml-cpu-piledriver.so",
  "libggml-cpu-sandybridge.so",
  "libggml-cpu-sapphirerapids.so",
  "libggml-cpu-skylakex.so",
  "libggml-cpu-sse42.so",
  "libggml-cpu-x64.so",
  "libggml-cpu-zen4.so",
]

const KEEP: Record<EmbeddingTarget, readonly string[]> = {
  "win32-x64": WIN_KEEP,
  "darwin-arm64": [...DARWIN_KEEP, "libggml-metal.1.0.0.dylib", "ggml-metal-tuning"],
  "darwin-x64": DARWIN_KEEP,
  "linux-x64": LINUX_KEEP,
}

// The accepted set stays open to an `ggml-cpu-*` name a newer llama build adds, so upgrading the
// pinned release only means re-running this script.
const ISA_PLUGINS: Partial<Record<EmbeddingTarget, RegExp>> = {
  "win32-x64": /^ggml-cpu-[a-z0-9]+\.dll$/,
  "linux-x64": /^libggml-cpu-[a-z0-9]+\.so$/,
}

export function isIncludedEntry(target: EmbeddingTarget, name: string): boolean {
  return KEEP[target].includes(name) || ISA_PLUGINS[target]?.test(name) === true
}

/** What `resources/embedding/<target>` must hold, asserted by the packaging contract test. */
export function stagedFileNames(target: EmbeddingTarget): string[] {
  return [...KEEP[target]]
}

/**
 * The binaries reference their libraries by compatibility soname (`@rpath/libggml.1.dylib`,
 * `libllama.so.1`), which the tarballs publish as symlinks to the versioned real files. Git cannot
 * carry those symlinks through a Windows checkout, so the repo stores only the real files and
 * `electron-builder.config.ts` recreates the links from this rule before packing.
 */
export function compatLinks(target: EmbeddingTarget, files: readonly string[]): { link: string; to: string }[] {
  if (target.startsWith("darwin"))
    return files
      .filter((file) => file.endsWith(".1.0.0.dylib"))
      .flatMap((file) => {
        const base = file.slice(0, -".1.0.0.dylib".length)

        return [
          { link: `${base}.1.dylib`, to: file },
          { link: `${base}.dylib`, to: file },
        ]
      })

  if (target.startsWith("linux"))
    return files.flatMap((file) => (file.endsWith(".so.1.0.0") ? [{ link: file.slice(0, -".0.0".length), to: file }] : []))

  return []
}

export async function stageEmbedding(options?: { dest?: string; cache?: string }) {
  const root = path.resolve(import.meta.dirname, "..")
  const dest = path.resolve(options?.dest ?? path.join(root, "resources", "embedding"))
  const cache = path.resolve(options?.cache ?? path.join(root, "dist", ".embedding"))

  await mkdir(cache, { recursive: true })

  if (!(await isCurrent(dest))) {
    await rm(dest, { recursive: true, force: true })
    await mkdir(dest, { recursive: true })

    for (const target of EMBEDDING_TARGETS) {
      const unpacked = path.join(cache, `llama-${target}`)
      await unpackArchive(target, cache, unpacked)
      await copyStagedDir(unpacked, path.join(dest, target), target)
    }

    await fetchAsset(MODEL.urls, path.join(cache, MODEL_FILE), MODEL.sha256)
    await fetchAsset([LICENSE.url], path.join(cache, LICENSE_FILE), LICENSE.sha256)
    await Promise.all(
      [MODEL_FILE, LICENSE_FILE].map((name) => Bun.write(path.join(dest, name), Bun.file(path.join(cache, name)))),
    )
    await writeFile(path.join(dest, VERSION_FILE), EMBEDDING_VERSION)
    console.log(`Staged embedding runtime ${EMBEDDING_VERSION} at ${dest}`)
  }

  await verifyStaging(dest)
}

/** A matching version marker alone is not enough: a partial copy must be rebuilt. */
async function isCurrent(dest: string) {
  const version = await Bun.file(path.join(dest, VERSION_FILE)).text().catch(() => "")

  if (version !== EMBEDDING_VERSION) return false

  const shared = await readdir(dest).catch(() => [])

  if (!rootFileNames().every((name) => shared.includes(name))) return false

  const staged = await Promise.all(
    EMBEDDING_TARGETS.map(async (target) => {
      const names = await readdir(path.join(dest, target)).catch(() => [])

      return stagedFileNames(target).every((name) => names.includes(name))
    }),
  )

  return staged.every(Boolean)
}

async function unpackArchive(target: EmbeddingTarget, cache: string, unpacked: string) {
  if ((await flatNames(unpacked)).includes(serverFileName(target.split("-")[0]))) return

  const archive = ARCHIVES[target]
  const file = path.join(cache, archive.name)

  await fetchAsset(
    [`https://github.com/ggml-org/llama.cpp/releases/download/${RELEASE}/${archive.name}`],
    file,
    archive.sha256,
  )
  await rm(unpacked, { recursive: true, force: true })
  await mkdir(unpacked, { recursive: true })

  if (archive.kind === "zip") await unzip(file, unpacked, target)
  else await untar(file, unpacked, target)
}

async function unzip(archive: string, dir: string, target: EmbeddingTarget) {
  // Pure JS (@zip.js is already a desktop dependency): a Linux host cross-packaging Windows has no
  // guarantee of an `unzip` binary. The release is flat, so entries keep their basename.
  const entries = await new ZipReader(new BlobReader(new Blob([await Bun.file(archive).bytes()]))).getEntries()

  const wanted = entries.filter(
    (entry) => !entry.directory && entry.filename && isIncludedEntry(target, path.basename(entry.filename)),
  )

  await Promise.all(
    wanted.map(async (entry) =>
      writeFile(path.join(dir, path.basename(entry.filename!)), await entry.getData!(new Uint8ArrayWriter())),
    ),
  )
}

async function untar(archive: string, dir: string, target: EmbeddingTarget) {
  // Windows bsdtar fails on the tarballs' dylib/so symlinks, which are deliberately not stored in git
  // (compatLinks recreates them at packaging time), and every real file still extracts. So the server
  // binary is required instead of trusting the exit code.
  const code = await Bun.spawn(["tar", "-xzf", archive, "-C", dir], { stdout: "ignore", stderr: "ignore" }).exited

  if ((await flatNames(dir)).includes(serverFileName(target.split("-")[0]))) return

  throw new Error(`unpacking ${path.basename(archive)} failed (tar exit ${code})`)
}

async function copyStagedDir(unpacked: string, destDir: string, target: EmbeddingTarget) {
  const files = await flatFiles(unpacked)
  const names = [...files.keys()].filter((name) => isIncludedEntry(target, name))

  await mkdir(destDir, { recursive: true })
  await Promise.all(names.map((name) => Bun.write(path.join(destDir, name), Bun.file(files.get(name)!))))
}

async function flatFiles(dir: string) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => [])
  const files = new Map<string, string>()

  for (const entry of entries) if (entry.isFile()) files.set(entry.name, path.join(entry.parentPath, entry.name))

  return files
}

async function flatNames(dir: string) {
  return [...(await flatFiles(dir)).keys()]
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
  // or mismatched file is deleted instead of left for the next run to trust. GitHub release downloads
  // stall here intermittently, so a rerun resumes from the cache once a file hashes clean.
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

/** An installer ships exactly this directory, so a missing or empty file is a build failure. */
async function verifyStaging(dest: string) {
  const required = rootFileNames().concat(
    EMBEDDING_TARGETS.flatMap((target) => stagedFileNames(target).map((name) => path.join(target, name))),
  )

  const statuses = await Promise.all(
    required.map(async (name) => {
      const file = Bun.file(path.join(dest, name))

      if (!(await file.exists())) return `${name} missing`

      if ((await file.size) === 0) return `${name} empty`
    }),
  )

  const broken = statuses.filter((status): status is string => status !== undefined)

  if (broken.length) throw new Error(`embedding staging is not complete: ${broken.join(", ")}`)
}

if (import.meta.main) await stageEmbedding()
