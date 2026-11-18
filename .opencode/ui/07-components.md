# 07 · 组件规范

> 所有尺寸为 CSS px；「实现 B」列为源码实测，「实现 A」列为 token/变量实测值。状态枚举是代码里真实存在的分支，不是补全。

## 总表

| 组件 | 高 | 圆角 | 字号/行高 | 内距 | 关键 token |
|---|---|---|---|---|---|
| Button md | 36 | 12 | 14/22 | 0 14 | `button-primary-fill` |
| Button sm | 28 | 8 | 12/18 | 0 10 | 同上 |
| Input | 32 | 12 | 14/22 | 0 8 | `bg-layer-1` + 0.5px `border-l4` |
| SegmentedControl | 36（容器） | 12 | 13/20 | 4 | `interactive-bg-hover` |
| Switch | 20 | 999 | — | 2 | `brand-primary` |
| Checkbox | 16 | 4 | 14/20 | — | `label-primary` |
| Modal | 自适应 | 28 | 16/24（标题） | 24 | `bg-layer-2` + `elevation-prominent` |
| Menu | 自适应 | 16（紧凑 12） | 14/22 | 4 | 玻璃 + `elevation-prominent` |
| Tooltip | 自适应 | 8 | 13/20 | 3 7 | `tooltip-bg` |
| Toast | 自适应 | 16 | 14/22 | 12 16 | `toast-bg` + `shadow-lv3` |
| Tag | 17 | 999 | 11/17 | 1 8 | `state-*` 10% 混色 |
| Pill | 24 | 999 | 12/18 | 0 8 | `bg-layer-2` |
| Badge | — | 999 | — | — | 实现 A `--badge-radius: full` |
| Avatar | — | 999 | — | — | `--avatar-radius: full` |

---

## Button

**变体（实现 B 4 种 / 实现 A 5 种）**

| 变体 | 背景 | 文字 | 边框 | 用途 |
|---|---|---|---|---|
| `primary` | `brand-primary`（黑/白） | `label-primary-foreground` | 无 | 每屏最多 1 个 |
| `ghost` | 透明 → hover `interactive-bg-hover` | `label-primary` | 无 | 工具栏、行内操作 |
| `outline` | 透明 | `label-primary` | 0.5px inset `border-l3` | 次要操作 |
| `toolbar` | `button-tool-bar-fill`（半透明灰） | `label-primary` | 无 | 浮在内容上的工具条 |
| （实现 A）`soft` / `surface` | 低透明度语义色 | 对应 `-soft` 文字 | 无 | 轻量强调 |

**状态**

| 状态 | 处理 |
|---|---|
| hover | 仅 `@media (hover: hover)`，换 `-hover` 色 |
| active | 换 `interactive-bg-active`（比 hover 深一档） |
| disabled | `opacity: 0.4`，`cursor: not-allowed`；**不换色** |
| focus | `outline: 2px` + `outline-offset: 2px`（仅键盘） |
| loading | 文字保留 + 左侧 16px spinner，宽度不变 |

**注意**

- `disabled` 用透明度而非灰色，保证深浅主题下都能看出"这是同一个按钮"。
- 图标 16×16，`gap: 4px`；纯图标按钮宽度 = 高度（正方形），不加左右 padding。
- `outline` 变体不能用 `border`（会改布局），用 `inset box-shadow`。

---

## Input

```
┌─────────────────────────────┐  32px
│ [16 icon] 文本…             │  padding 0 8px
└─────────────────────────────┘  0.5px border-l4, radius 12
```

| 属性 | 值 |
|---|---|
| 高 | 32 |
| 圆角 | 12 |
| 边框 | `0.5px solid border-l4` |
| 背景 | `bg-layer-1` |
| 内距 | `0 8px`，图标与文本 `gap: 6px` |
| 字号 | 14/22 |
| 占位符 | `label-dimmed`（不是 tertiary，更弱一档） |
| 聚焦 | `:focus-within` 只把 `border-color` 切到 `state-business-primary`，**不加外环** |

**必做**：`::placeholder` 必须单独给色；`textarea` 需 `max-height` + 内部滚动（实现 B 输入区上限 336px）。

---

## SegmentedControl / Tabs

| 属性 | 值 |
|---|---|
| 容器高 | 36（`padding: 4px` + tab 28） |
| 容器圆角 | 12，背景 `interactive-bg-hover` |
| 指示器 | 圆角 8，背景 `bg-layer-1`，`elevation-soft` |
| 指示器宽度 | `calc((100% - 8px - 2px × (n-1)) / n)` |
| tab 内距 | `0 16px`，字号 13/20 |
| 动画 | `transform` 160ms |
| 选中文字 | `label-primary`；未选中 `label-secondary` |

**注意**：指示器不改宽度（各段等宽）；若必须不等宽，改成"测量 + translate"而非缩放，避免文字被拉伸。

---

## Switch

| 属性 | 值 |
|---|---|
| 轨道 | 36×20，圆角 999（必须 `corner-shape: round`） |
| 轨道内距 | 2 |
| thumb | 16×16 圆形，`translateX(16px)` 切换 |
| 关态轨道 | `border-l3` |
| 开态轨道 | `brand-primary` |
| thumb 色 | 开 `label-primary-foreground` / 关 `switch-thumb` |
| 动画 | 120ms transform |
| 禁用 | `opacity: 0.5` |

**关键**：状态样式挂在 `aria-checked`，不是并行 class。视觉与无障碍状态不可能不一致。

---

## Checkbox

| 属性 | 值 |
|---|---|
| 盒 | 16×16，圆角 4 |
| 文字 | 14/20，`gap: 6px` |
| 禁用 | 整行 `opacity: 0.5` |
| 聚焦 | `input:focus-visible` 画环 |

原生 `<input type=checkbox>` 优先（可访问性免费）；自定义外观用 `appearance: none` + `::before` 勾，不要用 `div`。

---

## Modal / Dialog

| 属性 | 值 |
|---|---|
| 宽度 | `min(380px, 100%)` |
| 圆角 | 28（`radius-panel`） |
| 背景 | `bg-layer-2` |
| 阴影 | `elevation-prominent` |
| 内距 | `0 0 24px`（底部留白，顶部由 header 控制） |
| header | `22px 14px 12px 24px` |
| 标题 | 16/24 |
| 正文 | 14/22，`label-secondary` |
| 关闭按钮 | 28×28，右上（所以 header 右 14px） |
| 层级 | 遮罩 + dialog；root `z-index: 1000` |
| 遮罩 | `bg-mask-1`（浅 .24 / 深 .5） |

**注意**

- 遮罩透明度**深色更高**（0.5 vs 0.24），因为深色下对比本来更弱。
- 遮罩用 `::after` 叠在容器上，而不是单独 div，减少 DOM 层级。
- 危险确认对话框：标题前 16px 警告图标（`state-warn-primary`），不要整块染红。
- 宽度 380 是"一句话能读完"的上限；表单类对话框放宽到 480–560，并要求 `padding` 从 24 起。

---

## Menu / 上下文菜单

| 属性 | 值 |
|---|---|
| 列表内距 | 4 |
| 项间距 | 0（靠项自身 padding 撑开） |
| 圆角 | 16（紧凑变体 12） |
| 阴影 | `elevation-prominent`（描边色重绑为 `border-l1`，比默认更淡） |
| 最小宽 | `min(144px, calc(100vw - 24px))` |
| 最大宽 | `min(360px, calc(100vw - 24px))` |
| 层级 | 普通 100；portal 1100 |
| 材质 | `rgba(252,253,254,.7)` / dark `.64` + `blur(40px) saturate(150%)` |
| macOS | 平台为 darwin 时改为 0.94 近不透明 |

**注意**

- 菜单项高度 28–32，图标 16，右侧快捷键 11px `label-tertiary`。
- 上下文菜单与下拉菜单是两个触发器、同一套表面；用属性区分，不要两套样式。
- `max-width` 必须用 `100vw - 24px` 兜底，否则长路径/URL 会撑破视口。

---

## Tooltip

| 属性 | 值 |
|---|---|
| 内距 | `3px 7px`（带快捷键时右侧 5px） |
| 圆角 | 8 |
| 字号 | 13/20 |
| 背景 | `tooltip-bg`（浅 `neutral-bluish-850` / 深 `750`） |
| 文字 | `tooltip-label`（白） |
| 最大宽 | `min(50vw, calc(100vw - 24px))` |
| 入场 | `opacity 0→1`，150ms |
| 指针事件 | 默认 `none` |

**注意**：`width: max-content` 不可省——固定定位下 shrink-to-fit 只会量到视口右缘，靠右的锚点会提前换行。

---

## Toast

| 属性 | 值 |
|---|---|
| 内距 | `12px 16px` |
| 圆角 | 16 |
| 字号 | 14/22 |
| 背景 | `toast-bg`（深色底，两主题都用深） |
| 阴影 | `shadow-lv3` |
| 最大宽 | `min(640px, calc(100vw - 48px))` |
| 层级 | 1100 |
| 间距 | 多条堆叠 `gap: 10px` |

**注意**：Toast 是唯一"两主题都用深色底"的组件——它在任何背景下都要跳出来。因此其文字色固定白色（`toast-label`），不要跟随主题。

---

## Tag / Pill / Badge

三者的区别是语义不是尺寸：

| | Tag | Pill | Badge |
|---|---|---|---|
| 用途 | 分类、状态 | 可点击筛选、计数 | 未读数、角标 |
| 高 | 17（行高） | 24 | 内容撑开 |
| 字号 | 11/17 | 12/18 | 10–11/14 |
| 内距 | `1px 8px` | `0 8px` | `0 4px` |
| 交互 | 无 | 可 hover/active | 无 |
| 圆角 | 999 | 999 | 999 |

Tag 的 `tone` 枚举：`outline / solid / neutral / quiet / success / info / warning / danger`。
彩色 tone 的背景是 `color-mix(in srgb, state-color 10%, transparent)`，不是独立色板——**换主题时自动跟随**。

Pill 的选中态：`button-ghost-active-fill` + `inset 0 0 0 1px ghost-active-border`（1px 而非 0.5px，因为胶囊边缘太细会糊）。

---

## Card

| 属性 | 值 |
|---|---|
| 内距 | 16（`p-4`）/ 20（大卡片） |
| 圆角 | 12–16 |
| 背景 | `card-fill`（浅 `neutral-50` / 深 `neutral-850`） |
| 边框 | 0.5px `border-l4` 或 `elevation-stroke` |
| hover | `card-fill-hover`，**不位移、不放大** |

卡片不用阴影抬升，用填充色差 + 描边区分层级——这是"内容型界面"的通用选择（阴影多了会脏）。

---

## CodeBlock / Terminal

| 属性 | 值 |
|---|---|
| 背景 | `markdown-code-block`（浅 `neutral-bluish-50` / 深 `900`） |
| 顶部条 | `markdown-code-block-banner` |
| 字号 | 11–12 / 19 |
| 字体 | 代码字体栈（不带裸 monospace） |
| 圆角 | 8–12 |
| 行内代码 | `markdown-inline-code`，比正文代码大 1px |
| 最大高 | 288（终端输出，`--terminal-output-max-height`） |
| 空白 | `pre` / 终端 `pre-wrap` |

**注意**：代码块必须能水平滚动而不撑宽父容器（`min-width: 0` + `overflow-x: auto`）；长行禁止自动换行破坏缩进。

---

## MessageBubble（用户消息）

| 属性 | 值 |
|---|---|
| 背景 | `specific-bubble`（浅 `brand-50` / 深 `neutral-bluish-850`） |
| 高亮 | `specific-bubble-highlight` |
| 圆角 | 16–20，靠近头像一侧可减一档 |
| 内距 | `10px 14px` |
| 最大宽 | 内容列的 70–80% |
| 字号 | 14/22 或用户设定正文 |

**注意**：气泡宽度用 `max-width` + `width: fit-content`，不要固定百分比——短消息不该占满一行。

---

## Sidebar 导航项

| 属性 | 值 |
|---|---|
| 行高 | 32–36 |
| 内距 | `8px 12px`（`--sidebar-inline-padding: 8`、`row-padding: 12`） |
| 图标 | 16，与文字 `gap: 6px` |
| 圆角 | 8 |
| 选中 | `sidebar-nav-item-active` 填充 |
| hover | `interactive-bg-hover` |
| 文本 | 单行 `truncate`，`min-width: 0` |

**注意**：`truncate` 必须配 `min-width: 0`，否则 flex 子项不会收缩，长标题会把侧栏撑开。
