import { MainSurface, Style } from "@opencode/plugin/gui"
import type { Context } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { createSignal, onCleanup } from "solid-js"
import { ChatIpc } from "./contract.js"
import { text } from "./i18n.js"
import { ChatPage } from "./page.js"
import { css } from "./styles.js"
import { RAIL_DEFAULT, shellBlank } from "./util.js"

/** 左栏宽度：拖动分隔线改，窗口记住上次的值。 */
const Layout = Schema.Struct({ listWidth: Schema.Number })

/** 与 `styles.ts` 里隐藏左栏的断点一致：下方没有列表时，顶栏也不再分段。 */
const NARROW = "(max-width: 760px)"

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

  const narrow = window.matchMedia(NARROW)
  const [listHidden, setListHidden] = createSignal(narrow.matches)
  const onNarrow = (event: MediaQueryListEvent) => setListHidden(event.matches)
  narrow.addEventListener("change", onNarrow)
  onCleanup(() => narrow.removeEventListener("change", onNarrow))

  /** 没有列表可对齐的几种情况：窄屏收起了左栏，或者页面本身在空态。 */
  const noList = () => listHidden() || shellBlank(client.state())

  ctx.add(MainSurface, {
    id: "chat",
    get title() {
      return text(ctx, "hyt.chat.nav")
    },
    icon: "bubble-5",
    order: 10,
    badge: () => client.state()?.unread ?? 0,
    // 顶栏横跨窗口：左段对左栏的底色，右段对聊天区，两栏在顶栏这一行也读得出来。
    titlebar: () => {
      const colors =
        ctx.appearance.mode() === "dark"
          ? { chrome: "#0d1013", paper: "#1a1e23", ink: "#e3e8ed" }
          : { chrome: "#f3f5f7", paper: "#ffffff", ink: "#1b2430" }
      const width = Math.round(listWidth())

      // 没有左栏时整条顶栏都跟聊天区走。
      return {
        background:
          noList() || width <= 0
            ? colors.paper
            : `linear-gradient(to right, ${colors.chrome} 0 ${width}px, ${colors.paper} ${width}px)`,
        foreground: colors.ink,
      }
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
