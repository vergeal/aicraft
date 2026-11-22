import { Plugin } from "@opencode/plugin"
import { AbsolutePath } from "@opencode/schema/schema"
import { Skill } from "@opencode/schema/skill"
import { existsSync } from "node:fs"
import { readFile, appendFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import manifest from "../ocplugin.json" with { type: "json" }
import { analyzeOnce, capabilityList, startAnalysisLoop } from "../src/ai/loop.js"
import type { AnalysisSink } from "../src/ai/loop.js"
import { startReminders } from "../src/ai/reminders.js"
import { registerAI } from "../src/ai/tools.js"
import { defaultProfile } from "../src/profile/schema.js"
import { loadProfile } from "../src/profile/store.js"
import { createService } from "../src/service.js"
import { register } from "../src/tools.js"

/** 分析会话的标题；同一插件只复用这一个会话，避免每批都新建。 */
const ANALYSIS_TITLE = "虹云通分析"

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
    const service = createService({
      dataDir: ctx.paths.data,
      config: ctx.config,
      options: ctx.options,
    })
    const note = (text: string) =>
      mkdir(ctx.paths.data, { recursive: true })
        .then(() => appendFile(join(ctx.paths.data, "bridge-warm.log"), `${new Date().toISOString()} pid=${process.pid} ${text}\n`))
        .catch(() => undefined)
    // 插件自带 SDK：启动后台把桥接拉起来并登录，之后收发都不必先运行虹云通客户端。
    void service.warm().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn("[hyt] 独立消息通道未就绪：", message)
      // 后台预热失败不打断插件，但把原因留在插件数据目录，便于下次排查。
      return note(`warm failed: ${message}`)
    })

    const skill = await loadSkill()
    await ctx.skill.transform((editor) => {
      if (!editor.get(skill.id)) editor.add(skill)
    })
    await ctx.tool.transform((editor) => {
      register(editor, service)
      registerAI(editor, service, { skillRoot: skillsRoot() })
    })

    const profile = await loadProfile(service.dataDir, defaultProfile(""))
    const sink = createAnalysisSink(ctx)

    // 后台循环只负责「攒批次 + 投递」，模型判定在分析会话里完成；能力全关时连库都不读。
    const stopAnalysis = startAnalysisLoop({
      intervalMinutes: profile.cost.analysisIntervalMinutes,
      run: async () => {
        const current = await loadProfile(service.dataDir, defaultProfile(""))
        if (capabilityList(current).length === 0) return
        const environment = await service.environment()
        if (environment === undefined) return
        const result = await analyzeOnce({
          dataDir: service.dataDir,
          profile: current,
          db: await service.chat(),
          selfAccount: environment.account,
          sink,
          batchSize: current.cost.batchSize,
        })
        console.log(`[hyt] analyze ${result.status}: scanned ${result.scanned}, candidates ${result.candidates}`)
      },
      onError: (error) => console.warn("[hyt] analysis loop failed", error),
    })

    const stopReminders =
      profile.capabilities.reminders.enabled
        ? startReminders({
            dataDir: service.dataDir,
            port: ctx.inbox,
            onError: (error) => console.warn("[hyt] reminder loop failed", error),
          })
        : () => undefined
    if (profile.capabilities.reminders.enabled)
      console.log("[hyt] 到期提醒使用插件内定时器 + 收件箱消息（宿主尚未向插件暴露 experimental.schedule）。")

    console.log(`[hyt] loaded ${manifest.version}`)
    return async () => {
      stopAnalysis()
      stopReminders()
      await service.cleanup()
    }
  },
})

/**
 * 分析任务投递：复用一个标题固定的会话，用 synthetic 消息把批次交给它。
 * 会话不存在时按需创建；投递失败只返回错误，不抛出——批次已经落盘，可以手动用 hyt.analyze.batch 处理。
 */
function createAnalysisSink(ctx: Plugin.Context): AnalysisSink {
  let cached: string | undefined
  return {
    async deliver(input) {
      try {
        const sessionID = cached ?? (await ensureAnalysisSession(ctx))
        cached = sessionID
        await ctx.session.synthetic({
          sessionID,
          text: input.text,
          description: `虹云通批次 ${input.batchId}`,
          metadata: { source: "hyt", batchId: input.batchId },
        })
        return { sessionId: sessionID, delivered: true }
      } catch (error) {
        return {
          sessionId: cached ?? "",
          delivered: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}

async function ensureAnalysisSession(ctx: Plugin.Context) {
  const found = await ctx.session.list({ search: ANALYSIS_TITLE, limit: 20 })
  const existing = found.data.find((session) => session.title === ANALYSIS_TITLE)
  if (existing !== undefined) return String(existing.id)
  const created = await ctx.session.create({ title: ANALYSIS_TITLE, location: { directory: ctx.location.directory } })
  return String(created.id)
}

/** 风格技能写进插件包的 skills 目录；源码运行与打包运行的层级不同，按 loadSkill 的候选顺序取第一个存在的。 */
function skillsRoot() {
  const candidates = [join(import.meta.dir, "..", "skills"), join(import.meta.dir, "..", "..", "skills")]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!
}

/**
 * 技能正文随构建产物一起发布，激活时读一次：清单里的描述和模型实际读到的内容不会各说一套。
 * 构建后 SKILL.md 在 dist/skills 下，源码运行时在插件根目录的 skills 下。
 */
async function loadSkill() {
  const entry = manifest.skills.find((skill) => skill.id === "hyt-assistant")!
  const candidates = [join(import.meta.dir, "..", entry.path), join(import.meta.dir, "..", "..", entry.path)]
  const path = candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!
  return Skill.Info.make({
    id: Skill.ID.make(entry.id),
    name: Skill.Name.make(entry.name),
    description: entry.description,
    path: AbsolutePath.make(path),
    content: await readFile(path, "utf8"),
  })
}
