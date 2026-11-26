import path from "node:path"

/**
 * The installer bundles the memory vector runtime (llama-server and the bge-small-zh-v1.5 GGUF) under
 * `resources/embedding`, committed at `packages/desktop/resources/embedding` and copied per target by
 * `electron-builder.config.ts`: a shared model at the top plus one native directory per build target.
 * Pointing the two documented environment variables at it is all the sidecar needs: core's MemoryService
 * spawns a resident llama-server from them, and the sidecar inherits this process's environment.
 *
 * Targets outside the matrix (win32-arm64, linux-arm64) and source checkouts carry no bundle, so the
 * vector channel stays absent and memory degrades to trigger + lexical — a designed fallback, not an
 * error. Call site: the environment step in `lifecycle/environment.ts`, which runs before any sidecar
 * spawn.
 */
export const EMBEDDING_TARGETS = ["win32-x64", "darwin-arm64", "darwin-x64", "linux-x64"] as const

export type EmbeddingTarget = (typeof EMBEDDING_TARGETS)[number]

/** Which bundle a platform+cpu pair uses; undefined means the install ships no vector runtime by design. */
export function embeddingTarget(platform: string, cpu: string): EmbeddingTarget | undefined {
  return EMBEDDING_TARGETS.find((target) => `${platform}-${cpu}` === target)
}

/** The llama.cpp releases ship `llama-server.exe` on Windows only; every other target uses the bare name. */
export function serverFileName(platform: string) {
  return platform === "win32" ? "llama-server.exe" : "llama-server"
}

const EMBEDDING_DIR = "embedding"

const MODEL_FILE = "bge-small-zh-v1.5-q8_0.gguf"

export function bundledEmbeddingEnv(input: {
  platform: NodeJS.Platform
  cpu: string
  packaged: boolean
  resourcesPath: string
  exists: (file: string) => boolean
  env: Record<string, string | undefined>
}) {
  if (!input.packaged) return {}

  const target = embeddingTarget(input.platform, input.cpu)

  if (!target) return {}

  const server = path.join(input.resourcesPath, EMBEDDING_DIR, target, serverFileName(input.platform))
  const model = path.join(input.resourcesPath, EMBEDDING_DIR, MODEL_FILE)

  if (!input.exists(server) || !input.exists(model)) return {}

  // A pairing the user or support already set wins, so an installed build can still run against a
  // different runtime or a remote AICRAFT_EMBEDDING_URL server.
  if (input.env.AICRAFT_LLAMA_SERVER || input.env.AICRAFT_EMBED_MODEL || input.env.AICRAFT_EMBEDDING_URL) return {}

  return { AICRAFT_LLAMA_SERVER: server, AICRAFT_EMBED_MODEL: model }
}
