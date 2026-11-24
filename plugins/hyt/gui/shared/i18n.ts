import type { Catalog } from "@aicraft/plugin/gui"

/**
 * 插件的中文文案。
 *
 * `gui/main.tsx` 目前还没有把 `i18n` 交给 `Plugin.define`，所以 `ctx.t` 会退回应用自己的语言表；
 * 未知 key 时 `ctx.t` 原样返回 key。`text()` 只在这一种情况下回落到本文件的中文表，
 * 一旦 main.tsx 接上 `catalog`，所有文案就改走宿主的翻译链路。
 */
export const zh: Record<string, string> = {
  "hyt.settings.title": "虹云通助手",
  "hyt.settings.description": "控制助手读哪些聊天、怎么回、花多少成本，以及它学到了什么。改动即时写回档案，不需要重启插件。",
  "hyt.settings.state.loading": "正在读取本地档案…",
  "hyt.settings.state.error": "读取档案失败：{{message}}",

  "hyt.section.account": "账号与连接",
  "hyt.section.behavior": "AI 行为",
  "hyt.section.cost": "成本",
  "hyt.section.knowledge": "知识库",
  "hyt.section.style": "风格",
  "hyt.section.privacy": "数据与隐私",

  "hyt.account.identity": "当前账号",
  "hyt.account.identity.unbound": "还没有识别到虹云通账号",
  "hyt.account.identity.description": "从本地 login.db 读取，账号目录用于消息、通讯录与风格档案。",
  "hyt.account.pick": "切换账号",
  "hyt.account.none": "未登录",
  "hyt.account.department": "部门：{{name}}",
  "hyt.account.department.unknown": "部门未知",
  "hyt.account.bridge": "消息连接",
  "hyt.account.bridge.description": "bridge 是本地收发消息的进程；只读聊天记录不需要它。",
  "hyt.account.bridge.start": "启动",
  "hyt.account.bridge.stop": "停止",
  "hyt.account.bridge.reconnect": "重连",
  "hyt.account.bridge.stopped": "未连接",
  "hyt.account.bridge.connecting": "连接中",
  "hyt.account.bridge.ready": "已连接",
  "hyt.account.bridge.restarting": "重连中",
  "hyt.account.bridge.failed": "连接失败",
  "hyt.account.bridge.error": "连接错误",
  "hyt.account.bridge.path": "bridge 可执行文件",
  "hyt.account.bridge.path.description": "留空时只连接已经运行的实例。",
  "hyt.account.bridge.path.placeholder": "/path/to/bridge",
  "hyt.account.root": "数据根目录",
  "hyt.account.root.description": "含 login.db 与各账号目录，留空按平台默认位置推断。",
  "hyt.account.root.placeholder": "留空使用默认位置",

  "hyt.role.title": "你的角色",
  "hyt.role.description": "角色决定助手默认关注什么，也决定提示词的措辞。",
  "hyt.role.it-ops": "运维",
  "hyt.role.tech-support": "技术支持",
  "hyt.role.engineering": "研发",
  "hyt.role.management": "管理",
  "hyt.role.business": "业务",
  "hyt.role.other": "其他",

  "hyt.scenes.title": "关注场景",
  "hyt.scenes.description": "只在你选的场景里主动做事，未选的场景不打扰你。",
  "hyt.scene.troubleshoot": "故障排查",
  "hyt.scene.troubleshoot.description": "群里的报错、异常与求助",
  "hyt.scene.task-intake": "任务收集",
  "hyt.scene.task-intake.description": "从聊天里认出待办与截止时间",
  "hyt.scene.duty-alerts": "值班告警",
  "hyt.scene.duty-alerts.description": "监控与告警消息的跟进",
  "hyt.scene.ticket-close": "工单闭环",
  "hyt.scene.ticket-close.description": "工单进展与回访",
  "hyt.scene.meeting": "会议沟通",
  "hyt.scene.meeting.description": "会议通知、纪要与待办",
  "hyt.scene.no-miss": "防漏读",
  "hyt.scene.no-miss.description": "被 @ 或私聊时提醒你",

  "hyt.capability.digest": "定时简报",
  "hyt.capability.digest.description": "按固定节奏汇总你没看的消息。",
  "hyt.capability.tasks": "任务与待办",
  "hyt.capability.tasks.description": "把聊天里的承诺整理成可勾选的待办。",
  "hyt.capability.reminders": "到期提醒",
  "hyt.capability.reminders.description": "临近截止时间提醒你。",
  "hyt.capability.knowledge": "知识库积累",
  "hyt.capability.knowledge.description": "把反复出现的问题与答案沉淀下来。",
  "hyt.capability.drafts": "自动草稿",
  "hyt.capability.drafts.description": "在输入框里备好回复，由你决定是否发送。",
  "hyt.capability.autopilot": "自动回复",
  "hyt.capability.autopilot.description": "只在允许的会话里直接发送，默认关闭。",
  "hyt.capability.style": "说话风格",
  "hyt.capability.style.description": "学习你的措辞，让草稿更像你。",

  "hyt.autopilot.scope": "托管范围",
  "hyt.autopilot.scope.description": "自动回复只作用于这里选定的会话。",
  "hyt.autopilot.off": "关闭",
  "hyt.autopilot.whitelist": "仅白名单",
  "hyt.autopilot.all": "全部会话",
  "hyt.autopilot.whitelist.title": "白名单",
  "hyt.autopilot.whitelist.description": "按姓名或账号搜索联系人，加入后才会自动回复。",
  "hyt.autopilot.whitelist.empty": "名单为空，自动回复不会作用于任何会话。",
  "hyt.autopilot.whitelist.search": "搜索联系人",
  "hyt.autopilot.whitelist.add": "加入白名单",
  "hyt.autopilot.whitelist.remove": "移出白名单",
  "hyt.autopilot.whitelist.noresult": "没有匹配的联系人。",

  "hyt.cost.interval": "分析间隔（分钟）",
  "hyt.cost.interval.description": "后台增量分析的间隔，1–1440 分钟。",
  "hyt.cost.batch": "每批条数",
  "hyt.cost.batch.description": "一次分析处理的样本条数，5–500。",
  "hyt.cost.model": "使用的模型",
  "hyt.cost.model.description": "留空跟随当前会话的模型。",
  "hyt.cost.model.placeholder": "跟随当前模型",
  "hyt.cost.estimate": "成本预估",
  "hyt.cost.estimate.description": "{{runs}} 次/天 × {{batch}} 条 ≈ 每天 {{total}} 条样本。实际消耗取决于模型与样本长度。",

  "hyt.knowledge.builtin": "内置知识库",
  "hyt.knowledge.builtin.description": "随插件发布的运维常识与工具用法。",
  "hyt.knowledge.paths": "本地知识目录",
  "hyt.knowledge.paths.description": "扫描目录里的 md / txt，按条目入库。",
  "hyt.knowledge.paths.empty": "还没有添加本地目录。",
  "hyt.knowledge.paths.add": "添加目录",
  "hyt.knowledge.mcp": "MCP 知识工具",
  "hyt.knowledge.mcp.description": "登记为知识来源的工具名，例如 server.tool。",
  "hyt.knowledge.mcp.empty": "还没有登记 MCP 工具。",
  "hyt.knowledge.mcp.add": "登记工具",
  "hyt.knowledge.mcp.placeholder": "server.tool",
  "hyt.knowledge.count": "已积累条目",
  "hyt.knowledge.count.description": "最近更新：{{time}}",
  "hyt.knowledge.count.none": "尚未积累条目，最近更新：—",
  "hyt.knowledge.remove": "移除",

  "hyt.style.summary": "风格摘要",
  "hyt.style.summary.description": "从你发出的文本里统计得出，不调用模型。",
  "hyt.style.refresh": "立即重新提炼",
  "hyt.style.refreshing": "正在提炼…",
  "hyt.style.refreshed": "已根据本地消息重新提炼。",
  "hyt.style.empty": "还没有学到这个账号的说话风格。",
  "hyt.style.updated": "更新于 {{time}}",

  "hyt.privacy.dataDir": "数据目录",
  "hyt.privacy.dataDir.description": "档案、知识库与风格样本都保存在这里。",
  "hyt.privacy.open": "打开目录",
  "hyt.privacy.password": "关于密码",
  "hyt.privacy.password.description": "虹云通客户端把密码以 base64 明文存在 login.db；助手只在需要连接时读取，不写日志、不复制到别处。",
  "hyt.privacy.clear": "清空学习数据",
  "hyt.privacy.clear.description": "删除已积累的知识条目与风格档案，保留账号与行为设置。",
  "hyt.privacy.clear.confirm": "这会删除知识库与风格档案，且无法撤销。",
  "hyt.privacy.clear.done": "学习数据已清空。",
  "hyt.privacy.clear.cancel": "取消",

  "hyt.common.save": "保存",
  "hyt.common.saving": "保存中…",
  "hyt.common.cancel": "取消",
  "hyt.common.close": "关闭",
  "hyt.common.retry": "重试",
  "hyt.common.none": "—",
  "hyt.common.unknown": "未知",

  "hyt.onboarding.title": "认识一下你的聊天",
  "hyt.onboarding.step": "第 {{current}} / {{total}} 步",
  "hyt.onboarding.back": "上一步",
  "hyt.onboarding.next": "下一步",
  "hyt.onboarding.skip": "跳过，用最安全的默认值",
  "hyt.onboarding.exit": "关闭引导",
  "hyt.onboarding.finish": "启用助手",
  "hyt.onboarding.finishing": "正在启用…",

  "hyt.onboarding.about.title": "先确认是你",
  "hyt.onboarding.about.description": "助手只读这个账号自己的聊天与通讯录。",
  "hyt.onboarding.about.account": "账号",
  "hyt.onboarding.about.name": "姓名",
  "hyt.onboarding.about.department": "部门",
  "hyt.onboarding.about.role": "你平时主要做什么？",
  "hyt.onboarding.about.role.description": "只影响默认场景与措辞，之后可以改。",

  "hyt.onboarding.scenes.title": "它能帮你做什么",
  "hyt.onboarding.scenes.description": "选你真正想让助手接手的场景，选得越准，打扰越少。",
  "hyt.onboarding.scenes.preset": "或者从一套预设开始",
  "hyt.onboarding.preset.ops": "运维值守",
  "hyt.onboarding.preset.ops.description": "盯故障与告警，按白名单代发，定时汇总值班消息。",
  "hyt.onboarding.preset.tasks": "任务助理",
  "hyt.onboarding.preset.tasks.description": "收任务、跟进工单，每天汇总一次，不自动发送。",
  "hyt.onboarding.preset.full": "全面托管",
  "hyt.onboarding.preset.full.description": "所有场景都启用，仍只按白名单自动发送。",
  "hyt.onboarding.preset.applied": "已套用「{{name}}」，可以继续微调。",

  "hyt.onboarding.bounds.title": "边界与成本",
  "hyt.onboarding.bounds.description": "默认只出草稿、不自动发送；所有分析都在本地按间隔批量进行。",
  "hyt.onboarding.bounds.autopilot": "自动发送范围",
  "hyt.onboarding.bounds.frequency": "简报频率",
  "hyt.onboarding.bounds.frequency.4": "每 4 小时",
  "hyt.onboarding.bounds.frequency.8": "每 8 小时",
  "hyt.onboarding.bounds.frequency.24": "每天一次",
  "hyt.onboarding.bounds.model": "使用的模型",
  "hyt.onboarding.bounds.knowledge": "知识来源",
  "hyt.onboarding.bounds.knowledge.builtin": "内置知识库",
  "hyt.onboarding.bounds.knowledge.paths": "本地目录 {{count}} 个",
  "hyt.onboarding.bounds.privacy": "虹云通把密码以 base64 明文存在本地；助手只在连接时读取，不写日志、不上传。",

  "hyt.onboarding.preview.title": "预览并启用",
  "hyt.onboarding.preview.description": "确认无误后启用；之后随时可以在设置里修改。",
  "hyt.onboarding.preview.role": "角色",
  "hyt.onboarding.preview.scenes": "场景",
  "hyt.onboarding.preview.digest": "简报",
  "hyt.onboarding.preview.autopilot": "自动发送",
  "hyt.onboarding.preview.knowledge": "知识库",
  "hyt.onboarding.preview.style": "风格学习",
  "hyt.onboarding.preview.on": "开",
  "hyt.onboarding.preview.off": "关",
  "hyt.onboarding.trial": "生成最近 20 条试跑简报",
  "hyt.onboarding.trial.description": "只在本地统计，不调用模型、不消耗 token。",
  "hyt.onboarding.trial.loading": "正在统计…",
  "hyt.onboarding.trial.empty": "最近没有可统计的消息。",
  "hyt.onboarding.trial.summary": "最近 {{messages}} 条消息，来自 {{sessions}} 个会话。",
  "hyt.onboarding.trial.retry": "重新统计",

  "hyt.onboarding.done.title": "已经启用",
  "hyt.onboarding.done.description": "助手会在你选的场景里安静地工作；需要时从这里打开设置。",
  "hyt.onboarding.done.close": "完成",
}

/** 宿主读取的 catalog：英文位也用中文，保证任何语言下都能读到这套文案。 */
export const catalog: Catalog = { en: zh, zh }

/**
 * 先读宿主翻译，拿不到再读本地中文表。
 *
 * `ctx.t` 在没有 catalog 时会把 key 原样返回，这个判断就是那条回落路径。
 */
export function text(ctx: { t(key: string, params?: Record<string, string | number | boolean>): string }, key: string, params?: Record<string, string | number | boolean>) {
  const translated = ctx.t(key, params)
  const template = translated === key ? (zh[key] ?? key) : translated
  if (params === undefined) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}
