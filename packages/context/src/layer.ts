/**
 * 八层模型：表序即装配序，也是变更频率序（L1 最稳，L8 最热）。
 * 定义与论证见 DESIGN.md §1。
 */
export const LAYERS = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"] as const

export type Layer = (typeof LAYERS)[number]

/**
 * 不动产层：版本内字节冻结，唯一写路径是 absorb（DESIGN.md §3 不变式 1/2）。
 * 外部供给在类型上拿不到这三层的槽位。
 */
export const FROZEN_LAYERS = ["L1", "L2", "L3"] as const satisfies ReadonlyArray<Layer>

/** L4 变更状态声明层：替换式（同 key 只留最新态），少变更。 */
export const STATE_LAYER: Layer = "L4"

export const rank = (layer: Layer) => LAYERS.indexOf(layer)

export const isFrozen = (layer: Layer) => (FROZEN_LAYERS as ReadonlyArray<Layer>).includes(layer)
