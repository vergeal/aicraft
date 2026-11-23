import { MainSurface, Style } from "@opencode/plugin/gui"
import type { Context } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { createSignal } from "solid-js"
import { ChatIpc } from "./contract.js"
import { text } from "./i18n.js"
import { ChatPage } from "./page.js"
import { css } from "./styles.js"
import { RAIL_DEFAULT } from "./util.js"

/** 左栏宽度：拖动分隔线改，窗口记住上次的值。 */
const Layout = Schema.Struct({ listWidth: Schema.Number })

/**
 * 聊天主界面：注册为一级导航页 `/plugins/<plugin>/chat`。
 *
 * 未读数由主进程推送的 state 提供，因此角标不需要页面挂载也能显示；
 * 页面自己在可见时轮询刷新，关掉页面就停止读盘。
 */
export function registerChat(ctx: Context) {
  ctx.add(Style, css)
  const client = ctx.main(ChatIpc)
  const layout = ctx.storage.store("layout", { schema: Layout, initial: { listWidth: RAIL_DEFAULT } })
  // 拖动中的宽度只留在内存里，松手才写盘，免得每一帧都写一次存储。
  const [dragWidth, setDragWidth] = createSignal<number>()
  const listWidth = () => dragWidth() ?? layout.value?.listWidth ?? RAIL_DEFAULT

  ctx.add(MainSurface, {
    id: "chat",
    get title() {
      return text(ctx, "hyt.chat.nav")
    },
    icon: "bubble-5",
    order: 10,
    badge: () => client.state()?.unread ?? 0,
    // 顶栏整条与左栏同色：聊天区是一张浮在左栏底色上的圆角卡片，顶栏不再按栏分段。
    titlebar: () => {
      const colors =
        ctx.appearance.mode() === "dark"
          ? { chrome: "#0d1013", ink: "#e3e8ed" }
          : { chrome: "#f3f5f7", ink: "#1b2430" }

      return { background: colors.chrome, foreground: colors.ink }
    },
    render: () => (
      <ChatPage
        ctx={ctx}
        client={client}
        listWidth={listWidth}
        onListWidth={(width) => setDragWidth(width)}
        onListWidthEnd={() => {
          const width = dragWidth()
          setDragWidth(undefined)
          if (width !== undefined) layout.set({ listWidth: width })
        }}
      />
    ),
  })
}
