import { Plugin } from "@aicraft/aix/gui"
import { definition } from "./definition.js"
import { main } from "./main-process.js"
import { setup } from "./setup.js"

/** 窗口 setup 与 main 进程合在一个默认导出里；声明仍在 `definition.ts`，供组件取类型。 */
export default Plugin.define({ ...definition, setup, main })
