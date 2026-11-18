# 02 · 色彩系统

## 1. 结构对照

| 层 | 实现 A | 实现 B |
|---|---|---|
| 原始色板 | `--gray-*` / `--gray-fixed-*` / `--blue-*` / `--red-*` / `--green-*` / `--yellow-*` / `--orange-*` / `--purple-*` / `--alpha-*` | `--static-{amber,blue,实现 B,green,neutral,neutral-bluish,red,violet}-*` |
| 语义色 | `--color-{background,text,border,ring}-*` | `--alias-{bg,label,border,state,button,markdown,code-diff,chart,scrollbar}-*` |
| 局部色 | `--app-color-*`（70） / `--color-子应用-*`（47） | `--specific-*`（24） / `--menu-*` |
| 深浅切换 | `light-dark(a, b)` 单行 | 两张表 + `body[data-ds-dark-theme]` |

## 2. 中性色轴

两套系统的中性色都不是纯灰：**都带轻微蓝/冷偏**，这是桌面客户端在高饱和显示器上避免"发黄"的通用做法。

| 用途 | 实现 A | 实现 B（light） | 实现 B（dark） |
|---|---|---|---|
| 画布底 | `#fff` | `#fff`（`neutral-bluish-00`） | `rgb(21,21,23)`（`950`） |
| 面板面 | `#fff` → `#212121` | `#fff`（layer-1） | `rgb(35,35,36)`（`875`） |
| 抬升面 | `#e8e8e8` → `#303030` | `#fff`（layer-2/3） | `rgb(44,44,46)`（`850`）/ `rgb(53,54,56)`（`800`） |
| 正文字 | `#0d0d0d` → `#fff` | `rgb(15,17,21)`（`1000`） | `rgb(249,250,251)`（`50`） |
| 次级字 | `--color-text-secondary` | `rgb(97,102,107)`（`700`） | `rgb(207,211,214)`（`300`） |
| 三级字 | `--color-text-tertiary` | `rgb(129,133,140)`（`600`） | `rgb(173,178,184)`（`400`） |

**要点**

- 深色底不是 `#000`。实现 A 面板 `#212121`，实现 B 画布 `rgb(21,21,23)`。纯黑会让浮层无处可抬。
- 实现 B 的深浅关系不是反色，而是**两套独立取值的色阶**：浅色用 00→1000 递增变深，深色用 950→50 递减变浅，同名档位不构成镜像。
- `--gray-fixed-*`（实现 A）是一组**不随主题变化**的灰色，用于需要恒定明度的场景（活动栏、代码区域底）。

## 3. 边框层级（透明度阶梯）

两套系统都用"同色不同透明度"表达层级，这是无边框设计的基础。

| 层级 | 用途 | 实现 A | 实现 B light | 实现 B dark |
|---|---|---|---|---|
| L1 | 分隔线、最弱 | `--color-border-light` `#0000000d`（5%） | `--alias-border-l1` `rgba(0,0,0,.04)` | `rgba(255,255,255,.06)` |
| L2 | 卡片边、输入框 | `--color-border` `#0000001a`（10%） | `l2` `rgba(0,0,0,.10)` | `rgba(255,255,255,.12)` |
| L3 | 可交互边框 | `--color-border-strong`（15%） | `l3` `rgba(0,0,0,.12)` | `rgba(255,255,255,.16)` |
| L4 | 强调边、焦点底 | `--color-border-heavy` `#00000026`（15%） | `l4` `rgba(0,0,0,.16)` | `rgba(255,255,255,.20)` |

实现 A 的 `--alpha-*` 阶梯更细：`--alpha-05 / 06 / 08 / 15 / 16 / 20 / 25 / 30`（值为 `light-dark(#0d0d0dXX, #ffffffXX)`，直接编码 alpha 十六进制）。

**结论**：边框只用 4–5 档透明度，且深色下透明度**比浅色高**（0.16 vs 0.20）。深色背景吸光，同样透明度看起来更弱。

## 4. 文字层级

| 层级 | 实现 A | 实现 B | 典型用途 |
|---|---|---|---|
| 主 | `--color-text` `#0d0d0d`/`#fff` | `label-primary` | 标题、正文 |
| 次 | `--color-text-secondary` | `label-secondary` | 说明、列表副标题 |
| 三 | `--color-text-tertiary` | `label-tertiary` | 时间戳、占位、元信息 |
| 弱 | `--color-text-disabled` | `label-caption` / `label-dimmed` | 禁用、极弱标注 |
| 反色 | `--color-text-{role}-solid`（多为 `#fff`） | `label-on-color` / `label-primary-foreground` | 彩色底上的字 |

实现 B 额外有 `label-primary-foreground`：它是"主按钮上的字"，浅色下是白、深色下是黑——因为深色主题的主按钮是**浅色填充**。这是深色主题最常见的 bug 来源，实现 B 用独立 token 规避。

## 5. 状态色

| 语义 | 实现 A | 实现 B（primary） | 备注 |
|---|---|---|---|
| success | `--color-background-success-solid` → `--green-500` | `--alias-state-success-primary` → `rgb(34,197,94)` | 提交成功 |
| warning / caution | `--color-background-caution-solid` → `--yellow-600` | `state-warn-primary` → `rgb(245,158,11)` | 实现 A 另有 `warning`（orange） |
| danger / error | `--color-background-danger-solid` → `--red-500` | `state-error-primary` → `rgb(236,19,19)` | 破坏性操作 |
| info | `--color-background-info-solid` → `--blue-500` | `state-business-primary` → `rgb(65,118,230)` | 提示、进行中 |
| done | —（无独立色） | `state-done-primary` → `violet-600 rgb(124,58,237)` | 任务完成（实现 B 特有） |
| idle | — | `state-idle-primary` → `neutral-300` | 空闲/未开始 |

**实现 A 多一个 `discovery`（purple）**，用于新功能引导与推荐，和状态色分开；实现 B 把"完成"给了 violet。两者都把紫/蓝留给了「非错误的正向强调」。

## 6. 品牌色策略（关键差异）

| | 实现 A | 实现 B |
|---|---|---|
| 主 CTA 填充 | **黑白**（`--color-background-accent-solid: var(--color-background-neutral-solid)` → `gray-900/950`） | **黑白**（`--alias-brand-primary` → `neutral-bluish-1000/50`） |
| 品牌色出现位置 | 链接、信息态、启动 logo | 链接（`--alias-link`）、信息态、品牌字样 |
| 品牌蓝 | `--blue-500 rgb(59,130,246)`，但 `--color-accent` 在子应用被覆盖为 `#10a37f`、`#007acc` | `--static-brand-500 rgb(65,118,230)` |

> **可迁移结论**：两套实现都把「主操作按钮」做成黑/白，而不是品牌色。品牌色只出现在链接、指示器、插图和加载态。这样按钮在深浅两套主题下都不需要额外调色，也避免了"满屏蓝色按钮"。

## 7. 透明度与遮罩

| 用途 | 实现 A | 实现 B |
|---|---|---|
| 遮罩 | `--color-background-mask-*`（多档） | `--alias-bg-mask-1 rgba(0,0,0,.24)` / `mask-2 .12` / `mask-3 .48` |
| 骨架屏 | `--color-background-skeleton` | `--alias-bg-skeleton rgba(0,0,0,.04)` / dark `rgba(255,255,255,.08)` |
| 交互悬停 | `--color-background-secondary-ghost-hover` | `--alias-interactive-bg-hover rgba(38,49,72,.06)` / dark `rgba(255,255,255,.08)` |
| 按下 | `...-ghost-active` | `--alias-interactive-bg-active rgba(38,49,72,.10)` / dark `.14` |

**实现 B 的悬停色带蓝调**（`rgb(38,49,72)` 而非纯黑），与其中性色轴一致；实现 A 用中性灰。这决定了悬停时界面偏冷还是偏灰。

## 8. 落地规则

1. 组件里**禁止**出现十六进制色值，只能引用语义 token（两套系统都遵守，例外见 01 第 5 节）。
2. 新状态色必须同时提供浅/深两值；只给一值的用 `light-dark()` 或两表同步。
3. 深色下的边框、悬停透明度要**加 2–6 个百分点**，不要照搬浅色值。
4. 彩色底上的文字统一走 `on-color` / `foreground` 类 token，不要写 `#fff`。
5. 语义色不承担装饰职责：插图、图表用 `illustration-*` / `chart-*` 独立命名（实现 B 的 `chart-messages/system/tools` 是好例子）。
