/**
 * AI 能力层：提示词、风格学习、任务识别、草稿、托管判定、批次循环、到期提醒与工具注册。
 * 数据层在 ../profile、../style、../tasks、../knowledge，这里只做「怎么用这些数据」。
 */

export {
  DEFAULT_MAX_CHARS,
  DEFAULT_MAX_DRAFTS,
  DEFAULT_THRESHOLD,
  FORBIDDEN,
  SCENE_PROMPTS,
  buildBatchInstruction,
  buildSystemPrompt,
  describePrompt,
  roleLabel,
  sceneLabel,
} from "./prompt.js"
export type { PromptOptions } from "./prompt.js"
export { DEFAULT_SIMILARITY, bestAnswer, knowledgeCandidate, matchAnswer, previewAdmission } from "./knowledge.js"
export type { AnswerMatch } from "./knowledge.js"
export { atEveryone, dedupeBatch, isAtSelf, isDirectSession, judge, signalScore, summarize } from "./prefilter.js"
export type { FilterOptions, SkipReason, Verdict } from "./prefilter.js"
export { collectStyleSamples, learnStyle, renderStyleSkill, styleSkillDescription, styleSkillId, writeStyleSkill } from "./style-learn.js"
export { findCandidates, formatLocal, isDue, parseDueAt, titleOf } from "./tasks-detect.js"
export type { TaskCandidate } from "./tasks-detect.js"
export { checkReplies, loadDrafts, markDraft, pendingDrafts, putDraft, saveDrafts, visualLength } from "./drafts.js"
export type { Draft, DraftStatus } from "./drafts.js"
export { decideAutopilot } from "./autopilot.js"
export type { AutopilotDecision } from "./autopilot.js"
export { analyzeOnce, capabilityList, latestBatch, loadBatch, startAnalysisLoop } from "./loop.js"
export type { AnalysisSink, BatchFile, BatchResult } from "./loop.js"
export { pollReminders, reminderText, selectDue, startReminders } from "./reminders.js"
export type { HostSchedule, ReminderPort } from "./reminders.js"
export { registerAI } from "./tools.js"
