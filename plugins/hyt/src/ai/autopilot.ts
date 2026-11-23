import type { HytProfile } from "../profile/schema.js"
import type { Settings } from "../settings.js"
import { isAllowed } from "../service.js"

/**
 * 托管发送判定。默认关闭；开启后仍要过三道硬校验，任何一道不过就只出草稿：
 *   1. profile.capabilities.autopilot 开启且 scope ≠ off；
 *   2. 会话（或私聊对方账号）在 profile 的白名单里；
 *   3. METAINF 里 configuration 的 whitelist 允许这个会话——与 hyt.send.text 用同一套判断，不另立口径。
 * 这是一个纯函数：不读文件、不发消息，判定结果与原因都回给调用方展示。
 */

export type AutopilotCode =
  | "disabled"
  | "scope-off"
  | "configuration-disabled"
  | "empty-configuration-whitelist"
  | "not-in-configuration-whitelist"
  | "not-in-profile-whitelist"
  | "allowed"

export interface AutopilotDecision {
  readonly send: boolean
  readonly code: AutopilotCode
  readonly reason: string
}

export interface AutopilotInput {
  readonly profile: HytProfile
  readonly sessionId: string
  readonly selfAccount: string
  /** 私聊对方的账号；群聊时省略。 */
  readonly peerAccount?: string
  readonly settings: Pick<Settings, "whitelist" | "autoReplyEnabled">
}

export function decideAutopilot(input: AutopilotInput): AutopilotDecision {
  const autopilot = input.profile.capabilities.autopilot
  if (!autopilot.enabled) return denied("disabled", "托管关闭：只生成草稿。")
  if (autopilot.scope === "off") return denied("scope-off", "托管范围是 off：只生成草稿。")
  if (!input.settings.autoReplyEnabled)
    return denied("configuration-disabled", "插件设置里的「AI 托管」没开：只生成草稿。")
  if (input.settings.whitelist.length === 0)
    return denied("empty-configuration-whitelist", "插件设置的白名单为空，拒绝发送。")
  if (!isAllowed(input.settings.whitelist, input.sessionId, input.selfAccount))
    return denied("not-in-configuration-whitelist", `会话 ${input.sessionId} 不在插件设置的白名单里，只生成草稿。`)

  if (autopilot.scope === "all") return { send: true, code: "allowed", reason: "托管范围为全部会话，且已过白名单校验。" }

  const scoped = autopilot.whitelist
  const matched = scoped.some(
    (entry) => entry === input.sessionId || (input.peerAccount !== undefined && entry === input.peerAccount),
  )
  if (!matched)
    return denied(
      "not-in-profile-whitelist",
      scoped.length === 0 ? "托管白名单为空：只生成草稿。" : `会话 ${input.sessionId} 不在托管白名单里：只生成草稿。`,
    )
  return { send: true, code: "allowed", reason: "命中托管白名单，且已过插件设置的白名单校验。" }
}

function denied(code: AutopilotCode, reason: string): AutopilotDecision {
  return { send: false, code, reason }
}
