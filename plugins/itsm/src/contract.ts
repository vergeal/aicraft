export * as ItsmContract from "./contract.js"

import { Rpc } from "@opencode/schema/rpc"
import { Schema } from "effect"

/** 一个答案值：单行/多行文本、单选、人员、时间都是一个字符串；多选是字符串数组。 */
export const AnswerValue = Schema.Union([Schema.String, Schema.Array(Schema.String)])
export type AnswerValue = typeof AnswerValue.Type

export const Environment = Schema.Literals(["prod", "test", "unknown"])
export type Environment = typeof Environment.Type

/** 一个 OA 账号。每个账号独占一个 Electron session 分区，互不影响登录态。 */
export const Account = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  /** 内嵌浏览器的持久化分区名，例如 `persist:itsm-<id>`。 */
  profileDir: Schema.String,
  /** 复用登录态时来源的 Chrome profile 目录名，例如 `Default`；手动登录时为空串。 */
  chromeProfile: Schema.String,
  createdAt: Schema.String,
  lastUsedAt: Schema.String,
})
export interface Account extends Schema.Schema.Type<typeof Account> {}

export const ServiceItem = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  category: Schema.String,
  description: Schema.String,
  env: Environment,
  /** 命中的内置模板键，例如 `fortress-prod`；未知服务项留空。 */
  builtinKey: Schema.optional(Schema.String),
  templateId: Schema.optional(Schema.String),
})
export interface ServiceItem extends Schema.Schema.Type<typeof ServiceItem> {}

export const ServiceCatalog = Schema.Struct({
  syncedAt: Schema.String,
  items: Schema.Array(ServiceItem),
})
export interface ServiceCatalog extends Schema.Schema.Type<typeof ServiceCatalog> {}

export const QuestionType = Schema.Literals([
  "text",
  "textarea",
  "select",
  "multiselect",
  "person",
  "date",
  "time",
  "boolean",
])
export type QuestionType = typeof QuestionType.Type

export const Option = Schema.Struct({ value: Schema.String, label: Schema.String })
export interface Option extends Schema.Schema.Type<typeof Option> {}

export const Question = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  hint: Schema.optional(Schema.String),
  type: QuestionType,
  required: Schema.Boolean,
  options: Schema.optional(Schema.Array(Option)),
  defaultValue: Schema.optional(AnswerValue),
  /** 本地记住上次答案用的键；缺省时用 `id`。 */
  rememberKey: Schema.optional(Schema.String),
})
export interface Question extends Schema.Schema.Type<typeof Question> {}

export const StepKind = Schema.Literals([
  "navigate",
  "search-service",
  "open-service",
  "fill-fields",
  "relate-resources",
  "account-columns",
  "fill-second-page",
  "submit-page-one",
  "stop",
])
export type StepKind = typeof StepKind.Type

export const StepSpec = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: StepKind,
  /** 展示用的补充说明，例如「筛选资源名称，全选后确定」。 */
  detail: Schema.optional(Schema.String),
})
export interface StepSpec extends Schema.Schema.Type<typeof StepSpec> {}

export const ResourceRule = Schema.Struct({
  /** 关联数据弹窗里供筛选的字段文案，例如「资源名称」。 */
  filterLabel: Schema.String,
  /** 多个关键词之间是「或」。 */
  keywords: Schema.Array(Schema.String),
  /** 弹窗标题，用于确认打开的是同一个弹窗。 */
  dialogTitle: Schema.optional(Schema.String),
})
export interface ResourceRule extends Schema.Schema.Type<typeof ResourceRule> {}

export const SecondPage = Schema.Struct({
  title: Schema.String,
  /** `select`：每行的下拉；`text`：每行的手填文本框。 */
  accountControl: Schema.Literals(["select", "text"]),
  /** 手填时的固定值；下拉时留空，按 sys/app/第一个非空 的规则选择。 */
  fixedAccount: Schema.optional(Schema.String),
})
export interface SecondPage extends Schema.Schema.Type<typeof SecondPage> {}

export const Boundary = Schema.Literals(["submit-first-page", "stop-before-submit"])
export type Boundary = typeof Boundary.Type

export const TemplateSource = Schema.Literals(["builtin", "detected", "manual"])
export type TemplateSource = typeof TemplateSource.Type

export const Template = Schema.Struct({
  id: Schema.String,
  serviceKey: Schema.String,
  name: Schema.String,
  env: Environment,
  source: TemplateSource,
  pages: Schema.Int,
  questions: Schema.Array(Question),
  steps: Schema.Array(StepSpec),
  resourceRule: Schema.optional(ResourceRule),
  secondPage: Schema.optional(SecondPage),
  boundary: Boundary,
  /** 自动探测生成的模板里，需要人工确认的字段 id。 */
  needsReview: Schema.optional(Schema.Array(Schema.String)),
})
export interface Template extends Schema.Schema.Type<typeof Template> {}

export const Answers = Schema.Struct({
  templateId: Schema.String,
  accountId: Schema.String,
  values: Schema.Record(Schema.String, AnswerValue),
  updatedAt: Schema.String,
})
export interface Answers extends Schema.Schema.Type<typeof Answers> {}

export const RunStatus = Schema.Literals(["draft", "running", "stopped", "submitted", "failed"])
export type RunStatus = typeof RunStatus.Type

export const StepStatus = Schema.Literals(["waiting", "running", "done", "failed", "skipped"])
export type StepStatus = typeof StepStatus.Type

export const StepRun = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  status: StepStatus,
  summary: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  startedAt: Schema.optional(Schema.String),
  finishedAt: Schema.optional(Schema.String),
})
export interface StepRun extends Schema.Schema.Type<typeof StepRun> {}

export const Run = Schema.Struct({
  id: Schema.String,
  templateId: Schema.String,
  accountId: Schema.String,
  serviceName: Schema.String,
  title: Schema.String,
  status: RunStatus,
  steps: Schema.Array(StepRun),
  startedAt: Schema.String,
  finishedAt: Schema.optional(Schema.String),
  /** 堡垒机第一页提交成功后拿到的工单号。 */
  orderNo: Schema.optional(Schema.String),
  /** 提交前快照：答案、资源条数等，历史里展示。 */
  fields: Schema.Record(Schema.String, Schema.String),
})
export interface Run extends Schema.Schema.Type<typeof Run> {}

/** agent 通过 `itsm.prepare` 排入的待办请求；插件页面领取后开始向导。 */
export const PrepareRequest = Schema.Struct({
  id: Schema.String,
  templateId: Schema.String,
  accountId: Schema.optional(Schema.String),
  values: Schema.Record(Schema.String, AnswerValue),
  missing: Schema.Array(Schema.String),
  createdAt: Schema.String,
  status: Schema.Literals(["pending", "claimed", "finished"]),
  runId: Schema.optional(Schema.String),
})
export interface PrepareRequest extends Schema.Schema.Type<typeof PrepareRequest> {}

export const Settings = Schema.Struct({
  /** 填完后是否询问「把这套参数保存为默认值」。 */
  askSaveDefaults: Schema.Boolean,
  /** 内嵌浏览器打开的门户地址；空串表示由用户在内嵌浏览器里手动进入。 */
  portalUrl: Schema.String,
})
export interface Settings extends Schema.Schema.Type<typeof Settings> {}

export const Snapshot = Schema.Struct({
  accounts: Schema.Array(Account),
  templates: Schema.Array(Template),
  catalog: Schema.NullOr(ServiceCatalog),
  answers: Schema.Array(Answers),
  runs: Schema.Array(Run),
  pending: Schema.Array(PrepareRequest),
  settings: Settings,
})
export interface Snapshot extends Schema.Schema.Type<typeof Snapshot> {}

const standard = <S extends Schema.ConstraintCodec<unknown, unknown>>(schema: S) => Schema.toStandardSchemaV1(schema)

/**
 * The server half the workbench reads and writes: accounts, templates, the cached service catalog, remembered answers
 * and run history. It lives on the plugin's own storage, not in a Project, so the workbench needs no Session.
 */
export const Definition = Rpc.define({
  id: "changhong.itsm",
  methods: {
    snapshot: { input: standard(Schema.Struct({})), output: standard(Snapshot) },
    saveAccount: { input: standard(Account), output: standard(Schema.Struct({ account: Account })) },
    removeAccount: {
      input: standard(Schema.Struct({ id: Schema.String })),
      output: standard(Schema.Struct({ removed: Schema.Boolean })),
    },
    saveTemplate: { input: standard(Template), output: standard(Schema.Struct({ template: Template })) },
    removeTemplate: {
      input: standard(Schema.Struct({ id: Schema.String })),
      output: standard(Schema.Struct({ removed: Schema.Boolean })),
    },
    saveCatalog: {
      input: standard(ServiceCatalog),
      output: standard(Schema.Struct({ catalog: ServiceCatalog })),
    },
    saveAnswers: { input: standard(Answers), output: standard(Schema.Struct({ answers: Answers })) },
    recordRun: { input: standard(Run), output: standard(Schema.Struct({ run: Run })) },
    claimPending: {
      input: standard(Schema.Struct({ id: Schema.String })),
      output: standard(Schema.Struct({ request: Schema.NullOr(PrepareRequest) })),
    },
    finishPending: {
      input: standard(Schema.Struct({ id: Schema.String, runId: Schema.optional(Schema.String) })),
      output: standard(Schema.Struct({ finished: Schema.Boolean })),
    },
    saveSettings: { input: standard(Settings), output: standard(Schema.Struct({ settings: Settings })) },
    clearHistory: { input: standard(Schema.Struct({})), output: standard(Schema.Struct({ removed: Schema.Int })) },
  },
  events: {},
})
