import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { HytProfile } from "../src/profile/index.js"
import {
  applyConfiguration,
  applyPreset,
  defaultProfile,
  isOnboarded,
  loadProfile,
  mergeProfile,
  presetOf,
  profilePath,
  resolveProfile,
  saveProfile,
} from "../src/profile/index.js"

const NOW = 1_800_000_000_000

describe("defaultProfile", () => {
  test("未引导时的中性默认值", () => {
    const profile = defaultProfile("csT1002173", undefined, NOW)
    expect(profile).toMatchObject({
      version: 1,
      account: "csT1002173",
      role: "it-ops",
      scenes: [],
      updatedAt: NOW,
    })
    expect(profile.capabilities).toEqual({
      digest: { enabled: false, everyHours: 24 },
      tasks: { enabled: false },
      reminders: { enabled: false },
      knowledge: { enabled: false },
      drafts: { enabled: false },
      autopilot: { enabled: false, scope: "off", whitelist: [] },
      style: { enabled: false },
    })
    expect(profile.cost).toEqual({ analysisIntervalMinutes: 30, batchSize: 50, model: "" })
    expect(profile.knowledge).toEqual({ builtin: true, paths: [], mcpTools: [] })
    expect(profile.onboarding).toEqual({ completed: false })
  })

  test("传入角色时用它", () => {
    const profile: HytProfile = defaultProfile("cs1", "management")
    expect(profile.role).toBe("management")
  })
})

describe("预设", () => {
  test("运维值守", () => {
    const profile = applyPreset("ops", "cs1", NOW)
    expect(profile.role).toBe("it-ops")
    expect(profile.scenes).toEqual(["troubleshoot", "duty-alerts"])
    expect(profile.capabilities.digest).toEqual({ enabled: true, everyHours: 4 })
    expect(profile.capabilities.tasks.enabled).toBe(true)
    expect(profile.capabilities.reminders.enabled).toBe(true)
    expect(profile.capabilities.knowledge.enabled).toBe(true)
    expect(profile.capabilities.drafts.enabled).toBe(true)
    expect(profile.capabilities.style.enabled).toBe(true)
    expect(profile.capabilities.autopilot).toEqual({ enabled: true, scope: "whitelist", whitelist: [] })
    expect(profile.cost).toEqual({ analysisIntervalMinutes: 60, batchSize: 40, model: "" })
    expect(profile.onboarding).toEqual({ completed: false, preset: "ops" })
    expect(profile.account).toBe("cs1")
    expect(profile.updatedAt).toBe(NOW)
  })

  test("任务助理", () => {
    const profile = applyPreset("tasks", "cs1", NOW)
    expect(profile.role).toBe("tech-support")
    expect(profile.scenes).toEqual(["task-intake", "ticket-close"])
    expect(profile.capabilities.digest).toEqual({ enabled: true, everyHours: 24 })
    expect(profile.capabilities.drafts.enabled).toBe(true)
    expect(profile.capabilities.autopilot).toEqual({ enabled: false, scope: "off", whitelist: [] })
    expect(profile.cost).toEqual({ analysisIntervalMinutes: 120, batchSize: 60, model: "" })
  })

  test("全面托管包含全部场景", () => {
    const profile = applyPreset("full", "cs1", NOW)
    expect(profile.scenes).toEqual([
      "troubleshoot",
      "task-intake",
      "duty-alerts",
      "ticket-close",
      "meeting",
      "no-miss",
    ])
    expect(profile.capabilities.digest.enabled).toBe(true)
    expect(profile.capabilities.knowledge.enabled).toBe(true)
    expect(profile.capabilities.style.enabled).toBe(true)
    expect(profile.capabilities.autopilot).toEqual({ enabled: true, scope: "whitelist", whitelist: [] })
    expect(profile.cost).toEqual({ analysisIntervalMinutes: 60, batchSize: 40, model: "" })
  })

  test("预设对象的白名单不会被返回值共享", () => {
    const profile = applyPreset("ops", "cs1", NOW)
    expect(profile.capabilities.autopilot.whitelist).not.toBe(presetOf("ops").capabilities.autopilot.whitelist)
    expect(profile.capabilities.autopilot.whitelist).toEqual([])
    expect(presetOf("ops").capabilities.autopilot.whitelist).toEqual([])
  })
})

describe("mergeProfile", () => {
  test("局部 patch 只改目标字段", () => {
    const base = applyPreset("ops", "cs1", NOW)
    const merged = mergeProfile(
      base,
      {
        scenes: ["meeting"],
        capabilities: { autopilot: { scope: "all" } },
        cost: { batchSize: 99 },
        onboarding: { completed: true },
      },
      NOW,
    )
    expect(merged.scenes).toEqual(["meeting"])
    expect(merged.capabilities.autopilot).toEqual({ enabled: true, scope: "all", whitelist: [] })
    expect(merged.capabilities.digest).toEqual(base.capabilities.digest)
    expect(merged.cost).toEqual({ analysisIntervalMinutes: 60, batchSize: 99, model: "" })
    expect(merged.onboarding).toEqual({ completed: true, preset: "ops" })
    expect(merged.updatedAt).toBe(NOW)
  })

  test("数组整体替换、undefined 不覆盖", () => {
    const base = applyPreset("ops", "cs1", NOW)
    const merged = mergeProfile(base, { scenes: [], capabilities: { autopilot: { whitelist: ["g1", "cs2"] } } }, NOW)
    expect(merged.scenes).toEqual([])
    expect(merged.capabilities.autopilot.whitelist).toEqual(["g1", "cs2"])
    expect(merged.capabilities.autopilot.enabled).toBe(true)
  })

  test("updatedAt 可显式给出", () => {
    const merged = mergeProfile(defaultProfile("cs1", undefined, NOW), { updatedAt: 42 }, NOW)
    expect(merged.updatedAt).toBe(42)
  })
})

describe("configuration 优先级", () => {
  const config = {
    whitelist: ["g80001419326603732", "cs20254801"],
    autoReplyEnabled: true,
    analysisBatchSize: 77,
    analysisIntervalMinutes: 45,
    knowledgePaths: ["/tmp/kb"],
    mcpKnowledgeTools: ["wiki.search"],
  }

  test("没有保存档案时，configuration 覆盖默认值", () => {
    const profile = resolveProfile({ account: "cs1", config, now: NOW })
    expect(profile.capabilities.autopilot).toEqual({
      enabled: true,
      scope: "whitelist",
      whitelist: ["g80001419326603732", "cs20254801"],
    })
    expect(profile.cost).toEqual({ analysisIntervalMinutes: 45, batchSize: 77, model: "" })
    expect(profile.knowledge.paths).toEqual(["/tmp/kb"])
    expect(profile.knowledge.mcpTools).toEqual(["wiki.search"])
  })

  test("关闭自动回复时 scope 回到 off，白名单保留", () => {
    const profile = applyConfiguration(applyPreset("ops", "cs1", NOW), {
      autoReplyEnabled: false,
      whitelist: ["g1"],
    })
    expect(profile.capabilities.autopilot.scope).toBe("off")
    expect(profile.capabilities.autopilot.enabled).toBe(false)
    expect(profile.capabilities.autopilot.whitelist).toEqual(["g1"])
  })

  test("类型不对的 configuration 项被忽略", () => {
    const profile = applyConfiguration(defaultProfile("cs1", undefined, NOW), {
      whitelist: "g1",
      analysisBatchSize: "77",
      autoReplyEnabled: "yes",
    })
    expect(profile.capabilities.autopilot.whitelist).toEqual([])
    expect(profile.cost.batchSize).toBe(50)
    expect(profile.capabilities.autopilot.enabled).toBe(false)
  })

  test("已保存的 profile 字段优先于 configuration", () => {
    const saved = mergeProfile(
      resolveProfile({ account: "cs1", config, now: NOW }),
      { cost: { batchSize: 99 }, capabilities: { autopilot: { whitelist: ["g2"] } } },
      NOW,
    )
    const profile = resolveProfile({ account: "cs1", config, saved, now: NOW })
    expect(profile.cost.batchSize).toBe(99)
    expect(profile.cost.analysisIntervalMinutes).toBe(45)
    expect(profile.capabilities.autopilot.whitelist).toEqual(["g2"])
  })

  test("预设 + 角色覆盖 + configuration 一起生效", () => {
    const profile = resolveProfile({ account: "cs1", preset: "tasks", role: "engineering", config, now: NOW })
    expect(profile.role).toBe("engineering")
    expect(profile.scenes).toEqual(["task-intake", "ticket-close"])
    expect(profile.capabilities.digest).toEqual({ enabled: true, everyHours: 24 })
    expect(profile.cost.batchSize).toBe(77)
  })
})

describe("档案存储", () => {
  test("保存后能读回，updatedAt 由保存时间决定", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hyt-profile-"))
    try {
      const profile = applyPreset("ops", "cs1", NOW)
      const saved = await saveProfile(directory, profile, NOW + 1)
      expect(saved.updatedAt).toBe(NOW + 1)
      const loaded = await loadProfile(directory)
      expect(loaded).toEqual(saved)
      expect(isOnboarded(loaded)).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("文件不存在时返回 fallback", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hyt-profile-"))
    try {
      const fallback = defaultProfile("cs1", undefined, NOW)
      expect(await loadProfile(directory, fallback)).toEqual(fallback)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("损坏 JSON 回退到默认且不覆盖原文件", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hyt-profile-"))
    try {
      await mkdir(join(directory, "hyt"), { recursive: true })
      const path = profilePath(directory)
      await writeFile(path, '{ "version": 1, "account": "cs1", "role": ', "utf8")
      const original = await readFile(path, "utf8")
      const fallback = defaultProfile("cs1", undefined, NOW)
      const loaded = await loadProfile(directory, fallback)
      expect(loaded).toEqual(fallback)
      expect(await readFile(path, "utf8")).toBe(original)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("schema 不符的档案同样回退，不写回", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hyt-profile-"))
    try {
      await mkdir(join(directory, "hyt"), { recursive: true })
      const path = profilePath(directory)
      await writeFile(path, JSON.stringify({ ...applyPreset("ops", "cs1", NOW), version: 2 }), "utf8")
      const original = await readFile(path, "utf8")
      const loaded = await loadProfile(directory, defaultProfile("cs1", undefined, NOW))
      expect(loaded.version).toBe(1)
      expect(loaded.onboarding.completed).toBe(false)
      expect(await readFile(path, "utf8")).toBe(original)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe("isOnboarded", () => {
  test("未完成、没有档案都为 false，完成为 true", () => {
    expect(isOnboarded(undefined)).toBe(false)
    expect(isOnboarded(defaultProfile("cs1", undefined, NOW))).toBe(false)
    const completed = mergeProfile(defaultProfile("cs1", undefined, NOW), {
      onboarding: { completed: true, completedAt: NOW },
    })
    expect(isOnboarded(completed)).toBe(true)
  })
})
