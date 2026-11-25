import type { MainContext } from "@aicraft/aix/gui/main"
import { ItsmBrowser } from "../src/ipc.js"
import { createHost } from "../native/main.js"

/** main 进程：把内嵌浏览器与页面自动化的 Ipc 提供给窗口。 */
export function main(ctx: MainContext) {
  ctx.provide(ItsmBrowser, createHost(ctx))
}
