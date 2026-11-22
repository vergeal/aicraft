import { Option, Schema } from "effect"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { emojiCount, isEmojiOnly, isLinkOnly, normalizeText } from "../text.js"

/**
 * 用户说话风格档案：<plugin data>/hyt/style/<account>.json。
 * 只统计本账号发出的 MsgType=1 文本；预过滤是纯规则，合并样本也不需要模型。
 * 详细规则见 ../style/README.md。
 */

export interface StyleExample {
  readonly text: string
  readonly at: string
}

export interface StylePunctuation {
  readonly comma: number
  readonly period: number
  readonly exclamation: number
  readonly question: number
  readonly ellipsis: number
}

export interface StyleProfile {
  readonly tone: string
  readonly avgLength: number
  readonly emojiRate: number
  readonly punctuation: StylePunctuation
  /** 常用开场，例如「好的」「收到」。 */
  readonly greetings: readonly string[]
  /** 常用收尾，例如「谢谢」「辛苦了」。 */
  readonly closings: readonly string[]
  readonly favoritePhrases: readonly string[]
  readonly examples: readonly StyleExample[]
  /** 不建议模仿的写法，由统计推出，例如「不用长段落」。 */
  readonly antiPatterns: readonly string[]
  readonly updatedAt: string
}

export const Profile = Schema.Struct({
  tone: Schema.String,
  avgLength: Schema.Number,
  emojiRate: Schema.Number,
  punctuation: Schema.Struct({
    comma: Schema.Number,
    period: Schema.Number,
    exclamation: Schema.Number,
    question: Schema.Number,
    ellipsis: Schema.Number,
  }),
  greetings: Schema.Array(Schema.String),
  closings: Schema.Array(Schema.String),
  favoritePhrases: Schema.Array(Schema.String),
  examples: Schema.Array(Schema.Struct({ text: Schema.String, at: Schema.String })),
  antiPatterns: Schema.Array(Schema.String),
  updatedAt: Schema.String,
})

const decodeProfile = Schema.decodeUnknownOption(Profile)

export const GREETINGS = ["好的", "好嘞", "收到", "在的", "来了", "您好", "你好", "哈喽", "嗯嗯", "稍等", "我看下", "安排"]
export const CLOSINGS = ["谢谢", "多谢", "辛苦了", "感谢", "再见", "拜拜", "晚安", "有问题随时说", "有事找我", "先这样"]

const MAX_EXAMPLES = 30
const SMOOTHING = 0.3

export function emptyProfile(now = new Date().toISOString()): StyleProfile {
  return {
    tone: "未知",
    avgLength: 0,
    emojiRate: 0,
    punctuation: { comma: 0, period: 0, exclamation: 0, question: 0, ellipsis: 0 },
    greetings: [],
    closings: [],
    favoritePhrases: [],
    examples: [],
    antiPatterns: [],
    updatedAt: now,
  }
}

export function stylePath(dataDir: string, account: string) {
  return join(dataDir, "hyt", "style", `${account}.json`)
}

export async function loadProfile(dataDir: string, account: string): Promise<StyleProfile> {
  const file = Bun.file(stylePath(dataDir, account))
  if (!(await file.exists())) return emptyProfile()
  const decoded = decodeProfile(await file.json().catch(() => undefined))
  return Option.isSome(decoded) ? decoded.value : emptyProfile()
}

export async function saveProfile(dataDir: string, account: string, profile: StyleProfile) {
  const path = stylePath(dataDir, account)
  await mkdir(join(dataDir, "hyt", "style"), { recursive: true })
  await writeFile(`${path}.tmp`, JSON.stringify(profile, null, 2) + "\n", "utf8")
  await rename(`${path}.tmp`, path)
}

export interface Sample {
  readonly id?: number | string
  readonly text: string
}

export interface FilterOptions {
  /** 已经学过的文本（归一化后），用于跨批去重。 */
  readonly seen?: ReadonlySet<string>
  /** AI 自己发出的消息 id，永不进入样本。 */
  readonly aiSent?: ReadonlySet<string>
}

/**
 * 预过滤：<4 字、纯链接、纯表情、批内重复、已学过、AI 自己发出的都丢掉。
 * 返回的是保留顺序的原始文本，调用方不需要再判一次。
 */
export function filterSamples(samples: readonly Sample[], options: FilterOptions = {}): string[] {
  const seen = new Set(options.seen ?? [])
  return samples.flatMap((sample) => {
    const text = sample.text.trim()
    if (sample.id !== undefined && options.aiSent?.has(String(sample.id)) === true) return []
    if (!isLearnable(text)) return []
    const key = normalizeText(text)
    if (seen.has(key)) return []
    seen.add(key)
    return [text]
  })
}

export function isLearnable(text: string) {
  const trimmed = text.trim()
  if (trimmed.length < 4) return false
  if (isLinkOnly(trimmed)) return false
  if (isEmojiOnly(trimmed)) return false
  return true
}

/** 增量合并：数值指标用 0.3 的平滑权重，列表按出现顺序去重后截断。不调用模型。 */
export function mergeSamples(profile: StyleProfile, samples: readonly string[], now: string): StyleProfile {
  const texts = samples.map((sample) => sample.trim()).filter((sample) => sample.length > 0)
  if (texts.length === 0) return profile

  const averageLength = texts.reduce((sum, text) => sum + text.length, 0) / texts.length
  const emojiRate = texts.reduce((sum, text) => sum + (emojiCount(text) > 0 ? 1 : 0), 0) / texts.length
  const batchPunctuation = countPunctuation(texts)

  const avgLength = smooth(profile.avgLength, averageLength)
  const emoji = smooth(profile.emojiRate, emojiRate)

  return {
    ...profile,
    tone: deriveTone(avgLength, emoji, batchPunctuation.exclamation),
    avgLength,
    emojiRate: emoji,
    punctuation: {
      comma: countAll(profile.punctuation.comma, batchPunctuation.comma),
      period: countAll(profile.punctuation.period, batchPunctuation.period),
      exclamation: countAll(profile.punctuation.exclamation, batchPunctuation.exclamation),
      question: countAll(profile.punctuation.question, batchPunctuation.question),
      ellipsis: countAll(profile.punctuation.ellipsis, batchPunctuation.ellipsis),
    },
    greetings: mergeList(profile.greetings, detected(texts, "start"), 6),
    closings: mergeList(profile.closings, detected(texts, "end"), 6),
    favoritePhrases: mergeList(profile.favoritePhrases, phrases(texts), 10),
    examples: mergeExamples(profile.examples, texts, now),
    antiPatterns: deriveAntiPatterns(avgLength, emoji, batchPunctuation),
    updatedAt: now,
  }
}

/** 给工具/界面用的一段摘要，不参与判定。 */
export function describeProfile(profile: StyleProfile) {
  if (profile.examples.length === 0 && profile.tone === "未知") return "还没有学到这个账号的说话风格。"
  const lines = [
    `语气：${profile.tone}｜平均 ${Math.round(profile.avgLength)} 字｜表情使用率 ${(profile.emojiRate * 100).toFixed(0)}%`,
    profile.greetings.length > 0 ? `常用开场：${profile.greetings.join("、")}` : "",
    profile.closings.length > 0 ? `常用收尾：${profile.closings.join("、")}` : "",
    profile.favoritePhrases.length > 0 ? `口头习惯：${profile.favoritePhrases.join("、")}` : "",
    profile.antiPatterns.length > 0 ? `避免：${profile.antiPatterns.join("；")}` : "",
    profile.examples.length > 0 ? `最近说法：${profile.examples.slice(-3).map((item) => item.text).join(" / ")}` : "",
  ]
  return lines.filter(Boolean).join("\n")
}

function isGreetingStart(text: string) {
  return GREETINGS.find((greeting) => text.startsWith(greeting)) ?? ""
}

function isClosingEnd(text: string) {
  return CLOSINGS.find((closing) => text.endsWith(closing)) ?? ""
}

function detected(texts: readonly string[], position: "start" | "end") {
  const matches = texts
    .map((text) => (position === "start" ? isGreetingStart(text) : isClosingEnd(text)))
    .filter((value) => value.length > 0)
  return [...new Set(matches)]
}

/** 口头习惯：批内重复出现 2 次以上的 2-gram，去掉纯语气词。 */
function phrases(texts: readonly string[]) {
  const counts = new Map<string, number>()
  for (const text of texts) {
    for (const run of text.match(/[\u4e00-\u9fff]+/g) ?? []) {
      for (let index = 0; index < run.length - 1; index++) {
        const gram = run.slice(index, index + 2)
        counts.set(gram, (counts.get(gram) ?? 0) + 1)
      }
    }
  }
  return [...counts.entries()]
    .filter(([gram, count]) => count >= 2 && !STOP_PHRASES.has(gram))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([gram]) => gram)
}

const STOP_PHRASES = new Set(["我们", "你们", "他们", "这个", "那个", "可以", "一下", "什么", "怎么", "现在", "就是", "不是"])

function deriveTone(avgLength: number, emojiRate: number, exclamation: number) {
  if (emojiRate >= 0.35 || exclamation >= 3) return "热情"
  if (avgLength >= 40) return "详细"
  if (avgLength <= 12) return "简洁"
  return "平和"
}

function deriveAntiPatterns(avgLength: number, emojiRate: number, punctuation: StylePunctuation) {
  const patterns: string[] = []
  if (emojiRate < 0.05) patterns.push("不要用表情符号")
  if (avgLength <= 14) patterns.push("不要写长段落")
  if (punctuation.exclamation === 0) patterns.push("不用感叹号")
  if (punctuation.ellipsis === 0) patterns.push("不用省略号")
  return patterns
}

function countPunctuation(texts: readonly string[]): StylePunctuation {
  const count = (pattern: RegExp) => texts.reduce((sum, text) => sum + (text.match(pattern)?.length ?? 0), 0)
  return {
    comma: count(/[，,]/g),
    period: count(/[。.]/g),
    exclamation: count(/[！!]/g),
    question: count(/[？?]/g),
    ellipsis: count(/(?:…|\.{3,})/g),
  }
}

function smooth(previous: number, next: number) {
  if (previous <= 0) return round(next)
  return round(previous * (1 - SMOOTHING) + next * SMOOTHING)
}

function countAll(previous: number, next: number) {
  return previous + next
}

function mergeList(existing: readonly string[], incoming: readonly string[], max: number) {
  return [...new Set([...existing, ...incoming])].slice(0, max)
}

function mergeExamples(existing: readonly StyleExample[], texts: readonly string[], now: string) {
  const merged = [...existing, ...texts.map((text) => ({ text, at: now }))]
  const seen = new Set<string>()
  return merged
    .filter((example) => {
      const key = normalizeText(example.text)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(-MAX_EXAMPLES)
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
