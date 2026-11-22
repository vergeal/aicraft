export * as ItsmTemplates from "./templates.js"

import type { Question, StepSpec, Template } from "./contract.js"

/** 门户里三类工单的服务项名称与结构。只给结构，不给任何个人值。 */
export const FORTRESS_PROD_SERVICE = "普通账号-系统管理账号权限申请（堡垒机）"
export const FORTRESS_TEST_SERVICE = "华为公有云账号-系统管理账号权限申请（堡垒机）"
export const RELEASE_SERVICE = "生产环境发布-通用"

export const FORTRESS_PROD = "fortress-prod"
export const FORTRESS_TEST = "fortress-test"
export const RELEASE_PROD = "release-prod"

const title = (hint: string): Question => ({
  id: "title",
  label: "工单标题",
  hint,
  type: "text",
  required: true,
  rememberKey: "title",
})

const reason = (hint: string): Question => ({
  id: "reason",
  label: "申请原因",
  hint,
  type: "textarea",
  required: true,
  rememberKey: "reason",
})

/** 页面上带出默认值、选项由页面下拉决定的字段：向导不猜选项，只记用户的选择或页面默认值。 */
const pageDriven = (id: string, label: string, hint: string): Question => ({
  id,
  label,
  hint,
  type: "select",
  required: true,
  options: [],
})

export function questionKey(question: Question) {
  return question.rememberKey ?? question.id
}

const fortressSteps: readonly StepSpec[] = [
  { id: "navigate", name: "打开 IT 服务门户", kind: "navigate" },
  { id: "search", name: "搜索服务项", kind: "search-service" },
  { id: "open", name: "打开发起页", kind: "open-service" },
  { id: "fill", name: "填写第一页字段", kind: "fill-fields" },
  { id: "relate", name: "关联资源", kind: "relate-resources", detail: "按资源名称筛选，全选当前页后确定" },
  { id: "accounts", name: "配置资源账号", kind: "account-columns", detail: "sys 优先，其次 app，全空则删除该行" },
  { id: "second", name: "填写第二页补充信息", kind: "fill-second-page", detail: "只填不提交" },
  { id: "submit", name: "确认并提交第一页", kind: "submit-page-one", detail: "需要你二次确认" },
  { id: "stop", name: "停在提交前", kind: "stop" },
]

const releaseSteps: readonly StepSpec[] = [
  { id: "navigate", name: "打开 IT 服务门户", kind: "navigate" },
  { id: "search", name: "搜索「发布管理」", kind: "search-service" },
  { id: "open", name: "打开生产环境发布页", kind: "open-service" },
  { id: "fill", name: "填写发布字段", kind: "fill-fields" },
  { id: "stop", name: "停在提交前", kind: "stop" },
]

/**
 * 生产堡垒机申请。第一页可提交（经二次确认），第二页只填不提交。
 */
export const fortressProd: Template = {
  id: FORTRESS_PROD,
  serviceKey: FORTRESS_PROD_SERVICE,
  name: "生产堡垒机申请",
  env: "prod",
  source: "builtin",
  pages: 2,
  boundary: "submit-first-page",
  questions: [
    title("建议写清系统与用途，例如「XX 系统投产权限申请」"),
    pageDriven("projectType", "项目类型", "选项以页面下拉为准"),
    pageDriven("downtime", "使用账号停机停服", "选项以页面下拉为准"),
    pageDriven("userScope", "账号处理用户范围", "选项以页面下拉为准"),
    {
      id: "businessType",
      label: "处理业务类型",
      hint: "选项以页面为准，可多选",
      type: "multiselect",
      required: true,
      options: [],
      rememberKey: "businessType",
    },
    reason("说明为什么需要这些权限，越具体越好"),
    {
      id: "approver",
      label: "部门运维主管/项目技术负责人",
      hint: "输入姓名或工号搜索",
      type: "person",
      required: true,
      rememberKey: "approver",
    },
    {
      id: "keywords",
      label: "资源名称关键词",
      hint: "多个关键词用逗号分隔，任一命中即关联",
      type: "text",
      required: true,
      rememberKey: "keywords",
    },
  ],
  steps: [...fortressSteps],
  resourceRule: { filterLabel: "资源名称", keywords: [] },
  secondPage: { title: "补充信息", accountControl: "select" },
}

/**
 * 测试堡垒机申请（华为云）。字段与生产基本一致，负责人标签少一个「项目」，关联数据弹窗标题不同，
 * 第二页的账号是手填文本框。
 */
export const fortressTest: Template = {
  id: FORTRESS_TEST,
  serviceKey: FORTRESS_TEST_SERVICE,
  name: "测试堡垒机申请（华为云）",
  env: "test",
  source: "builtin",
  pages: 2,
  boundary: "submit-first-page",
  questions: [
    title("建议写清系统与测试目的，例如「XX 系统测试环境权限申请」"),
    pageDriven("projectType", "项目类型", "选项以页面下拉为准"),
    pageDriven("downtime", "使用账号停机停服", "选项以页面下拉为准"),
    pageDriven("userScope", "账号处理用户范围", "选项以页面下拉为准"),
    {
      id: "businessType",
      label: "处理业务类型",
      hint: "选项以页面为准，可多选",
      type: "multiselect",
      required: true,
      options: [],
      rememberKey: "businessType",
    },
    reason("说明测试内容与所需权限"),
    {
      id: "approver",
      label: "部门运维主管/技术负责人",
      hint: "输入姓名或工号搜索",
      type: "person",
      required: true,
      rememberKey: "approver",
    },
    {
      id: "keywords",
      label: "资源名称关键词",
      hint: "多个关键词用逗号分隔，任一命中即关联",
      type: "text",
      required: true,
      rememberKey: "keywords",
    },
    {
      id: "account",
      label: "第二页资源账号",
      hint: "每个资源填这一行账号，例如 sys-hyt-01",
      type: "text",
      required: true,
      rememberKey: "account",
    },
  ],
  steps: [...fortressSteps],
  resourceRule: { filterLabel: "资源名称", keywords: [], dialogTitle: "公有云_堡垒机资源【20260305】" },
  secondPage: { title: "补充信息", accountControl: "text" },
}

/**
 * 发版申请。页面只有一页；只填不提交，也不保存草稿。业务系统、系统分类、发布类型、管理方式和原因分类的选项
 * 都从页面下拉读取，模板里只留默认文案。
 */
export const releaseProd: Template = {
  id: RELEASE_PROD,
  serviceKey: RELEASE_SERVICE,
  name: "生产环境发版申请",
  env: "prod",
  source: "builtin",
  pages: 1,
  boundary: "stop-before-submit",
  questions: [
    {
      id: "startAt",
      label: "计划开始时间",
      hint: "默认 22:00",
      type: "time",
      required: true,
      defaultValue: "22:00",
      rememberKey: "startAt",
    },
    {
      id: "endAt",
      label: "计划结束时间",
      hint: "默认 23:00",
      type: "time",
      required: true,
      defaultValue: "23:00",
      rememberKey: "endAt",
    },
    pageDriven("system", "业务系统", "选项从页面下拉读取"),
    pageDriven("systemCategory", "系统分类", "选项从页面下拉读取"),
    pageDriven("releaseType", "发布类型", "默认「一般发布」"),
    pageDriven("management", "管理方式", "默认「集团统管」"),
    pageDriven("reasonL1", "一级原因分类", "默认「软件原因」"),
    pageDriven("reasonL2", "二级原因分类", "默认「程序版本和补丁发布」"),
    title("建议写清系统与版本，例如「XX 系统 V1.2.0 发布」"),
    {
      id: "plan",
      label: "发布方案步骤",
      hint: "由插件内的临时会话生成，你可以在向导里修改",
      type: "textarea",
      required: true,
      rememberKey: "plan",
    },
    {
      id: "rollback",
      label: "发布回退方案",
      hint: "由插件内的临时会话生成，你可以在向导里修改",
      type: "textarea",
      required: true,
      rememberKey: "rollback",
    },
    {
      id: "manager",
      label: "发布经理",
      hint: "页面可能带出默认值，填写时会读出并告诉你",
      type: "person",
      required: false,
      rememberKey: "manager",
    },
  ],
  steps: [...releaseSteps],
}

export const builtins: readonly Template[] = [fortressProd, fortressTest, releaseProd]

/** 内置模板的默认值：发版四类分类字段的页面默认文案。 */
export const releaseDefaults: Readonly<Record<string, string>> = {
  releaseType: "一般发布",
  management: "集团统管",
  reasonL1: "软件原因",
  reasonL2: "程序版本和补丁发布",
}

export function findBuiltin(id: string) {
  return builtins.find((template) => template.id === id)
}
