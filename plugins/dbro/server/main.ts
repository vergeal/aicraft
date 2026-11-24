import { Plugin } from "@opencode/plugin"
import { PluginManifest } from "@opencode/schema/plugin-manifest"
import { join } from "node:path"

const manifest = PluginManifest.decode(await Bun.file(join(import.meta.dir, "..", "METAINF")).json())
import * as DbroSkill from "../src/skill.js"
import * as DbroTools from "../src/tools.js"

export default Plugin.define({
  id: manifest.id,
  // The manifest is the single source of truth for the plugin browser; discovery reads the same file before install.
  display: {
    name: manifest.display.name,
    description: manifest.display.description,
    category: manifest.display.category,
    icon: manifest.display.icon,
    skills: (manifest.skills ?? []).map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
    })),
    tools: manifest.display.tools,
  },
  async activate(ctx) {
    console.log(`[dbro] loaded ${manifest.version}`)

    const skill = await DbroSkill.load()
    await ctx.skill.transform((editor) => {
      if (!editor.get(skill.id)) editor.add(skill)
    })

    await ctx.tool.transform((editor) => DbroTools.register(editor, ctx))
  },
})
