# 05 · 圆角、描边与抬升

## 1. 圆角阶梯

| 档 | 实现 A | 实现 B | 用途 |
|---|---|---|---|
| 2xs | 2px | — | 极小标记 |
| xs | 4px | 4px | 内嵌标签、缩略图 |
| sm | 8px | 8px | 小控件、分段控件指示器 |
| md | 12px | 12px | 默认控件、卡片 |
| lg | 12–16px | 16px | 大卡片、面板 |
| xl | 20px | 20px | 对话框 |
| 2xl | 16px | — | （实现 A 用于内层容器反扣） |
| 3xl | 24px | — | 大面板 |
| 4xl | 24–32px | — | 输入区 |
| panel | — | 28px | 对话框/面板 |
| full | 999px / 50% | 999px | 胶囊、头像、状态点 |

**8 / 12 / 16 / 20 是两套系统共有的四档**，可以直接作为基础阶梯。

### 全局圆角缩放（实现 A）

```css
--radius-2xl: calc(var(--radius-2xl-base) * var(--corner-radius-scale));
--corner-radius-scale: 1;        /* 默认 */
--子应用-corner-radius-scale: 1.25;  /* 子应用 窗口类型 */
```

好处：一套形状语言可整体"变圆"以适配不同产品线（实现 A 常规 1.0，子应用 1.25），不用重写组件。**注意**：胶囊必须显式排除缩放，否则 `999px × 1.25` 会在极端比例下失效。

### 超椭圆（实现 B）

```css
--corner-shape: superellipse(1.5);
```

在支持的引擎上把所有圆角从圆弧改为 1.5 次超椭圆（介于圆与 squircle 之间），视觉更"现代"、更贴合 macOS 图标语言。不支持的引擎自动回退圆弧。

实现 B 的两处例外非常关键：

```css
/* 胶囊与圆形必须退出超椭圆 */
border-radius: 999px;
corner-shape: round;
```

> 若采用 `corner-shape`，**所有胶囊/圆形组件都要显式写 `corner-shape: round`**，否则会变成"方角椭圆"。

## 2. 0.5px 发丝描边（两套系统的共同核心）

桌面客户端在 Retina/高 DPI 下，1px 边框会显得粗、且随缩放抖动；0.5px 更接近"一条线"。

### 实现 B 的实现

```css
.outline {
  border: 0.5px solid transparent;              /* 占位，保住布局 */
  box-shadow: inset 0 0 0 var(--hairline-width, 0.5px) var(--alias-border-l3);
}
```

注释原文：*"The transparent border preserves layout; the inset stroke stays complete at fractional widths."*
即：边框本身是透明的（只占空间），真正的线画在 `inset box-shadow` 上——这样 0.5px 不会被边框舍入规则吞掉，也避免出现/消失时的 1px 跳动。

### 实现 A 的实现

```css
--elevation-stroke: 0 0 0 .5px var(--color-border-strong);
--elevation-stroke-subtle: 0 0 0 .5px light-dark(rgb(from var(--color-border-strong) r g b / .04),
                                                   rgb(from var(--color-border-strong) r g b / .06));
```

描边作为 `box-shadow` 的第一项，与后面的柔光共用同一个列表；颜色可从 `--color-border-strong` 通过 `rgb(from ...)` 直接降透明度，不需要额外 token。

## 3. 抬升体系

### 实现 B：三档 + 独立阴影阶梯

| 变量 | 值 |
|---|---|
| `--elevation-stroke` | `0 0 0 0.5px var(--elevation-stroke-color)` |
| `--elevation-panel` | stroke + `0 3px 8px rgba(0,0,0,.03)` + `0 0 16px rgba(0,0,0,.02)` |
| `--elevation-prominent` | stroke + `0 3px 8px rgba(0,0,0,.04)` + `0 0 20px rgba(0,0,0,.05)` |
| `--elevation-soft` | stroke + `0 4px 16px rgba(0,0,0,.03)` + `0 0 24px rgba(0,0,0,.03)` |
| `--shadow-lv1` | `0 2px 4px rgba(0,0,0,.05)` |
| `--shadow-lv2` | `0 4px 12px .02` + `0 2px 8px .04` |
| `--shadow-lv3` | `0 0 1px .2` + `0 0 4px .02` + `0 12px 32px .08` |

### 实现 A：几何与透明度解耦

```css
--elevation-100-geo: 0 1px 2px -1px;
--elevation-200-geo: 0 2px 4px -1px;
--elevation-300-geo: 0 4px 8px -2px;
--elevation-400-geo: 0 8px 16px -4px;

--shadow-100: var(--elevation-100-geo) rgb(var(--shadow-color) / var(--shadow-alpha-100));
--shadow-100-strong:  var(--elevation-100-geo) rgb(var(--shadow-color) / calc(var(--shadow-alpha-100) * 1.25));
--shadow-100-stronger: var(--elevation-100-geo) rgb(var(--shadow-color) / calc(var(--shadow-alpha-100) * 1.6));

--shadow-color: 0 0 0;
--shadow-alpha-100: .08; --shadow-alpha-200: .08;
--shadow-alpha-300: .1;  --shadow-alpha-400: .12;
```

优点：想调整"浮起来多少"时只改 alpha，几何形状不变；想改方向/距离时只改 geo。**这个拆分方式比整串阴影 token 更能应对迭代**。

### 实际使用值

| 场景 | 值 |
|---|---|
| 输入框（composer） | `0 0 0 1px #0000000a, 0 2px 8px #0000000a, 0 4px 80px 8px #00000006` |
| 侧栏 | `stroke + 0 3px 7.5px #00000008 + 0 0 16px #00000005` |
| 深色输入框内高光 | `inset 0 0 1px 0 #fff3` |

**最大 alpha 0.12、最大模糊 80px。** 超过这个范围就会"发灰"。

## 4. 材质：玻璃只给浮层

| | 实现 A | 实现 B |
|---|---|---|
| 菜单面 | `rgba(252,253,254,0.7)` / dark `rgba(48,49,54,0.64)` | 同量级 |
| 背景滤镜 | — | `blur(40px) saturate(150%)` |
| macOS 特例 | — | `html[data-platform='darwin']` 覆盖为 **0.94 近不透明** |
| 侧栏玻璃 | — | `--specific-sidebar-glass-fill` light `rgb(255 255 255 / .55)` / dark `rgb(255 255 255 / .15)` |

实现 B 的 macOS 特例值得注意：**原生 vibrancy 下透明菜单的合成不可靠**，所以平台为 darwin 时直接放弃透明。这是"玻璃材质必须按平台降级"的真实案例。

侧栏还叠了两层 wash（顶部冷蓝、底部紫灰）与 tint（`color-mix` 混入 40% 蓝紫），让侧栏在大面积浅色中不显脏。

## 5. 描边 vs 阴影的取舍

| 想表达 | 用什么 |
|---|---|
| 元素边界 | 0.5px inset stroke |
| 层级抬升 | stroke + 双层低 alpha 柔光 |
| 聚焦 | 2px outline（`outline-offset: 2px`），不用 box-shadow |
| 分隔 | 1px 线（`border-bottom`），透明度 L1 |
| 遮罩 | 半透明黑，不用 blur（除菜单） |

> **不要用 `box-shadow` 做焦点环**：`outline` 不参与布局、可随 `outline-offset` 外扩，且在 Windows 高对比模式下会被系统接管。

## 6. 落地规则

1. 圆角只用 8 / 12 / 16 / 20 / 28 / 999 六种；中间值（10、14）只在有明确控件尺寸依据时出现。
2. 所有边框优先 `0.5px` + inset stroke；只有表格分隔线用 1px。
3. 抬升最多三档；不允许出现"第四档更浮的阴影"。
4. 阴影 alpha 上限 0.12，模糊半径上限 ~48px（特殊输入区可到 80px）。
5. 用了 `corner-shape: superellipse` 就必须给胶囊/圆形补 `corner-shape: round`。
6. 玻璃材质必须有平台降级分支。
