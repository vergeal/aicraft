import { Plugin } from "@aicraft/aix"
import { PluginManifest } from "@aicraft/schema/plugin-manifest"
import { join } from "node:path"

const manifest = PluginManifest.decode(await Bun.file(join(import.meta.dir, "..", "METAINF")).json())
import * as ItsmContract from "../src/contract.js"
import { validateTemplate } from "../src/logic.js"
import * as ItsmSkill from "../src/skill.js"
import * as ItsmStore from "../src/store.js"
import * as ItsmTools from "../src/tools.js"

export default Plugin.define({
  id: manifest.id,
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
    const settings = async () => {
      const config = await ctx.config.get()
      return { keepRuns: clampNumber(config.keepRuns, ItsmStore.DEFAULT_KEEP_RUNS, 1, 500) }
    }
    const now = () => new Date().toISOString()

    const deps: ItsmTools.Deps = {
      storage: ctx.storage,
      now,
      keepRuns: async () => (await settings()).keepRuns,
    }

    const skill = await ItsmSkill.load()
    await ctx.skill.transform((editor) => {
      if (!editor.get(skill.id)) editor.add(skill)
    })
    await ctx.tool.transform((editor) => ItsmTools.register(editor, deps))

    // 工作台读写与工具共用同一份存储；这里显式传上下文，因为工作台没有路由中的 Session。
    await ctx.rpc.register(ItsmContract.Definition, {
      snapshot: async () => ItsmStore.snapshot(ctx.storage, (await settings()).keepRuns),
      saveAccount: async (account) => ({ account: await ItsmStore.saveAccount(ctx.storage, account) }),
      removeAccount: async (input) => {
        await ItsmStore.removeAccount(ctx.storage, input.id)
        return { removed: true }
      },
      saveTemplate: async (template) => {
        const problems = validateTemplate(template)
        if (problems.length > 0) throw new Error(problems.map((problem) => problem.message).join(" "))
        return { template: await ItsmStore.saveTemplate(ctx.storage, template) }
      },
      removeTemplate: async (input) => {
        await ItsmStore.removeTemplate(ctx.storage, input.id)
        return { removed: true }
      },
      saveCatalog: async (catalog) => ({ catalog: await ItsmStore.saveCatalog(ctx.storage, catalog) }),
      saveAnswers: async (answers) => ({ answers: await ItsmStore.saveAnswers(ctx.storage, answers) }),
      recordRun: async (run) => ({ run: await ItsmStore.recordRun(ctx.storage, run, (await settings()).keepRuns) }),
      claimPending: async (input) => ({ request: await ItsmStore.claimPending(ctx.storage, input.id) }),
      finishPending: async (input) => ({ finished: await ItsmStore.finishPending(ctx.storage, input.id, input.runId) }),
      saveSettings: async (input) => ({ settings: await ItsmStore.saveSettings(ctx.storage, input) }),
      clearHistory: async () => ({ removed: await ItsmStore.clearRuns(ctx.storage) }),
    })

    console.log(`[itsm] loaded ${manifest.version}`)
    return () => {}
  },
})

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}
