import { builtinCatalog } from "@aicraft/aix/gui/builtin"
import { Plugin } from "@aicraft/aix/gui"
import en from "./i18n/en"

export default Plugin.define({ i18n: builtinCatalog({ en, zh: () => import("./i18n/zh") }) })
