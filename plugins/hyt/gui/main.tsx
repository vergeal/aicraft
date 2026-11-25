import { Plugin } from "@aicraft/aix/gui"
import { catalog as chatCatalog } from "./chat/i18n.js"
import { registerChat } from "./chat/index.js"
import { provideChatIpc } from "./chat/main.js"
import { registerOnboarding } from "./onboarding/index.js"
import { registerSettings } from "./settings/index.js"
import { catalog as sharedCatalog } from "./shared/i18n.js"

/**
 * GUI 总入口：聊天主界面、设置页与首次引导共用一份 catalog 与一个主进程。
 * `main` 只读本地文件，所有数据都经 Ipc 推给窗口；窗口不碰 fs。
 */
const i18n = {
  en: { ...sharedCatalog.en, ...chatCatalog.en },
  zh: { ...sharedCatalog.zh, ...chatCatalog.zh },
}

const setup: Plugin.Setup = (ctx) => {
  registerChat(ctx)
  registerSettings(ctx)
  registerOnboarding(ctx)
}

const main: Plugin.MainSetup = (ctx) => {
  provideChatIpc(ctx)
}

export default Plugin.define({ i18n, setup, main })
