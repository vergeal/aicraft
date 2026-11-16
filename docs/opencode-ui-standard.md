# OpenCode UI 开发标准

本文件是 app、desktop、ui、session-ui、gui-plugins 窗口界面的统一开发标准。

它由以下事实来源合成，任何数值都以代码为准：

- `packages/ui/src/styles/tokens/theme.css`：颜色、材质、字体、行高与阴影 token。
- `packages/ui/src/styles/base.css`：全局重置、拖动区域、减透明降级。
- `packages/ui/src` 下的共享组件及其 CSS（`navigation/menu`、`overlays/dialog`、`forms/*`、`actions/button`、`components/*`）。
- 各包的 `AGENTS.md`：`packages/app/AGENTS.md` 与 `packages/ui/AGENTS.md` 的 Typography / Fonts / Scrolling / Loading Indicators / Suspense / Localization 章节。
- `packages/app/src/shell/replica/replica.css` 与 `packages/session-ui/src` 的窗口骨架与时间线实测。

冲突时按此顺序取舍：

1. 仓库 token 与共享组件。
2. 本文件的尺寸与状态规则。
3. 两者都没有覆盖的设计细节按本文件新增规则，但必须能指出代码依据；**颜色一律映射到 `--v2-*` token，不写 hex**。

---

## 1. 设计基调

一句话：**白底、细线、紧凑行、单层卡片、中性选中、一个强调色。**

- 层级靠背景层、间距和 0.5px 分隔线建立，不靠渐变、玻璃拟态或大面积阴影。
- 一屏只允许一个主操作：主操作用 `contrast`（深墨底 + 亮字），其余操作一律灰白或无底色。
- 选中态用中性灰，不用品牌蓝填充整行。
- 卡片只抬升一层；卡片里再套卡片说明层级错了。
- 信息密度偏紧凑（13–15px UI 文本），但正文描述保持可读行高。
- 只读优先：浏览、搜索、打开目录、重新扫描先做；启用、删除、写入放在确认之后。

评审时可以直接用这句话当标准：*“管理页只回答三个问题——下次什么时候跑、上次结果如何、要不要改。”* 每个新页面都应能回答同样清晰的 2–3 个问题，回答不了就是信息没分层。

---

## 2. 颜色：token 映射

颜色只走仓库 token，不引入第二套灰阶或语义色：

| 用途 | 仓库 token | 说明 |
| --- | --- | --- |
| 页面底色 | `--v2-background-bg-base` | 浅色 `grey-50`，深色 `grey-1100` |
| 浅层分组 / 侧栏 | `--v2-background-bg-deep` / `--v2-background-bg-layer-01` | `grey-100`；深色分别 `grey-1200` / `grey-1000` |
| 行选中、次级表面 | `--v2-background-bg-layer-02` | `grey-200`；深色 `grey-900` |
| 更重的层 | `--v2-background-bg-layer-03` | `grey-300`；深色 `grey-800` |
| 主文本 | `--v2-text-text-base` | `grey-1100`；深色 `grey-100` |
| 描述文本 | `--v2-text-text-muted` | `grey-700`；深色 `grey-500` |
| 元信息 | `--v2-text-text-faint` | `grey-600`；深色仍是 `grey-600` |
| 细分隔线 | `--v2-border-border-muted` | `alpha-dark-8`；深色 `alpha-light-8` |
| 标准边框 | `--v2-border-border-base` | `alpha-dark-10`；深色 `alpha-light-10` |
| 强调边框 / 输入框 | `--v2-border-border-strong` | `alpha-dark-20`；深色 `alpha-light-20` |
| 强调色 | `--v2-system-accent`（经 `--v2-background-bg-accent` / `--v2-text-text-accent` / `--v2-icon-icon-accent` 引用） | 浅色 `#007aff`，深色 `#0a84ff`；不要在组件里写这两个 hex |
| 强调弱底 | `--v2-system-accent-soft` | accent 16% 混合，只作弱底 |
| 成功 / 警告 / 危险 / 信息 | `--v2-state-fg-*`（前景）、`--v2-state-bg-*`（底色）、`--v2-state-border-*`（边框） | 五档语义色，三组 token 配套使用 |
| 遮罩 | `--v2-overlay-simple-overlay-scrim` | 浅色 `alpha-dark-40`，深色 `alpha-dark-60` |
| hover / pressed | `--v2-overlay-simple-overlay-hover` / `--v2-overlay-simple-overlay-pressed` | hover 更浅，pressed 更深 |
| 卡片 / 浮层 / 弹窗阴影 | `--v2-elevation-raised` / `--v2-elevation-floating` / `--v2-elevation-overlay` | 三档深度，不混用 |

硬性规则：

- 功能 CSS 里不写 hex、`rgb()`、`hsl()`。
- 语义色只用 `--v2-state-fg-*` 做前景；状态底色需要新增 token 时先扩展主题，不要借邻近色。
- 状态徽章（成功/警告/危险/中性）必须同时有前景色和可辨识的形状或文字，不能只靠颜色区分。
- 列表行选中用中性灰（`--v2-background-bg-layer-02` 或侧栏的 `--color-selected`），不用 accent 填整行。accent 用于焦点环、开关、链接与主操作。

---

## 3. 字体与字号

遵循 `packages/app/AGENTS.md` 的 Typography / Fonts 全节。行高的实际取值以 `theme.css` 为准：`--line-height-tight: 14px`、`--line-height-compact: 18px`、`--line-height-base: 22px`。

| 角色 | 规格 |
| --- | --- |
| 页面/工作区标题 | 19px（`--font-size-workspace-title`） |
| 详情标题 | 17px，`-0.13px`，weight 530（`[data-slot="dialog-title"]`） |
| 区块标题 | 13px；分组标签 12px、`--v2-text-text-faint`（菜单组标签同样 12px） |
| UI 正文 | 13px / `var(--line-height-compact)` |
| 菜单行、搜索结果行 | 15px / `var(--line-height-compact)`，`-0.04px` |
| 紧凑行文本 | 12–12.5px / `var(--line-height-compact)` |
| 元信息 | 12px / `var(--line-height-compact)`，仅用于非操作信息 |
| 描述正文 | 15px / `var(--line-height-base)`（对话框描述）；设置行描述 12px |
| 代码、路径、日志 | `var(--font-family-mono)` 或 `var(--v2-font-family-code)`，13px / weight 440 / `-0.04px` |

- 禁止 `leading-none`、`line-height: 1`、13px 文字配 13px 行盒。
- 不写字体族字面量；字体只来自 `--font-family-sans` / `--v2-font-family-sans` / `--font-family-mono` / `--v2-font-family-code`。
- 设置页和列表里的按钮、字段标签、行标题默认 weight 400；只给页面标题和真正的强调留粗体。
- 数字列（时间、计数、耗时）用 `font-variant-numeric: tabular-nums`。

---

## 4. 尺寸、间距、圆角

### 4.1 骨架尺寸

窗口骨架来自 `packages/app/src/shell/replica/replica.css` 的 token 表，新页面沿用这些值而不是自行估算：

| 元素 | 代码实际 |
| --- | --- |
| 窗口标题栏 | macOS 39px；Windows 32px（`--titlebar-height`，与 desktop `titleBarOverlay` 一致） |
| 左侧图标导轨 | 46px（`--primary-rail-width`） |
| 会话侧边栏 | 300px，可折叠（`--navigation-sidebar-width`） |
| 侧栏头 / 行 / 项目行 | 49px / 29px / 30px（`--sidebar-header-height`、`--sidebar-row-height`、`--sidebar-project-row-height`） |
| 会话内容宽度 | 650px（`--conversation-content-max-width`） |
| 工作区内容宽度 | 820px（`--workspace-content-max-width`） |
| 输入卡片 | 最大 650px 宽、88px 高、19px 圆角（`--composer-max-width`、`--composer-height`、`--composer-radius`） |
| 设置侧栏 / 内容 | 264px / 最大 720px，内容内边距 32px（`--settings-sidebar-width`、`--settings-content-max`、`--settings-content-inset`） |
| 设置导航项 / 设置行 | 30px / 最小 44px（`--settings-nav-item-height`、`--settings-row-min-height`） |
| 对话框 | 默认 640×368；`large` 640×480；`x-large` min(100vw−32px, 880px) × min(100vh−92px, 600px) |

- 主从分栏：左列表、右详情，各自独立滚动；不要合成单列长滚动。
- 容器宽度优先于视口宽度：用 `@container` 在窄宽度收起侧栏/检查器，而不是把详情压到不可读。
- 窄屏断点为 767px（`@media (max-width: 767px)`）：侧栏与导轨隐藏，标题栏左侧让出；只保留“看结果 + 处理异常”。

### 4.2 间距

只用 2 / 4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 32。

- 行内元素 2–4px；相关控件 8px；区块之间 20–24px；页面内边距 32px。
- 行高固定：侧栏会话行 29px、侧栏项目行 30px、设置导航项 30px、菜单项 28px、按钮 30px（小号 26px）。
- 分组标题：侧栏分组 25px，菜单分组标签 28px，12px 安静文本，不带图标、不带 accent。

### 4.3 圆角

| 表面 | 圆角 |
| --- | --- |
| 标签 / 徽章（`data-component="tag"`） | 2px（`standard` 用 `--radius-xs`） |
| 菜单行 | 4px |
| 输入框、选择器 | 6px（`--radius-md`） |
| 菜单面板、选择器面板 | 8px |
| 卡片 | 6px（`--radius-md`）；设置卡片 10px（`--settings-card-radius`） |
| 弹窗 | 12px |
| 按钮、胶囊、搜索行 | 9999px |
| Toast | 16px |
| 输入卡片 | 14px；replica 工作台覆盖为 19px |

一个表面只用一档圆角，不要在一个卡片里混用两档。

### 4.4 分隔线与阴影

- 分隔线统一 `0.5px`：`border-bottom: 0.5px solid var(--v2-border-border-base)`；“卡片轮廓”用 `box-shadow: inset 0 0 0 0.5px var(--v2-border-border-muted)`。需要 1px 的容器边（工作台面板）用 `--color-divider`。
- 不要 1px 灰线 + 阴影同时用来伪造深度。
- 阴影只给脱离页面的层：`raised` 面板、`floating` 菜单、`overlay` 弹窗。平铺的行和卡片不加投影。
- 浮层材质只有一套：菜单、popover、select、hover-card、context-menu、dialog、toast 全部用 `--v2-material-surface-strong` + `--v2-material-blur-thick`。实测取值：浅色 `grey-50` 72%、深色 `grey-1000` 80%；blur 为 `blur(30px) saturate(180%)`。`--v2-material-surface`（浅色 72%、深色 76%）是同一材质的弱档，当前没有组件在用，不要为它另造浮层。
- 减透明降级由 `base.css` 的 `@media (prefers-reduced-transparency: reduce)` 统一完成：blur 置 `none`，两个 surface 切到各自的 `*-opaque`。组件不要再写第二套降级。
- 内容面板和行永远不做毛玻璃。

---

## 5. 组件规格

### 5.1 按钮

- 高度 30px，小号 26px，大号 32px；水平内边距 12px / 9px / 14px；胶囊形（圆角 9999px）；字号 12.5px / 11.5px。
- 配色按操作角色，不按文案：一组操作里只能有一个主操作，主操作用 `contrast`（`--v2-background-bg-contrast` 底 + `--v2-text-text-contrast` 字），同组的取消、上一步、关闭、返回等次要操作用 `neutral`（`--v2-grey-100` 纸底 + 深墨字，内描 0.5px 边）。深色模式自动反转这一对，语义不变。
- 危险操作用 `danger`（纸底 + `--v2-state-fg-danger` 字），不要用纯黑主按钮表示删除；`ghost-danger` 只用于和其他 ghost 按钮并排的场景。
- 主操作的判定是“用户在这一屏只会点的那一个”：保存、确认、创建、下一步、发送都属于主操作。判断不了就用灰白。
- 工具栏、菜单栏这类纯入口按钮保持灰白或无底色；工具栏里只有当前选中的一项可以用黑底表示激活态。
- 一个按钮组里不允许出现两个纯黑按钮。
- 每个 icon 按钮必须有可访问标签（`aria-label` 或 tooltip 文本）。
- 一个工具栏最多两个 icon 按钮 + 一个溢出菜单。
- 危险操作必须有确认；确认按钮重复“动词 + 对象”，不写“确定”。

### 5.2 列表行

三种共享行，按用途选，不要另造尺寸：

- **侧栏导航行**（`[data-slot="replica-row"]`）：29px 高，8px 水平内边距，8px 圆角；hover 用 `--color-hover`，选中用 `--color-selected`（中性灰）。
- **搜索结果行**（`.search-list-row`）：36px 高，9999px 胶囊，水平 8px，行内 gap 12px；文本 15px / `--line-height-compact`，标题 weight 530。选中与键盘焦点都用 `--v2-overlay-simple-overlay-hover`。
- **菜单行**（`[data-component="menu-v2-item"]`）：28px 高，4px 圆角，`padding: 0 12px`（尾端 6px），行内 gap 8px；文本 15px。
- 行内结构固定为：`图标 → 标题 + 状态点 → 副标题（频率/位置）→ 元信息（下次/计数）`。
- 长文本单行省略，`title` 保留全文。
- 数字列（计数、耗时、时间）用 `font-variant-numeric: tabular-nums`，菜单行与 search-list 已默认开启。

### 5.3 状态徽章

共享徽章是 `data-component="tag"`（`packages/ui/src/data-display/badge`），不要另造胶囊：

- 形状：16px 高、水平 4px、2px 圆角、12px weight 530、`line-height: 1`；`data-appearance="standard"` 为 18px 高、水平 6px、12px / `--line-height-large`。
- 变体只有三类：默认（`--v2-background-bg-layer-02` 底 + 0.5px `border-base` + `--v2-text-text-muted` 字）、`accent`（accent 底 + contrast 字）、`subtle`（`layer-03` 底）。
- 徽章没有 success/warning/danger 变体。状态色走 `--v2-state-fg-*` 的前景与 `--v2-state-bg-*` 的弱底，语义靠文字或图标表达。
- 列表角标优先用“状态点 + 可选短徽章”；不要整行填色。
- 状态必须同时体现在文字上，颜色只是辅助（色盲可读）。

### 5.4 卡片

共享卡片是 `data-component="card"`（`packages/ui/src/components/card.css`）：

- 透明底、无边框、6px 圆角（`--radius-md`）；内边距 10px / 12px / 10px。
- 左侧 2px 圆角色条（`::before`）标识卡片类型：默认 `--v2-icon-icon-base`，可通过 `--card-accent` 覆盖。
- 标题行 gap 8px，标题图标 16px（`--card-icon`），标题 weight medium；描述用 `--v2-text-text-muted`，`pre-wrap` 换行。
- 卡片之间 8–9px 间距，不要用大留白分隔同组卡片。
- 设置页里的卡片用 10px 圆角（`--settings-card-radius`），与设置行 44px 的最小高度配套。
- 新内容可以用 accent 弱边框提示一次，但不要给每张卡都上 accent。

### 5.5 输入框与编辑器

- 单行文本框（`data-component="input"`）高 32px，6px 圆角，1px `--v2-border-border-base`，底色 `--input-base`；选择器（`select-v2`）高 28px（`small` 24px / `large` 32px），同 6px 圆角与 `--v2-elevation-input`。
- 聚焦：文本框 3px `--v2-focus-ring-color` 环（25% 混合）+ 1px `--v2-border-border-focus`；选择器只换 `outline-color`；按钮用 3px outline + 1px offset。
- 多行 composer 用 14px 圆角（replica 工作台覆盖为 19px），结构固定为「内容区 + 工具条」；内容区最小高度为两行 `--line-height-base` + 20px，卡片内边距 12px / 8px。工具条控件统一 28px 高、13px 文字、9999px 圆角。
- 四种输入意图（普通、附件、斜杠命令、@ 提及）共用同一骨架，只换内容与浮层，不新增第二种输入组件。
- 字数/上限计数只在接近上限时出现，用 muted 文本；超限用 `--v2-state-fg-danger`。
- 不把模型/智能体选择藏进设置：它们是输入框上的可点开 chip。可选 agent 多于一个时显示 agent chip（内置 Build / Plan 也算，见 `packages/app/src/providers/models/selection.tsx` 的 `agentsVisible`）。

### 5.6 弹窗

- 遮罩用 `--v2-overlay-simple-overlay-scrim` + `blur(6px)`；弹窗圆角 12px，材质 `--v2-material-surface-strong` + `--v2-material-blur-thick`，阴影 `--v2-elevation-overlay`。
- 尺寸：默认 640×368；`data-size="large"` 640×480；`data-size="x-large"` min(100vw−32px, 880px) × min(100vh−92px, 600px)；`data-fit` 时高度自适应。
- 结构：头部（`dialog-header`，padding 16px，标题 17px weight 530，描述 15px muted，关闭按钮 20px）、正文（`dialog-body`，唯一滚动区）、底部操作区（`dialog-footer`，padding 16px、gap 8px、右对齐）。头部与底部都不加浅底或分隔线。
- 底部主操作在右，最多一个 primary。
- 内容复杂时正文可分两栏，但弹窗本身保持单列；不要把多步流程塞进一个弹窗。

### 5.7 菜单、命令面板、浮层

- 菜单面板（`[data-component="menu-v2-content"]`）：2px 内边距、最小宽 160px、8px 圆角、`--v2-material-surface-strong` + `--v2-material-blur-thick`、`--v2-elevation-floating`，z-index 60；行 28px、4px 圆角。
- 选择器面板复用菜单面板，但 `padding: 0`、最大宽 23rem；行仍按菜单行规格。
- 菜单行 15px；快捷键 12px weight 530 faint；行尾徽章 16px 高、2px 圆角；分组标签 12px weight 530，行高 28px。
- 当前值在行尾显示对勾；图标只用于消歧，不做装饰。
- 命令面板（`packages/app/src/shell/commands/dialog.css`）宽 min(100vw−24px, 640px)，12px 圆角，输入 15px，结果行 13px。
- 列表滚动一律 `MenuScroll`（`@opencode/ui/menu-scroll`）：内边距放 `viewportClass`，键盘滚动与定位用 `viewportRef`，行网格样式挂 `[data-slot="menu-scroll-content"]`。
- 搜索结果为空时给一句话 + 一个动作，不放大插画。
- 同一个动作在所有会话菜单里都要一致：会话行的归档项在 Home 列表、replica 侧栏、titlebar 侧栏与收件箱都提供，文案随会话是否已归档切换成「归档 / 取消归档」，不要用禁用占位项代替。

### 5.8 时间线与消息

- 用户消息右对齐；气泡底色 `--v2-background-bg-layer-02`，内边距 8px 12px，圆角 14px；气泡最大宽度 `min(82%, 64ch)`；连续气泡相接的尾角收到 6px。附件卡与气泡同宽、6px 圆角、0.5px `border-base`。
- 助手消息左对齐，消息内元素间距 10px；正文 13px / 1.65 行高，小标题 14px / 1.5 / weight 600。
- 系统分隔行用 `TimelineSeparator`：32px 高，15px `--v2-text-text-faint`，文字两侧是渐变细线。
- 思考默认折叠为一行标题（`reasoningDefaultOpen` 未开启）；展开正文 15px / `--line-height-base`，`--v2-text-text-muted`，不加底色或圆角。
- 工具调用是带状态和耗时的卡片：头部（工具名 + 参数 code + 成功/耗时）、正文（结果摘要）、必要时 diff/终端块。
- 结构化产出（报告、待办、风险）用消息内卡片，而不是另造“结果页”。
- 流式中的“AI 正在工作”只用 `Spinner`；其他加载用 `Loader`。

---

## 6. 页面范式

### 6.1 主从管理页（例行、技能、扩展）

```
[侧边栏] [页面头: 标题 + 一句说明 + 主操作]
         [工具栏: 筛选 chip + 右侧搜索]
         [列表 300–360px | 详情自适应]
```

- 列表只做“目录”，详情只放事实与操作。
- 详情头：标题 + 状态徽章 + 右上 2 个动作 + 溢出。
- 事实区用 stat grid（浅底、`--radius-md` 圆角），列数按容器宽度定，不固定四列。
- 最近记录按真实数据全量展示；需要截断时说明截断规则，不要写死条数。
- 空状态保留列表，详情区给一句指令。
- 扩展页的插件与技能来自统一的本地发现根：`~/.distribution/plugins/<id>/<version>/` 与 `~/.distribution/skills/<id>/`（`packages/core/src/plugin/local.ts`、`packages/core/src/skill/local.ts`，目录读取见 `packages/app/src/explore/catalog.ts`）。不要引用已废弃的 `~/.ocplugins-local`。
- 技能页的「已安装」只列用户自己写的技能与内置技能（内置插件不上探索页，技能要留在这里可读）；本机安装插件带入的技能归到该插件详情页的 Skills 分区，不混进用户的技能列表。同一规则适用于设置里的工作区技能列表。

### 6.2 工作台（今天）

- 顶部问候 + 一句话摘要。
- 状态条：若干 chip，正常用中性，警告/危险用对应语义色。
- 主体按容器宽度分两栏：左“需要处理 / 进行中”，右“收件箱 / 最近会话”；窄容器收成一列。
- 卡片直接给结论 + 下一步动作，点开才进会话。
- 默认按未读优先，不制造额外通知。

### 6.3 收件箱

- 只收需要决策的事：待采纳、失败、越权请求、归属待确认。
- 每条：图标语义色 + 标题 + 描述 + 来源 + 动作行 + 右侧时间。
- 普通产出留在工作台，不进收件箱。
- 顶部一行筛选（全部 / 待处理 / 失败 / 已完成）。

### 6.4 对话

- 一条会话 = 全部事实：消息、工具卡、diff、终端、结构化产出。
- 输入框常驻底部；渠道/模型/权限是 chip，不是设置项。
- 从对话里改配置时，先生成“变更草案卡片”，由用户确认后应用。
- 反馈行（有用 / 不太对）放在产出之后，说明用途，不用弹窗。

### 6.5 设置

- 页签以 `packages/app/src/settings/pages.ts` 为准：偏好设置、外观、通知、快捷键、项目、工作区、提供商、模型、扩展、服务器、实验、关于。没有“时间轴”和“界面布局”页签；时间线默认只用 `timelinePresets` 里的 `text-only` 预设。
- 左分类 264px（`--settings-sidebar-width`），右内容最大 720px（`--settings-content-max`），两栏独立滚动。
- 设置行最小 44px 高（`--settings-row-min-height`），结构是「左：标题 + 描述」/「右：控件」（`packages/app/src/settings/row.tsx`），不是固定宽度的标签列。
- 设置首页整体居中于 1048px 布局；设置卡片 10px 圆角。
- 强感知的全局设置（字体、主题、语言）单独成组。
- 危险区放最后，带确认。

### 6.6 新建会话

- 居中单列，输入卡片最大 650px（`--composer-max-width`），标题字标最大 660px。
- 一个大输入框，下方直接给最近项目卡片，省掉“先选项目”。
- 输入框内工具条放附件、模型、智能体；主发送按钮在右下。
- 空状态不放大插画，只给输入框和最近项目。

### 6.7 窄屏

- 767px 以下只保留：看结果、处理异常、继续追问。
- 创建、批量操作、diff、设置退回桌面端。
- 底部导航只放一级入口；当前项用文本色加重，不用填充块。

---

## 7. 状态与交互

### 7.1 状态机

任何有生命周期的界面（加载、提交、重连、重试、拖拽、安装）都用显式状态机：

- 一个判别联合类型，独立模块（`machine.ts`），纯 `transition(state, event)`。
- 组件只读 selector，不并排维护 `loading` / `saving` / `open` 三个布尔。
- 异步驱动放在边缘，清理绑定到 owner 生命周期。
- 每个异步路径都要有终点：成功、失败、超时、取消。

### 7.2 空 / 加载 / 错误 / 禁用 / 选中

| 状态 | 规则 |
| --- | --- |
| 空 | 一句安静说明 + 一个下一步动作；无插画 |
| 加载 | 页面/面板/搜索用 `Loader`；AI 工作用 `Spinner`；都不改样式 |
| 刷新 | 保留旧数据，头部放小 `Loader`，不清空、不重置滚动 |
| 错误 | `--v2-state-fg-danger` 一行原因 + 原地重试；不能只靠 toast |
| 部分失败 | 先渲染成功的行，再加一行行内错误 |
| 禁用 | 标签保持可读，遵循共享控件的禁用约定，并说明原因 |
| 选中 | 每个列表恰好一个；指针与键盘选中渲染一致，并同步详情 |

### 7.3 键盘与焦点

- 列表方向键移动、Enter 打开、Escape 关闭最上层浮层、焦点回到触发点。
- 行、tab、菜单项、icon 按钮都必须有可见焦点环。
- 选中行没有焦点指示就是缺陷。
- `MenuScroll` 的 `viewportRef` 用于键盘滚动定位与 scroll-into-view。

### 7.4 动效

- 控件状态 90–150ms ease-out；菜单进入 140ms、popover 150ms（同为 `cubic-bezier(0.22, 1, 0.36, 1)`）。
- 同时尊重 `@media (prefers-reduced-motion: reduce)` 与 `:root[data-motion="reduce"]`。
- 动效必须有目的（状态变化、空间关系），不做装饰性位移。

---

## 8. 滚动、溢出、长列表

- 页面/面板：`overflow-y-auto` + `min-h-0` + `data-scrollable`。
- 菜单、下拉、选择器结果列表：`MenuScroll`。
- 不允许在 `MenuScroll` 之外自造滚动条，不写 `scrollbar-width: thin|auto`、`scrollbar-color`。
- `ScrollView` 只用于会话时间线与 Home。
- 输入框和多行文本在内容溢出时用 `scrollbar-gutter: stable`。
- 不嵌套滚动容器；面板内再滚动就是结构问题。
- 长列表顺序：先搜索 → 再分组（安静的组标题）→ 最后才考虑 sticky 头。

---

## 9. 文案与国际化

- 所有用户可见文案走 `language.t(...)`；数量相关走 `language.plural(baseKey, count, params)`。
- 不硬编码英文，也不硬编码中文；中文来自 `packages/app/src/runtime/i18n/zh.ts`。
- 新功能只加英文源文案，其他语言缺失时回退英文。
- 不拼接句子片段；占位符只放名称、路径、数量这类不可约值。
- 状态、按钮、空状态、tooltip、错误、确认框全部走 i18n。
- 中文优先用开发者社区既有说法，不逐字直译。

---

## 10. 可访问性与语义

- 交互元素用真实语义元素（`button`、`a`、`input`），不拿 `div` 加 click 冒充。
- 每个 icon 按钮有可访问名称；纯装饰图标 `aria-hidden`。
- 状态徽章文本可被读屏读出；不要只靠色点。
- 对比度：`faint` 只用于元信息，不用于可操作标签。
- 焦点顺序与视觉顺序一致；弹窗打开后焦点进入弹窗，关闭后回到触发点。

---

## 11. 交付检查清单

- [ ] 颜色全部来自 `--v2-*`；没有 hex / `rgb()` / `hsl()`。
- [ ] 字体来自 token；没有字面量字体族，没有新增 `@font-face`。
- [ ] 13px 文本配 `var(--line-height-compact)`，正文配 `var(--line-height-base)`；无 `leading-none`。
- [ ] 选中是中性灰，hover 更浅，焦点可见且与两者不同；accent 只给焦点环、开关、链接与主操作。
- [ ] 浮层统一用 `--v2-material-surface-strong` + `--v2-material-blur-thick`，没有第二套模糊或自制降级。
- [ ] 分隔线 0.5px；平铺行/卡片无阴影；阴影只给浮动层。
- [ ] 一屏只有一个主操作；工具栏 icon 按钮不超过两个且都有标签。
- [ ] 滚动容器符合规则（`data-scrollable` / `MenuScroll` / `ScrollView` 仅在时间线）。
- [ ] 空、加载、刷新、错误、部分失败、禁用、选中七种状态都有设计。
- [ ] 加载用 `Loader`，AI 工作用 `Spinner`，都没有被改样式。
- [ ] 破坏性操作有确认，确认文案重复“动词 + 对象”。
- [ ] 生命周期来自显式状态机，不是多个布尔。
- [ ] 所有文案走 i18n，中文在 `zh.ts`。
- [ ] 浅色和深色都验证过（边框、选中、禁用、空状态）。
- [ ] 窄容器下先收检查器、再收侧栏，详情不被压到不可读。
- [ ] 键盘可达：方向键、Enter、Escape、焦点回归。
- [ ] 动效尊重 reduced-motion，且有明确目的。

---

## 12. 反模式

- 列表与详情堆成一列、共用一根滚动条。
- 每行一个彩色图标，或每个分类一种强调色。
- 中性列表用饱和蓝填充选中行。
- 内容面板做毛玻璃，或每张卡片都加模糊。
- 平铺行上叠投影，再用 1px 灰线伪造层次。
- 桌面面板里出现网页式的超大圆角卡片。
- 满宽危险按钮，或把删除放在导航旁且不确认。
- 硬编码中英文、字面量 `Inter` / `monospace`、裸 hex。
- 13px 文字用 `leading-none`，或在截断行里固定 13px 行盒。
- 页面加载用 `Spinner`，或自造加载指示器与共享组件并存。
- 为了改滚动条外观而引入 `ScrollView` 或 `scrollbar-width: thin`。
- 用 `loading` / `saving` / `open` 多个布尔同时表达一个生命周期。
- 把“结果”另造成一个页面，而不是消息里的结构化卡片。
- 把模型、智能体、权限藏进设置，而不是放在输入框或详情头。
