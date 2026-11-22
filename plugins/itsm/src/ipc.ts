export * as ItsmIpc from "./ipc.js"

import { Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { AnswerValue, Template } from "./contract.js"

const text = (max: number) => Schema.String.check(Schema.isMaxLength(max))

export const PageState = Schema.Struct({
  url: text(16_384),
  title: text(1_024),
  ready: Schema.Boolean,
})
export type PageState = typeof PageState.Type

export const PageField = Schema.Struct({
  label: text(512),
  /** 探测到的控件类型：文本、下拉、单选、多选、人员、富文本、日期。 */
  kind: text(32),
  required: Schema.Boolean,
  value: Schema.optional(text(4_096)),
  options: Schema.optional(Schema.Array(text(512))),
})
export type PageField = typeof PageField.Type

export const PageProbe = Schema.Struct({
  url: text(16_384),
  title: text(1_024),
  buttons: Schema.Array(text(256)),
  fields: Schema.Array(PageField),
  /** 当前可见的弹窗标题，例如关联数据弹窗。 */
  dialogs: Schema.Array(text(512)),
})
export type PageProbe = typeof PageProbe.Type

export const ImportResult = Schema.Struct({
  ok: Schema.Boolean,
  imported: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** 本机发现的 Chrome profile 目录名，供设置页选择。 */
  profiles: Schema.Array(text(128)),
  reason: Schema.optional(text(1_024)),
})
export type ImportResult = typeof ImportResult.Type

export const CatalogItem = Schema.Struct({
  name: text(512),
  category: text(256),
  description: text(1_024),
  /** 服务项在门户里的打开地址；DOM 抓取不到时为空串。 */
  url: text(16_384),
})
export type CatalogItem = typeof CatalogItem.Type

export const CatalogResult = Schema.Struct({
  items: Schema.Array(CatalogItem),
  /** `api`：从页面上下文里的接口拿到；`dom`：退回页面抓取。 */
  source: Schema.Literals(["api", "dom"]),
  syncedAt: Schema.String,
})
export type CatalogResult = typeof CatalogResult.Type

export const LoginState = Schema.Struct({
  loggedIn: Schema.Boolean,
  url: text(16_384),
  title: text(1_024),
})
export type LoginState = typeof LoginState.Type

export const StepOutcome = Schema.Struct({
  status: Schema.Literals(["done", "skipped", "failed"]),
  summary: Schema.optional(text(1_024)),
  error: Schema.optional(text(2_048)),
  orderNo: Schema.optional(text(128)),
})
export type StepOutcome = typeof StepOutcome.Type

const Values = Schema.Record(Schema.String, AnswerValue)

/**
 * The embedded browser's main-process half. One view per account per window; every call names the embed id the
 * window got from `ensure`. Page operations are read-only until `runStep` performs the step the workbench asked for.
 */
export const ItsmBrowser = Ipc.define({
  id: "changhong.itsm.browser",
  methods: {
    /** Creates or reuses the view of an account's partition in the calling window. */
    ensure: {
      input: Schema.Struct({
        accountId: Schema.String.check(Schema.isMinLength(1)),
        /** `persist:itsm-<account id>`; the window owns the naming so nothing is derived in two places. */
        partition: text(128),
      }),
      output: Schema.Struct({ embed: text(64), partition: text(128) }),
    },
    show: { input: Schema.Struct({ embed: text(64), visible: Schema.Boolean }) },
    navigate: {
      input: Schema.Struct({ embed: text(64), url: text(16_384), timeoutMs: Schema.Int }),
      output: PageState,
    },
    page: { input: Schema.Struct({ embed: text(64) }), output: PageState },
    probe: { input: Schema.Struct({ embed: text(64), timeoutMs: Schema.Int }), output: PageProbe },
    loginState: { input: Schema.Struct({ embed: text(64) }), output: LoginState },
    /** Imports `.changhong.com` cookies from local Chrome; never returns cookie values. */
    importCookies: {
      input: Schema.Struct({ accountId: Schema.String, partition: text(128), chromeProfile: Schema.optional(text(128)) }),
      output: ImportResult,
    },
    catalog: { input: Schema.Struct({ embed: text(64), timeoutMs: Schema.Int }), output: CatalogResult },
    /** Searches the portal for one service item and opens its request page. */
    openService: {
      input: Schema.Struct({ embed: text(64), serviceName: text(512), timeoutMs: Schema.Int }),
      output: PageState,
    },
    runStep: {
      input: Schema.Struct({
        embed: text(64),
        template: Template,
        values: Values,
        stepId: Schema.String,
        timeoutMs: Schema.Int,
        back: Schema.Boolean,
      }),
      output: StepOutcome,
    },
    dispose: { input: Schema.Struct({ embed: text(64) }) },
  },
  events: {},
})
