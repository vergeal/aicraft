import type { Catalog } from "@opencode/plugin/gui"

/**
 * 聊天主界面的中文文案。
 *
 * 与 `shared/i18n.ts` 分开，避免两个会话同时改同一个文件；`gui/main.tsx` 会把两份合并成一个 catalog，
 * 万一宿主没拿到 catalog，`text()` 仍能回落到这里的中文表。
 */
export const zh: Record<string, string> = {
  "hyt.chat.nav": "虹云通",
  "hyt.chat.brand.badge": "运维助手",
  "hyt.chat.title": "虹云通消息",
  "hyt.chat.subtitle": "{{account}} · 本地聊天记录",
  "hyt.chat.subtitle.none": "本地聊天记录",

  "hyt.chat.state.loading": "正在读取本地消息…",
  "hyt.chat.state.title.no-account": "还没有识别到虹云通账号",
  "hyt.chat.state.body.no-account": "本地没有登录记录。先在虹云通客户端登录，再回到这里重新读取。",
  "hyt.chat.state.title.no-data": "这个账号还没有本地消息",
  "hyt.chat.state.body.no-data": "打开虹云通客户端收发一次消息，或检查数据目录是否指向了正确的位置。",
  "hyt.chat.state.title.error": "读取本地消息失败",
  "hyt.chat.state.body.error": "文件可能在客户端写入时被占用，稍后重试即可。",
  "hyt.chat.state.title.empty": "还没有收到消息",
  "hyt.chat.state.body.empty": "消息库是空的。等第一条消息进来，这里就会显示会话。",
  "hyt.chat.state.detail": "读取位置",
  "hyt.chat.action.retry": "重新读取",
  "hyt.chat.action.settings": "打开设置",
  "hyt.chat.action.refresh": "刷新",

  "hyt.chat.status.bridge.ready": "消息连接正常",
  "hyt.chat.status.bridge.missing": "消息连接未启动，只能查看历史",
  "hyt.chat.status.autopilot.on": "AI 托管已开启",
  "hyt.chat.status.autopilot.off": "AI 托管未开启",
  "hyt.chat.status.whitelist": "白名单 {{count}} 个会话",

  "hyt.chat.search.label": "搜索消息",
  "hyt.chat.search.placeholder": "搜索消息、联系人或文件",
  "hyt.chat.search.empty": "没有匹配的消息。",
  "hyt.chat.search.searching": "正在搜索…",
  "hyt.chat.search.count": "{{count}} 条命中",
  "hyt.chat.search.clear": "清除搜索",

  "hyt.chat.sessions.title": "会话",
  "hyt.chat.sessions.empty": "还没有会话。",
  "hyt.chat.sessions.group": "群聊",
  "hyt.chat.sessions.groups": "群聊",
  "hyt.chat.sessions.direct": "单聊",
  "hyt.chat.sessions.notice": "通知消息",
  "hyt.chat.sessions.at": "@我",
  "hyt.chat.sessions.filter.unread": "未读消息",
  "hyt.chat.sessions.filter.unread.hint": "只看还有未读的会话",
  "hyt.chat.sessions.filter.at": "@我的消息",
  "hyt.chat.sessions.filter.at.hint": "只看有人 @ 我的会话",
  "hyt.chat.sessions.filter.empty": "这个筛选下没有会话。",

  "hyt.chat.user.online": "在线",
  "hyt.chat.user.offline": "只读历史",
  "hyt.chat.head.ai": "AI 已开启",
  "hyt.chat.head.messages": "今日 {{count}} 条消息",

  "hyt.chat.messages.pick": "从左侧选一个会话开始",
  "hyt.chat.messages.empty": "这个会话还没有消息。",
  "hyt.chat.messages.loadMore": "载入更早的消息",
  "hyt.chat.messages.loadingMore": "正在载入更早的消息…",
  "hyt.chat.messages.toEnd": "回到最新",
  "hyt.chat.day.today": "今天",
  "hyt.chat.day.yesterday": "昨天",

  "hyt.chat.msg.voice": "语音消息",
  "hyt.chat.msg.voice.hint": "本地暂不支持播放，可在客户端里收听。",
  "hyt.chat.msg.video": "视频消息",
  "hyt.chat.msg.video.hint": "本地暂不支持播放，可在客户端里查看。",
  "hyt.chat.msg.image.missing": "图片不在本地",
  "hyt.chat.msg.image.open": "查看原图",
  "hyt.chat.msg.file.open": "在文件夹中显示",
  "hyt.chat.msg.merge": "合并转发",
  "hyt.chat.msg.merge.expand": "展开",
  "hyt.chat.msg.merge.collapse": "收起",
  "hyt.chat.msg.merge.empty": "这条合并转发读不到内容。",
  "hyt.chat.msg.merge.image": "[图片]",
  "hyt.chat.msg.recall": "撤回了一条消息",
  "hyt.chat.msg.call": "通话",
  "hyt.chat.msg.notice": "系统通知",
  "hyt.chat.msg.other": "暂不支持的消息类型",
  "hyt.chat.msg.atMe": "@ 了你",
  "hyt.chat.msg.self": "我",

  "hyt.chat.composer.placeholder": "输入消息，Enter 发送，Shift + Enter 换行",
  "hyt.chat.composer.send": "发送",
  "hyt.chat.composer.ai": "让 AI 起草",
  "hyt.chat.composer.attach": "附件",
  "hyt.chat.composer.emoji": "表情",
  "hyt.chat.composer.mention": "@ 某人",
  "hyt.chat.composer.mentionEmpty": "通讯录里没有匹配的人。",
  "hyt.chat.composer.disabled.no-session": "先选择一个会话再发送",
  "hyt.chat.composer.disabled.pending": "正在发送…",
  "hyt.chat.composer.notWired": "消息通道目前只支持文本，发文件请直接在客户端里发。",
  "hyt.chat.composer.rejected": "没有发送：{{reason}}",
  "hyt.chat.composer.empty": "先输入内容",

  "hyt.chat.ai.title": "AI 助手",
  "hyt.chat.ai.entry.sub": "{{drafts}} 条草稿 · {{knowledge}} 条知识命中",
  "hyt.chat.ai.tag": "AI",
  "hyt.chat.ai.draft.basis": "依据当前会话生成",
  "hyt.chat.ai.drafts.refresh": "重新检查",
  "hyt.chat.ai.commands": "AI 快捷指令",
  "hyt.chat.ai.cmd.summary": "总结",
  "hyt.chat.ai.cmd.summary.hint": "提炼本次会话的要点",
  "hyt.chat.ai.cmd.todo": "待办",
  "hyt.chat.ai.cmd.todo.hint": "从对话里提取任务",
  "hyt.chat.ai.cmd.translate": "翻译",
  "hyt.chat.ai.cmd.translate.hint": "翻译选中的消息",
  "hyt.chat.ai.cmd.draft": "草稿",
  "hyt.chat.ai.cmd.draft.hint": "按你的语气起草回复",
  "hyt.chat.ai.autopilot": "AI 托管",
  "hyt.chat.ai.runtime": "运行状态",  "hyt.chat.ai.autopilot.on": "已开启",
  "hyt.chat.ai.autopilot.off": "未开启",
  "hyt.chat.ai.autopilot.hint": "托管范围与白名单在设置里调整。",
  "hyt.chat.ai.drafts": "草稿",
  "hyt.chat.ai.drafts.empty": "还没有草稿。开启自动草稿后，助手会把回复备在这里。",
  "hyt.chat.ai.drafts.empty.title": "还没有 AI 草稿",
  "hyt.chat.ai.drafts.empty.body": "当助手判断某条消息值得回复时，草稿会出现在这里。",
  "hyt.chat.ai.drafts.empty.action": "重新检查",
  "hyt.chat.ai.drafts.use": "填入输入框",
  "hyt.chat.ai.knowledge": "知识库命中",
  "hyt.chat.ai.knowledge.empty": "当前会话没有命中知识库。",
  "hyt.chat.ai.knowledge.empty.title": "还没有知识库命中",
  "hyt.chat.ai.knowledge.empty.body": "和当前会话相关的条目会随消息一起出现在这里。",
  "hyt.chat.ai.members": "可 @ 的人",
  "hyt.chat.ai.members.count": "通讯录 {{count}} 人",
  "hyt.chat.members.title": "通讯录",
  "hyt.chat.members.count": "{{count}} 人",
  "hyt.chat.members.group": "成员 — {{count}}",
  "hyt.chat.members.empty": "还没有通讯录数据，等客户端同步联系人。",
  "hyt.chat.ai.readonly": "只读：草稿与知识库由助手在后台写入。",
}

export const catalog: Catalog = { en: zh, zh }

/** 先读宿主翻译，拿不到再读本地中文表；`ctx.t` 没有 catalog 时会把 key 原样返回。 */
export function text(
  ctx: { t(key: string, params?: Record<string, string | number | boolean>): string },
  key: string,
  params?: Record<string, string | number | boolean>,
) {
  const translated = ctx.t(key, params)
  const template = translated === key ? (zh[key] ?? key) : translated
  if (params === undefined) return template
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}
