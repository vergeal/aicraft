# 引导档案契约

首次安装的引导结果只存在这里：AI 行为、提示词片段、定时任务与成本预算都从 `HytProfile` 派生，不再各自读配置。本目录是纯数据层，不含界面、运行时与工具实现；UI 会话和 AI 会话都从 `src/profile/index.ts` import。

## 字段

```ts
HytProfile = {
  version: 1
  account: string
  role: "it-ops" | "tech-support" | "engineering" | "management" | "business" | "other"
  scenes: ("troubleshoot" | "task-intake" | "duty-alerts" | "ticket-close" | "meeting" | "no-miss")[]
  capabilities: {
    digest: { enabled: boolean; everyHours: number }
    tasks: { enabled: boolean }
    reminders: { enabled: boolean }
    knowledge: { enabled: boolean }
    drafts: { enabled: boolean }
    autopilot: { enabled: boolean; scope: "off" | "whitelist" | "all"; whitelist: string[] }
    style: { enabled: boolean }
  }
  cost: { analysisIntervalMinutes: number; batchSize: number; model: string }
  knowledge: { builtin: boolean; paths: string[]; mcpTools: string[] }
  onboarding: { completed: boolean; completedAt?: number; preset?: "ops" | "tasks" | "full" }
  updatedAt: number
}
```

`model` 为空串表示跟随客户端当前模型。`onboarding.completed` 是"引导是否完成"的唯一判据，`isOnboarded` 只读它。

## 默认值

`defaultProfile(account, role = "it-ops")` 是未引导的中性档案：所有自动化关闭、`scenes` 为空、`autopilot.scope = "off"`、内置知识库开启、`cost` 沿用 30 分钟 / 50 条。

## 三套预设

| | 运维值守 `ops` | 任务助理 `tasks` | 全面托管 `full` |
| --- | --- | --- | --- |
| role | `it-ops` | `tech-support` | `it-ops` |
| scenes | troubleshoot, duty-alerts | task-intake, ticket-close | 全部 6 个 |
| digest | 开，每 4 小时 | 开，每天（24 小时） | 开，每 4 小时 |
| tasks / reminders / knowledge / drafts / style | 全开 | 全开 | 全开 |
| autopilot | `whitelist`，名单为空 | `off` | `whitelist`，名单为空 |
| batchSize | 40 | 60 | 40 |
| analysisIntervalMinutes | 60 | 120 | 60 |

预设只给初始值，不会把 `onboarding.completed` 置为 `true`；套用后仍是未完成引导，界面确认后才写 `completed` / `completedAt`。`applyPreset` 返回独立副本，调用方修改数组不会污染预设常量。

## 优先级

```text
默认值 → 预设 → configuration（粗粒度安装期开关）→ 已保存的 profile（引导结果）
```

- `resolveProfile` 一次算完这条链路，调用方不要自己拼。
- `mergeProfile(base, patch)` 只覆盖 patch 里出现的字段：对象逐字段合并，数组整体替换，`undefined` 不覆盖。
- `applyConfiguration` 把 `METAINF` 的 configuration 映射到语义字段：

| configuration | profile 字段 |
| --- | --- |
| `whitelist` | `capabilities.autopilot.whitelist` |
| `autoReplyEnabled` | `capabilities.autopilot.enabled` / `scope`（开启时 off → whitelist） |
| `knowledgePaths` | `knowledge.paths` |
| `mcpKnowledgeTools` | `knowledge.mcpTools` |
| `analysisBatchSize` | `cost.batchSize`（夹到 5–500） |
| `analysisIntervalMinutes` | `cost.analysisIntervalMinutes`（夹到 1–1440） |

引导保存后，profile 的同名字段优先；configuration 仍可作为未引导安装的默认开关。

## 存储

`<plugin data>/hyt/profile.json`，写入用临时文件 + rename 原子替换：

- `loadProfile(dataDir, fallback = defaultProfile(""))`：文件不存在、JSON 损坏或不符合 schema 时返回 fallback，**不回写**，原文件保留给人工修复。
- `saveProfile(dataDir, profile, now = Date.now())`：写入前按 schema 解码一次，不合格直接抛错；`updatedAt` 统一由保存时间决定，返回实际落盘的内容。
- `isOnboarded(profile | undefined)`：`onboarding.completed === true`。

## 测试

`test/profile.test.ts` 覆盖默认值、三套预设、局部合并与数组替换、configuration 覆盖与 profile 优先、损坏 JSON 回退且不覆盖原文件、`isOnboarded`。
