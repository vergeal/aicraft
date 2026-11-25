import type { SessionMessageAssistant, SessionMessageInfo } from "@aicraft/client/promise"
import { createSignal } from "solid-js"
import { DataProvider } from "../context/data"
import { MarkdownProvider } from "../context/markdown"
import { CURRENT_SESSION_ID } from "../storybook/current-session-fixtures"
import { AnswerPage } from "./page"

export default {
  title: "AI Craft/Conversation/Answer page",
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

// The client projects a `session.idle` event into this message; it is what closes a turn.
const idle = (id: string, created: number): SessionMessageInfo => ({ id, type: "idle", outcome: "succeeded", time: { created } })

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
  idle("msg_idle_1", TIME + 13_500),
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
  idle("msg_idle_2", TIME + 24_500),
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

// A pasted config keeps one line far past the bubble's measure, so the fenced block has to wrap
// inside the bubble instead of scrolling sideways or pushing the bubble past the screen.
const codePrompt: SessionMessageInfo[] = [
  {
    id: "msg_user_code",
    type: "user",
    text:
      "```yaml\nwps:\n  drive:\n    base-url: https://pan.changhong.com\n    notice-dir-ids: '1000=410866789433389,1001=410866789433390,1002=410866789433393,1003=410866789433392,1004=410866789433391,1006=410866789433395,1007=410866789433396'\n```\n这个不是测试吗？",
    time: { created: TIME },
  },
  assistant("msg_assistant_code", [{ type: "text", text: "目录 id 指向的是测试盘。" }], TIME + 1_000, TIME + 2_000),
  idle("msg_idle_code", TIME + 2_500),
]

export const CodePrompt = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => codePrompt} />
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
  idle("msg_idle_phase", TIME + 8_500),
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
  idle("msg_idle_flow", TIME + 10_500),
]

const lists: SessionMessageInfo[] = [
  { id: "msg_user_list", type: "user", text: "列一下步骤。", time: { created: TIME } },
  assistant(
    "msg_list",
    [{ type: "text", text: "步骤：\n\n- 读取文件\n- 运行命令\n- 总结\n\n1. 第一步\n2. 第二步" }],
    TIME + 1_000,
    TIME + 4_000,
  ),
  idle("msg_idle_list", TIME + 4_500),
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

// A steer joins the run it interrupts: the step before it never settles as its own turn, so only the
// reply the steered run closes with carries the copy / fork / model footer.
const steered: SessionMessageInfo[] = [
  { id: "msg_user_steer", type: "user", text: "把投影的 turn 边界改成 idle 标记。", time: { created: TIME } },
  assistant(
    "msg_steer_step",
    [{ type: "text", text: "先看当前的切分逻辑。" }, tool("tool_steer", "grep", { pattern: "drafts" }, "completed")],
    TIME + 1_000,
    TIME + 3_000,
  ),
  { id: "msg_user_steer_2", type: "user", text: "顺便补一条回归测试。", time: { created: TIME + 4_000 } },
  assistant(
    "msg_steer_answer",
    [{ type: "text", text: "已按 idle 标记切分，回归测试也补上了。" }],
    TIME + 5_000,
    TIME + 8_000,
  ),
  idle("msg_steer_idle", TIME + 8_500),
]

export const Steered = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => steered} />
    </div>
  ),
}

// The same exchange while the steered run is still working: nothing has settled, so no reply offers its footer.
const steerRunning: SessionMessageInfo[] = steered
  .filter((message) => message.type !== "idle")
  .map((message) =>
    message.type === "assistant" && message.id === "msg_steer_answer"
      ? { ...message, time: { created: message.time.created } }
      : message,
  )

export const SteerRunning = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => steerRunning} />
    </div>
  ),
}

// A pending retry keeps the provider's reason behind a button instead of trailing it on the row.
const retrying: SessionMessageInfo[] = [
  { id: "msg_user_retry", type: "user", text: "再跑一次。", time: { created: TIME } },
  {
    ...assistant("msg_assistant_retry", [{ type: "text", text: "正在重新生成回复。" }], TIME + 1_000),
    retry: {
      attempt: 2,
      at: TIME + 4_000,
      error: {
        type: "provider",
        status: 429,
        message:
          'Provider returned error: 429 {"error":{"message":"Rate limit reached for requests on tokens per min (TPM)","type":"tokens"}}',
      },
    },
  },
]

export const Retrying = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => retrying} />
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
              "cd D:/dev/projects/aicraft && bun run check --all --verbose --reporter=line && echo this-is-a-very-long-command-that-should-be-truncated",
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

const injectedContext: SessionMessageInfo[] = [
  { id: "msg_user_ctx", type: "user", text: "看看注入的上下文。", time: { created: TIME } },
  assistant("msg_ctx_tool", [tool("tool_ctx", "read", { filePath: "README.md" }, "completed")], TIME + 1_000, TIME + 3_000),
  {
    id: "msg_ctx_notice",
    type: "synthetic",
    text: "来自以下文件的指令：AGENTS.md\n\n# AGENTS\n\n回答前先读项目说明。",
    description: "已加载 AGENTS.md",
    time: { created: TIME + 4_000 },
  },
  assistant("msg_ctx_final", [{ type: "text", text: "上下文已注入。" }], TIME + 5_000, TIME + 6_000),
  idle("msg_idle_ctx", TIME + 6_500),
]

export const InjectedContext = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => injectedContext} />
    </div>
  ),
}

const injectedContextMultiple: SessionMessageInfo[] = [
  { id: "msg_user_ctxm", type: "user", text: "看看多个注入上下文。", time: { created: TIME } },
  {
    id: "msg_ctxm_a",
    type: "synthetic",
    text: "来自以下文件的指令：/a/AGENTS.md\n\n# A\n\n第一条规则。",
    time: { created: TIME + 1_000 },
  },
  {
    id: "msg_ctxm_b",
    type: "synthetic",
    text: "来自以下文件的指令：/b/AGENTS.md\n\n# B\n\n第二条规则。",
    time: { created: TIME + 2_000 },
  },
  {
    id: "msg_ctxm_c",
    type: "synthetic",
    text: "来自以下文件的指令：/c/AGENTS.md\n\n# C\n\n第三条规则。",
    time: { created: TIME + 3_000 },
  },
  assistant("msg_ctxm_final", [{ type: "text", text: "上下文已注入。" }], TIME + 4_000, TIME + 5_000),
  idle("msg_idle_ctxm", TIME + 5_500),
]

export const InjectedContextMultiple = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => injectedContextMultiple} />
    </div>
  ),
}

// Every step resends the same system prefix; only the sources whose text changed are reported.
const contextChanges: SessionMessageInfo[] = (() => {
  const step = (id: string, created: number, sources: { key: string; text: string }[]) => ({
    ...assistant(id, [tool(`tool_${id}`, "read", { filePath: "README.md" }, "completed")], created, created + 1_000),
    metadata: {
      context: sources.map((source) => ({ key: source.key, chars: source.text.length, text: source.text })),
    },
  }) satisfies SessionMessageInfo

  return [
    { id: "msg_user_cch", type: "user", text: "上下文只在变化时显示。", time: { created: TIME } },
    step("msg_cch_1", TIME + 1_000, [
      { key: "system", text: "系统提示 A" },
      { key: "core/instructions", text: "项目指令 A" },
    ]),
    step("msg_cch_2", TIME + 3_000, [
      { key: "system", text: "系统提示 A" },
      { key: "core/instructions", text: "项目指令 A" },
    ]),
    step("msg_cch_3", TIME + 5_000, [
      { key: "system", text: "系统提示 A" },
      { key: "core/instructions", text: "项目指令 B" },
    ]),
    idle("msg_idle_cch", TIME + 6_000),
  ]
})()

export const ContextChanges = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => contextChanges} />
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
  idle("msg_idle_two", TIME + 5_500),
]

export const TwoKinds = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => twoKinds} />
    </div>
  ),
}

const repeatedEdits: SessionMessageInfo[] = [
  { id: "msg_user_repeat", type: "user", text: "把同一处的两行分别改掉。", time: { created: TIME } },
  assistant(
    "msg_repeat",
    [
      tool(
        "tool_edit_1",
        "edit",
        { filePath: "packages/app/src/session/timeline/answer-timeline.tsx" },
        "completed",
      ),
      tool(
        "tool_edit_2",
        "edit",
        { filePath: "packages/app/src/session/timeline/answer-timeline.tsx" },
        "completed",
      ),
      tool("tool_read_1", "read", { filePath: "packages/app/src/session/timeline/interaction.ts" }, "completed"),
      tool("tool_edit_3", "edit", { filePath: "packages/app/src/session/timeline/interaction.ts" }, "completed"),
      { type: "text", text: "两处都改好了。" },
    ],
    TIME + 1_000,
    TIME + 9_000,
  ),
  idle("msg_idle_repeat", TIME + 9_500),
]

export const RepeatedEdits = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => repeatedEdits} />
    </div>
  ),
}

const repeatedReads: SessionMessageInfo[] = [
  { id: "msg_user_reads", type: "user", text: "分别读这几个文件。", time: { created: TIME } },
  assistant(
    "msg_reads",
    [
      tool("tool_read_a", "read", { filePath: "packages/session-ui/src/answer/page.tsx" }, "completed"),
      tool("tool_read_b", "read", { filePath: "packages/session-ui/src/answer/project.ts" }, "completed"),
      tool("tool_read_c", "read", { filePath: "packages/session-ui/src/answer/tool.ts" }, "completed"),
      { type: "text", text: "三个文件都看过了。" },
    ],
    TIME + 1_000,
    TIME + 9_000,
  ),
  idle("msg_idle_reads", TIME + 9_500),
]

export const ReadsAcrossFiles = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => repeatedReads} />
    </div>
  ),
}

// A settled run long enough to take the capped panel: distinct files so the repeat fold keeps every row apart.
const manyReads: SessionMessageInfo[] = [
  { id: "msg_user_many_reads", type: "user", text: "把相关文件都读一遍。", time: { created: TIME } },
  assistant(
    "msg_many_reads",
    [
      tool("tool_many_01", "read", { filePath: "packages/session-ui/src/answer/page.tsx" }, "completed"),
      tool("tool_many_02", "read", { filePath: "packages/session-ui/src/answer/project.ts" }, "completed"),
      tool("tool_many_03", "read", { filePath: "packages/session-ui/src/answer/types.ts" }, "completed"),
      tool("tool_many_04", "read", { filePath: "packages/session-ui/src/answer/tool.ts" }, "completed"),
      tool("tool_many_05", "read", { filePath: "packages/session-ui/src/answer/answer.css" }, "completed"),
      tool("tool_many_06", "read", { filePath: "packages/session-ui/src/answer/restore-machine.ts" }, "completed"),
      tool("tool_many_07", "read", { filePath: "packages/session-ui/src/timeline/timeline-row.ts" }, "completed"),
      tool("tool_many_08", "read", { filePath: "packages/session-ui/src/timeline/projection.ts" }, "completed"),
      tool("tool_many_09", "read", { filePath: "packages/session-ui/src/timeline/session-timeline-row.tsx" }, "completed"),
      tool("tool_many_10", "read", { filePath: "packages/session-ui/src/components/message-part.css" }, "completed"),
      tool("tool_many_11", "read", { filePath: "packages/session-ui/src/components/markdown.tsx" }, "completed"),
      tool("tool_many_12", "read", { filePath: "packages/session-ui/src/components/file.tsx" }, "completed"),
      tool("tool_many_13", "read", { filePath: "packages/session-ui/src/answer/answer.stories.tsx" }, "completed"),
      tool("tool_many_14", "read", { filePath: "packages/session-ui/src/answer/page.test.ts" }, "completed"),
      { type: "text", text: "所有文件都读完了。" },
    ],
    TIME + 1_000,
    TIME + 20_000,
  ),
  idle("msg_idle_many_reads", TIME + 20_500),
]

export const CappedPanel = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => manyReads} />
    </div>
  ),
}

// A result long enough that the IO card's output half has to scroll inside the step.
const longResult = Array.from({ length: 60 }, (_, index) => `line ${index + 1}: ${"x".repeat(48)}`).join("\n")

const longOutput: SessionMessageInfo[] = [
  { id: "msg_user_long_output", type: "user", text: "这个大日志里有什么？", time: { created: TIME } },
  assistant(
    "msg_long_output",
    [
      {
        type: "tool",
        id: "tool_long_output",
        name: "shell",
        state: {
          status: "completed",
          input: { command: "cat build.log" },
          content: [{ type: "text", text: longResult }],
          metadata: {},
        },
        time: { created: TIME, completed: TIME },
      },
      { type: "text", text: "日志读完了，只有重复的构建行。" },
    ],
    TIME + 1_000,
    TIME + 5_000,
  ),
  idle("msg_idle_long_output", TIME + 5_500),
]

// A running run long enough to overflow its cap: the panel must follow the newest row while it streams.
const liveSteps: Content[] = Array.from({ length: 20 }, (_, index) => ({
  type: "tool",
  id: `tool_live_${index}`,
  name: "shell",
  state: {
    status: "completed",
    input: { command: `bun run check:${index}` },
    content: [{ type: "text", text: "ok" }],
    metadata: {},
  },
  time: { created: TIME, completed: TIME },
}))

const liveRun: SessionMessageInfo[] = [
  { id: "msg_user_live", type: "user", text: "把检查全跑一遍。", time: { created: TIME } },
  // No completion time: this run is still streaming.
  assistant("msg_live", liveSteps, TIME + 1_000),
]

export const LiveCapped = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => liveRun} />
    </div>
  ),
}

// A long reasoning block inside one step: it must not grow the turn past the group's cap.
const longThinking = Array.from(
  { length: 40 },
  (_, index) => `第 ${index + 1} 段：先确认折叠边界，再检查投影层的行 key 在流式增量里是否稳定。`,
).join("\n\n")

const thinkingRun: SessionMessageInfo[] = [
  { id: "msg_user_thinking", type: "user", text: "说说你的判断过程。", time: { created: TIME } },
  assistant(
    "msg_thinking",
    [reasoning(longThinking), { type: "text", text: "判断完了，结论如上。" }],
    TIME + 1_000,
    TIME + 9_000,
  ),
  idle("msg_idle_thinking", TIME + 9_500),
]

export const LongThinking = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => thinkingRun} />
    </div>
  ),
}

// A thought still streaming: its box follows the newest paragraph until the reader scrolls up.
const liveThinkingRun: SessionMessageInfo[] = [
  { id: "msg_user_live_thinking", type: "user", text: "继续说。", time: { created: TIME } },
  assistant("msg_live_thinking", [reasoning(longThinking)], TIME + 1_000),
]

export const LiveThinking = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => liveThinkingRun} />
    </div>
  ),
}

// A running step that has already read a file and is still thinking: the heading must not repeat the line the thought
// row below it already shows.
const liveThinkingGroup: SessionMessageInfo[] = [
  { id: "msg_user_live_group", type: "user", text: "先读文件，再继续想。", time: { created: TIME } },
  assistant(
    "msg_live_group",
    [
      tool("tool_live_group", "read", { filePath: "packages/session-ui/src/answer/project.ts" }, "completed"),
      reasoning(longThinking),
    ],
    TIME + 1_000,
  ),
]

export const LiveThinkingGroup = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => liveThinkingGroup} />
    </div>
  ),
}

export const LongOutput = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => longOutput} />
    </div>
  ),
}

// The recorded patch is what an edit step expands into: a GitHub-style diff instead of raw input and output.
const editPatch =
  "diff --git a/packages/session-ui/src/answer/project.ts b/packages/session-ui/src/answer/project.ts\n" +
  "index 3a03f407..b2f0d1c2 100644\n" +
  "--- a/packages/session-ui/src/answer/project.ts\n" +
  "+++ b/packages/session-ui/src/answer/project.ts\n" +
  "@@ -548,5 +548,5 @@ function summarizeGroup(\n" +
  " /**\n" +
  "- * Two steps fold together only when they repeat the same activity on the same target.\n" +
  "+ * Two steps fold together only when they repeat the same activity on the same target, of every kind.\n" +
  "  */\n" +
  " function repeatSignature(node: TimelineNode) {\n" +
  "   if (node.payload.kind === \"tool\") return `${toolActivity(node.payload.tool.name)}|${toolSummary(node.payload.tool)}`\n"

const editedFile: SessionMessageInfo[] = [
  { id: "msg_user_edit_diff", type: "user", text: "把折叠条件的注释写清楚。", time: { created: TIME } },
  assistant(
    "msg_edit_diff",
    [
      {
        type: "tool",
        id: "tool_edit_diff",
        name: "edit",
        state: {
          status: "completed",
          input: {
            path: "packages/session-ui/src/answer/project.ts",
            oldString: "* Two steps fold together only when they repeat the same activity on the same target.",
            newString:
              "* Two steps fold together only when they repeat the same activity on the same target, of every kind.",
          },
          content: [{ type: "text", text: "Updated packages/session-ui/src/answer/project.ts" }],
          metadata: {
            files: [
              {
                file: "packages/session-ui/src/answer/project.ts",
                patch: editPatch,
                additions: 1,
                deletions: 1,
                status: "modified",
              },
            ],
          },
        },
        time: { created: TIME, completed: TIME + 1_000 },
      },
      { type: "text", text: "注释已经说明所有类型都按同类同目标折叠。" },
    ],
    TIME + 500,
    TIME + 2_000,
  ),
  idle("msg_idle_edit_diff", TIME + 2_500),
]

// The same edit before the turn settles: the answer is already written, but the turn is still running, so the
// change list under it waits for the idle message that closes the turn.
const editingLive = editedFile.slice(0, -1)

export const EditRunning = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => editingLive} />
    </div>
  ),
}

export const EditDiff = {
  render: () => {
    const [opened, setOpened] = createSignal("")

    return (
      <div class="h-dvh">
        <AnswerPage messages={() => editedFile} onOpenFile={setOpened} />
        <div data-slot="opened-file" aria-hidden="true" style={{ display: "none" }}>
          {opened()}
        </div>
      </div>
    )
  },
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

// A pasted prompt of 30 lines: past the fold's 12-line limit, so the bubble shows its first 8 behind a toggle.
const longPromptText = Array.from(
  { length: 30 },
  (_, index) => `第 ${index + 1} 行：把窗口、折叠和恢复位置的边界都写清楚。`,
).join("\n")

const foldedPrompt: SessionMessageInfo[] = [
  { id: "msg_user_folded_prompt", type: "user", text: longPromptText, time: { created: TIME } },
  assistant("msg_assistant_folded_prompt", [{ type: "text", text: "收到。" }], TIME + 1_000, TIME + 2_000),
  idle("msg_idle_folded_prompt", TIME + 2_500),
]

export const FoldedPrompt = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => foldedPrompt} />
    </div>
  ),
}

// Every settled turn is rendered, so the reading position and restore can be exercised on a long transcript.
const longSession: SessionMessageInfo[] = Array.from({ length: 40 }, (_, index) => {
  const created = TIME + index * 10_000
  const turn = `long_${index}`

  return [
    { id: `msg_user_${turn}`, type: "user", text: `第 ${index + 1} 个问题：确认分页与折叠的边界。`, time: { created } },
    assistant(
      `msg_assistant_${turn}`,
      [
        reasoning(`第 ${index + 1} 轮：先看边界。`),
        tool(`tool_read_${turn}`, "read", { filePath: "packages/session-ui/src/answer/page.tsx" }, "completed"),
        { type: "text", text: `第 ${index + 1} 轮结论：分页与折叠的边界已确认。` },
      ],
      created + 1_000,
      created + 4_000,
    ),
    idle(`msg_idle_${turn}`, created + 4_500),
  ] satisfies SessionMessageInfo[]
}).flat()

export const Windowed = {
  render: () => {
    const [viewport, setViewport] = createSignal<HTMLDivElement>()
    const [active, setActive] = createSignal(true)
    // Mirrors the host: the page reports the row under the top edge and the host remembers it across activations.
    let saved: { key: string; offset: number } | undefined

    ;(globalThis as unknown as { __setAnswerActive?: (next: boolean) => void }).__setAnswerActive = setActive

    return (
      <div ref={setViewport} data-testid="answer-window" class="h-dvh overflow-y-auto">
        <AnswerPage
          messages={() => longSession}
          viewport={viewport}
          active={active}
          restore={() => saved}
          onPositionChange={(position) => {
            saved = position
          }}
        />
      </div>
    )
  },
}

// A remembered row opens the page at that row instead of the first message.
export const WindowedRestore = {
  render: () => {
    const [viewport, setViewport] = createSignal<HTMLDivElement>()
    const restore = { key: "node:input:msg_user_long_29", offset: 0 }

    return (
      <div ref={setViewport} data-testid="answer-window" class="h-dvh overflow-y-auto">
        <AnswerPage messages={() => longSession} viewport={viewport} restore={() => restore} following={() => false} />
      </div>
    )
  },
}

// A remembered offset the loaded transcript cannot scroll to. Restoring it only clamps, so the page must not record the
// top row it lands on: doing that replaces the reader's place and every later activation opens at the first message.
export const WindowedRestoreUnreachable = {
  render: () => {
    const [viewport, setViewport] = createSignal<HTMLDivElement>()
    const restore = { key: "node:input:msg_user_long_39", offset: 200_000 }
    const positions: Array<{ key: string; offset: number }> = []
    ;(globalThis as unknown as { __answerPositions?: typeof positions }).__answerPositions = positions

    return (
      <div ref={setViewport} data-testid="answer-window" class="h-dvh overflow-y-auto">
        <AnswerPage
          messages={() => longSession}
          viewport={viewport}
          restore={() => restore}
          following={() => false}
          onPositionChange={(position) => positions.push(position)}
        />
      </div>
    )
  },
}

// A long running turn whose steps the reader can open while the turn is still working. Finishing the turn folds every
// step it settled, even the one the reader opened and even with the turn's header scrolled out of view.
const readingSteps: SessionMessageInfo[] = [
  { id: "msg_user_reading", type: "user", text: "把 24 个文件都读一遍。", time: { created: TIME } },
  assistant(
    "msg_reading",
    Array.from({ length: 24 }, (_, index) =>
      tool(`tool_reading_${index}`, "read", { filePath: `packages/file-${index}.ts` }, "completed"),
    ),
    TIME + 1_000,
  ),
]

const readingFinished: SessionMessageInfo[] = [
  ...readingSteps,
  assistant("msg_reading_done", [{ type: "text", text: "全部读完了。" }], TIME + 4_000, TIME + 5_000),
  idle("msg_idle_reading", TIME + 5_500),
]

export const ReaderOpenedStep = {
  render: () => {
    const [viewport, setViewport] = createSignal<HTMLDivElement>()
    const [finished, setFinished] = createSignal(false)
    ;(globalThis as unknown as { __finishAnswerTurn?: () => void }).__finishAnswerTurn = () => setFinished(true)

    return (
      <div ref={setViewport} data-testid="answer-window" class="h-dvh overflow-y-auto">
        <AnswerPage messages={() => (finished() ? readingFinished : readingSteps)} viewport={viewport} />
      </div>
    )
  },
}

// A tool result can carry an image beside its text: the open row previews it instead of hiding it in the output text.
const screenshot = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">',
    '<rect width="640" height="360" fill="#f4f5f7"/>',
    '<rect width="640" height="34" fill="#ffffff"/>',
    '<circle cx="20" cy="17" r="5" fill="#e5484d"/>',
    '<circle cx="38" cy="17" r="5" fill="#f5a623"/>',
    '<circle cx="56" cy="17" r="5" fill="#46a758"/>',
    '<rect x="0" y="34" width="152" height="326" fill="#ffffff"/>',
    '<rect x="18" y="56" width="96" height="10" rx="5" fill="#d9dbe0"/>',
    '<rect x="18" y="86" width="112" height="8" rx="4" fill="#e6e8ec"/>',
    '<rect x="18" y="106" width="86" height="8" rx="4" fill="#e6e8ec"/>',
    '<rect x="178" y="56" width="220" height="14" rx="7" fill="#c9ccd2"/>',
    '<rect x="178" y="92" width="428" height="96" rx="12" fill="#ffffff"/>',
    '<rect x="196" y="112" width="150" height="10" rx="5" fill="#d9dbe0"/>',
    '<rect x="196" y="134" width="300" height="8" rx="4" fill="#e6e8ec"/>',
    '<rect x="196" y="152" width="260" height="8" rx="4" fill="#e6e8ec"/>',
    '<rect x="178" y="212" width="208" height="64" rx="12" fill="#ffffff"/>',
    '<rect x="398" y="212" width="208" height="64" rx="12" fill="#ffffff"/>',
    "</svg>",
  ].join(""),
)}`

const capturedScreenshot: SessionMessageInfo[] = [
  { id: "msg_user_shot", type: "user", text: "看一下设置页截图。", time: { created: TIME } },
  assistant(
    "msg_shot",
    [
      {
        type: "tool",
        id: "tool_shot",
        name: "screenshot",
        state: {
          status: "completed",
          input: { tabID: "tab_1" },
          content: [
            { type: "text", text: "Captured the settings viewport." },
            { type: "file", uri: screenshot, mime: "image/svg+xml", name: "settings.svg" },
          ],
          metadata: {},
        },
        time: { created: TIME, completed: TIME + 1_000 },
      },
      { type: "text", text: "截图里能看到设置页的侧边栏和两个配置卡片。" },
    ],
    TIME + 500,
    TIME + 2_000,
  ),
  idle("msg_idle_shot", TIME + 2_500),
]

export const ToolScreenshot = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => capturedScreenshot} />
    </div>
  ),
}

// A read that brings back media is a picture step, not a file step. Two rows keep the group heading visible.
// Its result points at the file with a `file:` URL, as the read tool does, so the story exercises that conversion.
const pictureTool = (id: string, path: string): Content => ({
  type: "tool",
  id,
  name: "read",
  state: {
    status: "completed",
    input: { path },
    content: [
      { type: "text", text: `Read ${path}` },
      {
        type: "file",
        uri: `file:///Users/ekko/Projects/aicraft/${path}`,
        mime: "image/svg+xml",
        name: path.split("/").pop(),
      },
    ],
    metadata: {},
  },
  time: { created: TIME, completed: TIME + 1_000 },
})

const pictureBytes = new Blob([decodeURIComponent(screenshot.slice(screenshot.indexOf(",") + 1))], {
  type: "image/svg+xml",
})

const readPicture: SessionMessageInfo[] = [
  { id: "msg_user_picture", type: "user", text: "看一下这两张图。", time: { created: TIME } },
  assistant(
    "msg_picture",
    [
      pictureTool("tool_picture_a", "packages/app/before.svg"),
      pictureTool("tool_picture_b", "packages/app/after.svg"),
      { type: "text", text: "两张图都是设置页。" },
    ],
    TIME + 500,
    TIME + 2_000,
  ),
  idle("msg_idle_picture", TIME + 2_500),
]

// The client strips stored message payloads down to `data:<mime>;base64,`, so a picture step falls back to reading
// the file the tool itself read instead of the emptied URL.
const strippedPicture: SessionMessageInfo[] = [
  { id: "msg_user_stripped_picture", type: "user", text: "看一下这张图。", time: { created: TIME } },
  assistant(
    "msg_stripped_picture",
    [
      {
        type: "tool",
        id: "tool_stripped_picture",
        name: "read",
        state: {
          status: "completed",
          input: { path: "C:/workspaces/aicraft/packages/app/before.svg" },
          content: [
            { type: "file", uri: "data:image/svg+xml;base64,", mime: "image/svg+xml", name: "before.svg" },
          ],
          metadata: {},
        },
        time: { created: TIME, completed: TIME + 1_000 },
      },
      { type: "text", text: "这是设置页。" },
    ],
    TIME + 500,
    TIME + 2_000,
  ),
  idle("msg_idle_stripped_picture", TIME + 2_500),
]

export const ReadPictureStripped = {
  render: () => (
    <MarkdownProvider
      readImage={(path) => Promise.resolve(path.endsWith("packages/app/before.svg") ? pictureBytes : undefined)}
    >
      <div class="h-dvh">
        <AnswerPage messages={() => strippedPicture} />
      </div>
    </MarkdownProvider>
  ),
}

export const ReadPicture = {
  render: () => (
    <MarkdownProvider readImage={() => Promise.resolve(pictureBytes)}>
      <div class="h-dvh">
        <AnswerPage messages={() => readPicture} />
      </div>
    </MarkdownProvider>
  ),
}

// While `experimental.media_blob` is on, a stored tool image arrives as a `media:` ref instead of a data URL.
const mediaRef = `media:${"a".repeat(64)}`

const readPictureRef: SessionMessageInfo[] = [
  { id: "msg_user_picture_ref", type: "user", text: "看一下这张图。", time: { created: TIME } },
  assistant(
    "msg_picture_ref",
    [
      {
        type: "tool",
        id: "tool_picture_ref",
        name: "read",
        state: {
          status: "completed",
          input: { path: "packages/app/settings.svg" },
          content: [
            { type: "text", text: "Read packages/app/settings.svg" },
            { type: "file", uri: mediaRef, mime: "image/svg+xml", name: "settings.svg" },
          ],
          metadata: {},
        },
        time: { created: TIME, completed: TIME + 1_000 },
      },
      { type: "text", text: "这是设置页。" },
    ],
    TIME + 500,
    TIME + 2_000,
  ),
  idle("msg_idle_picture_ref", TIME + 2_500),
]

export const ReadPictureRef = {
  render: () => (
    <DataProvider
      data={{ session: [], session_status: {}, session_diff: {} }}
      directory="C:/workspaces/aicraft"
      readMedia={() => Promise.resolve(URL.createObjectURL(pictureBytes))}
    >
      <div class="h-dvh">
        <AnswerPage messages={() => readPictureRef} />
      </div>
    </DataProvider>
  ),
}

// A run the reader stopped while it was still working: the last words were step commentary, not the reply, so
// the page names no closing answer and offers nothing to copy, fork or read the model from.
const stoppedMidTool: SessionMessageInfo[] = [
  { id: "msg_user_stop", type: "user", text: "把弹窗渲染出来，看看两栏有没有裁切。", time: { created: TIME } },
  {
    ...assistant(
      "msg_stop_step",
      [
        { type: "text", text: "渲染跑通了，弹窗 760×675、两栏都没裁切。看实际画面。" },
        tool("tool_shot_1", "read", { filePath: "shots/screen-1.png" }, "completed"),
      ],
      TIME + 1_000,
      TIME + 3_000,
    ),
    error: { type: "AbortError", message: "aborted" },
  },
  {
    ...assistant("msg_stop_tool", [tool("tool_shot_2", "read", { filePath: "shots/screen-2.png" }, "completed")], TIME + 4_000),
    error: { type: "AbortError", message: "aborted" },
  },
]

export const StoppedMidTool = {
  render: () => (
    <div class="h-dvh">
      <AnswerPage messages={() => stoppedMidTool} />
    </div>
  ),
}
