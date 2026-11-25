import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { timelinePresets } from "@aicraft/session-ui/timeline/detail"
import { Persistence } from "@/runtime/persistence/schema"
import {
  settingsSchema,
  settingsPersistence,
  defaultSettings,
  monoFontFamily,
  normalizeFontFamily,
  sansFontFamily,
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
      workspaces: { defaultDestination: "last-used", lastUsed: { retired: "workspace" } },
    })

    expect(settings.general.showSearch).toBe(true)
    expect(settings.general).not.toHaveProperty("showStatus")
    expect(settings.general).not.toHaveProperty("experimentalBrowser")
    expect(settings.general).not.toHaveProperty("showProjectIcon")
    expect(settings.appearance).not.toHaveProperty("showProjectName")
    // The retired remembered destination falls back to local, and its history is dropped.
    expect(settings.workspaces).toEqual({ defaultDestination: "local" })

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
      workspaces: { defaultDestination: "local" },
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
    expect(settings.workspaces).toEqual({ defaultDestination: "new" })
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

test.each([
  { typed: "JetBrains Mono", stored: '"JetBrains Mono"' },
  // Normalizing a stored list returns it unchanged, so reading and writing normalize twice is safe.
  { typed: '"JetBrains Mono"', stored: '"JetBrains Mono"' },
  { typed: "JetBrains Mono, Fira Code", stored: '"JetBrains Mono", "Fira Code"' },
  // Generic keywords and system extensions stay unquoted.
  { typed: "monospace, -apple-system, ui-monospace", stored: "monospace, -apple-system, ui-monospace" },
  // Quotes, angle brackets and backslashes cannot survive into inline CSS or repeat per name.
  { typed: 'Arial <button onload="x">, Fira\\Code\u0001', stored: '"Arial button onload=x", "FiraCode"' },
  // Blank pieces drop, so trailing commas and stray spaces store a clean list.
  { typed: " Mono , ,  ,", stored: '"Mono"' },
  { typed: "   ", stored: "" },
  { typed: "", stored: "" },
])("normalizeFontFamily(%s)", ({ typed, stored }) => {
  expect(normalizeFontFamily(typed)).toBe(stored)
})

test("each font role starts from its own stack", () => {
  expect(sansFontFamily(undefined)).toStartWith("-apple-system, ")
  expect(monoFontFamily(undefined)).toStartWith('"SF Mono", ')
  expect(terminalFontFamily(undefined)).toStartWith("ui-monospace, ")
  expect(monoFontFamily("system-ui")).toStartWith('"SF Mono", ')
  expect(monoFontFamily("Custom Mono")).toStartWith('"Custom Mono", "SF Mono", ')
})

test("System resolves to each role's own stack", () => {
  expect(sansFontFamily("system-ui")).toBe(
    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif',
  )
  expect(monoFontFamily("system-ui")).toBe(
    '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"',
  )
  expect(terminalFontFamily("system-ui")).toBe("ui-monospace, SFMono-Regular, Menlo, Consolas, monospace")
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
    prefix: '"SF Mono", ',
  },
  {
    name: "mono",
    family: (font: string | undefined) => monoFontFamily(font),
    font: "",
    prefix: '"SF Mono", ',
  },
  {
    name: "mono",
    family: (font: string | undefined) => monoFontFamily(font),
    font: "   ",
    prefix: '"SF Mono", ',
  },
  {
    name: "mono",
    family: (font: string | undefined) => monoFontFamily(font),
    font: "Custom Mono",
    prefix: '"Custom Mono", "SF Mono", ',
  },
  {
    name: "mono",
    family: (font: string | undefined) => monoFontFamily(font),
    font: "system-ui",
    prefix: '"SF Mono", ',
  },
  {
    name: "terminal",
    family: (font: string | undefined) => terminalFontFamily(font),
    font: undefined,
    prefix: "ui-monospace, ",
  },
  {
    name: "terminal",
    family: (font: string | undefined) => terminalFontFamily(font),
    font: "system-ui",
    prefix: "ui-monospace, ",
  },
  {
    name: "terminal",
    family: (font: string | undefined) => terminalFontFamily(font),
    font: "MesloLGS NF",
    prefix: '"MesloLGS NF", ui-monospace, ',
  },
])("$name font family for $font starts with $prefix", ({ family, font, prefix }) => {
  expect(family(font)).toStartWith(prefix)
})
