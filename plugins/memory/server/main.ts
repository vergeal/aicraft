import { Plugin } from "@opencode/plugin"
import manifest from "../ocplugin.json" with { type: "json" }
import * as MemoryContract from "../src/contract.js"
import * as MemoryRuntime from "../src/runtime.js"
import * as MemorySkill from "../src/skill.js"
import * as MemoryStore from "../src/store.js"
import * as MemoryTools from "../src/tools.js"

export default Plugin.define({
  id: manifest.id,
  display: {
    name: manifest.display.name,
    description: manifest.display.description,
    category: manifest.display.category,
    skills: manifest.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
    })),
    tools: manifest.display.tools,
  },
  async activate(ctx) {
    // The config is a file on disk; read it once per change instead of once per request.
    let cached: MemoryRuntime.Settings | undefined
    const settings = async () => (cached ??= MemoryRuntime.readSettings(await ctx.config.get()))
    ctx.config.onChange(() => {
      cached = undefined
    })

    const deps: MemoryRuntime.Deps = {
      storage: ctx.storage,
      projectID: (sessionID) => MemoryRuntime.projectID(ctx, sessionID),
      settings,
      now: () => new Date().toISOString(),
    }

    const skill = await MemorySkill.load()
    await ctx.skill.transform((editor) => {
      if (!editor.get(skill.id)) editor.add(skill)
    })
    await ctx.tool.transform((editor) => MemoryTools.register(editor, deps))

    // The settings page's read/write channel: the same storage the tools use, addressed explicitly because a settings
    // page has no routed Session to take a Project from.
    await ctx.rpc.register(MemoryContract.Definition, {
      list: async (input) => {
        const config = await settings()
        const [global, project] = await Promise.all([
          MemoryStore.readScope(ctx.storage, MemoryStore.globalPrefix, config.maxEntries),
          input.projectID === null
            ? []
            : MemoryStore.readScope(ctx.storage, MemoryStore.projectPrefix(input.projectID), config.maxEntries),
        ])
        return { global: MemoryStore.sortRecent(global), project: MemoryStore.sortRecent(project) }
      },
      save: async (input) => {
        const text = input.text.trim()
        if (text.length === 0) throw new Error("记忆内容不能为空。")
        const projectID = projectFor(input.scope, input.projectID)
        const tags = MemoryStore.normalizeTags(input.tags)
        const existing = await MemoryStore.readScope(
          ctx.storage,
          MemoryStore.prefixFor(input.scope, projectID),
          MAX_SCAN,
        )
        const duplicate = existing.find((entry) => entry.text.trim() === text)
        const now = deps.now()
        const entry: MemoryStore.Entry = duplicate
          ? { ...duplicate, tags: MemoryStore.normalizeTags([...duplicate.tags, ...tags]), updatedAt: now }
          : { id: MemoryStore.newID(), text, tags, createdAt: now, updatedAt: now }
        await ctx.storage.set(MemoryStore.keyFor(input.scope, projectID, entry.id), entry)
        return { entry, duplicate: duplicate !== undefined }
      },
      update: async (input) => {
        const text = input.text.trim()
        if (text.length === 0) throw new Error("记忆内容不能为空。")
        const projectID = projectFor(input.scope, input.projectID)
        const entries = await MemoryStore.readScope(
          ctx.storage,
          MemoryStore.prefixFor(input.scope, projectID),
          MAX_SCAN,
        )
        const current = entries.find((entry) => entry.id === input.id)
        if (!current) return { entry: null }
        const entry: MemoryStore.Entry = {
          ...current,
          text,
          tags: MemoryStore.normalizeTags(input.tags),
          updatedAt: deps.now(),
        }
        await ctx.storage.set(MemoryStore.keyFor(input.scope, projectID, entry.id), entry)
        return { entry }
      },
      remove: async (input) => {
        const projectID = projectFor(input.scope, input.projectID)
        await ctx.storage.remove(MemoryStore.keyFor(input.scope, projectID, input.id))
        return { removed: true }
      },
    })

    // Injected before every primary request. A failure here must never fail the request itself.
    await ctx.session.hook("context", async (event) => {
      try {
        const config = await settings()
        if (!config.autoInject) return
        const projectID = await deps.projectID(event.sessionID)
        const [project, global] = await Promise.all([
          MemoryStore.readScope(ctx.storage, MemoryStore.projectPrefix(projectID), config.maxEntries),
          MemoryStore.readScope(ctx.storage, MemoryStore.globalPrefix, config.maxEntries),
        ])
        event.system.push({
          type: "text",
          text: MemoryStore.render({ project, global, budget: config.maxInjectedChars }),
        })
      } catch (error) {
        console.error(`[memory] 注入记忆失败：${message(error)}`)
      }
    })

    console.log(`[memory] loaded ${manifest.version}`)
    return () => {}
  },
})

/** A project-scoped write needs a Project; a global one stores under the empty prefix. */
function projectFor(scope: MemoryContract.Scope, projectID: string | null) {
  if (scope === "global") return ""
  if (projectID === null) throw new Error("没有打开的项目，无法保存项目记忆。")
  return projectID
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** A project write deduplicates against the whole scope, so the scan ceiling is the same one the tools use. */
const MAX_SCAN = 2_000
