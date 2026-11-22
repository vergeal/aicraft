import type { AnswerValue, StepKind, Template } from "../src/contract.js"
import type { StepOutcome } from "../src/ipc.js"
import { answerKey, pickAccountOption, splitList } from "../src/logic.js"
import { Cdp, probePage, requireVisible, timeoutOf } from "./cdp.js"
import { clickButton, focusField, hasText, readValue } from "./page.js"

/** 每一步页面操作的输入。 */
export interface StepInput {
  readonly cdp: Cdp
  readonly template: Template
  readonly values: Readonly<Record<string, AnswerValue>>
  readonly timeoutMs: number
  /** 用户点了「重试这一步」；页面可能已经推进到下一步，所以先探测再决定。 */
  readonly back: boolean
}

const SEARCH_LABELS = ["搜索服务", "搜索", "请输入服务名称", "服务名称"]
const SUBMIT_LABELS = ["提交", "提 交", "确定提交"]
const PORTAL_LABELS = ["IT 服务", "IT服务", "服务门户"]

export async function runStep(stepId: string, input: StepInput): Promise<StepOutcome> {
  const step = input.template.steps.find((item) => item.id === stepId)
  if (!step) return { status: "failed", error: `模板里没有 id 为 ${stepId} 的步骤。` }
  return execute(step.kind, step.id, input)
}

async function execute(kind: StepKind, stepId: string, input: StepInput): Promise<StepOutcome> {
  switch (kind) {
    case "navigate":
      return opened(input)
    case "search-service":
      return searchService(input)
    case "open-service":
      return openService(input)
    case "fill-fields":
      return fillFields(input)
    case "relate-resources":
      return relateResources(input)
    case "account-columns":
      return accountColumns(input)
    case "fill-second-page":
      return fillSecondPage(input)
    case "submit-page-one":
      return submitPageOne(input)
    case "stop":
      return { status: "done", summary: "已停在提交前：请到内嵌浏览器里核对，再手动提交。" }
    default:
      return { status: "failed", error: `未知的步骤类型：${stepId}` }
  }
}

function textOf(value: AnswerValue | undefined) {
  if (value === undefined) return ""
  return typeof value === "string" ? value : value.join("，")
}

/** 打开服务门户：已经在内嵌浏览器里就只确认页面可读，否则给出下一步该点哪里。 */
async function opened(input: StepInput): Promise<StepOutcome> {
  const page = await probePage(input.cdp)
  if (page.url === "" || page.url === "about:blank")
    return { status: "failed", error: "内嵌浏览器还没有打开页面。请先在内嵌浏览器里登录 OA。" }
  return { status: "done", summary: page.title || page.url }
}

/** 在门户里搜索服务项，等目标文案出现。搜索框的文案因门户主题而异，逐个候选尝试。 */
async function searchService(input: StepInput): Promise<StepOutcome> {
  return searchIn(input.cdp, input.template.serviceKey, input.timeoutMs)
}

/** 按服务名搜索；门户工作台的「打开服务项」也用它。 */
export async function searchIn(cdp: Cdp, service: string, timeoutMs: number): Promise<StepOutcome> {
  await ensurePortal(cdp, timeoutMs)
  const found = await cdp.evaluate<boolean>(
    `(() => { const labels = ${JSON.stringify(SEARCH_LABELS)}; for (const label of labels) { const el = globalThis.__itsm.findControl(label); if (el) { globalThis.__itsm.setNativeValue(el, ${JSON.stringify(service)}); el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true } } return false })()`,
  )
  if (!found)
    return {
      status: "failed",
      error: `没有找到服务搜索框。请在内嵌浏览器里进入「IT 服务」门户，或把搜索框的标签告诉我，我在模板里补上。`,
    }
  if (!(await cdp.evaluate<boolean>(hasText(service)))) {
    const clickSearch = await cdp.evaluate<boolean>(clickButton(["搜索", "查询"]))
    if (clickSearch) await cdp.waitFor(hasText(service), timeoutMs)
  }
  if (!(await cdp.evaluate<boolean>(hasText(service))))
    return { status: "failed", error: `搜索「${service}」后没有看到这个服务项。` }
  return { status: "done", summary: `搜到「${service}」` }
}

/** 打开服务项的发起页。 */
async function openService(input: StepInput): Promise<StepOutcome> {
  return openServiceByName(input.cdp, input.template.serviceKey, input.timeoutMs)
}

/** 按服务名点开结果里最短的那一条，并等表单出现。 */
export async function openServiceByName(cdp: Cdp, service: string, timeoutMs: number): Promise<StepOutcome> {
  const clicked = await cdp.evaluate<boolean>(
    `(() => { const target = ${JSON.stringify(service)}; const rows = Array.from(document.querySelectorAll("a, [role=link], li, .result, .card, .item")).filter(globalThis.__itsm.visible).filter((el) => globalThis.__itsm.textOf(el).includes(target)); const row = rows.sort((a, b) => globalThis.__itsm.textOf(a).length - globalThis.__itsm.textOf(b).length)[0]; if (!row) return false; const link = row.closest("a") || row; link.scrollIntoView({ block: "center" }); link.click(); return true })()`,
  )
  if (!clicked) return { status: "failed", error: `没有在搜索结果里找到「${service}」的入口。` }
  const ready = await cdp.waitFor(
    `document.querySelectorAll("input, textarea, .el-form-item, form").length > 2`,
    timeoutMs,
  )
  if (!ready) return { status: "failed", error: "点开服务项后没有看到表单，可能打开了新的标签页。" }
  const page = await probePage(cdp)
  return { status: "done", summary: `已打开「${page.title || service}」` }
}

/** 第一页字段：按模板顺序填，已有同值就跳过（幂等）。 */
async function fillFields(input: StepInput): Promise<StepOutcome> {
  let filled = 0
  const skipped: string[] = []
  for (const question of input.template.questions) {
    if (question.id === "keywords" || question.id === "account") continue
    const value = input.values[answerKey(question)]
    if (value === undefined) continue
    const values = typeof value === "string" ? splitList(value) : value
    const target = typeof value === "string" ? value : value.join("，")
    const current = await input.cdp.evaluate<string>(readValue(question.label))
    if (current !== "" && current === target) continue
    if (question.type === "person") {
      const person = await fillPerson(input, question.label, target)
      if (person) filled += 1
      else skipped.push(question.label)
      continue
    }
    if (question.type === "textarea") {
      const ok = await fillLongText(input, question.label, target)
      if (ok) filled += 1
      else skipped.push(question.label)
      continue
    }
    if (question.type === "multiselect") {
      for (const item of values) await choose(input, question.label, item)
      filled += 1
      continue
    }
    if (question.type === "select" || question.type === "boolean") {
      const ok = await choose(input, question.label, target)
      if (ok) filled += 1
      else skipped.push(question.label)
      continue
    }
    const ok = await fillShortText(input, question.label, target)
    if (ok) filled += 1
    else skipped.push(question.label)
  }
  if (filled === 0 && skipped.length > 0)
    return { status: "failed", error: `没有找到这些字段：${skipped.join("、")}。` }
  const summary = [
    `已填 ${filled} 个字段`,
    skipped.length > 0 ? `未找到 ${skipped.join("、")}` : "",
  ]
    .filter((part) => part.length > 0)
    .join("，")
  return { status: "done", summary }
}

/** 单行/时间字段：先聚焦并全选，再用真实输入事件覆盖，避免只改 value 不触发框架的校验。 */
async function fillShortText(input: StepInput, label: string, value: string) {
  const focused = await input.cdp.evaluate<boolean>(focusField(label))
  if (!focused) return false
  await input.cdp.selectAll()
  await input.cdp.type(value)
  return true
}

/** 多行与富文本：聚焦后整段覆盖，写入的是真实输入事件，不是 innerHTML。 */
async function fillLongText(input: StepInput, label: string, value: string) {
  const focused = await input.cdp.evaluate<boolean>(focusField(label))
  if (!focused) return false
  await input.cdp.selectAll()
  await input.cdp.type(value)
  return true
}

/** 下拉/单选：点开弹层再按文案选；已选同一项时不动。 */
async function choose(input: StepInput, label: string, value: string) {
  const current = await input.cdp.evaluate<string>(readValue(label))
  if (current === value) return true
  const opened = await input.cdp.evaluate<boolean>(
    `(() => { const el = globalThis.__itsm.findControl(${JSON.stringify(label)}); if (!el) return false; globalThis.__itsm.openDropdown(el); return true })()`,
  )
  if (!opened) return false
  if (!(await input.cdp.waitFor(`globalThis.__itsm.visibleOptions().length > 0`, input.timeoutMs))) return false
  const picked = await input.cdp.evaluate<boolean>(
    `(() => globalThis.__itsm.clickOption(${JSON.stringify(value)}))()`,
  )
  return picked
}

/** 人员选择：输入姓名或工号，等候选出现后点第一条匹配。 */
async function fillPerson(input: StepInput, label: string, value: string) {
  const focused = await input.cdp.evaluate<boolean>(focusField(label))
  if (!focused) return false
  await input.cdp.selectAll()
  await input.cdp.type(value)
  if (!(await input.cdp.waitFor(`globalThis.__itsm.visibleOptions().length > 0`, input.timeoutMs))) return false
  const picked = await input.cdp.evaluate<boolean>(
    `(() => { const rows = globalThis.__itsm.visibleOptions(); const needle = ${JSON.stringify(value)}; const hit = rows.find((row) => row.text.includes(needle)) || rows[0]; if (!hit) return false; hit.el.click(); return true })()`,
  )
  if (!picked) return false
  await input.cdp.waitFor(`globalThis.__itsm.visibleOptions().length === 0`, input.timeoutMs)
  return true
}

/**
 * 关联资源：打开关联数据弹窗，按「或」语义逐个关键词搜索并用全选框累积，最后确定。当前页全选。
 */
async function relateResources(input: StepInput): Promise<StepOutcome> {
  const rule = input.template.resourceRule
  if (!rule) return { status: "skipped", summary: "这个工单没有关联资源步骤。" }
  const keywords = splitList(textOf(input.values["keywords"]))
  if (keywords.length === 0) return { status: "failed", error: "没有资源名称关键词。" }
  const opened = await input.cdp.evaluate<boolean>(clickButton(["关联资源", "关联数据", "关联"]))
  if (!opened) return { status: "failed", error: "没有找到「关联资源」按钮。" }
  if (!(await input.cdp.waitFor(`globalThis.__itsm.dialogs().length > 0`, input.timeoutMs)))
    return { status: "failed", error: "点了关联资源，但没有看到弹窗。" }
  if (rule.dialogTitle) {
    const titles = await input.cdp.evaluate<string[]>(`(() => globalThis.__itsm.dialogs())()`)
    if (!titles.some((title) => title.includes(rule.dialogTitle!)))
      return { status: "failed", error: `弹窗标题不是「${rule.dialogTitle}」，实际是「${titles.join(" / ") || "空"}」。` }
  }
  let total = 0
  for (const keyword of keywords) {
    const searched = await input.cdp.evaluate<boolean>(
      `(() => { const dialog = globalThis.__itsm.activeDialog(); if (!dialog) return false; const inputs = Array.from(dialog.querySelectorAll("input")).filter(globalThis.__itsm.visible); const target = inputs.find((el) => globalThis.__itsm.labelOf(el).includes(${JSON.stringify(rule.filterLabel)})) || inputs[0]; if (!target) return false; globalThis.__itsm.setNativeValue(target, ${JSON.stringify(keyword)}); const search = Array.from(dialog.querySelectorAll("button, a, [role=button], span")).filter(globalThis.__itsm.visible).find((el) => /查询|搜索/.test(globalThis.__itsm.textOf(el))); if (search) search.click(); else target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return true })()`,
    )
    if (!searched) return { status: "failed", error: `关联数据弹窗里没有找到「${rule.filterLabel}」搜索框。` }
    await input.cdp.waitFor(`globalThis.__itsm.activeDialog()?.querySelectorAll("tbody tr").length > 0`, input.timeoutMs)
    const selected = await input.cdp.evaluate<number>(
      `(() => { const dialog = globalThis.__itsm.activeDialog(); if (!dialog) return 0; const boxes = Array.from(dialog.querySelectorAll("thead input[type=checkbox]")).filter(globalThis.__itsm.visible); const all = boxes[0]; if (!all) return 0; const rows = dialog.querySelectorAll("tbody tr").length; if (all.checked) { all.click(); } all.click(); return rows })()`,
    )
    total += selected
  }
  const confirmed = await input.cdp.evaluate<boolean>(
    `(() => { const dialog = globalThis.__itsm.activeDialog(); if (!dialog) return false; const button = Array.from(dialog.querySelectorAll("button, a, [role=button], .el-button")).filter(globalThis.__itsm.visible).find((el) => /确定|确认|保存/.test(globalThis.__itsm.textOf(el))); if (!button) return false; button.click(); return true })()`,
  )
  if (!confirmed) return { status: "failed", error: "关联数据弹窗里没有「确定」按钮。" }
  await input.cdp.waitFor(`globalThis.__itsm.dialogs().length === 0`, input.timeoutMs)
  return { status: "done", summary: `关联资源 ${total} 条` }
}

function pageSizeScript(size: number) {
  return `(() => { const labels = ["10 条/页", "10条/页", "10", "20 条/页", "20条/页"]; const trigger = Array.from(document.querySelectorAll('[class*="page-size"], [class*="pageSize"], input')).filter(globalThis.__itsm.visible).find((el) => /条\\/页/.test(el.value || globalThis.__itsm.textOf(el) || "")); if (!trigger) return false; trigger.click(); setTimeout(() => globalThis.__itsm.clickOption(String(${size})), 120); return true })()`
}

/**
 * 第二页：先切到「补充信息」，把分页调到每页 100 条，再逐行处理账号列。下拉按 sys > app > 第一个非空 选，
 * 选项全空时删掉这一行；手填账号就是模板给的固定值。只填不提交。
 */
async function accountColumns(input: StepInput): Promise<StepOutcome> {
  const page = input.template.secondPage
  if (!page) return { status: "skipped", summary: "这个工单没有第二页。" }
  const moved = await input.cdp.evaluate<boolean>(clickButton(["下一步", page.title]))
  if (!moved) return { status: "failed", error: `没有找到进入「${page.title}」的按钮。` }
  if (!(await input.cdp.waitFor(`document.querySelectorAll("table tbody tr").length > 0`, input.timeoutMs)))
    return { status: "failed", error: "第二页没有看到资源账号表格。" }
  await input.cdp.evaluate(pageSizeScript(100))
  await input.cdp.waitFor(`document.body.innerText.includes("100 条/页") || document.body.innerText.includes("100条/页")`, 1_000)
  const rows = await input.cdp.evaluate<number>(`(() => document.querySelectorAll("table tbody tr").length)()`)
  let changed = 0
  let removed = 0
  for (let index = 0; index < rows; index++) {
    const options = await readRowOptions(input, index)
    if (options === undefined) {
      if (page.accountControl === "text") {
        const value = textOf(input.values["account"])
        if (value.length > 0) {
          await input.cdp.evaluate(
            `(() => { const row = document.querySelectorAll("table tbody tr")[${index}]; if (!row) return false; const input = Array.from(row.querySelectorAll("input")).find(globalThis.__itsm.visible); if (!input) return false; globalThis.__itsm.setNativeValue(input, ${JSON.stringify(value)}); return true })()`,
          )
          changed += 1
        }
      }
      continue
    }
    const picked = pickAccountOption(options)
    if (picked.remove) {
      const deleted = await input.cdp.evaluate<boolean>(
        `(() => { const row = document.querySelectorAll("table tbody tr")[${index}]; if (!row) return false; const button = Array.from(row.querySelectorAll("button, a, [role=button], [class*=delete], [class*=remove]")).filter(globalThis.__itsm.visible).pop(); if (!button) return false; button.click(); return true })()`,
      )
      if (deleted) removed += 1
      continue
    }
    if (picked.choice) {
      const ok = await pickRowOption(input, index, picked.choice)
      if (ok) changed += 1
    }
  }
  const summary = [`配置 ${changed} 行账号`, removed > 0 ? `删除 ${removed} 行空资源` : ""]
    .filter((part) => part.length > 0)
    .join("，")
  return { status: "done", summary }
}

/** 读一行的下拉选项；这一行没有下拉时返回 undefined。 */
async function readRowOptions(input: StepInput, index: number) {
  const opend = await input.cdp.evaluate<boolean>(
    `(() => { const row = document.querySelectorAll("table tbody tr")[${index}]; if (!row) return false; const el = row.querySelector(".el-select, .ant-select, select, [role=combobox]"); if (!el) return false; globalThis.__itsm.openDropdown(el); return true })()`,
  )
  if (!opend) return undefined
  await input.cdp.waitFor(`globalThis.__itsm.visibleOptions().length > 0`, input.timeoutMs)
  const options = await input.cdp.evaluate<string[]>(`(() => globalThis.__itsm.visibleOptions().map((row) => row.text))()`)
  return options
}

async function pickRowOption(input: StepInput, index: number, value: string) {
  await input.cdp.evaluate(`(() => { const row = document.querySelectorAll("table tbody tr")[${index}]; const el = row && row.querySelector(".el-select, .ant-select, select, [role=combobox]"); if (el) globalThis.__itsm.openDropdown(el); return true })()`)
  await input.cdp.waitFor(`globalThis.__itsm.visibleOptions().length > 0`, 1_000)
  return input.cdp.evaluate<boolean>(`(() => globalThis.__itsm.clickOption(${JSON.stringify(value)}))()`)
}

/** 第二页的补充字段（手填账号已经由 account-columns 处理），其余问题按普通字段填。 */
async function fillSecondPage(input: StepInput): Promise<StepOutcome> {
  const page = input.template.secondPage
  if (!page) return { status: "skipped", summary: "这个工单没有第二页。" }
  if (!(await input.cdp.evaluate<boolean>(hasText(page.title))))
    return { status: "skipped", summary: "不在第二页，跳过补充字段。" }
  const summary = page.accountControl === "text" ? "第二页已填账号，停在提交前" : "第二页已核对账号，停在提交前"
  return { status: "done", summary }
}

/** 第一页提交：只有堡垒机模板允许，且由界面上的二次确认触发。提交后读出工单号。 */
async function submitPageOne(input: StepInput): Promise<StepOutcome> {
  if (input.template.boundary !== "submit-first-page")
    return { status: "failed", error: "这个工单不允许提交，只能停在提交前。" }
  const clicked = await input.cdp.evaluate<boolean>(clickButton(SUBMIT_LABELS))
  if (!clicked) return { status: "failed", error: "没有找到「提交」按钮。" }
  await input.cdp.waitFor(`/提交成功|工单号|受理成功/.test(document.body.innerText)`, input.timeoutMs)
  const orderNo = await input.cdp.evaluate<string>(
    `(() => { const text = document.body.innerText; const match = text.match(/(?:工单号|单号)[：:\\s]*([A-Za-z0-9_-]{6,})/) || text.match(/\\b([A-Z]{2,6}\\d{6,})\\b/); return match ? match[1] : "" })()`,
  )
  return { status: "done", summary: orderNo ? `已提交第一页，工单号 ${orderNo}` : "已提交第一页", ...(orderNo ? { orderNo } : {}) }
}

/** 进入 IT 服务门户：页面已经是门户就不动；否则按可见文案点一次「IT 服务」。 */
export async function ensurePortal(cdp: Cdp, timeoutMs: number) {
  const buttons = await cdp.evaluate<string[]>(`(() => globalThis.__itsm.probe().buttons)()`)
  if (buttons.some((label) => label.includes("服务目录") || label.includes("所有服务"))) return
  const opened = await cdp.evaluate<boolean>(clickButton(PORTAL_LABELS))
  if (!opened) return
  await cdp.waitFor(`document.body.innerText.includes("服务")`, timeoutMs)
}

/** 打开门户首页，供「开始填写」的第一步使用。 */
export async function gotoPortal(cdp: Cdp, url: string, timeoutMs: number) {
  await cdp.send("Page.navigate", { url })
  await cdp.waitFor(`document.readyState === "complete"`, timeoutMs)
  await requireVisible(cdp, `document.body && document.body.innerText.length > 0`, timeoutMs, "门户页面内容")
  await cdp.inject()
}

export interface CatalogRow {
  readonly name: string
  readonly category: string
  readonly description: string
  readonly url: string
}

/**
 * 读门户上可见的服务项目录。只读：只挑卡片/列表项里的标题与描述，按名称去重。
 * 抓不到时返回空数组，界面提示用户到内嵌浏览器里刷新服务目录。
 */
export async function readCatalog(cdp: Cdp, timeoutMs: number): Promise<CatalogRow[]> {
  await cdp.inject()
  await cdp.waitFor(`document.body && document.body.innerText.length > 0`, timeoutMs)
  return cdp.evaluate<CatalogRow[]>(`(() => {
    const itsm = globalThis.__itsm
    const rows = []
    const seen = new Set()
    const nodes = Array.from(document.querySelectorAll('[class*="card"], [class*="service"], [class*="catalog"], [class*="item"], li'))
      .filter(itsm.visible)
    for (const el of nodes) {
      if (el.querySelector("input, textarea, select")) continue
      const heading = el.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="name"]')
      const name = itsm.textOf(heading) || itsm.textOf(el).split(" ")[0] || ""
      if (name.length < 2 || name.length > 60 || seen.has(name)) continue
      seen.add(name)
      const full = itsm.textOf(el)
      const description = full.startsWith(name) ? full.slice(name.length).trim().slice(0, 200) : full.slice(0, 200)
      const section = el.closest('section, [class*="group"], [class*="category"]')
      const category = section ? itsm.textOf(section.querySelector('h1, h2, h3, h4, [class*="title"]')).slice(0, 60) : ""
      const link = el.closest("a") || el.querySelector("a")
      rows.push({ name, category, description, url: link ? link.href : "" })
      if (rows.length >= 200) break
    }
    return rows
  })()`)
}

export { timeoutOf }
