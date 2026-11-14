# UI 设计验收标准（Agent 执行版）

> `docs/opencode-ui-standard.md` 回答「长什么样」，本文回答「怎么证明你做对了」。
> 两者冲突时以标准 + 设计图为准，并把冲突写进交付报告，不要沉默选一边。
> 适用：`packages/app`、`packages/desktop`、`packages/session-ui`、`packages/ui` 的界面改动。

---

## 0. 使用方式

| 阶段 | 动作 |
| --- | --- |
| 动手前 | 读 `docs/opencode-ui-standard.md`、`packages/app/AGENTS.md` 的 Typography / Fonts / Scrolling / Loading Indicators / Suspense / State Machines / Localization 各节、目标包 `AGENTS.md`；确认设计图路径 |
| 写代码时 | 每处改动记录 `文件:行 → 标准章节`；先选 token 再写 markup |
| 提交前 | 依次跑第 1 节硬门槛 → 第 9 节命令 → 第 8 节设计图比对 |
| 交付时 | 按第 10 节模板给证据；缺一项视为未完成 |

**不合格的常见句式**（出现在交付说明里即打回）：
「基本一致」「视觉上差不多」「参考了标准」「应该没问题」「已在浅色下确认」。

---

## 1. 硬门槛（任一不满足直接打回）

多数项可用 `git` 机械判定（不需要 bash/grep），不能用正则判定的两项人工看 diff。判定方式标在每条后面。

1. 新增颜色字面量：`#hex`、`rgb()`、`hsl()`、`oklch()`。主题定义文件除外。（`git diff -G`）
2. 新增字面量字体族：`Inter`、`IBM Plex Mono`、`Menlo`、`monospace`、`system-ui`、`-apple-system`；必须用 `var(--font-family-sans|mono)` 一类 token。（`git diff -G`）
3. 边框 / 分隔线：颜色必须来自 `--v2-border-*`；只允许 `0.5px`（发丝）与 `1px`（既有组件的分隔线，见 `packages/ui/src/navigation/menu/menu.css`）。新增 2px 及以上或字面色即违规。（`git diff -G`）
4. 新增 `leading-none` 或 `line-height: 1`；13px 文本必须用 `--line-height-compact`（`18px`），见 `packages/app/AGENTS.md` Typography。（`git diff -G`）
5. 新增硬编码中英文文案；必须走 i18n（各包 API 见第 7 节）。
6. 自造滚动条：`scrollbar-width`、`scrollbar-color`、`::-webkit-scrollbar`；隐藏滚动条只允许 `no-scrollbar`。（`git diff -G`）
7. 用 `loading` / `saving` / `open` 多个布尔表达同一生命周期；必须有 `machine.ts` 判别联合。
8. 改动落在声明范围之外的文件。（`git diff --name-only`）
9. 新增 `!important`（保留态覆盖除外，需注释说明）。（`git diff -G`）
10. 用 `div` + `onClick` 冒充按钮/链接。（`git diff -G`）

```shell
# 硬门槛 1、2、3、4、6、9、10：列出补丁里出现这些模式的文件（纯 git 正则，PowerShell 与 macOS/Linux 结果一致）
git diff -U0 -G'#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|font-family:[^;]*(Inter|IBM Plex Mono|Menlo|monospace|system-ui)|scrollbar-width|scrollbar-color|::-webkit-scrollbar|leading-none|line-height:\s*1\s*;|!important|<div[^>]*onClick' --name-only -- packages

# 硬门槛 8：本次改到的全部文件
git diff --name-only
```

`git diff -G` 只回答「补丁里有没有出现该模式」，不区分新增与删除。结果非空时，对每个文件再跑一次 `git diff -U0 -- <文件>`：命中行以 `+` 开头才是违规，`-` 开头的是删除，可以放过。要覆盖未跟踪的新文件，先 `git add -N <文件>` 或直接读该文件。

Windows 上在 PowerShell 里原样粘贴即可：两条命令都用 git 自带正则，不经过 shell 的 `grep`/`bash`；单引号内的 `#`、`<`、`!` 不会被解析成注释、重定向或历史展开。

---

## 2. 结构验收（Agent 最常犯的一类）

| 规则 | 怎么验 | 常见错法 |
| --- | --- | --- |
| 主从分栏：左列表、右详情，**不许堆成单列长滚动** | 看 DOM 是否两个独立滚动容器 | 列表和详情共用一根滚动条；详情塞进列表项展开 |
| 列表宽 300–360px，详情最小可读 420px | DevTools 量 `getBoundingClientRect()` | `flex:1; min-width:0` 把详情压到 200px |
| 每栏独立滚动 | 两个容器各有 `overflow-y-auto` + `min-h-0` + `data-scrollable` | 外层滚动、内层也滚动（嵌套） |
| 一屏只有一个主操作 | 数 `variant="contrast"/"submit"` | 头部一个、详情头又一个 |
| 工具栏 ≤2 个 icon 按钮 + 1 个溢出菜单 | 数 `variant="ghost*"` 且只有 icon 的按钮 | 每个动作一个 icon |
| 详情头：标题 + 状态 + 右上 ≤2 动作 | 看 `PageHeader`/详情头结构 | 动作排成一行 5 个 |
| 空选中是设计态：列表保留，详情给指令 | 清空选中截图 | 详情区纯白 |
| 不嵌套滚动；`ScrollView` 只给时间线与 Home | `git grep -n ScrollView -- packages` | 管理页自造 `ScrollView` |
| 窄容器先收检查器、再收侧栏 | 容器 900/700px 截图 | 直接把详情压扁 |

**结构自查一句话**：把页面缩到 760px 宽，如果详情变得不可读、或者出现两根滚动条，就是结构错了。

---

## 3. 视觉刻度表（只允许这些值）

出现表外数值即为缺陷，除非有设计图明确依据并在报告里引用。

| 类别 | 允许值 |
| --- | --- |
| 间距 | 2 / 4 / 8 / 12 / 16 / 20 / 24 / 32 |
| 圆角 | 4（控件）/ 8（分组、菜单）/ 9–10（卡片、弹窗内块）/ 12（弹窗）/ 9999（胶囊，`button.css`） |
| 文字行高 | 14（`--line-height-tight`）/ 18（`--line-height-compact`）/ 22（`--line-height-base`），见 `packages/ui/src/styles/tokens/theme.css` |
| 控件高度 | 30（设置导航 `--settings-nav-item-height`）/ 44（设置行 `--settings-row-min-height`）/ 28（菜单项，`menu.css`）/ 26（小按钮）/ 30（按钮） |
| 字号 | 11 / 11.5 / 12 / 12.5 / 13 / 15 / 17 / 20 |
| 边框 | 0.5px（发丝）/ 1px（既有组件的分隔线、popover 边框） |
| 阴影 | 页面不要自己写 `box-shadow`；浮动层用 `--v2-elevation-{raised,floating,overlay}`，既有组件里的 `--shadow-md` 属组件内部实现 |
| 材质 | 浮动层（菜单、popover、对话框、toast、hover card）用 `--v2-material-surface-strong`：浅色 72% / 深色 80%（`tokens/theme.css`）；`prefers-reduced-transparency` 的 `*-opaque` 降级已由 `packages/ui/src/styles/base.css` 统一处理，不要手写 |
| 窗口标题栏 | 39px（macOS）/ 32px（Windows），`--titlebar-height`，见 `packages/app/src/shell/replica/replica.css` |

**常见越界值**（本项目已出现过）：`gap: 6px`、`gap: 10px`、`padding: 9px 10px`、`font-size: 10.5px`、`border-radius: 7px`（`home/`、`explore/`、`knowledge/`、`scheduled/`、`settings/search.css` 仍在用，属第 11 节记录的已知偏差，不要新增）。

```shell
# 列出本次改动过的 css 文件，再逐个比对白名单
git diff -G'[0-9.]+px' --name-only -- 'packages/**/*.css'
git diff -U0 -- packages
```

**颜色按语义角色选**，不要按“看起来像”：
- 页面底 `--v2-background-bg-base`；分组面 `--v2-background-bg-layer-01`；hover `--v2-background-bg-layer-02` 或 `--v2-overlay-simple-overlay-hover`；选中 `--v2-background-bg-layer-03` 或 `--v2-overlay-simple-overlay-pressed`
- accent 只给主操作、链接、焦点：`--v2-background-bg-accent`、`--v2-focus-ring-color`
- 状态用 `--v2-state-fg-{success,warning,danger,info}`（背景 `--v2-state-bg-*`，描边 `--v2-state-border-*`）
- 元信息 `--v2-text-text-faint`，只给元信息，不给可操作标签
- 分隔线 `--v2-border-border-muted`，可交互边框 `--v2-border-border-base`

---

## 4. 状态验收（七态缺一不可）

| 状态 | 必须做到 | 典型错误 |
| --- | --- | --- |
| 空 | 一句安静说明 + **一个下一步动作** | 只有「暂无数据」 |
| 加载 | 页面/面板/文件/搜索/连接用 `Loader`（`@opencode/ui/loader`）；AI 正在工作（会话、轮次、子 agent、工具调用）才用点阵 `Spinner`（`@opencode/ui/spinner`）；都不改样式 | 自造 skeleton 加载条；把 `Spinner` 用在页面加载 |
| 刷新 | **保留旧数据**，头部小 `Loader`，不清空、不重置滚动；render 时读 resource 必须按 `state` 守卫（见 `packages/app/AGENTS.md` Suspense） | `load.started` 直接清空列表 |
| 错误 | `danger` 一行原因 + **原地重试**；不能只 toast | 只 `showToast`，页面什么都没变 |
| 部分失败 | 先渲染成功的行，再加一行行内错误 | 整页进错误态 |
| 禁用 | 控件禁用 + **说明原因** | 只 `disabled`，用户不知道为什么 |
| 选中 | 每个列表恰好一个；指针与键盘一致；同步详情 | 初始无选中；键盘选中不改详情 |

检查清单：
- [ ] 七态都能在 3 次点击内复现并截图
- [ ] 错误态页面内可见，不依赖 toast
- [ ] 刷新时旧数据仍在
- [ ] 禁用态有文案说明缺什么
- [ ] 空态有可点的下一步

---

## 5. 交互与键盘

- [ ] 列表：`↑/↓` 移动选中，`Enter` 打开，`Escape` 关闭最上层浮层
- [ ] 关闭浮层后焦点回到触发点
- [ ] 每行、tab、菜单项、icon 按钮都有可见焦点环
- [ ] 选中行同时有选中样式与焦点样式（两者不能互相覆盖）
- [ ] 弹窗打开后焦点进入弹窗（`packages/ui/src/overlays/dialog/dialog.tsx` 依次取 `[autofocus]` → 上次焦点 → 首个输入框 → 容器）；**取消按钮优先加 `autofocus`**
- [ ] composer 的 agent 选择器可用：`Mod+.` 打开 `ui.promptInput.chooseAgent`，至少内置 Build / Plan 两项可选，不依赖用户自建 agent（`composer/editor/editor.tsx`、`providers/models/selection.tsx`）
- [ ] 危险操作必须二次确认；确认按钮重复「动词 + 对象」，不写「确定」

---

## 6. 深浅色与窄屏

- [ ] 浅色、深色各截一张，对比边框、选中、禁用、空态
- [ ] 浮动层在两种主题下都是 `--v2-material-surface-strong`（浅色 72% / 深色 80%），不是不透明底板；系统开启「降低透明度」时由 `base.css` 回落到 opaque，不要自己写降级
- [ ] 窗口标题栏高度：Windows 32px、macOS 39px（`--titlebar-height`）；截图在哪个平台要写明
- [ ] 用 `@container` 而不是 `@media` 做面板级收窄
- [ ] 收窄顺序：先收检查器 → 再收侧栏 → 详情不低于 420px
- [ ] 窄屏（<760px）只保留「看结果 + 处理异常」；创建/配置回到桌面端
- [ ] 不因为深色模式而换一套间距或圆角

---

## 7. 文案与国际化

- [ ] 所有可见文案走 i18n：`app` 用 `language.t(...)`、数量用 `language.plural(...)`；`packages/ui` 用 `t(...)` / `plural(...)`（运行时生成的英文源串用 `tDynamic(...)`）；`packages/session-ui` 用 `i18n.t(...)` / `i18n.plural(...)`；desktop 主进程用 `nativeT(...)`
- [ ] 不拼句子片段；占位符只放名称、路径、数量
- [ ] 新增文案只加英文源串，非英文键留空由运行时英文回退，翻译经语言评审单独落地（不要顺手写 `zh.ts`）
- [ ] 不改既有英文文案或英文 key 来迁就翻译
- [ ] 状态、按钮、空态、tooltip、错误、确认框全部走 i18n
- [ ] 删除确认文案包含对象名

---

## 8. 设计图比对流程

**截图规格**（缺一张即未完成）：
1. 1440×900 浅色
2. 1440×900 深色
3. 760px 宽窄屏
4. 关键状态：空、加载、错误、选中、禁用

**比对表**（逐项填，不允许合并）：

```md
| 项 | 设计图 | 实现 | 结论 |
| --- | --- | --- | --- |
| 列表栏宽度 | 332px | 320px | 已修正 / 一致 / 无法满足（原因） |
| 详情头标题 | 17px/600 | 20px/600 | 差 3px，已改 / 冲突待定 |
| 筛选 chip 间距 | 4px | 4px | 一致 |
```

规则：
- 「看起来差不多」不算结论；必须给数值或 token。
- 无法满足时写清原因（组件不支持 / 标准冲突 / 设计图缺失），不要静默跳过。
- 设计图缺失时，以 `docs/opencode-ui-standard.md` 为准，并在报告首行注明「设计图缺失，按标准验收」。

---

## 9. 交付证据模板

```md
## 改动
| 文件:行 | 改动 | 标准章节 |
| --- | --- | --- |
| packages/app/src/scheduled/new-dialog.tsx:96 | Dialog 加 size="large" | 5.6 |

## 设计图比对
（第 8 节表格）

## 状态覆盖
- 空：截图 / 路径
- 加载：截图 / 路径
- 错误：截图 / 路径（页面内可见，非 toast）
- 刷新：说明如何保留旧数据
- 部分失败：说明
- 禁用：说明文案
- 选中：说明初始选中与键盘同步

## 命令输出
- `bun run check`（= `lint` + `typecheck`）：通过 / 失败项
- 第 1 节 `git diff -G` 硬门槛：输出为空（非空时逐条说明是新增还是删除）
- 截图平台与窗口标题栏高度：Windows 32px / macOS 39px

## 截图
- light-1440.png / dark-1440.png / narrow-760.png

## 未解决 / 冲突
- （逐条列出，不许留空话）
```

---

## 10. Agent 高频错误 Top 20

| # | 错误 | 为什么错 | 正确做法 | 怎么发现 |
| --- | --- | --- | --- | --- |
| 1 | 只改 CSS 不改结构 | 结构错时调间距永远不对 | 先画分栏/状态计划 | 缩到 760px |
| 2 | 用 `gap: 6/10/14px` | 破坏节奏 | 就近取 4/8/12/16 | `git diff -G'gap: [0-9.]+px'` |
| 3 | 详情被压到不可读 | `min-width: 0` 无下限 | `min-width: 420px` 或容器查询收起 | 拖窄窗口 |
| 4 | 错误只弹 toast | 用户关掉就丢失，无法重试 | 页面内 danger 行 + 重试 | 断网重试 |
| 5 | 刷新清空列表 | 闪烁且丢滚动位置 | 保留旧数据 + 头部 Loader | 点刷新看列表 |
| 6 | 禁用无原因 | 用户不知道缺什么 | 禁用旁一行说明 | 清空必填项 |
| 7 | 空态只有一句话 | 没有出路 | 加一个下一步按钮 | 删光数据 |
| 8 | 状态只靠色点 | 色盲不可读 | 点 + 文字/`aria-label` | 灰度截图 |
| 9 | 自造按钮变体 | 与共享组件分裂 | 用 `button.css` 已有变体：`neutral/danger/warning/outline/contrast/submit/loading/ghost/ghost-muted/ghost-danger/ghost-faint` | `git grep -n 'data-variant="primary"' -- packages` 应为空 |
| 10 | 弹窗宽度随意 | 与 5.6 的 640–880 区间不符 | 显式传 `size`：`normal` 640×368 / `large` 640×480 / `x-large` min(100vw−32, 880) | 量宽度 |
| 11 | 取消按钮不聚焦 | 键盘用户要多按 Tab | 取消 `autofocus` | 打开弹窗看焦点 |
| 12 | 自造滚动条 | 平台不一致 | 列表用 `MenuScroll`，页面用 `overflow-y-auto` + `data-scrollable` | `git grep -n 'scrollbar-width\|scrollbar-color\|::-webkit-scrollbar' -- packages` |
| 13 | 用 `@media` 做面板收窄 | 侧栏开合时失效 | `@container` | 开合侧栏 |
| 14 | 只验浅色 | 深色下边框消失 | 两套都截图 | 切主题 |
| 15 | 多个布尔表状态 | 出现不可能组合 | `machine.ts` 判别联合 | 读 state |
| 16 | 硬编码英文/中文 | 无法翻译 | `language.t` / `t` / `i18n.t` | 读 diff 里的可见文案 |
| 17 | 13px 配 `leading-none` | 截断行重叠 | `--line-height-compact` | 长标题 |
| 18 | 平铺卡片加阴影 | 伪造层次 | 只给浮动层阴影 | 看截图 |
| 19 | 把删除放导航旁且不确认 | 误删 | 详情头 + 确认框 | 点删除 |
| 20 | 改完不跑 `bun run check` | 类型/格式漏网 | 提交前必跑 | CI |

---

## 11. 已知文档 / 代码冲突（先记录，别盲信）

| 项 | 文档说法 | 代码现状 | 处理 |
| --- | --- | --- | --- |
| 按钮变体 | 5.1：只有默认/primary/ghost/icon | `button.css` 实际有 `neutral/danger/warning/outline/contrast/submit/loading/ghost/ghost-muted/ghost-danger/ghost-faint`，没有 `default`/`primary`/`icon` 变体 | 以 `button.css` 为准，报告里注明文档过期 |
| 页面标题 | `packages/app/src/shell/page.tsx` 注释写 17px | 实现 `text-[20px] leading-[26px]` | 以实现为准，或提出统一 |
| 页面头内边距 | 4.1：22/24px | `px-6 py-3` = 24/12px | 报告里标注差异 |
| 弹窗宽度 | 5.6：640–880px | `dialog.css` + `dialog.tsx`：`normal` 640×368、`large` 640×480、`x-large` min(100vw−32, 880)×min(100vh−92, 600) | 需要宽弹窗时显式传 `size` |
| 卡片圆角 | 4.3：9–10px | `home/`、`explore/`、`knowledge/`、`scheduled/`、`settings/search.css` 用 7px，移动抽屉用 16px | 逐处修正，不要新增 |
| 浮层材质 | 旧稿 88%（浅）/ 90%（深） | `tokens/theme.css`：`--v2-material-surface-strong` 浅色 72%、深色 80% | 只引用新值，报告里不要出现 88/90 |
| 窗口标题栏 | 未分级 | 39px（macOS）/ 32px（Windows），`--titlebar-height` 于 `shell/replica/replica.css` | 截图注明平台 |
| 时间轴详细程度 | 旧偏好设置可调 | 已从偏好设置删除，默认 text-only（`settings/model.tsx`） | 不再作为验收项 |
| 界面布局切换 | 旧偏好设置可调 | 已删除（`settings/general/interface-mode.tsx` 移除） | 不再作为验收项 |
| 内置 agent | 旧实现只在有自定义 agent 时显示选择器 | 多个可选 agent 即显示，内置 Build / Plan 可切换（`providers/models/selection.tsx`） | 按代码验收 |
| 插件 / 技能分发目录 | 旧文档混用 `~/.opencode/*` | 本地分发目录是 `~/.distribution/plugins/<id>` 与 `~/.distribution/skills/<id>`（`packages/core/src/plugin/local.ts`、`skill/local.ts`；界面见 `explore/plugins.tsx`）；运行时缓存 / 数据目录仍是 `~/.opencode/*` | UI 与文档里展示的安装位置用 `~/.distribution` |

---

## 12. 一句话总则

**结构先于像素，状态先于样式，证据先于结论。**
做不到这三条，其它都是装饰。
