# 虹云通 AI 能力层

这一层不碰界面、不碰平台协议，只解决一件事：**把本地消息变成「本人会说的话」**——起草回复、记待办、学语气、攒知识、按时提醒。

数据层在 `../profile`、`../style`、`../tasks`、`../knowledge`；这里只负责「怎么用这些数据」。

## 模块地图

| 文件 | 职责 | 关键导出 |
| --- | --- | --- |
| `prompt.ts` | 拼系统提示词与批次投递指令，纯字符串，不读文件不调模型 | `buildSystemPrompt`、`FORBIDDEN`、`SCENE_PROMPTS`、`buildBatchInstruction` |
| `prefilter.ts` | 本地预过滤：去重、@我、私聊、信号分、闲聊判定 | `judge`、`summarize`、`dedupeBatch`、`signalScore` |
| `feed.ts` | 从 sqlite 增量读消息、拿会话名与最大消息 id | `readSince`、`lastMessageId`、`sessionNames` |
| `knowledge.ts` | 知识命中：BM25 召回 + Dice 相似度定阈值 | `matchAnswer`、`bestAnswer`、`knowledgeCandidate` |
| `style-learn.ts` | 只学本人文本，合并进风格档案，渲染成 `<account>-style` 技能 | `collectStyleSamples`、`learnStyle`、`renderStyleSkill`、`writeStyleSkill` |
| `tasks-detect.ts` | 规则找待办、解析期限（相对时间、中文日期） | `findCandidates`、`parseDueAt`、`isDue` |
| `drafts.ts` | 草稿箱读写与内容约束（条数、长度、禁用前缀） | `putDraft`、`checkReplies`、`pendingDrafts` |
| `autopilot.ts` | 托管发送判定，纯函数，三闸 | `decideAutopilot` |
| `loop.ts` | 批次扫描、游标、投递分析会话、定时循环 | `analyzeOnce`、`startAnalysisLoop`、`loadBatch` |
| `reminders.ts` | 到期提醒，本地定时器 + 收件箱，预留宿主定时 | `pollReminders`、`startReminders`、`HostSchedule` |
| `tools.ts` | 注册 `hyt.draft.generate` 等 4 个工具 | `registerAI` |

## 成本纪律

**不是每条消息都调模型。** 链路是：

```
新消息 → 本地预过滤（零成本） → 只要候选 → 落批次文件 → 定时投递分析会话
```

四道闸：

1. **预过滤**：`prefilter.ts` 按信号分、去重、@我/私聊、闲聊黑名单筛，绝大多数群消息在这里就出局。
2. **批量**：一批上限 `profile.cost.batchSize`（默认 50），一次模型调用处理一批，不是一条。
3. **定时**：`profile.cost.analysisIntervalMinutes`（默认 30），循环间隔下限 `MIN_INTERVAL_MINUTES = 5`，首次触发延后 60 秒避开启动初始化。
4. **只处理候选**：`analyzeOnce` 没有候选时直接返回 `empty`，不投递、不调模型；游标照常推进，避免重复扫同一段历史。

首次启用分析只回看最近 `batchSize * 2` 条，不把几年历史一次灌进模型。批次文件只保留最近 `MAX_BATCHES` 份。

## 模型调用方式与取舍

**不在插件里单独接模型 SDK，也不自己管 key。** 走宿主的会话机制：

1. `analyzeOnce` 把候选写成 `hyt/ai/batches/batch_<时间戳>.json`。
2. `startAnalysisLoop` 的 sink 把这些批次投递到固定的分析会话（标题「虹云通分析」），指令里写明这批有几条、开了哪些能力、该调哪个工具。
3. 分析会话的 agent 用 `hyt.analyze.batch` 读候选，再用 `hyt.draft.generate` / `hyt.task.fromMessages` / `hyt.style.update` / `hyt.knowledge.add` 回写。

这样做的理由：

- 复用宿主已有的模型、权限、成本计量与工具循环，插件不需要复制一套 agent 运行时。
- 回写全部走工具，产物是结构化文件（`drafts.json`、`tasks.json`、风格档案），界面直接读，不解析模型自然语言。
- 模型调用失败或会话不可用时，批次文件仍在盘上，状态退化为 `stored`——可以手动触发，也可以等下一轮重投。**不会丢候选，也不会阻塞消息读取。**

代价：分析结果依赖那条会话真的被跑起来；`manual` 触发（`hyt.analyze.batch` 手动跑一次）是不依赖定时器的兜底。

## 托管发送：默认只出草稿

`decideAutopilot` 是纯函数，三道硬校验，任何一道不过就只存草稿：

1. `profile.capabilities.autopilot.enabled === true` 且 `scope !== "off"`；
2. 会话 id（或私聊对方账号）在 `profile` 的白名单里（`scope === "all"` 时跳过这条）；
3. `METAINF` 的 `configuration` 白名单允许这个会话，且 `autoReplyEnabled` 为真——与 `hyt.send.text` 同一套 `isAllowed`，不另立口径。

`service.sendText` 内部还会再校验一次白名单与平台限制，`decideAutopilot` 只是前置判定，不能替代它。托管只发草稿的第一条，其余保留为 `pending`，等人确认。

## 到期提醒：宿主定时优先，本地兜底

宿主的 Promise 插件 SDK 里，`Context` 只暴露了 `experimental.terminal / generate / artifact`，**没有 `experimental.schedule`**。所以当前实现是：

- 插件内 `setInterval` 轮询（`startReminders`），到期的任务走 `ctx.inbox.publish` 发一条提醒；
- 已提醒记录写在 `hyt/ai/reminded.json`，键是「任务 id + 期限」，改期限会重新提醒一次（刻意如此）；
- `reminders.ts` 预留了窄接口 `HostSchedule`：将来宿主暴露定时能力时注入即可，排进宿主成功就返回 `true`，本地不再重复提醒；排失败自动回退本地。

这条取舍的代价是：应用没在跑时不会提醒。设置页与技能文档已注明这一点。

## 数据文件

都在插件数据目录的 `hyt/` 下：

| 路径 | 内容 |
| --- | --- |
| `hyt/ai/cursor.json` | 已扫到的最大消息 id |
| `hyt/ai/batches/batch_<ts>.json` | 候选批次（含预过滤计数与投递状态） |
| `hyt/ai/reminded.json` | 已提醒记录与已排定的宿主定时 |
| `hyt/drafts.json` | 草稿箱，界面读它 |
| `hyt/style/<account>.json` | 风格档案 |
| `hyt/tasks.json` | 待办 |

风格技能写在插件包的 `skills/<account>-style/SKILL.md`；写不进去时回退到 `<data>/hyt/skills`。这份技能不注册进全局技能列表，靠分析会话显式加载。

## 测试

从 `plugins/hyt` 目录跑单文件：

```
bun test test/ai-prompt.test.ts
bun test test/ai-knowledge.test.ts
bun test test/ai-filter.test.ts
bun test test/ai-tasks.test.ts
bun test test/ai-drafts.test.ts
bun test test/ai-reminders.test.ts
bun test test/ai-loop.test.ts
```

所有断言都针对纯函数或临时目录，不连真实平台、不发真实消息。注意 `bun test` 运行时区是 UTC，跨时区断言必须用 `Z` 绝对时刻。

## 未完成项

- `METAINF` 里新增配置项的 `title` / `description` 文案由设置页会话补，本文只描述语义。
- 宿主未暴露 `experimental.schedule`，提醒是「应用在跑才提醒」；`HostSchedule` 注入点是预留给宿主升级的。
- 摘要（`digest`）能力目前只有档案开关与预过滤计数，还没有独立的摘要生成与展示入口。
- 风格学习只覆盖文本消息（`MsgType` 1 / 11），语音转写与引用回复暂不入样本。
