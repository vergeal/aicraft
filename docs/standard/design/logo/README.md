# 客户端 Logo · 24 网格

按 [10-icons](../10-icons.md) 重建的客户端标识。看效果直接打开 [preview.html](preview.html)，配色候选见 [colors.html](colors.html)。

## 资产

| 文件 | 用途 |
|---|---|
| `packages/ui/src/assets/brand/logo-mark-color.svg` | 主色 mark，渐变环 + 浅青核，用于品牌位、启动页、营销 |
| `packages/ui/src/assets/brand/logo-mark-color-quiet.svg` | 备选，墨环 + 渐变核，界面里需要彩色但不抢视线时用 |
| `packages/ui/src/assets/brand/logo-mark.svg` | 线性 mark，24 网格、描边 2，≥20px，继承 `currentColor` |
| `packages/ui/src/assets/brand/logo-mark-solid.svg` | 实心权重，16px 及以下 |
| `packages/ui/src/assets/brand/favicon-logo.svg` | 应用图标，512 网格、固定品牌色 |

## 几何

- 24 网格，路径落在 3–21，描边 2（中心线描边）→ **视觉边界 2–22**，四周正好留 2px 安全区。
- 外框圆角 5.5，内块 7×7、圆角 1.5：圆角比 3.7:1，形成「窗口包内容」的层次，小尺寸下不糊。
- 16px 渲染时描边自动为 `2 × 16/24 ≈ 1.33px`，与规范「16 网格用 1.25」的换算一致，不需要另出一套尺寸图。
- 端点与连接全部 `round`，全产品只有一种描边风格。

## 色彩

| 位置 | 色值 |
|---|---|
| 环渐变 | `#00E08A → #00D4A0 → #00B4FF`（0 / 55% / 100%，左上到右下） |
| 内核（浅色） | `#5EEAD4` |
| 内核（深色） | `#99F6E4` |
| 墨环（备选） | 浅色 `#171717` / 深色 `#F1ECE4` |
| 应用图标底 | `#131010` |

三条规则：

1. **彩色 mark 是独立品牌体系**（10-icons §5）：用固定 `fill`/`stroke`，不参与 `currentColor`；界面里内嵌的图标仍用单色线性版。
2. **深浅不是反色**（02-color §2）：环的渐变两端在两种背景上都成立，深色下只把内核提亮一档。
3. **品牌色只出现在标志、链接和指示器**（02-color §6），主操作按钮仍是黑白。

## 命名

权重与配色进名字，尺寸不进名字：`logo-mark` / `logo-mark-solid` / `logo-mark-color` / `logo-mark-color-quiet`，渲染 16/20/24 任意尺寸。

## 应用图标

512 画布，mark 占 72%（368 单位）居中，恒定为深底 `#131010`，不随系统主题切换——浅色桌面上深底反而更醒目。
