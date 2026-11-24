import { builtinCatalog } from "@aicraft/plugin/gui/builtin"
import { Plugin } from "@aicraft/plugin/gui"
import en from "./i18n/en"

export default Plugin.define({ i18n: builtinCatalog({ en, zh: () => import("./i18n/zh") }) })
