export * as ItsmTools from "./tools.js"

import type { ToolEditor } from "@aicraft/aix/promise/tool"
import { Tool } from "@aicraft/schema/tool"
import { optional } from "@aicraft/schema/schema"
import { Schema } from "effect"
import { AnswerValue, StepRun } from "./contract.js"
import { mergeAnswers } from "./logic.js"
import * as Store from "./store.js"

const Values = Schema.Record(Schema.String, AnswerValue)

const ServicesInput = Schema.Struct({})

const RequiredField = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  type: Schema.String,
  hint: Schema.optional(Schema.String),
})

const ServiceTemplate = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  env: Schema.String,
  service: Schema.String,
  builtinKey: Schema.optional(Schema.String),
  required: Schema.Array(RequiredField),
  optional: Schema.Array(RequiredField),
  defaults: Schema.Record(Schema.String, Schema.String),
  boundary: Schema.String,
})

const ServicesResult = Schema.Struct({
  templates: Schema.Array(ServiceTemplate),
  catalogSyncedAt: Schema.NullOr(Schema.String),
})

const PrepareInput = Schema.Struct({
  templateId: Schema.String.check(Schema.isMinLength(1)).annotate({
    description: "工单模板 id，来自 itsm.services 返回的 templates[].id，例如 fortress-prod、release-prod。",
  }),
  accountId: optional(Schema.String).annotate({
    description: "使用哪个 OA 账号的登录态；省略时用最近使用过的账号。",
  }),
  values: optional(Values).annotate({
    description:
      "从用户话里提取的答案，键是字段 id（见 itsm.services 的 required/optional）。拿不到的不要编造，留给 missing。",
  }),
})

const MissingField = Schema.Struct({ id: Schema.String, label: Schema.String, hint: Schema.optional(Schema.String) })

const PrepareResult = Schema.Struct({
  requestId: Schema.String,
  templateId: Schema.String,
  accepted: Values,
  missing: Schema.Array(MissingField),
})

const StatusInput = Schema.Struct({
  requestId: optional(Schema.String).annotate({ description: "itsm.prepare 返回的 requestId。" }),
  runId: optional(Schema.String).annotate({ description: "执行记录 id，来自 itsm.history。" }),
})

const StatusResult = Schema.Struct({
  request: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      templateId: Schema.String,
      status: Schema.String,
      createdAt: Schema.String,
      runId: Schema.optional(Schema.String),
    }),
  ),
  run: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      serviceName: Schema.String,
      status: Schema.String,
      orderNo: Schema.optional(Schema.String),
      startedAt: Schema.String,
      finishedAt: Schema.optional(Schema.String),
      steps: Schema.Array(StepRun),
    }),
  ),
})

const HistoryInput = Schema.Struct({
  limit: optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)).check(Schema.isLessThanOrEqualTo(50))).annotate({
    description: "返回的最近记录条数，默认 10。",
  }),
})

const HistoryResult = Schema.Struct({
  runs: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      templateId: Schema.String,
      serviceName: Schema.String,
      title: Schema.String,
      status: Schema.String,
      orderNo: Schema.optional(Schema.String),
      startedAt: Schema.String,
    }),
  ),
})

const options = { namespace: "itsm", permission: "itsm", codemode: true } as const

export interface Deps {
  readonly storage: Store.Storage
  readonly now: () => string
  readonly keepRuns: () => Promise<number>
}

export function register(editor: ToolEditor, deps: Deps) {
  editor.namespace({
    name: "itsm",
    description:
      "长虹 ITSM 工单：列出可填的工单类型、按模板准备答案并排入待办、查询执行状态与历史。工具不驱动浏览器、不提交工单；填写由应用里的「IT 工单」页面执行，提交必须由用户确认。",
  })

  editor.add({
    name: "services",
    description: "列出可填的工单类型（内置模板与已同步的服务目录），以及每个模板的必填字段、可选字段和页面默认值。",
    input: ServicesInput,
    output: ServicesResult,
    options,
    execute: async () => {
      await Store.seedTemplates(deps.storage)
      const [templates, catalog] = await Promise.all([Store.readTemplates(deps.storage), Store.readCatalog(deps.storage)])
      const rows = templates.map((template) => ({
        id: template.id,
        name: template.name,
        env: template.env,
        service: template.serviceKey,
        required: template.questions
          .filter((question) => question.required)
          .map((question) => ({
            id: question.id,
            label: question.label,
            type: question.type,
            ...(question.hint === undefined ? {} : { hint: question.hint }),
          })),
        optional: template.questions
          .filter((question) => !question.required)
          .map((question) => ({
            id: question.id,
            label: question.label,
            type: question.type,
            ...(question.hint === undefined ? {} : { hint: question.hint }),
          })),
        defaults: Object.fromEntries(
          template.questions.flatMap((question) => {
            const value = question.defaultValue
            if (value === undefined) return []
            return [[question.id, typeof value === "string" ? value : value.join("，")] as const]
          }),
        ),
        boundary: template.boundary,
      }))
      const lines = rows.map(
        (row) =>
          `- ${row.name}（${row.id}，${row.env === "prod" ? "生产" : row.env === "test" ? "测试" : "未知环境"}）：必填 ${row.required.map((field) => field.label).join("、") || "无"}`,
      )
      return {
        output: { templates: rows, catalogSyncedAt: catalog?.syncedAt ?? null },
        content:
          rows.length === 0
            ? "还没有可填的工单模板。先在客户端「IT 工单」页面的设置里配置模板或刷新服务目录。"
            : ["可填的工单类型：", ...lines].join("\n"),
      }
    },
  })

  editor.add({
    name: "prepare",
    description:
      "按模板合并答案（含本地记住的上次答案），把这次填写排入待办队列，返回 requestId 与缺失的必填项。缺失项要转述给用户补齐，不要编造；本工具不会提交任何工单。",
    input: PrepareInput,
    output: PrepareResult,
    options,
    execute: async (input) => {
      await Store.seedTemplates(deps.storage)
      const templates = await Store.readTemplates(deps.storage)
      const template = templates.find((item) => item.id === input.templateId)
      if (!template) throw new Tool.Error({ message: `没有 id 为 ${input.templateId} 的模板。先用 itsm.services 查看可用的模板。` })
      const [answers, accounts] = await Promise.all([Store.readAnswers(deps.storage), Store.readAccounts(deps.storage)])
      const previous = answers.find((item) => item.templateId === template.id)?.values ?? {}
      const merged = mergeAnswers(template, previous, input.values ?? {})
      const request = {
        id: Store.newRequestID(),
        templateId: template.id,
        ...(input.accountId ?? accounts[0]?.id ? { accountId: input.accountId ?? accounts[0]!.id } : {}),
        values: merged.values,
        missing: merged.missing,
        createdAt: deps.now(),
        status: "pending" as const,
      }
      await Store.savePending(deps.storage, request)
      const missing = template.questions
        .filter((question) => merged.missing.includes(question.id))
        .map((question) => ({
          id: question.id,
          label: question.label,
          ...(question.hint === undefined ? {} : { hint: question.hint }),
        }))
      return {
        output: { requestId: request.id, templateId: template.id, accepted: merged.values, missing },
        content:
          missing.length === 0
            ? `已排入待办（${request.id}），答案齐全。请让用户到客户端左侧「IT 工单」页面确认并开始填写；提交仍需用户自己确认。`
            : [
                `已排入待办（${request.id}），但还缺 ${missing.length} 个必填项，请先问用户：`,
                ...missing.map((field) => `- ${field.label}（${field.id}）`),
              ].join("\n"),
      }
    },
  })

  editor.add({
    name: "status",
    description: "查询一次待办或执行的状态：当前步骤、结果摘要、失败原因与工单号。",
    input: StatusInput,
    output: StatusResult,
    options,
    execute: async (input) => {
      if (!input.requestId && !input.runId) throw new Tool.Error({ message: "至少提供 requestId 或 runId。" })
      const runs = await Store.readRuns(deps.storage)
      const request = input.requestId
        ? (await Store.readPending(deps.storage)).find((item) => item.id === input.requestId)
        : undefined
      const run = input.runId
        ? runs.find((item) => item.id === input.runId)
        : request?.runId
          ? runs.find((item) => item.id === request.runId)
          : undefined
      const output = {
        request: request
          ? {
              id: request.id,
              templateId: request.templateId,
              status: request.status,
              createdAt: request.createdAt,
              ...(request.runId === undefined ? {} : { runId: request.runId }),
            }
          : null,
        run: run
          ? {
              id: run.id,
              title: run.title,
              serviceName: run.serviceName,
              status: run.status,
              ...(run.orderNo === undefined ? {} : { orderNo: run.orderNo }),
              startedAt: run.startedAt,
              ...(run.finishedAt === undefined ? {} : { finishedAt: run.finishedAt }),
              steps: run.steps,
            }
          : null,
      }
      if (!request && !run) return { output, content: "没有找到对应的待办或执行记录。" }
      const lines = run
        ? [
            `执行：${run.title}（${run.serviceName}）`,
            `状态：${statusLabel(run.status)}${run.orderNo ? `，工单号 ${run.orderNo}` : ""}`,
            ...run.steps.map((step) => `- ${step.name}：${stepLabel(step.status)}${step.summary ? ` — ${step.summary}` : ""}${step.error ? `（${step.error}）` : ""}`),
          ]
        : [`待办：${request!.templateId}，状态 ${request!.status}`]
      return { output, content: lines.join("\n") }
    },
  })

  editor.add({
    name: "history",
    description: "列出最近的工单填写与提交记录：时间、类型、标题、工单号、状态。",
    input: HistoryInput,
    output: HistoryResult,
    options,
    execute: async (input) => {
      const runs = (await Store.readRuns(deps.storage)).slice(0, input.limit ?? 10)
      const rows = runs.map((run) => ({
        id: run.id,
        templateId: run.templateId,
        serviceName: run.serviceName,
        title: run.title,
        status: run.status,
        ...(run.orderNo === undefined ? {} : { orderNo: run.orderNo }),
        startedAt: run.startedAt,
      }))
      return {
        output: { runs: rows },
        content:
          rows.length === 0
            ? "还没有工单记录。"
            : rows
                .map((row) => `- ${row.startedAt} ${row.title}（${row.serviceName}）：${statusLabel(row.status)}${row.orderNo ? ` ${row.orderNo}` : ""}`)
                .join("\n"),
      }
    },
  })
}

function statusLabel(status: string) {
  return (
    { draft: "草稿", running: "进行中", stopped: "停在提交前", submitted: "已提交", failed: "失败" }[status] ?? status
  )
}

function stepLabel(status: string) {
  return { waiting: "等待", running: "进行中", done: "完成", failed: "失败", skipped: "跳过" }[status] ?? status
}

/** 保留给调用方读取执行条数上限；工具本身不写执行记录。 */
export async function keepRuns(deps: Deps) {
  return deps.keepRuns()
}
