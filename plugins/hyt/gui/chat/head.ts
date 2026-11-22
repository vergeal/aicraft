/**
 * 头像规则，逐条对齐虹云通桌面端源码（`desktop/src/renderer/src/components/Avatar.tsx`、
 * `GroupAvatar.tsx`）：我们是内置的虹云通，头像不应另起一套观感。
 *
 * - 形状：正方形 + 12% 圆角（`avatarRadius`），不是圆形。
 * - 无图时：名称哈希取色板，显示名字最后两个字。
 * - 群聊：灰底容器 + 成员小方块，按 1/2/3/4/5+ 的九宫格布局（原生 DrawGroupHead）。
 */
const HEAD_PALETTE = [
  "#3370FF",
  "#7B61FF",
  "#F76965",
  "#FF8F1F",
  "#34C724",
  "#14C0C0",
  "#EB459E",
  "#9B59B6",
  "#F5A623",
  "#3BA55D",
  "#E67E22",
  "#5B8DEF",
  "#00A0B0",
  "#D94A9C",
]

/** 群头像容器底色，与虹云通 `GROUP_HEAD_BG` 一致。 */
export const GROUP_HEAD_BG = "#DEDFE3"

export interface HeadMember {
  readonly name: string
  readonly headPath: string
}

/** 名称 → 底色；同一个名字永远同色，不同名字尽量分散。 */
export function headColor(seed: string) {
  const value = seed.trim() || "?"
  let hash = 5381
  for (const char of value) hash = ((hash << 5) + hash + (char.codePointAt(0) ?? 0)) | 0
  return HEAD_PALETTE[Math.abs(hash) % HEAD_PALETTE.length] ?? HEAD_PALETTE[0]
}

/** 头像里的字：默认取名字最后两个字，与虹云通 `avatarText(name, 2)` 一致。 */
export function headText(name: string, chars = 2) {
  const value = name.trim()
  return value.length === 0 ? "?" : value.slice(-chars)
}

/**
 * 群头像成员格子。`n` 是成员数，返回相对容器的百分比矩形（与虹云通 `layoutRects` 相同）。
 */
export function headLayout(count: number) {
  if (count <= 1) return [{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }]
  if (count === 2)
    return [
      { x: 0, y: 0.25, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.25, w: 0.5, h: 0.5 },
    ]
  if (count === 3)
    return [
      { x: 0.25, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ]
  if (count === 4)
    return [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ]
  const rows = Math.ceil(count / 3)
  const cell = 1 / 3
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / 3)
    const column = index % 3
    const inRow = row === rows - 1 ? count - 3 * (rows - 1) : 3
    return { x: (1 - inRow * cell) / 2 + column * cell, y: row * cell, w: cell, h: cell }
  })
}
