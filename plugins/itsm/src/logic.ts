export * as ItsmLogic from "./logic.js"

import type {
  AnswerValue,
  Environment,
  Option,
  Question,
  StepRun,
  Template,
} from "./contract.js"
import { FORTRESS_PROD, FORTRESS_TEST, RELEASE_PROD } from "./templates.js"

/** 一个答案在本地记住的位置：`rememberKey` 优先，缺省用字段 id。 */
export function answerKey(question: Question) {
  return question.rememberKey ?? question.id
}

export interface TemplateProblem {
  /** 出问题的字段 id；模板级问题为空串。 */
  readonly questionID: string
  readonly message: string
}

/** 保存模板前的校验：至少一个字段、label 非空、id 唯一且非空。 */
export function validateTemplate(template: Template): TemplateProblem[] {
  const problems: TemplateProblem[] = []
  if (template.questions.length === 0) problems.push({ questionID: "", message: "模板至少需要一个字段。" })
  if (template.name.trim().length === 0) problems.push({ questionID: "", message: "模板名称不能为空。" })
  const seen = new Set<string>()
  for (const question of template.questions) {
    if (question.label.trim().length === 0)
      problems.push({ questionID: question.id, message: `字段 ${question.id || "（无 id）"} 的标签不能为空。` })
    if (question.id.trim().length === 0) problems.push({ questionID: "", message: "字段 id 不能为空。" })
    else if (seen.has(question.id)) problems.push({ questionID: question.id, message: `字段 id「${question.id}」重复。` })
    else seen.add(question.id)
  }
  return problems
}

export type AnswerSource = "previous" | "edited" | "default" | "empty"

export interface MergedAnswers {
  readonly values: Record<string, AnswerValue>
  /** 缺失的必填字段 id。 */
  readonly missing: readonly string[]
  /** 每个字段的答案来源，向导摘要页展示。 */
  readonly sources: Readonly<Record<string, AnswerSource>>
}

/**
 * 把用户这次提供的答案与上次保存的答案合并成一套完整值。只清洗一次：多选统一成数组，布尔统一成 `"true"`
 * / `"false"`，文本去掉首尾空白。
 */
export function mergeAnswers(
  template: Template,
  previous: Readonly<Record<string, AnswerValue>>,
  input: Readonly<Record<string, AnswerValue | undefined>>,
): MergedAnswers {
  const values: Record<string, AnswerValue> = {}
  const sources: Record<string, AnswerSource> = {}
  const missing: string[] = []
  for (const question of template.questions) {
    const key = answerKey(question)
    const raw = input[question.id] ?? input[key]
    const remembered = previous[key]
    const fallback = question.defaultValue
    if (raw !== undefined) {
      const value = normalizeValue(question, raw)
      if (!isEmpty(value)) {
        values[key] = value
        sources[key] = remembered !== undefined && sameValue(remembered, value) ? "previous" : "edited"
        continue
      }
      // 本次输入为空时不覆盖上次答案：用户没动这一项，就沿用它。
      if (remembered !== undefined && !isEmpty(remembered)) {
        values[key] = normalizeValue(question, remembered)
        sources[key] = "previous"
        continue
      }
      sources[key] = "empty"
      if (question.required) missing.push(question.id)
      continue
    }
    if (remembered !== undefined && !isEmpty(remembered)) {
      values[key] = normalizeValue(question, remembered)
      sources[key] = "previous"
      continue
    }
    if (fallback !== undefined && !isEmpty(fallback)) {
      values[key] = normalizeValue(question, fallback)
      sources[key] = "default"
      continue
    }
    sources[key] = "empty"
    if (question.required) missing.push(question.id)
  }
  return { values, missing, sources }
}

export function normalizeValue(question: Question, value: AnswerValue): AnswerValue {
  if (question.type === "multiselect") {
    const list = typeof value === "string" ? splitList(value) : value
    return [...new Set(list.map((item) => item.trim()).filter((item) => item.length > 0))]
  }
  if (typeof value !== "string") return value.join("，")
  return question.type === "text" || question.type === "textarea" ? value.trim() : value
}

export function splitList(value: string) {
  return value
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function isEmpty(value: AnswerValue | undefined) {
  if (value === undefined) return true
  if (typeof value !== "string") return value.length === 0
  return value.trim().length === 0
}

function sameValue(a: AnswerValue, b: AnswerValue) {
  if (typeof a !== "string" && typeof b !== "string") return a.length === b.length && a.every((item, index) => item === b[index])
  return a === b
}

/** 服务项名称里的环境：中文「测试」或华为云算测试，明确写「生产」算生产，其余不猜。 */
export function inferEnvironment(name: string): Environment {
  if (/测试|test/i.test(name)) return "test"
  if (/生产|prod/i.test(name)) return "prod"
  if (/华为|huawei/i.test(name)) return "test"
  return "unknown"
}

/** 服务项名称命中的内置模板键；没有命中时返回 undefined，由自动探测生成草稿模板。 */
export function builtinKeyFor(name: string) {
  const value = name.replace(/\s+/g, "")
  if (/堡垒机/.test(value)) return /华为|公有云/.test(value) ? FORTRESS_TEST : FORTRESS_PROD
  if (/发布/.test(value)) return RELEASE_PROD
  return undefined
}

/** 目录搜索与向导筛选共用的匹配：名称、分类、描述任一包含关键词。 */
export function matchesService(
  item: { readonly name: string; readonly category: string; readonly description: string },
  query: string,
) {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return true
  return [item.name, item.category, item.description].some((value) => value.toLowerCase().includes(needle))
}

/**
 * 只导入长虹域下的 cookie。`changhong.com` 与任意子域都算；`evilchanghong.com`、`changhong.com.evil.io`
 * 都不算。
 */
export function cookieDomainAllowed(domain: string) {
  const value = domain.trim().toLowerCase().replace(/^\./, "")
  if (value.length === 0) return false
  return value === "changhong.com" || value.endsWith(".changhong.com")
}

/** 第二页下拉的账号选项：sys 开头优先，其次 app，再次第一个非空；全空时这一行要删掉。 */
export function pickAccountOption(options: readonly string[]): { choice?: string; remove: boolean } {
  const usable = options.map((option) => option.trim()).filter((option) => option.length > 0 && !isEmptyOption(option))
  if (usable.length === 0) return { remove: true }
  const sys = usable.find((option) => option.toLowerCase().startsWith("sys"))
  if (sys !== undefined) return { choice: sys, remove: false }
  const app = usable.find((option) => option.toLowerCase().startsWith("app"))
  if (app !== undefined) return { choice: app, remove: false }
  return { choice: usable[0]!, remove: false }
}

/** 页面把「未设置」渲染成一个空白的占位选项，文案是 empty 或空白。 */
export function isEmptyOption(option: string) {
  return option.trim().length === 0 || option.trim().toLowerCase() === "empty"
}

export type StepEvent =
  | { readonly type: "start"; readonly id: string; readonly at: string }
  | { readonly type: "finish"; readonly id: string; readonly at: string; readonly summary?: string }
  | { readonly type: "fail"; readonly id: string; readonly at: string; readonly error: string }
  | { readonly type: "retry"; readonly id: string }
  | { readonly type: "skip"; readonly id: string; readonly at: string; readonly summary?: string }

/**
 * 执行进度的状态机。一次只允许一个步骤在跑；重试把失败行放回等待；完成与失败只作用于进行中的那一行，
 * 跳过还可以结束仍在等待的行。未知 id 与不合法的迁移返回原数组，不改任何一行。
 */
export function nextSteps(steps: readonly StepRun[], event: StepEvent): StepRun[] {
  const index = steps.findIndex((step) => step.id === event.id)
  if (index < 0) return [...steps]
  const current = steps[index]!
  const replace = (step: StepRun) => steps.map((item, at) => (at === index ? step : item))
  if (event.type === "start") {
    if (current.status !== "waiting" && current.status !== "failed") return [...steps]
    // 一次只允许一个步骤在跑，别的行还没结束时不推进这一行。
    if (steps.some((step) => step.status === "running")) return [...steps]
    return replace({ ...current, status: "running", startedAt: event.at, finishedAt: undefined, error: undefined })
  }
  if (event.type === "retry") {
    if (current.status !== "failed") return [...steps]
    return replace({ ...current, status: "waiting", error: undefined, summary: undefined })
  }
  // 跳过可以结束等待或进行中的行；完成与失败只作用于进行中的行。
  if (event.type === "skip") {
    if (current.status !== "running" && current.status !== "waiting") return [...steps]
    return replace({ ...current, status: "skipped", finishedAt: event.at, ...(event.summary ? { summary: event.summary } : {}) })
  }
  if (current.status !== "running") return [...steps]
  if (event.type === "finish")
    return replace({ ...current, status: "done", finishedAt: event.at, ...(event.summary ? { summary: event.summary } : {}) })
  return replace({ ...current, status: "failed", finishedAt: event.at, error: event.error })
}
export function stepCounts(steps: readonly StepRun[]) {
  return {
    done: steps.filter((step) => step.status === "done" || step.status === "skipped").length,
    total: steps.length,
    failed: steps.some((step) => step.status === "failed"),
    running: steps.some((step) => step.status === "running"),
  }
}

/** 毫秒转「1.2 s」「820 ms」，进度和时间线共用。 */
export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return ""
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`
}

/** 人员答案的展示文案：「姓名（工号）· 分组」。 */
export function formatPerson(input: { name: string; employeeID?: string; group?: string }) {
  const head = input.employeeID ? `${input.name}（${input.employeeID}）` : input.name
  return input.group ? `${head}· ${input.group}` : head
}

/** 自动探测生成草稿时，哪一列需要人工确认。 */
export function reviewReasons(question: Question, detected: { label?: string; options?: readonly Option[] }) {
  const reasons: string[] = []
  if ((detected.label ?? "").trim().length === 0) reasons.push("没有读到标签")
  if (question.type === "select" && (detected.options ?? []).length === 0) reasons.push("下拉选项未读到")
  if (question.type === "text" && /日期|时间|日期时间/.test(question.label)) reasons.push("可能是日期控件")
  return reasons
}
