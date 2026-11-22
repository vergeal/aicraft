import { describe, expect, test } from "bun:test"
import type { Question, StepRun, Template } from "../src/contract.js"
import {
  builtinKeyFor,
  cookieDomainAllowed,
  formatDuration,
  formatPerson,
  inferEnvironment,
  matchesService,
  mergeAnswers,
  nextSteps,
  normalizeValue,
  pickAccountOption,
  validateTemplate,
} from "../src/logic.js"
import { FORTRESS_PROD, FORTRESS_TEST, RELEASE_PROD } from "../src/templates.js"

const text = (id: string, extra: Partial<Question> = {}): Question => ({
  id,
  label: id,
  type: "text",
  required: false,
  ...extra,
})

const template = (questions: Question[]): Template => ({
  id: "tpl_test",
  serviceKey: "测试服务",
  name: "测试模板",
  env: "test",
  source: "manual",
  pages: 1,
  questions,
  steps: [{ id: "navigate", name: "打开", kind: "navigate" }],
  boundary: "stop-before-submit",
})

describe("validateTemplate", () => {
  test("拒绝没有字段、没有名称与重复 id", () => {
    expect(validateTemplate(template([])).map((item) => item.questionID)).toEqual([""])
    expect(validateTemplate({ ...template([text("a")]), name: "  " }).some((item) => item.questionID === "")).toBe(true)
    const problems = validateTemplate(template([text("a"), text("a")]))
    expect(problems).toHaveLength(1)
    expect(problems[0]!.questionID).toBe("a")
  })

  test("一个正常模板没有问题", () => {
    expect(validateTemplate(template([text("title"), text("reason")]))).toEqual([])
  })
})

describe("mergeAnswers", () => {
  test("本次输入优先，其次上次答案，最后页面默认值", () => {
    const spec = template([
      text("title", { required: true }),
      text("reason", { required: true }),
      text("contact", { required: true, defaultValue: "13800000000" }),
    ])
    const merged = mergeAnswers(spec, { title: "上次标题", reason: "上次原因" }, { title: "这次标题" })
    expect(merged.values).toEqual({ title: "这次标题", reason: "上次原因", contact: "13800000000" })
    expect(merged.sources).toEqual({ title: "edited", reason: "previous", contact: "default" })
    expect(merged.missing).toEqual([])
  })

  test("空值不覆盖记住的答案，必填缺失会列出来", () => {
    const spec = template([text("title", { required: true }), text("note")])
    const merged = mergeAnswers(spec, { title: "记得" }, { title: "   ", note: "" })
    expect(merged.values).toEqual({ title: "记得" })
    expect(merged.sources.title).toBe("previous")
    expect(merged.missing).toEqual([])
  })

  test("rememberKey 与 id 分开：读取时两个都认", () => {
    const spec = template([text("title", { required: true, rememberKey: "shared.title" })])
    expect(mergeAnswers(spec, { "shared.title": "记住的" }, {}).values).toEqual({ "shared.title": "记住的" })
    expect(mergeAnswers(spec, {}, { "shared.title": "输入的" }).values).toEqual({ "shared.title": "输入的" })
    expect(mergeAnswers(spec, {}, { title: "按 id" }).values).toEqual({ "shared.title": "按 id" })
  })

  test("多选去重、去空，文本去首尾空白", () => {
    const spec = template([
      { id: "scope", label: "scope", type: "multiselect", required: false },
      text("title"),
    ])
    const merged = mergeAnswers(spec, {}, { scope: ["a", " a ", "", "b"], title: "  标题  " })
    expect(merged.values.scope).toEqual(["a", "b"])
    expect(merged.values.title).toBe("标题")
  })
})

describe("normalizeValue", () => {
  test("布尔保持页面文案，多选字符串按分隔符拆开", () => {
    expect(normalizeValue({ id: "ok", label: "ok", type: "boolean", required: false }, "true")).toBe("true")
    expect(normalizeValue({ id: "s", label: "s", type: "multiselect", required: false }, "a，b、c\nd")).toEqual([
      "a",
      "b",
      "c",
      "d",
    ])
  })
})

describe("builtinKeyFor 与 inferEnvironment", () => {
  test("堡垒机按华为区分测试与生产，发布固定生产", () => {
    expect(builtinKeyFor("普通账号-系统管理账号权限申请（堡垒机）")).toBe(FORTRESS_PROD)
    expect(builtinKeyFor("华为公有云账号-系统管理账号权限申请（堡垒机）")).toBe(FORTRESS_TEST)
    expect(builtinKeyFor("生产环境发布-通用")).toBe(RELEASE_PROD)
    expect(builtinKeyFor("其他服务")).toBeUndefined()
  })

  test("未知环境不乱猜", () => {
    expect(inferEnvironment("测试环境")).toBe("test")
    expect(inferEnvironment("生产库")).toBe("prod")
    expect(inferEnvironment("华为云资源")).toBe("test")
    expect(inferEnvironment("工单")).toBe("unknown")
  })
})

describe("cookieDomainAllowed", () => {
  test("只放行 changhong.com 与子域", () => {
    expect(cookieDomainAllowed("changhong.com")).toBe(true)
    expect(cookieDomainAllowed(".changhong.com")).toBe(true)
    expect(cookieDomainAllowed("itsm.changhong.com")).toBe(true)
    expect(cookieDomainAllowed("evilchanghong.com")).toBe(false)
    expect(cookieDomainAllowed("changhong.com.evil.io")).toBe(false)
    expect(cookieDomainAllowed("")).toBe(false)
  })
})

describe("pickAccountOption", () => {
  test("sys 优先，其次 app，再次第一个非空", () => {
    expect(pickAccountOption(["empty", "app-1", "sys-2", "other"]).choice).toBe("sys-2")
    expect(pickAccountOption(["empty", "app-1", "other"]).choice).toBe("app-1")
    expect(pickAccountOption(["", "other", "app-1"]).choice).toBe("app-1")
    expect(pickAccountOption(["empty", "  "])).toEqual({ remove: true })
  })
})

describe("nextSteps", () => {
  const waiting = (): StepRun[] => [
    { id: "a", name: "a", status: "waiting" },
    { id: "b", name: "b", status: "waiting" },
  ]

  test("开始只推进等待或失败的行，完成后结束", () => {
    const started = nextSteps(waiting(), { type: "start", id: "a", at: "t1" })
    expect(started[0]!.status).toBe("running")
    expect(nextSteps(started, { type: "start", id: "b", at: "t2" })[1]!.status).toBe("waiting")
    const done = nextSteps(started, { type: "finish", id: "a", at: "t3", summary: "ok" })
    expect(done[0]).toMatchObject({ status: "done", finishedAt: "t3", summary: "ok" })
  })

  test("失败后只能重试，重试回到等待并清掉错误", () => {
    const running = nextSteps(waiting(), { type: "start", id: "a", at: "t1" })
    const failed = nextSteps(running, { type: "fail", id: "a", at: "t2", error: "boom" })
    expect(failed[0]).toMatchObject({ status: "failed", error: "boom" })
    expect(nextSteps(failed, { type: "finish", id: "a", at: "t3" })[0]!.status).toBe("failed")
    const retried = nextSteps(failed, { type: "retry", id: "a" })
    expect(retried[0]).toMatchObject({ status: "waiting" })
    expect(retried[0]!.error).toBeUndefined()
  })

  test("未知 id 与不合法迁移返回原样副本", () => {
    const steps = waiting()
    expect(nextSteps(steps, { type: "start", id: "zzz", at: "t" })).toEqual(steps)
    expect(nextSteps(steps, { type: "finish", id: "a", at: "t" })).toEqual(steps)
  })

  test("跳过让等待的行结束", () => {
    const skipped = nextSteps(waiting(), { type: "skip", id: "b", at: "t" })
    expect(skipped[1]).toMatchObject({ status: "skipped", finishedAt: "t" })
  })
})

describe("展示辅助", () => {
  test("matchesService 匹配名称、分类与描述", () => {
    const item = { name: "堡垒机", category: "账号", description: "系统管理" }
    expect(matchesService(item, "")).toBe(true)
    expect(matchesService(item, "账号")).toBe(true)
    expect(matchesService(item, "系统")).toBe(true)
    expect(matchesService(item, "发布")).toBe(false)
  })

  test("formatDuration 与 formatPerson", () => {
    expect(formatDuration(820)).toBe("820 ms")
    expect(formatDuration(1_240)).toBe("1.2 s")
    expect(formatDuration(12_000)).toBe("12 s")
    expect(formatDuration(-1)).toBe("")
    expect(formatPerson({ name: "张三", employeeID: "A1", group: "运维" })).toBe("张三（A1）· 运维")
    expect(formatPerson({ name: "张三" })).toBe("张三")
  })
})
