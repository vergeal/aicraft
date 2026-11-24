import type { Context, IpcClient } from "@aicraft/plugin/gui"
import { Show, createSignal } from "solid-js"
import { ChatIpc } from "./contract.js"
import { text } from "./i18n.js"

/**
 * 登录页：没有可用凭据时的整页视图。
 *
 * 直接把账号密码交给自带桥接登录（`auth.login`），成功后凭据存进插件数据目录，
 * 因此不需要先安装、登录虹云通客户端。失败原因原样显示在表单下方。
 */
export function LoginPage(props: {
  ctx: Context
  client: IpcClient<typeof ChatIpc.spec>
  /** 数据目录，脚注里给用户一个可对照的位置。 */
  detail: string
  /** 打开登录页时已知的失败原因（例如后台静默登录被服务端拒绝），直接显示在表单下方。 */
  initialError?: string
  /** 已知的账号（来自客户端登录记录），预填进表单，用户只需要补密码。 */
  defaultUser?: string
  /** 主界面还有本地历史可看时，允许收起登录页继续只读浏览。 */
  onCancel?: () => void
  /** 登录成功（或已提交等待连接）后回到聊天页；失败时留在表单上显示原因。 */
  onLoggedIn?: () => void
}) {
  const [userName, setUserName] = createSignal(props.defaultUser ?? "")
  const [password, setPassword] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>(
    props.initialError !== undefined && props.initialError.length > 0 ? props.initialError : undefined,
  )

  const ready = () => userName().trim().length > 0 && password().length > 0 && !busy()

  const submit = async () => {
    if (!ready()) return
    setBusy(true)
    setError(undefined)
    try {
      const result = await props.client.login({ userName: userName().trim(), password: password() })
      // 成功时主进程会推送新 state；有回调就顺手收起登录页，失败把原因留在表单下方。
      if (result.ok) {
        props.onLoggedIn?.()
        return
      }
      setError(result.message.length > 0 ? result.message : text(props.ctx, "hyt.chat.login.failed"))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="blank blank--auth">
      <div class="blank-brand">{text(props.ctx, "hyt.chat.login.brand")}</div>
      <div class="blank-inner">
        <h2 class="blank-title">{text(props.ctx, "hyt.chat.login.title")}</h2>
        <p class="blank-body">{text(props.ctx, "hyt.chat.login.body")}</p>

        <form
          class="login-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label class="login-field">
            <span class="login-label">{text(props.ctx, "hyt.chat.login.user")}</span>
            <input
              class="login-input"
              type="text"
              name="username"
              autocomplete="username"
              spellcheck={false}
              value={userName()}
              disabled={busy()}
              placeholder={text(props.ctx, "hyt.chat.login.user.placeholder")}
              onInput={(event) => setUserName(event.currentTarget.value)}
            />
          </label>

          <label class="login-field">
            <span class="login-label">{text(props.ctx, "hyt.chat.login.password")}</span>
            <input
              class="login-input"
              type="password"
              name="password"
              autocomplete="current-password"
              value={password()}
              disabled={busy()}
              placeholder={text(props.ctx, "hyt.chat.login.password.placeholder")}
              onInput={(event) => setPassword(event.currentTarget.value)}
            />
          </label>

          <Show when={error()}>
            {(message) => <p class="login-error">{text(props.ctx, "hyt.chat.login.error", { message: message() })}</p>}
          </Show>

          <div class="blank-actions">
            <button class="button" type="submit" disabled={!ready()}>
              {busy() ? text(props.ctx, "hyt.chat.login.busy") : text(props.ctx, "hyt.chat.login.submit")}
            </button>
            <Show when={props.onCancel !== undefined}>
              <button class="ghost" type="button" disabled={busy()} onClick={() => props.onCancel?.()}>
                {text(props.ctx, "hyt.chat.login.cancel")}
              </button>
            </Show>
          </div>
        </form>

        {/* 连接方式与数据位置是排查时才需要的细节，收起来，不占登录页的主视觉。 */}
        <details class="login-meta">
          <summary>{text(props.ctx, "hyt.chat.login.meta")}</summary>
          <p>{text(props.ctx, "hyt.chat.login.note")}</p>
          <Show when={props.detail.length > 0}>
            <p>
              {text(props.ctx, "hyt.chat.login.detail")}：<code>{props.detail}</code>
            </p>
          </Show>
        </details>
      </div>
    </div>
  )
}
