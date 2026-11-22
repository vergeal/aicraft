import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { connectBridge } from "../../src/bridge/client.js"
import { METHODS, parseEndpoint, parseSendResult } from "../../src/bridge/protocol.js"

/**
 * 窗口主进程侧的消息发送。
 *
 * 与 `src/bridge/supervisor.ts` 不同，这里不拉起 bridge 进程：客户端正常运行时它已经在跑，
 * 窗口只借用发现文件里的端口发一条消息，发完就断开，避免主进程常驻连接。
 */

export type SendOutcome = { ok: true; msgId?: string } | { ok: false; reason: string }

/** `Config/bridge.json` 由客户端进程写；读不到就说明此刻没有可用的消息通道。 */
function readEndpoint(chfileRoot: string) {
  const file = join(chfileRoot, "Config", "bridge.json")
  if (!existsSync(file)) return undefined
  try {
    return parseEndpoint(JSON.parse(readFileSync(file, "utf8")))
  } catch {
    return undefined
  }
}

export async function sendText(chfileRoot: string, sessionId: string, text: string): Promise<SendOutcome> {
  const endpoint = readEndpoint(chfileRoot)
  if (endpoint === undefined) return { ok: false, reason: "没有发现运行中的消息通道（Config/bridge.json）" }

  const client = await connectBridge(endpoint).catch(() => undefined)
  if (client === undefined) return { ok: false, reason: `连不上消息通道 ${endpoint.host}:${endpoint.port}` }

  try {
    const result = parseSendResult(await client.request(METHODS.sendMessage, { sessionId, text }))
    return result.ok ? { ok: true, msgId: result.msgId } : { ok: false, reason: "消息通道没有确认已发出" }
  } catch (cause) {
    return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) }
  } finally {
    client.close()
  }
}
