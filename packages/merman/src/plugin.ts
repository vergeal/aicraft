import { Plugin } from "@aicraft/plugin/tui"
import { createMermaidCodeBlockRenderer } from "./markdown.js"
import { resolveAicraftDiagramPalette } from "./palette.js"

export default Plugin.define({
  id: "aicraft.merman",
  setup(context) {
    context.markdown.registerCodeBlockRenderer(
      "mermaid",
      createMermaidCodeBlockRenderer(context.renderer, () => ({
        colors: resolveAicraftDiagramPalette(context.theme, context.themeMode),
      })),
    )
  },
})
