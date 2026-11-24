import type { Context } from "@aicraft/plugin/gui"
import { Show } from "solid-js"
import type { Phase } from "./contract.js"
import { text } from "./i18n.js"

/**
 * 整页状态：加载、空态、错误。
 *
 * 三种都是同一套「左侧一道封红 + 标题 + 说明 + 动作」的排法，加载态额外画成三栏骨架，
 * 避免整页转圈把布局先撑起来又塌回去。阶段变化要能原地切换，所以用 Show 分支而不是提前 return。
 */
export function Blank(props: {
  ctx: Context
  phase: Phase
  detail: string
  onRetry: () => void
  onSettings: () => void
}) {
  const title = () => {
    if (props.phase === "no-account") return text(props.ctx, "hyt.chat.state.title.no-account")
    if (props.phase === "no-data") return text(props.ctx, "hyt.chat.state.title.no-data")
    if (props.phase === "error") return text(props.ctx, "hyt.chat.state.title.error")
    return text(props.ctx, "hyt.chat.state.title.empty")
  }

  const body = () => {
    if (props.phase === "no-account") return text(props.ctx, "hyt.chat.state.body.no-account")
    if (props.phase === "no-data") return text(props.ctx, "hyt.chat.state.body.no-data")
    if (props.phase === "error") return text(props.ctx, "hyt.chat.state.body.error")
    return text(props.ctx, "hyt.chat.state.body.empty")
  }

  const detail = () => props.detail

  return (
    <Show
      when={props.phase !== "loading"}
      fallback={
        <div class="blank blank--frame">
          <div class="sk-rail">
            <div class="sk" style={{ height: "14px", width: "55%", "margin-bottom": "24px" }} />
            <div class="sk w80" />
            <div class="sk w60" />
            <div class="sk w80" />
            <div class="sk w40" />
            <div class="sk w80" />
            <div class="sk w60" />
          </div>
          <div class="sk-desk">
            <div class="sk" style={{ height: "34px", width: "260px", "margin-bottom": "28px" }} />
            <p class="sk-hint">{text(props.ctx, "hyt.chat.blank.loading")}</p>
            <div class="inner">
              <div class="sk tall w60" />
              <div class="sk w40" />
              <div class="sk tall w60" style={{ "margin-left": "auto" }} />
              <div class="sk tall w40" />
              <div class="sk w60" />
            </div>
          </div>
        </div>
      }
    >
      <div class="blank">
        <div class="blank-brand">{text(props.ctx, "hyt.chat.blank.brand")}</div>
        <div class="blank-inner">
          <h2 class="blank-title">{title()}</h2>
          <p class="blank-body">{body()}</p>
          <div class="blank-actions">
            <Show
              when={props.phase === "error"}
              fallback={
                <button class="button" type="button" onClick={() => props.onSettings()}>
                  {text(props.ctx, "hyt.chat.action.settings")}
                </button>
              }
            >
              <button class="button" type="button" onClick={() => props.onRetry()}>
                {text(props.ctx, "hyt.chat.action.retry")}
              </button>
              <button class="ghost" type="button" onClick={() => props.onSettings()}>
                {text(props.ctx, "hyt.chat.action.settings")}
              </button>
            </Show>
            <Show when={props.phase !== "error"}>
              <button class="ghost" type="button" onClick={() => props.onRetry()}>
                {text(props.ctx, "hyt.chat.action.detect")}
              </button>
            </Show>
          </div>

          <Show when={props.phase === "error" && detail().length > 0}>
            <details class="tech">
              <summary>{text(props.ctx, "hyt.chat.error.tech")}</summary>
              <pre>{detail()}</pre>
            </details>
          </Show>

          <Show when={props.phase !== "error" && detail().length > 0}>
            <p class="panel-note">
              {text(props.ctx, "hyt.chat.state.detail")}：{detail()}
            </p>
          </Show>
        </div>
      </div>
    </Show>
  )
}
