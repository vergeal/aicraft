export type ViolationCode =
  /** 请求内容与快照前缀字节不符。正常路径不可能发生，出现即旁路 bug。 */
  | "prefix_drift"
  /** 装配顺序逆于变更频率声明。 */
  | "layer_order"
  /** 外部供给试图写 L1–L3。 */
  | "frozen_slot"
  /** 预算越界。P3 已定夺：软截断 + 审计，不硬拒（见 budget.ts `applyBudget`，越界整条丢弃并记账）。 */
  | "budget_exceeded"
  /** P0 骨架桩：签名就位、行为未实现。 */
  | "not_implemented"

/** 分层纪律违反。按不变式设计，这代表 bug 而非运行时业务错误，应作为 defect 上抛。 */
export class LayerViolation extends Error {
  readonly code: ViolationCode

  constructor(code: ViolationCode, detail: string) {
    super(`context layer violation [${code}]: ${detail}`)
    this.name = "LayerViolation"
    this.code = code
  }
}
