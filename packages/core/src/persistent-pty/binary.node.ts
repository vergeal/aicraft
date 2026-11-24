export const available = true

export async function resolveBinary() {
  return process.env.AICRAFT_PTY_BIN || "aicraft-pty"
}
