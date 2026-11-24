import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { timelinePresets } from "@opencode/session-ui/timeline/detail"
import { Persistence } from "@/runtime/persistence/schema"
import {
  settingsSchema,
  settingsPersistence,
  defaultSettings,
  monoDefaultFor,
  monoFontFamily,
  sansDefault,
  sansDefaultFor,
  sansFontFamily,
  terminalDefaultFor,
  terminalFontFamily,
} from "./model"

const schema = Persistence.withInitial(settingsPersistence, defaultSettings)

const decode = Schema.decodeUnknownSync(schema)

const encode = Schema.encodeSync(schema)

describe("settings timeline detail migration", () => {
  test("migrates saved switches and round trips the current settings", () => {
    const settings = decode({
      general: { shellToolPartsExpanded: true, editToolPartsExpanded: false, showReasoningSummaries: true },
      appearance: { fontSize: 16 },
    })

    expect(settings.general.timelineDetail).toEqual({
      ...timelinePresets[4].value,
      shell: { placement: "separate", details: "expanded" },
      edit: { placement: "grouped", details: "collapsed" },
      thinking: { placement: "separate", details: "expanded" },
    })
    expect(settings.appearance.fontSize).toBe(16)
    expect(decode(encode(settings))).toEqual(settings)
  })
})

describe("settings schema", () => {
  test("keeps the values plugins copy out once and discards retired preferences", () => {
    const settings = decode({
      general: {
        showStatus: true,
        showSearch: true,
        experimentalBrowser: false,
        showProjectIcon: true,
        releaseNotes: false,
        mobileDiffWrap: false,
      },
      appearance: { showProjectName: true },
      sessionSummary: { projectExpanded: false, serverExpanded: true },
    })

    expect(settings.general.showSearch).toBe(true)
    expect(settings.general).not.toHaveProperty("showStatus")
    expect(settings.general).not.toHaveProperty("experimentalBrowser")
    expect(settings.general).not.toHaveProperty("showProjectIcon")
    expect(settings.appearance).not.toHaveProperty("showProjectName")

    const copied = (value: typeof settings) => ({
      sessionSummary: value.sessionSummary,
      releaseNotes: value.general.releaseNotes,
      mobileDiffWrap: value.general.mobileDiffWrap,
    })

    expect(copied(decode(encode(settings)))).toEqual({
      sessionSummary: { projectExpanded: false, serverExpanded: true },
      releaseNotes: false,
      mobileDiffWrap: false,
    })
  })

  test("uses the supplied initial values independently of the current schema", () => {
    const initial = {
      ...defaultSettings,
      general: { ...defaultSettings.general, timelineDetail: timelinePresets[4].value, autoSave: false },
      appearance: { ...defaultSettings.appearance, fontSize: 20 },
    }

    const restore = Schema.decodeUnknownSync(Persistence.withInitial(settingsPersistence, initial))
    expect(restore({})).toEqual(initial)
    expect(restore({ general: { reasoningMode: "invalid", showReasoningSummaries: true } })).toEqual(initial)
    expect(restore({ general: { showReasoningSummaries: true } }).general.timelineDetail.thinking).toEqual({
      placement: "separate",
      details: "expanded",
    })
    expect(() => Schema.decodeUnknownSync(settingsSchema)({})).toThrow()
  })

  test("supplies the existing defaults for an empty document", () => {
    expect(decode({})).toEqual({
      general: {
        timelineDetail: timelinePresets[4].value,
        showCustomAgents: false,
        showTurnDiffs: false,
        backgroundActivity: "left",
        timelineWidth: "comfortable",
        newIcons: false,
        foldUserMessages: false,
        newQuestionUI: false,
        mobileTitlebarPosition: "top",
        followUpBehavior: "queue",
        transcriptView: "detailed",
        collapseTiming: "completion",
        foldedReplies: "final",
      },
      appearance: {
        fontSize: 14,
        mono: "",
        sans: "",
        terminal: "",
        tabLayout: "horizontal",
        reduceMotion: "system",
      },
      keybinds: {},
      permissions: { autoApprove: false, autoApproveProjects: {} },
      workspaces: { defaultDestination: "last-used", lastUsed: {} },
      notifications: { agent: false, permissions: true, questions: true, errors: false },
      sounds: {
        agentEnabled: true,
        agent: "staplebops-01",
        permissionsEnabled: true,
        permissions: "staplebops-02",
        questionsEnabled: true,
        questions: "staplebops-05",
        errorsEnabled: true,
        errors: "nope-03",
      },
    })
  })

  test("defaults invalid preferences locally while retaining valid siblings", () => {
    const settings = decode({
      general: {
        showTerminal: true,
        autoSave: false,
        releaseNotes: undefined,
        reasoningMode: 3,
        followUpBehavior: "invalid",
        backgroundActivity: "invalid",
        timelineWidth: "invalid",
        newQuestionUI: "invalid",
      },
      appearance: { fontSize: "large", mono: "Custom Mono", tabLayout: "vertical", showProjectName: true },
      permissions: { autoApprove: true, autoApproveProjects: { on: true, off: false, bad: "yes" } },
      workspaces: { defaultDestination: "new", lastUsed: { good: "workspace", bad: true } },
      keybinds: { good: "ctrl+k", bad: 3 },
      notifications: { agent: false, permissions: "yes", errors: true },
      sounds: { agent: "custom", agentEnabled: false, permissions: 3 },
    })

    expect(settings.general).toMatchObject({
      showTerminal: true,
      autoSave: false,
      timelineDetail: timelinePresets[4].value,
      followUpBehavior: "queue",
      backgroundActivity: "left",
      timelineWidth: "comfortable",
      newQuestionUI: false,
    })
    expect(settings.appearance).toEqual({
      fontSize: 14,
      mono: "Custom Mono",
      sans: "",
      terminal: "",
      tabLayout: "vertical",
      reduceMotion: "system",
    })
    expect(settings.permissions).toEqual({ autoApprove: true, autoApproveProjects: { on: true, off: false } })
    expect(settings.workspaces).toEqual({ defaultDestination: "new", lastUsed: { good: "workspace" } })
    expect(settings.keybinds).toEqual({ good: "ctrl+k" })
    expect(settings.notifications).toEqual({ agent: false, permissions: true, questions: true, errors: true })
    expect(settings.sounds).toMatchObject({ agent: "custom", agentEnabled: false, permissions: "staplebops-02" })
    expect(decode(encode(settings))).toEqual(settings)
  })

  test.each([undefined, null, false, 7, "invalid", []].map((invalid) => [invalid]))(
    "defaults malformed sections without losing other sections: %j",
    (invalid) => {
      const defaults = decode({})
      expect(
        decode({
          general: invalid,
          appearance: { fontSize: 18 },
          keybinds: invalid,
          permissions: invalid,
          workspaces: invalid,
          notifications: invalid,
          sounds: invalid,
        }),
      ).toEqual({
        ...defaults,
        appearance: { ...defaults.appearance, fontSize: 18 },
      })
    },
  )

  test("does not silently repair invalid values during encoding", () => {
    expect(() =>
      Schema.encodeUnknownSync(settingsSchema)({ ...decode({}), appearance: { fontSize: "large" } }),
    ).toThrow()
  })
})

test("every font row defaults to System", () => {
  expect(sansDefault).toBe("system-ui")

  expect(sansDefaultFor()).toBe("system-ui")
  expect(monoDefaultFor()).toBe("system-ui")
  expect(terminalDefaultFor()).toBe("system-ui")
})

test("each font role starts from its own stack", () => {
  expect(sansFontFamily(undefined)).toStartWith("-apple-system, ")
  expect(monoFontFamily(undefined)).toStartWith('"JetBrains Mono", ')
  expect(terminalFontFamily(undefined)).toStartWith('"SFMono-Regular", ')
  expect(monoFontFamily("system-ui")).toStartWith('"JetBrains Mono", ')
  expect(monoFontFamily("Custom Mono")).toStartWith('"Custom Mono", "JetBrains Mono", ')
})

test("System resolves to each role's own stack", () => {
  expect(sansFontFamily("system-ui")).toBe(
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  )
  expect(monoFontFamily("system-ui")).toBe(
    '"JetBrains Mono", "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace',
  )
  expect(terminalFontFamily("system-ui")).toBe(
    '"SFMono-Regular", "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
  )
})

test.each([
  { name: "sans", family: sansFontFamily, font: undefined, prefix: "-apple-system, " },
  { name: "sans", family: sansFontFamily, font: "", prefix: "-apple-system, " },
  { name: "sans", family: sansFontFamily, font: "   ", prefix: "-apple-system, " },
  { name: "sans", family: sansFontFamily, font: "Custom Sans", prefix: '"Custom Sans", -apple-system, ' },
  {
    name: "mono",
    family: (font: string | undefined) => monoFontFamily(font),
    font: undefined,
    prefix: '"JetBrains Mono", ',
  },
  {
    name: "mono",
    family: (font: string | undefined) => monoFontFamily(font),
    font: "",
    prefix: '"JetBrains Mono", ',
  },
  {
    name: "mono",
    family: (font: string | undefined) => monoFontFamily(font),
    font: "   ",
    prefix: '"JetBrains Mono", ',
  },
  {
    name: "mono",
    family: (font: string | undefined) => monoFontFamily(font),
    font: "Custom Mono",
    prefix: '"Custom Mono", "JetBrains Mono", ',
  },
  {
    name: "mono",
    family: (font: string | undefined) => monoFontFamily(font),
    font: "system-ui",
    prefix: '"JetBrains Mono", ',
  },
  {
    name: "terminal",
    family: (font: string | undefined) => terminalFontFamily(font),
    font: undefined,
    prefix: '"SFMono-Regular", ',
  },
  {
    name: "terminal",
    family: (font: string | undefined) => terminalFontFamily(font),
    font: "system-ui",
    prefix: '"SFMono-Regular", ',
  },
])("$name font family for $font starts with $prefix", ({ family, font, prefix }) => {
  expect(family(font)).toStartWith(prefix)
})
