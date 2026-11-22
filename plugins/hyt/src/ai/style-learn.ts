import { loadProfile, mergeSamples, saveProfile } from "../style/profile.js"
import type { StyleProfile } from "../style/profile.js"
import { filterSamples } from "../style/profile.js"
import type { ChatMessage } from "../chat/message.js"

/**
 * 风格学习：只学本账号本人发出的文本，本地预过滤完再合并进档案，全过程不调模型。
 * 另外负责把档案写成一份 <account>-style 技能，供分析会话按需加载（不注册进全局技能列表）。
 */

export interface CollectOptions {
  readonly selfAccount: string
  /** AI 自己发出的消息 id（MsgId），永远不进样本。 */
  readonly aiSentIds?: ReadonlySet<string>
  /** 已经学过的归一化文本，跨批去重。 */
  readonly seen?: ReadonlySet<string>
  readonly limit?: number
}

/**
 * 只收本账号 MsgType=1（文本）的消息：别人的话学不到「我怎么说」，转发/图片也没有语气。
 * 预过滤规则在 ../style/profile.ts，这里只负责挑出「自己的文本」并带上 MsgId。
 */
export function collectStyleSamples(messages: readonly ChatMessage[], options: CollectOptions): string[] {
  const self = options.selfAccount.trim()
  if (self.length === 0) return []
  const own = messages.filter(
    (message) =>
      message.sender === self &&
      (message.msgType === 1 || message.msgType === 11) &&
      message.text.trim().length > 0,
  )
  const sorted = [...own].sort((left, right) => left.id - right.id)
  const window = options.limit === undefined ? sorted : sorted.slice(-Math.max(1, options.limit))
  return filterSamples(
    window.map((message) => ({ id: message.msgId, text: message.text })),
    {
      ...(options.aiSentIds === undefined ? {} : { aiSent: options.aiSentIds }),
      ...(options.seen === undefined ? {} : { seen: options.seen }),
    },
  )
}

/** 增量合并并落盘。空批次直接返回原档案，不写文件。 */
export async function learnStyle(
  dataDir: string,
  account: string,
  samples: readonly string[],
  now: string,
): Promise<{ profile: StyleProfile; learned: number }> {
  const profile = await loadProfile(dataDir, account)
  if (samples.length === 0) return { profile, learned: 0 }
  const merged = mergeSamples(profile, samples, now)
  await saveProfile(dataDir, account, merged)
  return { profile: merged, learned: samples.length }
}

export function styleSkillId(account: string) {
  return `${account.trim().toLowerCase()}-style`
}

export function styleSkillDescription(account: string) {
  return `「${account}」在虹云通的说话方式：语气、长度、表情率、开场收尾与口头习惯。起草回复或代写消息前加载，用来对齐语气。`
}

/**
 * 生成技能正文。frontmatter 只写 name/description：这份技能由插件按本机消息自动生成，
 * 不注册到全局技能列表，所以不带任何触发词，靠分析会话显式加载。
 */
export function renderStyleSkill(input: {
  readonly account: string
  readonly displayName?: string
  readonly profile: StyleProfile
  readonly now: string
}) {
  const name = (input.displayName ?? "").trim() || input.account
  const profile = input.profile
  const lines = [
    "---",
    `name: ${name}的说话方式`,
    `description: ${styleSkillDescription(input.account)}`,
    "---",
    "",
    `# ${name}的说话方式`,
    "",
    "这份文件由虹云通助手按本机消息自动生成，不要手改（重新学习会覆盖）。它描述的是**本人**怎么说话，不是给本人看的说明。",
    "",
    "## 硬指标",
    "",
    `- 语气：${profile.tone}`,
    `- 平均一条 ${Math.round(profile.avgLength)} 字；写回复时按这个长度，不要明显更长。`,
    `- 表情使用率 ${(profile.emojiRate * 100).toFixed(0)}%${profile.emojiRate < 0.05 ? "（基本不用表情）" : ""}。`,
    `- 标点累计：逗号 ${profile.punctuation.comma}、句号 ${profile.punctuation.period}、感叹号 ${profile.punctuation.exclamation}、问号 ${profile.punctuation.question}、省略号 ${profile.punctuation.ellipsis}。`,
    "",
    "## 常用说法",
    "",
    profile.greetings.length > 0 ? `- 开场：${profile.greetings.join("、")}` : "- 开场：没有固定开场，直接说事。",
    profile.closings.length > 0 ? `- 收尾：${profile.closings.join("、")}` : "- 收尾：没有固定收尾，说完就停。",
    profile.favoritePhrases.length > 0 ? `- 口头习惯：${profile.favoritePhrases.join("、")}` : "- 口头习惯：未统计到明显习惯。",
    "",
    "## 不要这样写",
    "",
    ...(profile.antiPatterns.length > 0
      ? profile.antiPatterns.map((pattern) => `- ${pattern}`)
      : ["- 不要用客服腔（「亲」「宝子」「很高兴为您服务」）。", "- 不要写长段落和分点清单。"]),
    "",
    "## 原话样本",
    "",
    ...(profile.examples.length > 0
      ? profile.examples.slice(-8).map((example) => `- ${example.text}`)
      : ["- 还没有采到样本。"]),
    "",
    "## 怎么用",
    "",
    "1. 只对齐语气和长度，不要整句照抄样本；样本里有具体人名、系统名时不要带进新回复。",
    "2. 内容仍然是本人的代理在说话：第一人称，不暴露 AI。",
    "3. 不确定的说法宁可用平实的短句，也不要模仿一个不像的「风格」。",
    "",
    `更新时间：${input.now}`,
    "",
  ]
  return lines.join("\n")
}

export async function writeStyleSkill(directory: string, account: string, content: string) {
  const path = `${directory}/${styleSkillId(account)}/SKILL.md`
  await Bun.write(path, content)
  return path
}
