import { MainSurface, Style } from "@opencode/plugin/gui"
import type { Context } from "@opencode/plugin/gui"
import { ChatIpc } from "./contract.js"
import { text } from "./i18n.js"
import { ChatPage } from "./page.js"
import { css } from "./styles.js"

/**
 * 聊天主界面：注册为一级导航页 `/plugins/<plugin>/chat`。
 *
 * 未读数由主进程推送的 state 提供，因此角标不需要页面挂载也能显示；
 * 页面自己在可见时轮询刷新，关掉页面就停止读盘。
 */
export function registerChat(ctx: Context) {
  ctx.add(Style, css)
  const client = ctx.main(ChatIpc)
  ctx.add(MainSurface, {
    id: "chat",
    get title() {
      return text(ctx, "hyt.chat.nav")
    },
    icon: "bubble-5",
    order: 10,
    badge: () => client.state()?.unread ?? 0,
    render: () => <ChatPage ctx={ctx} client={client} />,
  })
}
