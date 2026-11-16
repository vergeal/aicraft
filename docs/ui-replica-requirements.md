# 桌面端三栏窗口外壳实现要求

状态：已实现，本文描述当前 replica 壳的实际约束
事实来源（以代码为准）：

- `packages/app/src/shell/replica/replica.css`
- `packages/app/src/shell/replica/titlebar.tsx`
- `packages/app/src/shell/replica/rail.tsx`
- `packages/app/src/shell/replica/sidebar.tsx`、`sidebar-tokens.ts`
- `packages/app/src/shell/shell.tsx`
- `packages/desktop/src/main/windows/defaults.ts`、`appearance.ts`

任何尺寸、颜色、路径改动都必须同步更新本文，并以代码为最终依据。

---

## 0. 已确认的决策

| 决策 | 结论 |
| --- | --- |
| 复刻范围 | 三栏窗口外壳替换旧标签页布局，路由与数据层保留 |
| 颜色 | 收敛到 `replica.css` 的一套 `--color-*` token，不映射到 `--v2-*`（深色模式少量引用 `--v2-*`） |
| 字体 | 跟随用户外观设置（`--font-family-sans`），回退 `--font-family-ui` 系统栈；不写死字体族 |
| 与收件箱的关系 | 收件箱已是侧栏的一个目的地，见 `sidebar-inbox.tsx` |

---

## 1. 目标与范围

### 1.1 目标

窗口外壳由四层组成，全部由代码定义，不存在设计稿里的固定基准窗口：

1. 顶部窗口条（titlebar），高度按平台取 39px 或 32px
2. 左侧一级导航（rail），宽 46px
3. 中间导航侧栏（sidebar），默认 300px，可拖动 220–480px
4. 右侧主工作区（main），`<main data-slot="replica-main">`，空闲时为白色工作台

### 1.2 不做

- 对话消息流、设置页、菜单展开与弹窗的实现细节
- 任何截图专用的装饰元素
- 新增设计提案；本文只描述当前实现

### 1.3 数据原则

- 项目、会话、工作区名称来自真实数据，不硬编码。
- 用户可见文案走 i18n（`replica.*` 键位于 `packages/app/src/runtime/i18n/en.ts`、`zh.ts`）。
- 产品名是 `ChangHong Work`（键 `replica.workspace.name`），不翻译。

---

## 2. 几何规格

没有固定基准窗口尺寸。以下值全部来自 `packages/app/src/shell/replica/replica.css` 的 `[data-replica]` 变量表与组件内固定值。

| 项 | 值 | 来源 |
| --- | ---: | --- |
| 窗口条高度（macOS / Linux / Web） | `max(39px, env(titlebar-area-height, 39px))` | `replica.css` `--titlebar-height` |
| 窗口条高度（Windows） | `max(32px, env(titlebar-area-height, 32px))` | `replica.css` `html[data-os="windows"]` |
| 原生窗口标题栏高度（Windows overlay） | 32px，随缩放取 `Math.max(32, 32 * zoom)` | `packages/desktop/src/main/windows/defaults.ts` `titlebarHeight`、`titlebarOverlay()` |
| 一级导航宽度 | 46px | `--primary-rail-width` |
| 导航侧栏宽度 | 300px 默认，拖动范围 220–480px | `--navigation-sidebar-width`、`shell.tsx` `sidebarSize()` |
| 侧栏折叠宽度 | 0px | `--navigation-sidebar-width-current` 由 `shell.tsx` 写入 |
| 侧栏顶部工作区栏高度 | 49px | `--sidebar-header-height`、`sidebar-tokens.ts` `HEADER` |
| 侧栏「新聊天」行高 | 31px | `--sidebar-new-chat-height`、`sidebar-tokens.ts` `PRIMARY` |
| 侧栏普通行高 | 29px | `--sidebar-row-height`、`sidebar-tokens.ts` `ROW` |
| 侧栏行间距 | 2px | `sidebar-tokens.ts` `LIST` |
| 窗口条左侧最小占位 | 176px | `--titlebar-left-min` |
| 面板外边距 / 边框 | 1px / 1px | `replica.css` `[data-slot="replica-workbench"]` |
| 面板圆角 | 12px | `--radius-panel` |
| 行圆角 / 控件圆角 / 卡片圆角 | 8px / 10px / 12px | `--radius-row`、`--radius-control`、`--radius-card` |
| 输入卡片圆角 | 19px | `--radius-composer` |
| 输入卡编辑区最小高度 | 45px | `replica.css` `[data-component="composer-editor"]` |
| 输入区底部间距 | 14px | `replica.css` `[data-component="session-composer-dock"]` |
| 会话内容最大宽度 | 650px | `--conversation-content-max-width` |
| 工作区内容最大宽度 | 820px | `--workspace-content-max-width` |
| 移动端断点 | `max-width: 767px` | `replica.css` `@media`、`shell.tsx` `createMediaQuery` |
| 移动端底部导航条高度 | `52px + env(safe-area-inset-bottom)` | `shell.tsx` `data-slot="destination-bar"` |

硬要求：

- 根节点 `[data-replica]` 必须 `min-width: 0; min-height: 0; overflow: hidden`。
- 主工作区必须 `min-width: 0`，窗口变宽时内容受 `--workspace-content-max-width` 约束。
- 侧栏内容独立滚动（`data-slot="replica-sidebar-scroll"`），窗口条与工作区栏固定不滚。
- 侧栏与主工作区同属一个 `replica-workbench` 面板，用 `border-inline-end` 1px 分隔，不画成两个独立卡片。

---

## 3. 颜色 Token

全部定义在 `packages/app/src/shell/replica/replica.css` 的 `[data-replica]` 与 `[data-color-scheme="dark"] [data-replica]`。

浅色：

```css
--color-titlebar: rgb(246 246 246 / 62%);
--color-rail: rgb(246 246 246 / 62%);
--color-sidebar: rgb(252 252 252 / 62%);
--color-main: #ffffff;
--color-composer: #ffffff;
--color-hover: #f3f3f3;
--color-selected: #e2e2e2;
--color-muted-surface: #f7f7f7;
--color-border: #e8e8e8;
--color-divider: #eeeeee;
--color-divider-glass: rgb(0 0 0 / 10%);
--color-text-primary: #3a3e3f;
--color-text-main: #242424;
--color-text-secondary: #858585;
--color-text-tertiary: #999999;
--color-text-placeholder: #bfc0c2;
--color-icon-primary: #383c3d;
--color-icon-secondary: #858b89;
--color-accent-blue: #69b6f7;
--color-accent-orange: #ed641b;
--color-send-bg: #929596;
--color-send-fg: #ffffff;
```

深色（摘要，完整值见文件）：窗口条与 rail `rgb(8 8 8 / 62%)`、侧栏 `rgb(21 21 21 / 62%)`、导航面 `rgb(21 21 21 / 90%)`、主区 `rgb(15 15 15)`；`--color-hover` / `--color-selected` 改为白色 7% / 14%；文字与图标引用 `--v2-text-*`、`--v2-icon-*`、`--v2-border-border-muted`；面板阴影加深为 40% / 45%。

规则：

- 主工作区纯白（深色为 `rgb(15 15 15)`），不套灰卡片。
- 面板边框 `1px solid var(--color-divider)`；玻璃外壳下 `--color-divider` 在 workbench 与 sidebar-slot 上被替换为 `--color-divider-glass`。
- 悬停/选中只加深少量，不用品牌色整块填充。
- 橙色 `--color-accent-orange` 只用于状态提示；蓝色 `--color-accent-blue` 用于收件箱未读点与「检查更新」图标。

无障碍分支必须保留（同一文件）：

- `@media (prefers-reduced-transparency: reduce)`：玻璃 tint 变为不透明，页面根节点恢复底色。
- `@media (prefers-contrast: more)`：`--color-divider` 提深到 `#c9c9c9`（深色 30% 白）。
- `@media (forced-colors: active)`：所有面板背景回落 `Canvas`，边框改 `CanvasText`。

---

## 4. 字体

字体不写死。窗口条、rail、侧栏、主区都使用：

```css
font-family: var(--font-family-sans, var(--font-family-ui));
```

- `--font-family-sans` 是用户在外观设置里选择的字体（`packages/app/src/settings/model.tsx`）。
- `--font-family-ui` 是回退栈，定义在 `replica.css`：
  `-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif`。
- 不新增 `@font-face`，不引入字体包；新增字体族只允许出现在 `packages/app/src/index.css`（见 `packages/app/AGENTS.md`）。

字号（`replica.css` 变量 + 组件实际取值）：

| 场景 | 字号 / 行高 | 来源 |
| --- | --- | --- |
| 工作区名称 | 19px / 24px / 600 | `sidebar.tsx` 头部按钮 |
| 侧栏一级入口、会话行 | 14px / 20px / 400 | `--font-size-sidebar`、`sidebar-tokens.ts` `ROW` |
| 区块标题 | 13px / 20px / 500 | `--font-size-section`、`sidebar-tokens.ts` `SECTION` |
| 窗口条会话标题 | 14px / 17px / 500 | `replica/titlebar.tsx` |
| 窗口条上下文用量 | 12px / 16px | `replica/titlebar.tsx` `titlebar-context` |
| 正文 / 次要文本 | 14px / 12px | `--font-size-body`、`--font-size-secondary` |

---

## 5. 组件拆分与文件映射

| 组件 | 文件 | 职责 |
| --- | --- | --- |
| 壳体 / 布局 | `packages/app/src/shell/shell.tsx` | `data-replica`、`data-os`、`data-replica-window`、侧栏宽度与折叠、移动端底部导航 |
| 窗口条 | `packages/app/src/shell/replica/titlebar.tsx` | 左半前进/后退/侧栏切换 + macOS 交通灯定位，右半会话位置、可重命名标题、上下文用量 |
| 一级导航 | `packages/app/src/shell/replica/rail.tsx` | 46px rail、6 个目的地、底部检查更新与设置 |
| 侧栏容器 | `packages/app/src/shell/replica/sidebar.tsx` | 按路由切换收件箱 / 定时 / 探索 / 知识 / 会话列表 |
| 侧栏度量 | `packages/app/src/shell/replica/sidebar-tokens.ts` | `HEADER`、`ROW`、`LIST`、`SECTION`、`PRIMARY` 等共享类 |
| 各目的地列表 | `sidebar-inbox.tsx`、`sidebar-scheduled.tsx`、`sidebar-explore.tsx`、`sidebar-knowledge.tsx` | 各自的分区与行 |
| 主工作区 | `shell.tsx` `data-slot="replica-main"` | 路由内容画布 |
| 欢迎页 | `packages/app/src/new-session/view.tsx`、`wordmark.tsx` | 产品字标 + Composer + 最近项目 |
| 输入组件 | `packages/app/src/composer/`，样式由 `replica.css` 覆盖 | 共享 Composer，复刻壳只改外框 |
| 窗口外观 | `packages/desktop/src/main/windows/defaults.ts`、`appearance.ts` | frameless、overlay 高度、vibrancy、背景色 |

`packages/app/src/shell/titlebar/titlebar.tsx`（`titlebarHeight = 36`）是旧布局模块，replica 壳不渲染它；不要按它的数值描述窗口条。

每个组件只控制自己的布局和状态。

---

## 6. 关键视觉细节

### 6.1 窗口条

- `[data-slot="replica-titlebar"]`：`display: grid`，两列
  `max(calc(var(--primary-rail-width) + var(--navigation-sidebar-width-current)), 176px)` 与 `minmax(0, 1fr)`；高度 `var(--titlebar-height)`，背景 `--color-titlebar`，`-webkit-app-region: drag`。
- 折叠或拖动侧栏时列宽以 `220ms cubic-bezier(0.2, 0, 0, 1)` 过渡；`[data-resizing]` 时取消过渡。
- 左半：三个 28px（`size-7`）按钮，依次后退、前进、侧栏切换，图标 `outline-arrow-left` / `outline-arrow-right` / `outline-sliders`；圆角 `--radius-control`，悬停 `--color-hover`。左内边距：macOS `70px`，其它平台 `calc(46px + 1px + 14px + 4px - 7px)`。
- macOS 交通灯由 `platform.setTrafficLightsPosition({ x: 14, y: ... })` 跟随窗口条垂直居中；卸载时复位为 `{ x: 14, y: 14 }`。
- 右半：`padding-inline: 18px 14px`，并用 `calc(100vw - env(titlebar-area-width, 100vw) + 14px)` 让出 Windows 的 caption 按钮区域；内容为 `titlebar-chat` 图标、`SessionLocation`、可双击重命名的标题（`max-w-[55%]`、14px），以及右侧上下文环 + token 数 + 花费。
- 顶部 1px 高光：`box-shadow: inset 0 1px 0 rgb(255 255 255 / 55%)`（深色 9%）。
- 拖拽区与控件分离：窗口条 `drag`，`[data-replica-control]` 与 `session-location-trigger` 为 `no-drag`。
- 窗口条本身不画下边框，只靠 Surface 颜色与下方分区。

平台差异：

- macOS：`titleBarStyle: "hidden"`，`vibrancy: "sidebar"`，`visualEffectState: "followWindow"`，窗口背景透明；`shell.tsx` 写入 `data-replica-window="translucent"`，此时窗口条、rail、侧栏背景透明，由 vibrancy 承载；深色下窗口条用 `linear-gradient` 在最后 10px 过渡到 `--color-navigation`。
- Windows：`frame: false`、`titleBarStyle: "hidden"`、`titleBarOverlay`（透明底、按主题给符号色、高度 32px 随缩放）、`roundedCorners: false`；`data-replica-window="opaque"`，CSS 只通过 `html[data-os="windows"]` 把 `--titlebar-height` 改成 32px。
- Linux / Web：`platformFrame()` 不加任何窗口参数，保持框架默认；`data-replica-window="opaque"`。

### 6.2 一级导航

- 宽度 46px，`flex-direction: column`，`align-items: center`，`padding-block: 7px 14px`，背景 `--color-rail`。
- 按钮 30px（`size-[30px]`），圆角 `--radius-control`，图标 `size="large"`；默认 `--color-icon-secondary`，悬停 `--color-hover` + `--color-icon-primary`，`data-state="pressed"` 时 `--color-selected`。
- 入口顺序（`rail.tsx` `ITEMS`）：首页 `/`、收件箱 `/inbox`、定时 `/scheduled`、知识 `/knowledge`、探索 `/explore`、更多（打开命令面板）。
- 底部 `data-slot="replica-rail-bottom"`，`gap: 6px`、`margin-top: auto`：检查更新（`--color-accent-blue`）与设置。
- 每个按钮都有 `aria-label`、`aria-pressed` 与 Tooltip。

### 6.3 侧栏

- 容器 `[data-slot="replica-sidebar"]`：`flex: 1 1 auto`、`min-height: 0`、背景 `--color-sidebar`；外层 `[data-slot="replica-sidebar-slot"]` 宽 `--navigation-sidebar-width-current`，`border-inline-end: 1px solid var(--color-divider)`。
- 折叠态 `[data-collapsed]`：`opacity: 0; overflow: hidden; pointer-events: none`，取消右边框，宽度以 220ms 过渡到 0。
- 拖动：`shell.tsx` 的 `ResizeHandle`，范围 220–480px，逐帧写入 CSS 变量，松手才提交到外观设置；拖动中 `[data-resizing]` 使用 `col-resize` 光标并禁止选中。
- 顶部工作区栏 `HEADER`：49px，`ps-[14px] pe-2`；左侧 19px/600 工作区名 + 下箭头，点击打开命令面板；右侧 30px 通知按钮，有待处理项时显示 5px `--color-accent-blue` 圆点。
- 「新聊天」`PRIMARY`：31px，`mx-2`、`gap-2`、`px-2`、圆角 8px、14px 文字，图标 `edit`，悬停出 `--color-hover`；点击创建草稿。
- 列表区 `data-slot="replica-sidebar-scroll"`：`mt-2`、`px-2`、`pb-3`、`overflow-y: auto`；接近底部 320px 时调用 `inbox.loadMore()`。
- 分区：`SECTION` 13px/500 + `mb-1`；`LIST` 行间距 2px。置顶区仅在存在置顶会话时渲染。
- 会话行 `ROW`：29px、圆角 8px、`px-2`、14px/20px，图标 `bubble-5` 16px；`data-state="pressed"` 用 `--color-selected`；行尾按状态显示 6px 圆点或 `ActivityRing`。
- 行交互：单击打开；双击标题就地重命名（Enter 保存、Escape 取消）；右键走原生菜单（`platform.showContextMenu`），Web 用应用内菜单。
- 会话菜单的归档项按 `session.time.archived` 切换：未归档显示「归档」，已归档显示「取消归档」（`common.archive` / `common.unarchive`，英文 `Archive` / `Unarchive`，中文「归档」/「取消归档」）。原生菜单带 `Shift+CmdOrCtrl+A` 作为展示用 accelerator，它只是菜单标注，不是全局快捷键。
- 归档后会话从 Home 列表消失；取消归档立即重新拉取被归档剔除的 Home 缓存页，列表里马上回来，不用等缓存过期。
- 归档后的行立即离开置顶区与最近列表。归档只改会话状态，本地 store 仍保留该会话，所以两个列表都要按 `inboxArchived(entry)` 过滤，不能只靠索引层剔除。
- 归档同时关闭该会话的标签页；取消归档只让它回到 Home 列表与侧栏，不重新打开标签页。
- 滚动条：`scrollbar-width: thin`，`scrollbar-color: var(--color-border) transparent`（与 `packages/app/AGENTS.md` 的 Scrolling 规则存在冲突，见第 11 节待确认项）。

### 6.4 欢迎页

- 主区为空路由时渲染 `HomeNewChat` → `new-session/view.tsx`，不显示独立欢迎标题。
- 结构：`absolute inset-0 flex items-center justify-center px-6`，内容宽 `w-full max-w-session px-0`。
- 产品字标 `NewSessionWordmark`：`max-w-[660px]`，内部 `w-4/5`。
- 字标下方 `mt-8 flex flex-col gap-3`：Composer（`data-slot="new-session-composer"`，`gap-1`）、项目位置条、最近项目行（`h-7`、13px、0.5px 边框）。
- 底部提示条固定在 `bottom-4`，高 24px，不与输入卡片重叠。
- 不添加副标题、插画、欢迎卡片。

### 6.5 输入组件

- 外框由复刻壳绘制一次：`[data-replica] [data-ui="composer"]` 与 `[data-slot="replica-compose-card"]` 使用 `--replica-composer-fill`（浅色 `#ffffff`）、`1px solid var(--color-border)`、`border-radius: var(--radius-composer)`（19px）、`box-shadow: var(--shadow-composer)`。
- 共享 `[data-component="composer"]` 自身不再画边框/阴影（`border-radius: inherit; background: transparent; box-shadow: none`）。
- 编辑区在复刻壳内 `min-height: 45px`；卡片高度由编辑区 + 工具行内容决定，不固定。
- 停靠宽度：`[data-component="session-composer-dock"] > div` 的 `max-width` 取 `var(--container-session, 684px)`；`--container-session` 在 `packages/ui/src/styles/tailwind/index.css` 中按视口取 `min(840px, 55vw)` / `min(560px, 48vw)` / `min(1240px, 72vw)`。不要在文档或代码里写死固定输入框宽度。
- 模型选择按钮不显示焦点蓝环（`outline: none; box-shadow: none`）。
- 底部停靠间距 14px（`padding-bottom: 14px`）。
- 深色下 `--replica-composer-fill` 取 `--v2-background-bg-layer-01`，与主区 `rgb(15 15 15)` 区分。

---

## 7. 与收件箱的关系

- 收件箱已是侧栏目的地之一：`rail.tsx` 的 `/inbox`，列表实现为 `packages/app/src/shell/replica/sidebar-inbox.tsx`。
- 未读/待处理能力保留在 `createSessionInbox()`（`shell/titlebar/inbox-model.ts`）中：侧栏通知点的 `pending()` 与 rail/底部导航的角标共用同一数据源。
- 收件箱的数据模型、聚合、列表、详情逻辑不受外壳改动影响，不要删除已有改动。

---

## 8. 当前落地状态与核对点

| 阶段 | 内容 | 代码现状 |
| --- | --- | --- |
| S1 | 三栏骨架 + token + 窗口条 | `shell.tsx` + `replica.css` 已实现，窗口条 39px / Windows 32px |
| S2 | 一级导航 + 侧栏工作区栏 / 新聊天 | `rail.tsx` 46px、`sidebar-tokens.ts` `HEADER` 49px、`PRIMARY` 31px |
| S3 | 会话行与分区 | `sidebar.tsx` `SessionRow`，行高 29px、间距 2px、选中 `--color-selected` |
| S4 | 欢迎页 + Composer | `new-session/view.tsx` 字标 + Composer，外框圆角 19px |
| S5 | 响应式 + 深色 + 无障碍 | `@media (max-width: 767px)`、深色 token、reduced-transparency / contrast / forced-colors |

改动外壳时按上表逐项回归。

---

## 9. 验收

### 9.1 几何

- 窗口条高度：macOS/Linux 39px，Windows 32px（`getComputedStyle(titlebar).height`）。
- rail 宽 46px；侧栏默认 300px，拖动后落在 220–480px 区间。
- 侧栏头部 49px、会话行 29px、新聊天 31px。
- 面板外边距 1px、圆角 12px。
- 误差 ≤ ±2 CSS px。

### 9.2 方式

- 用 DOM 的 `getBoundingClientRect()` 与 `getComputedStyle()` 断言尺寸、颜色与 `data-os` / `data-replica-window`。
- **不要用视觉识别或截图识别判断完成。**
- 截图只作为交付物给用户看，不作为自动验收依据。

### 9.3 功能

- 侧栏项目/会话来自真实数据，不是硬编码。
- 「新聊天」能创建草稿；会话行可打开、可双击重命名。
- Home 行有内联归档按钮，三处会话菜单（Home 行、replica 侧栏、titlebar 侧栏）也都有归档项，收件箱原有入口不变。
- 会话行菜单可归档：行从置顶与最近列表消失、标签页关闭；在归档会话对话框取消归档后重新出现。
- 侧栏开关（`mod+shift+b` 与窗口条按钮）联动窗口条列宽与侧栏宽度过渡。
- rail 六个入口可点击，激活态用 `data-state="pressed"`。
- 长项目名、长会话名截断而不撑破侧栏。
- 深色切换、系统减少透明度、高对比、强制颜色四种情况下不出现白底黑字或不可读边框。

---

## 10. 约束

- 不重启 app 或 server。
- 不在仓库根目录跑 `bun test`。
- 不新增依赖；图标用现有图标库，不用 emoji。
- 不写死字体族、不新增 `@font-face`。
- 不把整张截图当背景图。
- 布局用 Grid/Flex，不靠大量绝对坐标拼接。
- 保留现有路由、数据层和会话能力；这是视觉壳实现，不是功能删除。

---

## 11. 待人工确认

1. `replica.css` 的侧栏滚动条使用 `scrollbar-width: thin` 与 `scrollbar-color`，与 `packages/app/AGENTS.md` 的 Scrolling 章节（禁止这两个属性）冲突。文档暂按现有代码记录，是否改为共享滚动条样式需人工决定。
2. `replica.css` 声明了 `--sidebar-section-height`(25px)、`--sidebar-project-row-height`(30px)、`--sidebar-child-indent`(21px)、`--sidebar-header-height`(49px)、`--composer-max-width`(650px)、`--composer-height`(88px)、`--composer-bottom-gap`(14px)，其中多项目前没有消费方（组件用的是硬编码等价物或 `--container-session`）。是否清理这些 token 需人工决定。
3. `[data-slot="replica-compose-card"]`、`[data-slot="replica-utility-bar"]` 在 CSS 中有样式但没有任何组件渲染这两个 slot；文档未把它们写作要求，是否删除样式需人工决定。

---

## 12. 一句话总则

**尺寸取 `replica.css` 与组件的真实值，颜色取 `--color-*`，字体跟随用户设置；平台差异由 `data-os` 与 `data-replica-window` 决定，代码是唯一事实来源。**
