import { Plugin } from "@aicraft/plugin/gui"
import { catalog } from "./i18n.js"

/** 窗口与 main 两侧共用的声明；setup 与 main 分开写在各自的文件里。 */
export const definition = Plugin.define({ i18n: catalog })

export type Definition = typeof definition
