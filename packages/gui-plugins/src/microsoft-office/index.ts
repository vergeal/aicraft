import { builtinCatalog } from "@aicraft/aix/gui/builtin"
import { Plugin } from "@aicraft/aix/gui"
import en from "./i18n/en"

/** Read-only previews of Word, Excel and PowerPoint files in the file view. */
export default Plugin.define({
  i18n: builtinCatalog({ en, zh: () => import("./i18n/zh") }),
})
