import { Effect } from "effect"
import type {
  ContextEntry,
  DynamicFacts,
  JournalEntry,
  MemoryInjection,
  StateClaim,
  ToolDecl,
  TurnInput,
} from "./entry.js"
import { LayerViolation } from "./errors.js"
import type { AbsorbCommand, Snapshot } from "./snapshot.js"
import type { RequestPlan } from "./plan.js"

/** 外部供给槽：除 turn/history 外全部可选；类型上没有 L1–L3 的写入位。 */
export interface AssembleInput {
  readonly sessionID: string
  /** L3：折叠段之外的新历史条目（core 投影产出，append-only）。 */
  readonly history: ReadonlyArray<ContextEntry>
  readonly turn: TurnInput
  readonly l4Extra?: ReadonlyArray<StateClaim>
  readonly l5?: DynamicFacts
  readonly l6?: MemoryInjection
  readonly l8?: ReadonlyArray<ContextEntry>
}

/** 首聊装配：L1/L2 由内核现场经 SourceReaders 全量读取一次，产出快照 v1。 */
export interface StartInput {
  readonly sessionID: string
  readonly history: ReadonlyArray<ContextEntry>
  readonly turn: TurnInput
  readonly l4Extra?: ReadonlyArray<StateClaim>
  readonly l5?: DynamicFacts
  readonly l6?: MemoryInjection
  readonly l8?: ReadonlyArray<ContextEntry>
}

export interface ContextAPI {
  readonly start: (input: StartInput) => Effect.Effect<{ readonly plan: RequestPlan; readonly snapshot: Snapshot }>
  /** 热路径：纯读快照 + 尾部拼装，零 observe、零 L1–L3 重建（DESIGN.md §4）。 */
  readonly assemble: (input: AssembleInput) => Effect.Effect<RequestPlan>
  /** 全系统唯一版本写路径：advance 只拨 prefixVersion，compaction 双时钟同拨。 */
  readonly absorb: (sessionID: string, command: AbsorbCommand) => Effect.Effect<Snapshot>
}

/** 快照存储端口。core 实现包 `instruction_state` 表；测试用内存 fake。 */
export interface SnapshotStore {
  readonly load: (sessionID: string) => Effect.Effect<Snapshot | undefined>
  readonly save: (snapshot: Snapshot) => Effect.Effect<void>
}

/** 现实来源端口：start 取 L1/L2 原料，absorb 取账本结算原料。热路径不调用。 */
export interface SourceReaders {
  readonly staticLayers: () => Effect.Effect<{
    readonly l1: ReadonlyArray<ContextEntry>
    readonly l2: ReadonlyArray<ToolDecl>
  }>
  readonly journal: () => Effect.Effect<ReadonlyArray<JournalEntry>>
}

export interface ContextDeps {
  readonly store: SnapshotStore
  readonly sources: SourceReaders
}

/** P0 骨架：IO 形状定稿，行为在 P1（start/assemble）与 P2（absorb）落地。 */
export function makeAPI(_deps: ContextDeps): ContextAPI {
  const unimplemented = (name: string, phase: string) =>
    Effect.die(new LayerViolation("not_implemented", `${name} lands in ${phase}`))
  return {
    start: () => unimplemented("assemble.start", "P1"),
    assemble: () => unimplemented("assemble.next", "P1"),
    absorb: () => unimplemented("absorb", "P2"),
  }
}
