# 07 · 层级、阴影与材质

## 1. 五级空间模型

层级不是 z-index，而是"这块东西离用户多近"的综合表达：材质 + 阴影 + 描边 + 是否遮挡交互。

| 级 | 名称 | 典型元素 | 材质 | 阴影 | 圆角 |
| --- | --- | --- | --- | --- | --- |
| Z0 | Canvas | 窗口画布、内容区 | 实色 | 无 | 0 |
| Z1 | Surface | 卡片、输入框、表格、消息块 | 实色 | 无 / 极淡 | 12 |
| Z2 | Raised | 工具栏、浮动操作条、composer | 实色 | `elevation-raised` | 12–24 |
| Z3 | Floating | 菜单、Popover、Toast、右侧抽屉 | 玻璃 / 实色 | `elevation-floating` | 12–16 |
| Z4 | Overlay | 弹窗、遮罩、确认框 | 玻璃（厚） | `elevation-overlay` | 24 |

规则：

1. 同一层级只用一种材质与一种阴影。不允许"Z3 的元素用 Z4 的阴影"。
2. 相邻层级至少通过两种属性区分（如亮度 + 阴影），不能只靠一条描边。
3. 层级越高，面积越小。一个 Z4 弹窗占满窗口即为不合格。

## 2. 阴影

三档，直接引用令牌：

```css
--v2-elevation-raised    /* 0 2 4 .04 + 0 1 2 -1 .08 + 0 0 0 .5px .12 */
--v2-elevation-floating  /* 0 8 16 .04 + 0 4 8 .08 + 0 0 0 .5px .12 */
--v2-elevation-overlay   /* 0 16 32 .04 + 0 8 16 .08 + 0 0 0 .5px .12 */
```

约束：

| 项 | 上限 |
| --- | --- |
| 阴影层数 | 3（1 环境 + 1 接触 + 1 描边） |
| 浅色最大 alpha | 0.12 |
| 深色最大 alpha | 0.40 |
| 最大模糊半径 | 32px（输入区可 80px） |
| 最大 Y 偏移 | 16px |

**禁止**：给静态卡片加阴影；给按钮加投影（主按钮用内高光）；一个元素同时有 `border` 和 `inset 0 0 0 0.5px` 描边。

## 3. 材质决策

### 3.1 三种材质

| 材质 | 定义 | 用于 |
| --- | --- | --- |
| 实色 Solid | 不透明填充 | 画布、内容、卡片、输入框 |
| 玻璃 Glass | 半透明填充 + backdrop-filter | 菜单、Popover、Toast、弹窗 |
| 系统材质 Vibrancy | Electron 窗口级材质 | 侧栏、顶栏（仅 macOS） |

### 3.2 决策表（直接查）

| 元素 | 材质 | 参数 |
| --- | --- | --- |
| 窗口画布 | 实色 | `--v2-background-bg-base` |
| 侧栏（macOS 透明窗） | 系统 vibrancy | `vibrancy: "sidebar"` + 半透明 fill |
| 侧栏（非透明窗） | 实色 | `bg-deep` |
| 顶栏 | 跟随侧栏 / 画布 | 与所在列同表面，不加独立底色 |
| 内容区 | 实色 | `bg-base` |
| 卡片 | 实色 | `bg-base` + 0.5px 描边 |
| 输入框 | 实色 | `bg-base` + `elevation-input` |
| 右侧抽屉 | 实色（贴边） | 与内容同一画布 + 0.5px 左描边 |
| 菜单 / Popover | 玻璃 | `material-surface` + `blur(20px) saturate(180%)` |
| 弹窗 | 玻璃（厚） | `material-surface-strong` + `blur(40px) saturate(160%)` |
| Toast | 玻璃 / 实色 | `material-surface` + `blur(20px)` |
| Tooltip | 反相实色 | `bg-inverse` + 白字 |
| 命令面板 | 玻璃（厚） | 同弹窗 |

### 3.3 玻璃的四个必要条件

只有全部满足才允许用玻璃，否则用实色：

1. **浮在内容上**：背后确实有其他内容可模糊（全屏铺玻璃 = 磨砂塑料）。
2. **面积有限**：不超过窗口面积 40%。
3. **有降级**：`prefers-reduced-transparency`、平台不支持、性能不足时切实色。
4. **文字可读**：玻璃上文字对最坏背景仍 ≥ 4.5:1。

### 3.4 玻璃参数阶梯

| 层 | 填充 | 模糊 | 满足 |
| --- | --- | --- | --- |
| 顶栏 | 画布 82% | `blur(18px) saturate(140%)` | 需要透出后方滚动内容 |
| 菜单 / Popover | 表面 72% | `blur(20px) saturate(180%)` | 需要强分离 |
| 弹窗 | 表面 64% | `blur(40px) saturate(160%)` | 遮挡 + 保持环境感 |
| 弹窗遮罩 | 黑 40% | `blur(6px)` | macOS sheet 观感 |
| 大面板 / 全屏 | 禁止玻璃 | — | — |

**禁止**：`blur(40px)` 用于整页；对每个列表项加 `backdrop-filter`；对 blur 半径做动画。

## 4. 内高光与边缘光

只给 Z2 以上的表面：

```css
inset 0 1px 0 rgb(255 255 255 / 0.9)   /* 浅色：顶边一道亮线 */
inset 0 1px 0 rgb(255 255 255 / 0.04) /* 深色：极弱 */
```

规则：

- 方向永远来自顶部，全站统一。
- 只使用一次，不能上下都加。
- 深色下 alpha 4%–8%，浅色下 60%–90%。
- 高光不能替代描边：仍需要 0.5px 边界。

## 5. 系统材质（macOS Vibrancy）

Electron 窗口级能力，不是 CSS：

```ts
new BrowserWindow({
  titleBarStyle: "hiddenInset",
  vibrancy: "sidebar",
  visualEffectState: "followWindow",
  backgroundColor: "#00000000",
})
```

规则：

1. 只有侧栏 / 顶栏所在列使用系统材质；内容区必须绘制不透明背景。
2. 窗口失焦时材质跟随系统变化（`followWindow`），CSS 不额外降低整页透明度。
3. 非 macOS 平台：Windows 用实色 rail（acrylic 在桌面上发灰，不用），Linux 用半透明 + 实色降级。
4. `prefers-reduced-transparency: reduce` 时必须切实色并移除 `backdrop-filter`。

## 6. 降级矩阵

| 条件 | 行为 |
| --- | --- |
| 不支持 `backdrop-filter` | 实色填 `material-surface-opaque` |
| `prefers-reduced-transparency: reduce` | 实色 + 移除 blur |
| `prefers-contrast: more` | 分隔线加深（30%），描边加深，取消玻璃 |
| `forced-colors: active` | 全部 `Canvas` / `CanvasText`，移除阴影与高光 |
| 窗口失焦 | 材质强调降低，文字不变暗 |
| 性能不足（滚动掉帧） | 该区域切实色，保留阴影 |

## 7. 性能红线

- 滚动容器内的子元素禁止 `backdrop-filter`。
- 同一屏玻璃层不超过 2 个。
- 禁止动画 `backdrop-filter` 或 `filter`。
- 大面积阴影（模糊 > 48px）不得参与过渡。
- 玻璃层必须实测滚动帧率，macOS 1440×900 下不低于 55fps。

## 8. 禁止

- 全屏玻璃、磨砂壁纸式背景。
- 四级以上阴影，或"更浮"的第四档。
- 给卡片、表格行、列表项加阴影表达 hover（用背景与描边）。
- 用描边替代阴影表达抬升（描边只表达边界）。
- 在玻璃上叠第二层玻璃。
