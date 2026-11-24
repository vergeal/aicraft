// The first message a diagnosis session receives: where the dump is, how it is shaped, how to query it,
// and which sources produce it. It is deliberately data, not UI copy, so the agent can read it whole.

export type DiagnosisSource = readonly [path: string, note: string]

export function diagnosisPrompt(input: {
  path: string
  events: number
  dropped: number
  sources: readonly DiagnosisSource[]
}) {
  const sources = input.sources.map(([path, note]) => `- \`${path}\` — ${note}`).join("\n")

  return `我点了「AGENT 诊断」，请结合这份运行时 dump 排查我刚才遇到的问题。

## dump 文件

\`${input.path}\`

单文件 JSON（${input.events} 条事件，环形缓冲丢弃 ${input.dropped} 条），不需要其他配套文件。

## 先看哪里

\`sections.findings\` 是已经从 \`events\` 派生的摘要，不要跳过它去逐条读 6000 条原始事件：

- \`timeline\`：按 \`at.t\` 升序，最多 60 条；每条有 \`at\`（\`t\` 相对毫秒 / \`wall\` Unix 毫秒）、\`severity\`（\`error\`/\`warn\`/\`info\`）、\`kind\`、\`title\`、\`evidence\`、\`hint\`。
- \`counts\`：原始事件条数（error / unhandledrejection / networkError / longTask / layoutShift / mark），用来判断「没发生」还是「没采到」。
- \`window\`：采集秒数、事件数、被挤出条数。
- \`notes\`：聚合口径、启发式说明和 timeline 裁剪情况（超出 60 条时按 severity 裁剪，error 优先保留）。

\`kind\` 的含义：\`error.burst\`（60 秒内故障集中）、\`error.group\`（同一 fingerprint 重复）、\`network.failure\`（按 method + 脱敏 url 聚合的失败）、\`network.slow\`（≥1000ms）、\`layout.drift\`（\`layout.rect\` 的位移聚合与 \`layout.shift\` 累计 CLS）、\`scroll.reset\`（scrollTop 非 0 突然归零，按 ±2 秒窗口归因为 program/input/unknown）、\`performance.stall\`（长任务/长帧/连续低 fps）、\`memory.suspect\`（转述采集器的泄漏判定）、\`mark\`（时间点标记）。\`hint\` 只指向「去哪找」，不是结论。

## 数据结构

\`schema\` 为 \`aicraft.diagnostics.v2\`：

- \`environment\`：应用版本、平台/OS、窗口与屏幕尺寸、DPR、语言/时区、主题、路由、会话、服务端、UA、在线状态；\`clock.offsetMs\` 是主进程时钟减渲染进程时钟的估算值。
- \`timeOrigin\`：\`performance.timeOrigin\`，配合事件里的 \`t\` 还原 Unix 时间。
- \`metrics\`：导出时刻的性能快照。
- \`capture\`：采集窗口（60 秒）、事件数、被挤出条数、采集起始时间，以及 \`sources[]\`（每个采集域的 observed/recorded/dropped，用来判断某类事件是没发生还是没采到）。
- \`events[]\`：按 \`t\`（毫秒，自采集开始）升序，每条同时带 \`wall\`（Unix 毫秒），类型包括：
  - \`perf\`：每秒一条 fps/frame/p95/slow/stutters/longTasks/longTaskMax/input/cls/lag/heap/nodes/viewport，以及 \`main\`（该秒长帧的 script/layout/paint 占比，没有长帧时为 null）
  - \`perf.first-frame\` / \`perf.first-session\`：首帧、首次出现 \`[data-session-id]\` 的毫秒数（后者还带 \`alreadyVisible\` 与 \`target\`）
  - \`perf.loaf\`：长帧观测不可用时只记一次，\`availability: "unavailable"\` 与原因
  - \`longtask\`：\`ms\` 与 \`name\`
  - \`long.frame\`：\`duration\`、\`blockingDuration\`、\`renderStart\`、\`styleAndLayoutStart\`、\`scripts[]\`（前 5 条：duration/invoker/sourceURL/sourceFunctionName/sourceCharPosition）、\`scriptsTruncated\`、\`attribution[]\`（按 invoker 聚合的毫秒）
  - \`route.render\`：\`url\`、\`ms\`（DOM 静默后的下界）、\`mutations\`、\`settled\`
  - \`dom\`：\`data.mutations[]\`，\`kind\` 为 \`childList\`（added/removed 节点标签与数量）、\`attributes\`（属性名、旧值、新值）、\`characterData\`（文本变化），\`target\` 是 3 层祖先链标签
  - \`input.pointer\` / \`input.click\` / \`input.key\` / \`input.value\`：坐标、按键、目标元素、输入长度（不记录输入内容，password 按键为 [redacted]）
  - \`input.latency\`：交互延迟的 \`ms\`、\`name\`、\`target\`
  - \`scroll\` / \`resize\` / \`visibility\` / \`focus\` / \`navigation\`
  - \`wheel\`：只记 \`target\`、\`dy\`（-1/0/1，不看 deltaY 的精确值）与 \`ctrl\`，250ms 节流；\`touchmove\`：只记 \`target\`，250ms 节流。两者只证明「用户此刻在滚」，本身就是 \`scroll.reset\` 的 input 证据。
  - \`scroll.program\`：程序化滚动。\`kind\` 是入口（\`scrollTo\`/\`scrollBy\`/\`scrollIntoView\`/\`scrollTop\`/\`scrollLeft\`/\`window.scrollTo\`/\`window.scrollBy\`），\`from\`/\`to\` 是调用前后的 scrollTop/scrollLeft，\`stack\`（最多 3 帧，已过滤 recorder 自身帧）指向真正改 scrollTop 的代码。只记录位移 ≥32px 或归零的调用，全局 100ms 最多一条；平滑滚动在调用瞬间还没产生位移，可能不出现。
  - \`scroll.trace.unavailable\`：某个入口无法重定义（原型被锁定等），该入口的归因缺失，\`entry\` 指出是哪一个。
  - \`frames\`：\`[data-slot]\` 关键帧，\`trigger\`（mutation/interval/export）、\`at\`、\`total\`、\`skipped\`、\`keyframes[]\`（selector、rect、scrollTop、scrollHeight、clientHeight、styles 的 display/position/overflow/transform/opacity/z-index）
  - \`layout.shift\`：CLS 条目、\`value\`、\`sources\`、\`sourceSelectors\`（含 stable 与 overflow-anchor）；\`layout.rect\`：每秒对 80 个 \`data-slot\`/\`data-ui\`/\`data-component\` 元素的几何采样，\`changes[]\` 记录位移超过 1px 的元素（\`target\`、\`from\`/\`to\`、\`stacking\`、可选 \`scroll\`）
  - \`error\` / \`unhandledrejection\`：message/stack、\`fingerprint\`、\`frame\`、\`component\`、\`traceID\`；\`error.group\`：同一 fingerprint 的 \`count\`/\`first\`/\`last\`
  - \`console.error\` / \`console.warn\`
  - \`network\`：method、url、status、ok、ms、contentType、contentLength、retryAfter、traceID/spanID
  - \`network.error\`：失败的请求，带 \`error\` 与 \`aborted\`；\`network.cancel\`：调用方主动 abort，不是失败
  - \`network.retry\`：同一逻辑请求的 \`attempt\` 与 \`gapMs\`（5 秒窗口内重复）
  - \`network.timing\`：dns/tcp/tls/ttfb 与 \`protocol\`（未发生的阶段是 \`"unavailable"\`）
  - \`network.stream\`：SSE 的 \`events\`、\`firstEventMs\`、\`gaps\`/\`gapCount\`、\`ms\`，失败时带 \`error\`/\`cancelled\`
  - \`memory\`：节点扫描、\`detached\`、\`listeners\`、\`heap\`；\`memory.suspect\`：采集器的泄漏判定（\`spans\`/\`seconds\`/\`nodesPerMinute\`/\`detachedPerMinute\`）
  - \`mark\`：应用或用户打的时间点（label 与元数据），用来把「用户说的就是这里」钉到时间线上
  - \`session.start\`
- **\`network.*\` 的 \`url\` 已经过脱敏**：保留 origin/path 与 query 键，去掉 query 值和 fragment。它不是原始地址，不要拿它去 grep 完整 URL；按路径片段找调用点。
- \`dom\`：导出时刻的 \`document.documentElement.outerHTML\`（已剔除 script/style/link/noscript 和诊断面板本身；超过 1MB 截断，\`truncated\` 标记）
- \`sections\`：按模块注册的额外顶层区块，存在时才出现（见下一节）
- \`notes\`：采集口径与截断/隐私说明

## sections 全清单

- \`findings\`：上面的派生摘要（timeline/counts/window/notes）。
- \`main\`：主进程采集。\`clock\`（\`wall\`、\`uptime\`、\`capturedAt\`，用 \`clock.wall\` 与 \`environment.clock.offsetMs\` 把两个进程对齐到同一条时间线）、\`environment\`（主进程版本/pid/启动时间）、\`ipc\`（通道与往返耗时）、\`windows\`（焦点/最小化/还原/移动事件与当前 bounds）、\`processes\`（每进程 CPU/内存采样）、\`logs\`（主进程日志切片）。
- \`server\`：服务端 span 与慢查询。\`spans[]\`（\`name\`/\`durationMs\`/\`status\`/\`startWall\`/\`traceID\`/\`spanID\`/\`parentSpanID\`/\`attributes\`）、\`slowQueries[]\`（\`sql\`/\`durationMs\`/\`at\`/\`span\`，不含绑定参数）、\`llm[]\`（按 trace 的模型传输阶段）、\`dropped\`、\`windowSeconds\`。
- \`state\`：导出时刻的状态快照（credential 类字段已脱敏），带 \`capturedAt\`/\`bytes\`/\`truncated\`；与上一次导出相比会带 \`diff\`。
- \`frames\`：导出时刻的 \`[data-slot]\` 关键帧几何，和 \`events\` 里的 \`frames\` 事件同形。
- \`marks\`：应用与用户打的时间点，对应 \`mark\` 事件。
- \`freezes\`：自动/手动冻结的窗口副本（\`reason\` 为 fps/cls/errors/longtask/mark，最多 3 份，每份是该时段的完整事件切片，常是 dump 体积的最大来源）；先看 \`findings\`，再按 \`at\` 只取需要的那一份。
- \`retention\`：温层/冷层的保留与挤出统计，用来看 dump 自身丢了多少证据。
- 未启用某项采集时，对应键不存在。

## 查询示例

\`\`\`bash
# 从摘要开始：时间线、计数、口径说明
jq '.sections.findings.timeline[]' "$DUMP"
jq '.sections.findings.counts' "$DUMP"
jq '.sections.findings.notes' "$DUMP"

# 最慢的十个服务端 span
jq '.sections.server.spans | sort_by(-.durationMs)[:10]' "$DUMP"

# 所有错误与警告
jq '.events[] | select(.type | test("^(error|unhandledrejection|console\\.(error|warn))"))' "$DUMP"

# 时间窗内的全部事件（例如摘要里某条 finding 的 at.t 前后 5 秒）
jq '.events | map(select(.t >= 12000 and .t <= 17000))' "$DUMP"

# 长帧与它的脚本归因
jq '.events[] | select(.type == "long.frame") | {t, duration: .data.duration, blocking: .data.blockingDuration, attribution: .data.attribution}' "$DUMP"

# 慢请求与失败请求
jq '.events[] | select(.type | startswith("network")) | select(.data.ms > 1000 or .data.status >= 400 or .data.ok == false)' "$DUMP"

# DOM 结构变化
jq '.events[] | select(.type == "dom") | .data.mutations[] | select(.kind == "childList")' "$DUMP"

# 失败请求的重试细节
jq '.events[] | select(.type | test("^(network\\.error|network\\.retry)$"))' "$DUMP"

# 把导出时刻的 DOM 另存，便于对照选择器
jq -r '.dom.html' "$DUMP" > /tmp/aicraft-diagnostics-dom.html
\`\`\`

## 对应源码

${sources}

## 建议的排查顺序

1. 先读 \`sections.findings.timeline\`：从 severity 为 \`error\` 的条目开始，记下每条 \`at.t\`、\`kind\` 和 \`hint\`。摘要已经按 severity 保留了最重要的 60 条，不需要重新扫一遍原始事件。
2. 用 \`at.t\` 回 \`events\` 对齐原始证据（前后 2–5 秒）：先看 \`error\`/\`unhandledrejection\`/\`error.group\` 与 \`network.*\`，再看同时刻的 \`dom\`、\`input.*\`、\`long.frame\`、\`longtask\`。
3. 对比 \`findings.counts\` 与 \`capture.sources[]\`：某个域 \`observed\` 很高但 \`recorded\` 很低，说明被过滤；\`dropped\` 高说明证据被环形缓冲挤掉了。
4. 需要跨进程时，用 \`sections.main.clock.wall\` 与 \`environment.clock.offsetMs\` 换算，再看 \`main.ipc\`、\`main.logs\`；服务端耗时按 \`traceID\` 对齐 \`sections.server.spans\` 与 \`llm\`。
5. 布局与滚动问题：把 \`layout.rect\`/\`layout.shift\`/\`frames\` 的选择器对到 \`dom.html\`，再按选择器或脱敏路径 grep 源码；\`scroll.reset\` 的 \`suspect\` 只说明窗口内有没有程序化滚动（看 \`scroll.program\` 的 \`stack\`）或输入活动，不要当根因。
6. 确认根因后给出最小修复；如果摘要漏掉了你认为关键的东西，直接说明它落在哪个 \`kind\` 之外、以及你在 \`events\` 里找到的原始条目。`
}
