import type { Context } from "@aicraft/plugin/gui"
import { createSignal } from "solid-js"
import type { JSX } from "solid-js"
import { HytIpc } from "./contract.js"

export type Hyt = ReturnType<typeof useHyt>

/**
 * 窗口侧的 Ipc 客户端与一次性的错误/忙碌状态。
 *
 * 这里不读盘，也不做轮询：state 由主进程推送。Ipc 在网页里没有主进程（inactive），
 * 调用会 reject；捕获后显示成一句人能读懂的提示，而不是让页面白屏。
 */
export function useHyt(ctx: Context) {
  const client = ctx.main(HytIpc)
  const [error, setError] = createSignal<string | undefined>()
  const [busy, setBusy] = createSignal<string | undefined>()

  const state = () => client.state()

  const run = async <T,>(key: string, action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(key)
    setError(undefined)
    try {
      return await action()
    } catch (cause) {
      // Ipc 未连接时 SDK 抛错；把它变成可见提示，界面继续可用。
      setError(cause instanceof Error ? cause.message : String(cause))
      return undefined
    } finally {
      setBusy(undefined)
    }
  }

  const patch = (input: Parameters<typeof client.patch>[0]) => run("save", () => client.patch(input))

  return { ctx, client, state, error, setError, busy, run, patch }
}

/** 一行状态：一个点加一句文案，颜色由 data-state 决定。 */
export function Status(props: { state: string; label: string }) {
  return (
    <span class="hyt-status" data-state={props.state}>
      <span class="hyt-status-dot" aria-hidden="true" />
      <span>{props.label}</span>
    </span>
  )
}

/** 一个可移除的标签，用于目录、MCP 工具与白名单。 */
export function Chip(props: { text: string; muted?: boolean; title?: string; onRemove?: () => void; removeLabel?: string }) {
  return (
    <span class="hyt-chip" data-muted={props.muted === true ? "true" : undefined} title={props.title ?? props.text}>
      <span class="hyt-chip-text">{props.text}</span>
      {props.onRemove === undefined ? undefined : (
        <button
          type="button"
          class="hyt-chip-remove"
          aria-label={props.removeLabel ?? ""}
          title={props.removeLabel}
          onClick={() => props.onRemove?.()}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </span>
  )
}

/** 可选中的卡片，用于引导里的场景与预设。 */
export function ChoiceCard(props: { pressed: boolean; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" class="hyt-card" aria-pressed={props.pressed} onClick={() => props.onClick()}>
      <span class="hyt-card-title">
        <span>{props.title}</span>
        <span class="hyt-card-mark" aria-hidden="true">
          {props.pressed ? <CheckGlyph /> : undefined}
        </span>
      </span>
      <span class="hyt-card-body">{props.body}</span>
    </button>
  )
}

function CheckGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1.5 5.2 3.9 7.6 8.5 2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

/** 引导里的一组字段：标签、帮助文案与控件。 */
export function Field(props: { label: string; help?: string; children: JSX.Element }) {
  return (
    <div class="hyt-field">
      <span class="hyt-field-label">{props.label}</span>
      {props.children}
      {props.help === undefined ? undefined : <span class="hyt-field-help">{props.help}</span>}
    </div>
  )
}
