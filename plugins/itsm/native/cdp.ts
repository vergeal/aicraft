import type { WebContents } from "electron"
import { helpers } from "./page.js"

/** 每次探测与点击的轮询间隔；每一步都有明确上限，不会无限等待。 */
const POLL_MS = 150

/** 默认超时 5 秒，调用方可配置，上限 30 秒。 */
export const DEFAULT_TIMEOUT = 5_000
export const MAX_TIMEOUT = 30_000

export function timeoutOf(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_TIMEOUT
  return Math.min(MAX_TIMEOUT, Math.max(500, Math.floor(value)))
}

type EvaluateResult<T> = { result?: { value?: T }; exceptionDetails?: { text?: string } }

/**
 * Chrome DevTools Protocol 驱动。所有页面操作都先只读探测，再写入；写入前先比较当前值，已是目标值就跳过。
 */
export class Cdp {
  constructor(readonly contents: WebContents) {}

  async ensure() {
    if (!this.contents.debugger.isAttached()) this.contents.debugger.attach("1.3")
    await this.inject()
  }

  async detach() {
    if (this.contents.isDestroyed()) return
    if (this.contents.debugger.isAttached()) this.contents.debugger.detach()
  }

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
    await this.ensureAttached()
    return (await this.contents.debugger.sendCommand(method, params)) as T
  }

  private async ensureAttached() {
    if (this.contents.isDestroyed()) throw new Error("内嵌浏览器已经关闭。")
    if (!this.contents.debugger.isAttached()) this.contents.debugger.attach("1.3")
  }

  /** 在页面里求值。返回值的异常会变成可读的错误，而不是静默的 undefined。 */
  async evaluate<T>(expression: string): Promise<T> {
    const reply = await this.send<EvaluateResult<T>>("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.text ?? "页面脚本执行失败。")
    return reply.result?.value as T
  }

  /** 把定位用的 helper 注入页面；页面每次导航后需要重新注入。 */
  async inject() {
    await this.evaluate(helpers)
  }

  /** 轮询直到表达式为真；超时返回 false，不抛错，调用方决定怎么报告。 */
  async waitFor(expression: string, timeoutMs = DEFAULT_TIMEOUT) {
    const deadline = Date.now() + timeoutOf(timeoutMs)
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate<boolean>(`(() => { try { return !!(${expression}) } catch { return false } })()`))
          return true
      } catch {
        // 导航中的求值失败是正常的，等到下一个轮询点再试。
      }
      await sleep(POLL_MS)
    }
    return false
  }

  async click(expression: string) {
    return this.evaluate<boolean>(`(() => { try { const el = (${expression}); if (!el) return false; el.scrollIntoView({block: "center"}); el.click(); return true } catch { return false } })()`)
  }

  /** 真实输入事件，不写 innerHTML；富文本与普通输入都走这里。 */
  async type(text: string) {
    await this.send("Input.insertText", { text })
  }

  /** 选中当前焦点元素的全部内容，供覆盖写入。 */
  async selectAll() {
    await this.evaluate(`(() => { const el = document.activeElement; if (!el) return false; if (el.select) el.select(); else { const range = document.createRange(); range.selectNodeContents(el); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range) } return true })()`)
  }

  async focus(expression: string) {
    return this.evaluate<boolean>(`(() => { try { const el = (${expression}); if (!el) return false; el.scrollIntoView({block:"center"}); el.focus?.(); return true } catch { return false } })()`)
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 页面里定位控件、读标签与填值的 helper，作为一段脚本注入。 */
export function pageHelpers() {
  return helpers
}

/** 探测结果：可见控件与按钮。 */
export interface ProbedField {
  label: string
  kind: string
  required: boolean
  value?: string
  options?: string[]
}

export interface ProbeResult {
  url: string
  title: string
  buttons: string[]
  fields: ProbedField[]
  dialogs: string[]
}

/** 读一次页面概况。只读，不触发任何写入。 */
export async function probePage(cdp: Cdp): Promise<ProbeResult> {
  await cdp.inject()
  return cdp.evaluate<ProbeResult>(`(() => globalThis.__itsm?.probe())()`)
}

/** 逐个步骤等目标文案出现，超时抛错并带上正在等的内容，便于时间线展示。 */
export async function requireVisible(cdp: Cdp, expression: string, timeoutMs: number, what: string) {
  if (await cdp.waitFor(expression, timeoutMs)) return
  throw new Error(`等了 ${Math.round(timeoutOf(timeoutMs) / 1000)} 秒仍没出现${what}。可以到内嵌浏览器里看一下页面状态，再重试这一步。`)
}
