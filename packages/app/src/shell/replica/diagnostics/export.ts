import type { LocationRef } from "@opencode/client/promise"
import {
  diagnosisPrompt,
  diagnostics,
  summarize,
  type DiagnosisSource,
  type DiagnosticsDocument,
} from "@opencode/diagnostics"
import type { Platform } from "@/runtime/platform/platform"
import type { ServerCtx } from "@/runtime/server/runtime"
import type { ServerConnection } from "@/runtime/server/registry"
import { sessionHref } from "@/shell/routes/session"
import { captureMainDiagnostics } from "./main"
import { captureServerDiagnostics } from "./server"

// Turns the in-memory capture into a file, then starts a session that knows where the file is and what
// is inside it. The prompt is data, not UI copy: it is the first message the user sees in the new session.

const SOURCE_FILES: DiagnosisSource[] = [
  ["packages/diagnostics/src/collector.ts", "采集生命周期、mark/冻结/分层保留的接线、dump 组装"],
  ["packages/diagnostics/src/buffer.ts", "环形缓冲的裁剪与 per-source 统计"],
  [
    "packages/diagnostics/src/recorder/index.ts",
    "采集域注册表（dom/input/errors/console/network/navigation/performance/layout）",
  ],
  ["packages/diagnostics/src/findings.ts", "sections.findings 的派生规则：每种 kind 的阈值、上限与启发式边界"],
  [
    "packages/diagnostics/src/recorder/scroll-trace.ts",
    "scroll.program 的来源：包装哪些滚动入口、32px/归零阈值、调用栈如何过滤",
  ],
  ["packages/diagnostics/src/freeze.ts", "自动冻结的四个阈值与 3 份上限"],
  ["packages/diagnostics/src/retention.ts", "温/冷两层的窗口、降采样规则与丢弃计数"],
  ["packages/diagnostics/src/snapshot.ts", "sections.state 的裁剪预算、敏感键脱敏与结构 diff"],
  ["packages/diagnostics/src/report.ts", "诊断会话首条消息：数据结构、查询示例、排查顺序"],
  ["packages/app/src/shell/replica/diagnostics/export.ts", "这份 dump 的写盘、深度裁剪与会话创建流程"],
  ["packages/app/src/shell/replica/diagnostics/panel.tsx", "性能面板：实时时间线、severity 筛选、mark 与导出深度"],
  ["packages/app/src/shell/replica/perf-monitor.tsx", "性能面板外壳与「AGENT 诊断」按钮"],
  ["packages/app/src/shell/replica/titlebar.tsx", "面板在桌面标题栏中的入口"],
  ["packages/desktop/src/main/native/logging.ts", "writeDiagnostics：主进程写入磁盘的实现"],
]

/**
 * How much of the layered retention travels with the dump. `hot` is the default because the hot layer is what
 * the summary and the panel already describe; the longer layers only make the file bigger, so they are opt-in.
 */
export const DIAGNOSIS_DEPTHS = ["hot", "warm", "cold"] as const

export type DiagnosisDepth = (typeof DIAGNOSIS_DEPTHS)[number]

const DEPTH_NOTES: Record<DiagnosisDepth, string> = {
  hot: "本次导出深度为 hot：sections.retention 已省略，可用的只有 events 里的最近 60 秒。",
  warm: "本次导出深度为 warm：sections.retention 只保留 warm（最近 10 分钟降采样），cold 已省略。",
  cold: "本次导出深度为 cold：sections.retention 同时保留 warm（最近 10 分钟降采样）与 cold（最近 60 分钟故障事件）。",
}

/** Drops the retention layers a caller did not ask for; `cold` keeps the dump exactly as the collector built it. */
export function trimForDepth(dump: DiagnosticsDocument, depth: DiagnosisDepth): DiagnosticsDocument {
  if (depth === "cold") return dump
  const source = recordOf(dump.sections.retention)
  if (!source) return dump

  const sections = { ...dump.sections }
  if (depth === "hot") delete sections.retention
  else {
    // Copy before deleting: the dump's own section must survive so a caller can trim the same dump twice.
    const retention = { ...source }
    delete retention.cold
    sections.retention = retention
  }

  return { ...dump, sections }
}

function recordOf(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return
  return value as Record<string, unknown>
}

function reasonText(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
}

export async function runAgentDiagnosis(input: {
  platform: Platform
  ctx: ServerCtx
  server: ServerConnection.Key
  session?: { id: string; location: LocationRef }
  route: string
  title: string
  depth?: DiagnosisDepth
  navigate: (href: string) => void
}) {
  const write = input.platform.writeDiagnostics

  if (!write) throw new Error("Diagnostics export is unavailable in this build")

  const extra = {
    route: input.route,
    sessionID: input.session?.id,
    server: input.server,
    app: {
      version: input.platform.version,
      platform: input.platform.platform,
      os: input.platform.platform === "desktop" ? input.platform.os : undefined,
    },
  }
  // Both halves are fetched first: a section provider is synchronous, so the dump can only read what
  // already sits in `sections`. A missing endpoint or a rejected request leaves that section empty
  // instead of failing the export, so record why that section is absent.
  const [main, server] = await Promise.allSettled([
    captureMainDiagnostics(input.platform),
    captureServerDiagnostics(input.ctx),
  ])
  const depth = input.depth ?? "hot"
  const dump = trimForDepth(diagnostics.dump(extra), depth)
  // The summary is derived from the finished document, so it has to be attached after the dump is built.
  // It is what the diagnosing agent reads first, and it costs one pass over the events already in memory.
  dump.sections.findings = summarize(dump)
  // A trimmed section would otherwise read as "the retention layer was empty" instead of "this export skipped it".
  dump.notes.push(DEPTH_NOTES[depth])
  // Without this, a failed capture reads as "the section was empty" rather than "the section is missing".
  if (main.status === "rejected") dump.notes.push(`sections.main 采集失败，本次没有这一段：${reasonText(main.reason)}`)
  if (server.status === "rejected")
    dump.notes.push(`sections.server 采集失败，本次没有这一段：${reasonText(server.reason)}`)
  const name = `opencode-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  const path = await write({ name, content: JSON.stringify(dump) })

  const created = input.ctx.data.session.create({
    title: input.title,
    location: input.session?.location,
  })

  await created.request
  await input.ctx.data.session.prompt({
    sessionID: created.id,
    text: diagnosisPrompt({
      path,
      events: dump.capture.events,
      dropped: dump.capture.dropped,
      sources: SOURCE_FILES,
    }),
    delivery: "steer",
  })
  input.navigate(sessionHref(input.server, created.id))

  return { path, sessionID: created.id }
}
