import type { SessionMessageAssistant, SessionMessageInfo } from "@opencode/client/promise"
import { CURRENT_SESSION_ID } from "../storybook/current-session-fixtures"
import { AnswerPage } from "./page"

export default {
  title: "OpenCode/Conversation/Answer page",
  id: "answer-page",
  component: AnswerPage,
  parameters: { layout: "fullscreen" },
}

type Content = SessionMessageAssistant["content"][number]

const TIME = Date.now() - 5 * 60_000

const assistant = (id: string, content: Content[], created: number, completed?: number): SessionMessageInfo => {
  const time = completed === undefined ? { created } : { created, completed }

  return { id, type: "assistant", agent: "build", model: { id: "claude-sonnet-4", providerID: "anthropic" }, content, time }
}

const reasoning = (text: string): Content => ({ type: "reasoning", text, time: { created: TIME, completed: TIME } })

const tool = (id: string, name: string, input: Record<string, string>, status: "completed" | "error"): Content => ({
  type: "tool",
  id,
  name,
  state:
    status === "error"
      ? { status, input, error: { message: "Command exited with code 1" }, metadata: {} }
      : { status, input, content: [{ type: "text", text: "ok" }], metadata: {} },
  time: { created: TIME, completed: TIME },
})

const settled: SessionMessageInfo[] = [
  { id: "msg_user_1", type: "user", text: "重写回答区的折叠逻辑，并验证流式增量不会重建行。", time: { created: TIME } },
  assistant(
    "msg_assistant_1",
    [
      reasoning("先读一下当前的投影实现，确认折叠的边界。"),
      tool("tool_read", "read", { filePath: "packages/session-ui/src/answer/project.ts" }, "completed"),
      tool("tool_grep", "grep", { pattern: "foldedTurn" }, "completed"),
      { type: "text", text: "折叠边界确认完毕：`processStart` 到 `answer` 之间是过程区。" },
    ],
    TIME + 1_000,
    TIME + 13_000,
  ),
  { id: "msg_notice_1", type: "system", text: "上下文注入 · AGENTS.md, README.md", time: { created: TIME + 19_000 } },
  { id: "msg_user_2", type: "user", text: "继续，顺便把工具失败态也验证一下。", time: { created: TIME + 20_000 } },
  assistant(
    "msg_assistant_2",
    [
      tool("tool_shell", "shell", { command: "bun test src/answer" }, "error"),
      { type: "text", text: "测试失败的原因是 fixture 少了 `content` 字段，已修正。" },
    ],
    TIME + 21_000,
    TIME + 24_000,
  ),
]

const streaming: SessionMessageInfo[] = [
  ...settled,
  { id: "msg_user_3", type: "user", text: "再跑一遍完整检查。", time: { created: TIME + 30_000 } },
  assistant(
    "msg_assistant_3",
    [
      reasoning("先跑 session-ui 的 typecheck。"),
      {
        type: "tool",
        id: "tool_tc",
        name: "shell",
        state: {
          status: "completed",
          input: { command: "bun typecheck" },
          content: [{ type: "text", text: "Checked 286 files" }],
          metadata: { exit: 0 },
        },
        time: { created: TIME + 31_500, completed: TIME + 32_000 },
      },
    ],
    TIME + 31_000,
  ),
]

export const Settled = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => settled} />
    </div>
  ),
}

const withPhase: SessionMessageInfo[] = [
  { id: "msg_user_phase", type: "user", text: "先给阶段结论，再给最终答案。", time: { created: TIME } },
  assistant(
    "msg_phase",
    [
      reasoning("先确认两个文件的位置，再解释结论。"),
      tool("tool_read", "read", { filePath: "packages/session-ui/src/answer/page.tsx" }, "completed"),
      { type: "text", text: "阶段结论：折叠逻辑在投影层。" },
      { type: "text", text: "最终答案：投影层决定折叠边界，渲染层只负责展开状态。" },
    ],
    TIME + 1_000,
    TIME + 8_000,
  ),
]

const flowSequence: SessionMessageInfo[] = [
  { id: "msg_user_flow", type: "user", text: "读 README 前 5 行 → echo flow-check → 总结", time: { created: TIME } },
  assistant(
    "msg_flow_1",
    [reasoning("用户要求三个步骤：读 README、跑命令、总结。"), { type: "text", text: "先读取 README.md 的前 5 行。" }],
    TIME + 1_000,
    TIME + 3_000,
  ),
  assistant(
    "msg_flow_2",
    [
      tool("tool_flow_read", "read", { filePath: "README.md" }, "completed"),
      reasoning("前 5 行是标题、简介和两条命令示例。"),
      { type: "text", text: "README 前 5 行是标题、简介和命令示例。" },
    ],
    TIME + 4_000,
    TIME + 7_000,
  ),
  assistant(
    "msg_flow_3",
    [
      tool("tool_flow_shell", "shell", { command: "echo flow-check" }, "completed"),
      { type: "text", text: "三步都已完成：读取、运行命令、总结。" },
    ],
    TIME + 8_000,
    TIME + 10_000,
  ),
]

const lists: SessionMessageInfo[] = [
  { id: "msg_user_list", type: "user", text: "列一下步骤。", time: { created: TIME } },
  assistant(
    "msg_list",
    [{ type: "text", text: "步骤：\n\n- 读取文件\n- 运行命令\n- 总结\n\n1. 第一步\n2. 第二步" }],
    TIME + 1_000,
    TIME + 4_000,
  ),
]

const runningPhase: SessionMessageInfo[] = [
  { id: "msg_user_run", type: "user", text: "先给阶段结论，再继续。", time: { created: TIME } },
  assistant(
    "msg_run_step",
    [reasoning("先确认目标文件。"), { type: "text", text: "阶段简述：正在读 README。" }, tool("tool_run", "read", { filePath: "README.md" }, "completed")],
    TIME + 1_000,
    TIME + 4_000,
  ),
  assistant("msg_run_live", [reasoning("继续读取剩余内容。")], TIME + 5_000),
]

export const RunningPhase = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => runningPhase} />
    </div>
  ),
}

const longDetail: SessionMessageInfo[] = [
  { id: "msg_user_ld", type: "user", text: "跑个很长的命令。", time: { created: TIME } },
  assistant(
    "msg_ld",
    [
      {
        type: "tool",
        id: "tool_ld",
        name: "shell",
        state: {
          status: "running",
          input: {
            command:
              "cd D:/dev/projects/opencode && bun run check --all --verbose --reporter=line && echo this-is-a-very-long-command-that-should-be-truncated",
          },
          metadata: {},
        },
        time: { created: TIME + 1_000 },
      },
    ],
    TIME + 1_000,
  ),
]

export const LongDetail = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => longDetail} />
    </div>
  ),
}

export const Lists = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => lists} />
    </div>
  ),
}

export const FlowSequence = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => flowSequence} />
    </div>
  ),
}

const foldedDefault: SessionMessageInfo[] = withPhase

export const FoldedDefault = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => foldedDefault} />
    </div>
  ),
}

export const SettledFinal = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => withPhase} foldedReplies="final" />
    </div>
  ),
}

export const SettledAll = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => withPhase} foldedReplies="all" />
    </div>
  ),
}

const twoKinds: SessionMessageInfo[] = [
  { id: "msg_user_two", type: "user", text: "读文件并跑命令。", time: { created: TIME } },
  assistant(
    "msg_two",
    [
      { type: "text", text: "先读文件，再跑命令。" },
      tool("tool_read_two", "read", { filePath: "README.md" }, "completed"),
      tool("tool_shell_two", "shell", { command: "echo hello" }, "completed"),
      { type: "text", text: "两件事都做完了。" },
    ],
    TIME + 1_000,
    TIME + 5_000,
  ),
]

export const TwoKinds = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => twoKinds} />
    </div>
  ),
}

export const Compact = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => streaming} view="compact" />
    </div>
  ),
}

export const Detailed = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => streaming} view="detailed" />
    </div>
  ),
}

export const Verbose = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => streaming} view="verbose" />
    </div>
  ),
}

export const Streaming = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => streaming} />
    </div>
  ),
}
