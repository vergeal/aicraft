# Context 子系统标准

本目录是 context 子系统（`packages/context`）的**唯一事实来源**，与 `docs/standard/design` 同级。代码冲突时以本目录为准。

| 文件 | 内容 |
| --- | --- |
| [DESIGN.md](DESIGN.md) | 八层模型、快照/账本/双时钟、三入口、hook 校验、迁移映射（v3 终版） |
| [PLAN.md](PLAN.md) | P0–P5 施工任务与验收用例，阶段目标与终验标准 |

实现与测试分别位于 `packages/context`（纯内核）与 `packages/core/test/context-*.test.ts`、`packages/core/test/session-runner.test.ts`。
