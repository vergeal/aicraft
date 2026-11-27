# Context 子系统设计（终版 v3）

一句话原则：**L1–L3 不不动产，L4 少变更，L5–L8 热变更。**

## 1. 八层模型

| 层 | 内容 | 变更档 | 归属 | 进 L3 历史 |
|---|---|---|---|---|
| L1 | 系统提示词、Harness 机制（agent system、family 解析结果、项目/会话指令、静态注册表指令） | 不动产 | context 自管（快照） | 否 |
| L2 | 能力声明：CodeMode、插件工具、MCP 的 tools schema | 不动产 | context 自管（快照） | 否 |
| L3 | 历史上下文（投影后的消息流：**正文 + 工具结果**；思考默认不回放，见 §1.1） | 每轮追加、追加区之前不动 | context 自管（快照/折叠） | 本体 |
| L4 | 变更状态声明（search 已不可用 / 又可用了——**替换式**，只反映最新态） | 少变更 | context 账本渲染 | 否 |
| L5 | 动态描述（日期、环境变化） | 热变更 | 调用方注入槽（默认 context 时钟） | 否 |
| L6 | 记忆层（**memory 子系统检索产出**，命中即携带、不去重、临时） | 热变更 | 外部供给 | 否（其效果经 L3 交互痕迹体现） |
| L7 | 本轮问答输入 | 每轮 | 调用方注入槽 | 轮末转 L3 |
| L8 | 尾部注入（MAX_STEPS、CONTINUE_AFTER、system-reminder、steer） | 热变更 | 调用方注入槽（注册表声明） | 否 |

装配次序即表序。缓存语义：L1–L4 在版本内字节稳定；L4 变化只失效 L4 及其后小段；L5–L8 本就在尾部热区，不计较。

### 1.1 L3 回放细则

**L3 只存正文，思考不进回放**——落库（durable 消息流）不变，UI 可回看；进请求的映射规则：

1. **正常完成的 turn**：只回放正文与工具轨迹，reasoning 一律不进请求（思考逐轮全量重发是最大的隐性 token 花销之一，切断）。
2. **未完成 turn**（异常终止或用户手动终止）：该消息的**全部思考段**顶替正文回放，并以文字标注明确"这是思考内容、非正文"；模型需要断点线索才不会从头重做。现状 `failAssistant→flush` 已把中断时刻的累积思考全量提交落库，素材完整。
3. **无正文也无思考的终止 turn**：写备注"本轮无任何输出"，并同时标明终止方式（异常终止 / 用户手动终止）。
4. **undo/resend**：L3 线性追加（消息按 seq 单调），undo/resend 即把上一步内容自尾部**线性移除**（现 `SessionRevert` 已符合：删 `seq > boundary` 后缀）。允许连续 undo，每次都是线性往上移除；剩余前缀逐字节不动，与快照缓存语义天然一致（不动 baseline 就不裂缓存）。

已知风险（落地前必须逐 provider 核实）：Anthropic interleaved-thinking、OpenAI encrypted reasoning 这类 provider 把 thinking block 当**工具调用链的重放证明**，同 provider 续接多轮 tool loop 时可能强制要求历史 thinking 随 tool_use 回传——该情形下规则 1 需要按 provider 降级（保留签名块，砍纯文本思考），属 P4 `to-llm-message` 收口时的验收项，不是推翻规则。

## 2. 两个时钟 + 可追溯谱系

**prefix version（前缀版本）**：L1–L3 内容任一重建 → +1。变更 = 缓存断裂点，必须带原因记录。
**epoch（纪元）**：仅当 L3 发生历史折叠（压缩）才推进。epoch 内允许出现多个 version。

```
Epoch 1
├── 原始历史 轮1~50
├── Snapshot v1  { reason: initial }
└── Snapshot v2  { reason: advance, 内容: 插件换装 → L2 schema 重建 }
      ↓ 自动压缩（历史折叠：摘要(1~50) + 保留原文 45~50）
Epoch 2
├── 压缩摘要 + 保留原文 + 新增对话
├── Snapshot v3  { reason: compaction, parent: v2 }
└── 后续 version 演进…
      ↓ 再次压缩
Epoch 3 …
```

追溯结构（进 `Snapshot`，落库存档）：

```ts
interface Snapshot {
  readonly sessionID: string
  readonly epoch: number
  readonly prefixVersion: number
  readonly parentVersion: number | undefined
  readonly bumpReason: "initial" | "advance" | "compaction"
  readonly l1: ReadonlyArray<ContextEntry>
  readonly l2: ReadonlyArray<ToolDecl>
  // L3 由消息投影 + epoch 折叠段组成，折叠段清单随谱系可查
}
```

审计可回答："第 N 轮请求吃的是哪个 epoch/version？v2 为什么比 v1 多断裂一次缓存？"

version 推进的触发面（穷举，除此之外无写路径）：
- `compaction`（epoch+1 且 version+1，历史折叠 + 账本结算 + L2 摘除，一次断裂全结算）
- `advance`（用户显式；version+1，epoch 不变，L3 保留；代价是全请求缓存断裂一次，换变更立即生效）
- 能力变更（工具换装等）**默认不自动触发 advance**：走 L4 告知 + 运行时兜底，攒到下次压缩。手动 advance 是唯一的即时生效通道。

## 3. 不变式

1. version 内 L1–L3 字节不变；请求前缀 ⊇ 快照前缀逐字节一致，违反 = `LayerViolation`。
2. 快照唯一写路径 = `absorb`（compaction / advance 两个入口），core、插件、API 类型上拿不到写权。
3. L4 替换式最新态，由账本重算，可从 durable 事件流复现（账本落事件，渲染不落）。
4. L4 容量边界：只装**短状态声明**；AGENTS.md 等内容型变更不进 L4，只能等 version 推进（防止 L4 变成第二个前缀）。
5. 层序即变更频率序，注册/注入时校验，逆序拒绝。

## 4. IO 契约：八层全槽，L1–L3 编译只读

```ts
interface AssembleInput {
  readonly sessionID: string
  // —— 外部只能"供"这五层 ——
  readonly l5?: DynamicFacts          // 缺省用 context 内置时钟
  readonly l6?: MemoryInjection       // memory 子系统检索结果
  readonly l7: TurnInput              // 本轮输入
  readonly l8?: ReadonlyArray<ContextEntry>  // 尾部注入（经注册表）
  readonly l4Extra?: ReadonlyArray<StateClaim> // 插件申报的状态声明（受层校验）
  // —— L1/L2/L3 无槽：assemble 从 SnapshotStore 读快照 ——
}

interface ContextAPI {
  start(input: AssembleInput): Effect<{ plan: RequestPlan; snapshot: Snapshot }>  // 首聊装配，v1/epoch1
  assemble(input: AssembleInput): Effect<RequestPlan>   // 热路径：读缓存快照，绝不重建 L1-L3
  absorb(sessionID, kind: "compaction" | "advance", fold?): Effect<Snapshot>     // 唯一 version 写路径
}

// 端口（context 包内定义，core 实现；包零依赖 core）
interface SnapshotStore { load(sessionID): Snapshot | undefined; save(s: Snapshot): Effect<void> }
interface SourceReaders { /* Instructions 域 read() / agent 配置 / 工具注册表 的只读包装，产账本原料 */ }
```

"不保证每次都更新"的落实：`assemble` 热路径只做 `SnapshotStore` 读取 + 尾部拼装，零 observe、零渲染 L1–L3——不是"每次都检查要不要更新"，是**根本不看**，更新只可能来自 `absorb`。

## 5. 插件的上下文提供：需要，但只有三个合法入口

需要——memory 子系统本身就是 L6 供给方，skills/mcp/codemode 也在供 L4/L5/L6 内容，关掉供给等于砍掉整个生态。但入口收敛为：

| 入口 | 目标层 | 规则 |
|---|---|---|
| **Turn 供给者**（每轮回调） | L4′声明、L5、L6、L8 | 注册时声明层 + 预算（`LayerBudget`），热变更区随便动，永不触碰前缀 |
| **静态注册**（manifest） | L1、L2 | 装配期读取；运行期改内容→只进账本，version 推进才生效 |
| **session.context hook**（保留） | L5–L8 尾部 | 可改写装配产物尾部；改写 L1–L3 → Violation；注入文本进审计（现行 hookContextSources 语义收编） |

新增治理：**每层 token 预算**。插件刷屏 L4/L5/L8 的防控从"code review"变成"装配器按预算截断 + 审计超标告警"。这正是 packages/context 立项时"统管 token 预算"的原始诉求，在这里闭环。

## 6. 兜底（与核心同期，非后期加固）

- 已卸载工具被调用：执行层对照**真实注册表**（非快照）返回 `tool unavailable` tool result——进 L3，是消息流反馈不碰前缀。
- 手动 advance 入口与 `absorb` 同 PR 上线（P2），否则"变更不可见"的用户摩擦无出口。
- 日期：L5 每轮热更新，v1 冻死日期的副作用已消除。

## 7. 迁移映射

| 现有 | 去向 |
|---|---|
| `baseTranscript`（每步重建 + `project`/`sessionPrompt` 实时重读） | 快照化，实时重读切断。现状最大的漂移源，P1 第一个死 |
| `to-llm-message.ts` | `assemble` 的 L3 映射：按 §1.1 细则实现（思考默认不回放、终止 turn 思考顶正文带标注、空输出备注）；媒体/provider 细节留 adapter（§9 降级条款），interleaved-thinking 类签名保真按 provider 降级 |
| `instruction-state.ts` initial/changed/`advanceEpoch` | initial→Snapshot；changed 时间线注入→废弃（L4 替换式取代）；advanceEpoch→absorb；表/blob→SnapshotStore 适配器 |
| `MAX_STEPS`/`CONTINUE_AFTER_*`/system-reminder/memory 注入 | L8/L6 供给者注册表 |
| family txt + `optimize.ts` override | 装配期解析进 L1（v1 定稿）；运行期 override 通道关闭，变更走账本 |
| claude-agent 3 处独立拼装 | `assemble` 出口的 provider 映射；透传通道接校验 |
| 各域 `instructions.ts`（skill/mcp/codemode/reference/project/api） | 保留 read/render，声明补 `layer` 字段，装配职责上交内核 |
| `contextSources` 审计 | `LayerAudit`（每层字节 + epoch/version + 账本待结算数） |

## 8. 施工清单

- **P0 骨架**：包工程（package.json exports 白名单、tsconfig 同 memory 规格）、§1–§4 全部类型、import 守卫测试（禁依赖 core/server）。验收：进 workspace、typecheck 绿。
- **P1 快照热路径**：`start`/`assemble` 实装；core 切调用点；`project`/`sessionPrompt` 实时重读切断；`LayerAudit` 上线。验收：连续 10 步请求 system 字节相等；新旧 system 数组逐字节 diff 为零。
- **P2 双时钟 + absorb**：谱系落库（epoch/version/bumpReason/parent）；compaction 接线 `absorb`；**手动 advance 同期**；账本落 durable 事件、L4 替换式渲染。验收：手动 advance 后 AGENTS.md 会话中途修改进 v2、v1 期间不可见；谱系可查。
- **P3 供给者体系**：Turn 供给者注册（memory/skill/mcp 先迁）；`LayerBudget` 校验 + 超标告警；hook 通道层限制。验收：插件往 L1 槽塞东西编译失败或运行时 Violation。
- **P4 通道收口**：compaction/title/generate 系统流走同内核；family txt→L1 声明化；claude-agent 接入出口。验收：`grep -rn "system:" packages/core/src/session` 无绕过内核装配点。
- **P5 兜底与收尾**：工具 unavailable 路径收编进层体系；旧路径删除；文档转正 `docs/standard/`。
- 全程约束：小 PR 快合（`timeline-scroll` 热区）；律令只对新建会话生效。

## 9. 风险与降级

- **翻译成本失控**（P1/P4 判断点）：媒体/provider 细节离不开 core 类型 → 降级 `core/src/context/` + 路径 lint，触发即停，不硬撑。
- **advance 的缓存代价**：手动 version 推进 = 全请求缓存断一次。UI 上如实标注成本，防用户当"刷新按钮"狂点。
- **L4 膨胀回潮**：预算校验（P3）前，L4 只收系统账本不收插件申报，防"第二个前缀"复活。
- **mutation 安全**：IO 全类型 Readonly，exports 白名单，评审盯导出面。
