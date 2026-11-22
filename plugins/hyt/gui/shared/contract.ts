import { Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"
import { AUTOPILOT_SCOPES, HytProfile, PRESET_NAMES, ROLES, SCENES } from "../../src/profile/schema.js"

/**
 * 设置页与引导共用的 Ipc 契约。
 *
 * 窗口不读盘：档案、账号、bridge 状态、知识库计数与风格摘要都由主进程算好，作为一个 state 推给窗口；
 * 写操作走方法，主进程写完立刻 `changed()`，界面因此不需要重启插件。
 */

export const Person = Schema.Struct({
  account: Schema.String,
  name: Schema.String,
  department: Schema.String,
  /** 通讯录里的备注名，没有时为空串。 */
  remark: Schema.String,
})

export const Login = Schema.Struct({
  userName: Schema.String,
  account: Schema.String,
  displayName: Schema.String,
  compId: Schema.String,
  autoLogin: Schema.Boolean,
})

export const BridgeEndpoint = Schema.Struct({
  host: Schema.String,
  port: Schema.Number,
})

export const Bridge = Schema.Struct({
  state: Schema.Literals(["stopped", "connecting", "ready", "restarting", "failed"]),
  endpoint: Schema.optional(BridgeEndpoint),
  restarts: Schema.Number,
  lastError: Schema.optional(Schema.String),
  /** 主进程是否持有自己拉起的子进程。 */
  ownProcess: Schema.Boolean,
})

export const KnowledgeInfo = Schema.Struct({
  entries: Schema.Number,
  updatedAt: Schema.String,
})

export const StyleInfo = Schema.Struct({
  summary: Schema.String,
  updatedAt: Schema.String,
})

export const HytStateSchema = Schema.Struct({
  /** 档案、知识库与风格样本的根目录，界面只展示与打开，不拼接。 */
  dataDir: Schema.String,
  /** 档案读不出来或还没读到时为 null。 */
  profile: Schema.NullOr(HytProfile),
  chfileRoot: Schema.String,
  bridgePath: Schema.String,
  account: Schema.NullOr(Login),
  department: Schema.String,
  logins: Schema.Array(Login),
  bridge: Bridge,
  knowledge: KnowledgeInfo,
  style: StyleInfo,
  /** 最近一次读盘的错误，界面据此提示而不是静默显示空状态。 */
  error: Schema.optional(Schema.String),
})

export const ProfilePatch = Schema.Struct({
  account: Schema.optional(Schema.String),
  role: Schema.optional(Schema.Literals(ROLES)),
  scenes: Schema.optional(Schema.Array(Schema.Literals(SCENES))),
  capabilities: Schema.optional(
    Schema.Struct({
      digest: Schema.optional(Schema.Struct({ enabled: Schema.optional(Schema.Boolean), everyHours: Schema.optional(Schema.Number) })),
      tasks: Schema.optional(Schema.Struct({ enabled: Schema.optional(Schema.Boolean) })),
      reminders: Schema.optional(Schema.Struct({ enabled: Schema.optional(Schema.Boolean) })),
      knowledge: Schema.optional(Schema.Struct({ enabled: Schema.optional(Schema.Boolean) })),
      drafts: Schema.optional(Schema.Struct({ enabled: Schema.optional(Schema.Boolean) })),
      autopilot: Schema.optional(
        Schema.Struct({
          enabled: Schema.optional(Schema.Boolean),
          scope: Schema.optional(Schema.Literals(AUTOPILOT_SCOPES)),
          whitelist: Schema.optional(Schema.Array(Schema.String)),
        }),
      ),
      style: Schema.optional(Schema.Struct({ enabled: Schema.optional(Schema.Boolean) })),
    }),
  ),
  cost: Schema.optional(
    Schema.Struct({
      analysisIntervalMinutes: Schema.optional(Schema.Number),
      batchSize: Schema.optional(Schema.Number),
      model: Schema.optional(Schema.String),
    }),
  ),
  knowledge: Schema.optional(
    Schema.Struct({
      builtin: Schema.optional(Schema.Boolean),
      paths: Schema.optional(Schema.Array(Schema.String)),
      mcpTools: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
  onboarding: Schema.optional(
    Schema.Struct({
      completed: Schema.optional(Schema.Boolean),
      completedAt: Schema.optional(Schema.Number),
      preset: Schema.optional(Schema.Literals(PRESET_NAMES)),
    }),
  ),
})

export const TrialLine = Schema.Struct({
  sender: Schema.String,
  text: Schema.String,
  at: Schema.Number,
})

export const Trial = Schema.Struct({
  messages: Schema.Number,
  sessions: Schema.Number,
  lines: Schema.Array(TrialLine),
})

export type HytState = typeof HytStateSchema.Type

export const HytIpc = Ipc.define({
  id: "changhong.hyt",
  state: HytStateSchema,
  methods: {
    /** 合并写入档案里出现的字段；返回写入后的完整 state。 */
    patch: { input: ProfilePatch, output: HytStateSchema },
    /** 重新读盘，用于外部改过档案或 bridge 状态变化后刷新。 */
    refresh: { output: HytStateSchema },
    /** 写主进程保存的本地路径：数据根目录与 bridge 可执行文件。 */
    setLocation: {
      input: Schema.Struct({
        chfileRoot: Schema.optional(Schema.String),
        bridgePath: Schema.optional(Schema.String),
      }),
      output: HytStateSchema,
    },
    /** 切换到另一个已登录账号，并把该账号写回档案。 */
    selectAccount: { input: Schema.Struct({ account: Schema.String }), output: HytStateSchema },
    /** 启动或停止 bridge，等待探测结束后返回最新状态。 */
    bridge: { input: Schema.Struct({ action: Schema.Literals(["start", "stop"]) }), output: Bridge },
    /** 按姓名或账号搜索通讯录，用于自动回复白名单。 */
    people: {
      input: Schema.Struct({ query: Schema.String, limit: Schema.Number }),
      output: Schema.Array(Person),
    },
    /** 用本地消息重新计算风格档案，不调用模型。 */
    restyle: { output: Schema.Struct({ summary: Schema.String, updatedAt: Schema.String }) },
    /** 删除知识库与风格档案，保留账号与行为设置。返回清掉的知识条目数。 */
    clearLearning: { output: Schema.Struct({ entries: Schema.Number }) },
    /** 最近 20 条消息的本地统计，不调用模型。 */
    trial: { output: Trial },
  },
})
