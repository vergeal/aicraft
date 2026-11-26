import path from "node:path"

/**
 * The Windows installer bundles the memory vector runtime (llama-server and the bge-small-zh-v1.5 GGUF)
 * under `resources/embedding`, committed at `packages/desktop/resources/embedding`. Pointing the two
 * documented environment variables at it is all the sidecar needs: core's MemoryService spawns a
 * resident llama-server from them, and the sidecar inherits this process's environment.
 *
 * Other platforms and source checkouts carry no bundle, so the vector channel stays absent and memory
 * degrades to trigger + lexical — a designed fallback, not an error. Call site: the environment step in
 * `lifecycle/desktop-initialization.ts`, which runs before any sidecar spawn.
 */
const EMBEDDING_DIR = "embedding"

const LLAMA_SERVER_FILE = "llama-server.exe"

const MODEL_FILE = "bge-small-zh-v1.5-q8_0.gguf"

export function bundledEmbeddingEnv(input: {
  platform: NodeJS.Platform
  packaged: boolean
  resourcesPath: string
  exists: (file: string) => boolean
  env: Record<string, string | undefined>
}) {
  if (!input.packaged || input.platform !== "win32") return {}

  const server = path.join(input.resourcesPath, EMBEDDING_DIR, LLAMA_SERVER_FILE)
  const model = path.join(input.resourcesPath, EMBEDDING_DIR, MODEL_FILE)

  if (!input.exists(server) || !input.exists(model)) return {}

  // A pairing the user or support already set wins, so an installed build can still run against a
  // different runtime or a remote AICRAFT_EMBEDDING_URL server.
  if (input.env.AICRAFT_LLAMA_SERVER || input.env.AICRAFT_EMBED_MODEL || input.env.AICRAFT_EMBEDDING_URL) return {}

  return { AICRAFT_LLAMA_SERVER: server, AICRAFT_EMBED_MODEL: model }
}
