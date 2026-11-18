# 01 · 设计范式与工程原则

## 1. 两套系统的定位

| | 实现 A | 实现 B |
|---|---|---|
| 面向 | 消费级 AI 客户端，单窗口、强品牌 | 开发者工作台，多面板、可长时间驻留 |
| 视觉性格 | 克制、圆润、轻盈；`rounded-full` 高频（414 次） | 克制、密度更高；圆角偏中档，边缘更"硬" |
| 信息密度 | 低：`text-sm` 占绝对主导（1703 次），正文 14px | 中高：正文 14px，但三栏 + 终端让单位面积信息更多 |
| 主题可定制 | 浅/深/跟随系统 | 浅/深/跟随系统 + **正文字号、代码字号、终端字号分别可调** |
| 设计系统成熟度 | 高（矩阵完备），但呈现为编译产物 | 高（分层清晰），**注释里保留了设计理由** |

## 2. 视觉语言的收敛点

两套系统由不同团队、不同技术栈实现，却在五个点上一致，这些应视为该品类的"默认正确答案"：

1. **4px 基准，8/12/16 主节奏。** 实现 A `--spacing: 4px`，最高频 `gap-2/3/4`；实现 B 组件内 `gap: 4/6/8/12/16/20/24`，Button `gap: 4px`、Modal `gap: 20px`。
2. **0.5px 发丝描边。** 实现 A `--elevation-stroke: 0 0 0 .5px`；实现 B `--elevation-stroke`，且 Button 的 outline 变体用 `box-shadow: inset 0 0 0 var(--hairline-width, 0.5px)` 保住布局。
3. **无重阴影。** 最大的阴影也只有 `0 12px 32px rgba(0,0,0,.08)`（实现 B `--shadow-lv3`）；单层 hop 阴影被弃用，改成"描边 + 双层柔光"。
4. **玻璃材质只用在高浮层。** 实现 B 菜单 `blur(40px) saturate(150%)`，实现 A 侧栏/浮层同类；正文区一律不透明。
5. **正文 14px。** 实现 A `--text-sm: 14px`，实现 B `--font-s-14`；两者都把 16px 留给内容区/对话正文，UI 外壳用 13–14px。

## 3. 真正的分歧：语义如何组织

同一个"主按钮背景"，两套系统用两种完全不同的机制表达。

### 实现 A：单层 + `light-dark()`

```css
--color-background-accent-solid: var(--color-background-neutral-solid);
--color-border: light-dark(#0000001a, #ffffff26);
--color-text: light-dark(#0d0d0d, #fff);
```

- 深浅色写在**同一行**，由 CSS 原生 `light-dark()` 在运行时解析（依赖 `color-scheme`）。
- 语义靠**命名矩阵**横向展开：`accent | neutral | danger | success | warning | info | caution | discovery` × `solid | soft | soft-alpha | surface | outline | ghost` × `hover | active`。仅 `--color-background-*` 就有 173 个。
- 优点：新增主题不用复制整套变量；缺点：变量数爆炸，靠命名约定维持秩序。

### 实现 B：三层 + 属性开关

```css
/* 1 原始色板 */
--static-neutral-bluish-950: rgb(21, 21, 23);
/* 2 语义层：浅色为基准，深色在 body[data-ds-dark-theme] 覆盖 */
--alias-bg-base: var(--static-neutral-bluish-00);
/* 3 组件局部：允许按表面重绑 */
--specific-sidebar-fill: var(--static-neutral-bluish-50);
```

- 深浅色是**两张表**，由 `body[data-ds-dark-theme]` 切换；`data-ds-theme-source` 记录来源（light/dark/system），供调试与状态同步。
- 语义靠**层级**纵向收敛：`static(≈78) → alias(138) → specific(24)`，alias 就是对外 API。
- 优点：改名、换色、加主题都可控；缺点：两表必须同步，漏写会掉色。

### 结论

> **主题数量 ≤ 2 且不考虑品牌换肤** → 用 `light-dark()`，代码量最小。
> **主题多、要换肤、要组件级局部覆盖** → 用三层变量，维护成本可预期。
> 两者都**不要**在组件里直接写色值；这是两套系统唯一共同的红线。

## 4. 八条可迁移原则（附代码证据）

### 原则 1 · 语义层只暴露用途，不暴露色值

`--alias-label-primary`、`--color-text-secondary` 这类名字不带颜色；改品牌色只需换 static/原始层。
反例：实现 B 里也存在 `--alias-json-tree-keyword` 这类"把用途绑死颜色"的例外，数量约 10 个，属于历史包袱，新代码不应模仿。

### 原则 2 · 变体是有限枚举，不是自由配色

实现 A 的按钮只有 `solid / soft / surface / outline / ghost` 五种填充方式；实现 B 的 Button 只有 `primary / ghost / outline / toolbar`。
**没有第六种**。业务方要新样式时，优先组合已有变体，而不是新增颜色 token。

### 原则 3 · 描边不占布局

实现 B Button 注释原文：

> The transparent border preserves layout; the inset stroke stays complete at fractional widths.

即：`border: 0.5px solid transparent` + `inset box-shadow` 画边。这样 0.5px 在任何 DPR 下都不会被舍入丢失，也不会因出现/消失导致 1px 跳动。
实现 A 用 `--elevation-stroke` 把描边写进 `box-shadow` 列表，同理。

### 原则 4 · 控件尺寸走阶梯，不写魔法数

实现 A 有 10 档：`--control-size-4xs ... 3xl` = 20 / 22 / 24 / 26 / 28 / 32 / 36 / 40 / 44 / 48 px。
实现 B 虽然只显式做了两档（Button `md 36 / sm 28`），但 Input 32、Tag 17（行高）、Pill 24、Switch 20 全部落在同一套数轴上。
**同一屏内相邻控件的高度差必须是阶梯中的相邻或隔一档**，不要出现 35px。

### 原则 5 · 圆角与控件尺寸联动

实现 A：`--button-radius: var(--control-radius-sm)`（282 处引用）。
实现 B：Button `md` 用 `radius-md(12)`、`sm` 用 `radius-sm(8)`。
规律：**控件高度 ≈ 2.5–3 倍圆角** 最协调；胶囊（`999px`）只给 Tag/Pill/头像/状态点，且 实现 B 明确用 `corner-shape: round` 退出超椭圆。

### 原则 6 · 状态样式由语义属性驱动，不由并行的类名驱动

实现 B Switch 注释原文：

> The on/off appearance keys off `aria-checked` rather than a parallel class, so the visual state cannot disagree with the state assistive technology reads.

即 `.switch[aria-checked='true']` 同时决定"看起来"和"读出来"。
实现 A 侧对应的是 `data-*` 属性选择器（如 `[data-state=checked]`、`[data-side=top]`）。
**禁止**用 `.is-active` 这类与可访问状态无关的类表达状态。

### 原则 7 · 动效短、只做位移与透明度、可降级

实现 B 全局只有 4 个动效 token：`--ease-in-out: cubic-bezier(.4,0,.2,1)`、`--transition-duration: .2s`、`fast: .1s`、`slow: .3s`。
组件实际值：Switch thumb `120ms`、SegmentedControl indicator `160ms`、Tooltip 入场 `150ms`。
且 **50 处** `prefers-reduced-motion: reduce`，Tooltip 直接 `animation: none`。
实现 A 用 framer-motion，但时长同样落在 120–200ms 区间。

### 原则 8 · 悬停态必须探测能力

实现 B：304 处 `@media (hover: hover)`，12 处 `pointer: coarse`，11 处 `hover: none`。
**触摸设备不应用 hover 样式**（否则会出现"点完一直亮着"）。这条在桌面端常被忽略，因为默认就是 hover 可用。

## 5. 反模式清单（两套系统里真实存在、但不应复制）

| 反模式 | 出处 | 后果 |
|---|---|---|
| z-index 硬编码散落 | 实现 B（1/2/100/900/1000/1100，无 token） | 新增浮层只能靠试，容易压不住或压过头 |
| 间距无全局阶梯 | 实现 B（组件局部变量约 30 个） | 跨模块对齐靠肉眼，新页面难复用节奏 |
| 语义变量与色值命名混用 | 实现 B `--alias-json-tree-keyword` | 换主题时语义失效 |
| 语义矩阵无上限扩张 | 实现 A `--color-background-*` 173 个 | 命名难以穷举，只能靠 grep 找 |
| 字号档位过密 | 实现 A `xxxs-11 / xxs-12 / xs-13 / s-14` 相邻仅 1px | 视觉上不可辨，实际只在代码里制造选择困难 |
| 字重使用插值值 | 实现 A `510 / 590` | 缺少该可变字体时会回退到 500/600，跨平台不一致 |
