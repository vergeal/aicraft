# Context 子系统施工任务清单

分支：`subsystem/context`（基线 origin/master）· 设计依据：[DESIGN.md](DESIGN.md)（v3 终版）· 状态：P0–P5 已完成

| 阶段 | 为了什么 | 任务 | 测试用例 |
|---|---|---|---|
| **总目标** | **减少 token 消耗！把 prompt 缓存从"靠纪律"变成"靠结构"：L1–L3 前缀版本内字节冻结，长会话每步省 ~9/10 上下文重算费；同时提示词装配收口一处、可溯源、可审计** | 建成 `packages/context` 子系统并完成六条装配通道迁移 | 终验：一个 50 轮真实会话，除压缩/advance 外每一步请求的 system+tools 前缀与上一步逐字节相等，且缓存读取覆盖全部前缀字节 |
| P0 骨架 | 无风险打底：占住包位与编译边界 | package.json（exports 白名单）、tsconfig（同 memory 规格）、进 workspace；§3–4 全部类型 + `LayerViolation`；import 守卫测试 | ① 守卫测试遍历 `src/**` import 图：出现 `@aicraft/core` / `@aicraft/server` → 失败；② `bun typecheck` 绿；③ 从包外 import 未导出路径解析失败 |
| P1 快照热路径 | **兑现第一笔省钱**：前缀停止漂移 | `start`/`assemble` 实装（热路径纯读快照，零 observe）；core 侧 `ContextEntry` adapter；`SnapshotStore` 包 `instruction_state` 表；切换 `llm.ts` 调用点；切断 `project`/`sessionPrompt` 每步实时重读 | ① golden 字节级：fixtures（内置 agent / 自定义 agent / 有无 AGENTS.md / session 指令 / 多工具集）下新旧 system+tools 数组逐字节相等；② 漂移测试：连续 10 步、中途改 AGENTS.md → 第 10 步前缀与第 1 步相等（旧代码必红、新代码须绿）；③ 会话关闭重开 → 快照 load 结果与关闭前一致；④ 既有会话无快照 → 首请求懒建 v1，请求结果与迁移前字节一致 |
| P2 双时钟 + absorb/advance | 变更可结算、可追溯 | Journal 账本（落 durable 事件，L4 替换式渲染）；`absorb` 纯函数；compaction 接线；**手动 advance 入口（硬性同期，缺此不合入）**；谱系字段落库（epoch / prefixVersion / bumpReason / parentVersion） | ① absorb 单测：矛盾账本（卸载→重装）只留终态进新 baseline、L2 死条目摘除、注册表新增 key 折入；② 双时钟断言：compaction → epoch+1 且 version+1；advance → epoch 不变仅 version+1；谱系可查 v1←v2←v3 链与断裂原因；③ E2E：中途改 AGENTS.md → v1 期间模型不可见 → advance 后 v2 生效且账本清零；④ advance 当次 audit 记 `bumpReason=advance`（缓存断一次要可见） |
| P2.5 L3 回放净化 | **兑现第二笔省钱**：思考不再逐轮重发，断点信息不丢 | `to-llm-message` 按 DESIGN §1.1 实现：正常 turn 只回放正文+工具轨迹；终止 turn 的**全部思考**顶正文回放并文字标注"思考内容非正文"（现状 flush 已把中断时累积思考全量落库，素材完整）；无正文无思考写"本轮无任何输出"+终止方式；仅进程硬杀的孤儿 Started 段无文字、按空输出备注处理；核实逐 provider 的 thinking 签名重放要求（Anthropic interleaved-thinking、OpenAI encrypted reasoning），需要时按 provider 降级为"保签名块、砍纯文本思考"；undo/resend 线性后缀删除的前缀稳定性回归 | ① 正常长会话 20 轮：请求 messages 中 reasoning part 数为 0（provider 降级名单除外）；② 中断一轮（含 3 段思考、无正文）→ 回放末尾 assistant 含全部 3 段且带标注字样；③ 中断且零输出（含硬杀孤儿段场景）→ 备注文本命中且标明终止方式；④ 连续 undo 到任意步后 resend → 存活前缀逐字节不变、缓存不断；⑤ 既有 `to-llm-message`/`session-runner` 相关断言按新语义逐个更新，provider recorded 回归过 |
| P3 供给者体系 + 预算 | 插件生态进得来、刷屏防得住 | Turn 供给者注册（层声明 + `LayerBudget`）；memory→L6、skill/mcp→L4/L5 迁移；`session.context` hook 限尾部层；超标截断 + 告警进审计 | ① 供给者申报 L1–L3 → 编译失败或运行时 `LayerViolation`；② 超预算 → 截断且 audit 标注，不抛错不断流；③ L6 语义：检索命中即携带、miss 尾部为空、任何情况不落 L3；④ hook 改尾部合法，改前缀 → Violation 且本次请求被拒 |
| P4 通道收口 | 干掉旁路（现存的 B/C 两条暗道） | family txt → L1 声明化（装配期解析，运行期 override 通道关闭）；claude-agent 3 处独立拼装接入 assemble 出口校验；compaction/title/generate 系统流走同内核（kind 参数） | ① CI grep 守卫：`packages/core/src/session` 内找不到绕过内核的 system 装配点；② 7 个 family fixtures：模板解析输出与现状逐字节一致；运行期 override 尝试不生效、只进账本；③ claude-agent 透传 event.system 覆盖 → 走校验，违层即 Violation；④ 三种 kind 的 plan 快照测试全部出自内核 |
| P5 兜底与收尾 | 语义闭环，删旧路 | 工具执行层对照真实注册表返回 `tool unavailable` result；删除 core 旧装配残骸；DESIGN/PLAN 转正 `docs/standard/` | ① 插件热卸载后模型调用死工具 → 收到明确 unavailable tool result、前缀字节不变、下一步模型改道；② 全量会话回归 + `bun run check` 绿；③ 故意违规演示：往请求塞漂移内容 → `LayerViolation` 报错拒绝发出 |

## 修订：L3 只追加与撤回标记（subsystem/context 收口）

- L3 只做线性追加，不删除、不改写；撤回在历史尾部写入 durable 标记，被撤回的消息保留。
- 压缩是唯一允许折叠 L3 的入口（epoch+1）；其余路径不得缩短历史。
- 记忆检索只走 L6 动态注入，不写入 L3。
- L2 工具声明与 L1 一起冻结进快照：热卸载后请求仍广告冻结声明，执行层对已死工具返回明确 unavailable。
- 验收：撤回后 system+tools 逐字节不变且标记出现在历史；热卸载后 tools 数组不变；记忆块不出现在 durable 消息中。

## 全程约束

- 每阶段一个小 PR，快合；动的是 `timeline-scroll` 同期热区，rebase 对 origin/master。
- 律令只对新建会话生效（快照首聊创建）；旧会话兼容测试在 P1。
- P4 媒体/provider 翻译成本失控 → 触发 DESIGN §9 降级条款（退 `core/src/context` + lint），先停手汇报再定。
