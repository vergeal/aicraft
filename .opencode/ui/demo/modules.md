# 收件箱 / 定时任务 / 知识库 / 探索 · 模块设计说明

四个模块的设计图，与 `main-window.html` 同一套骨架和 `../tokens.css`。
本文件只解释「为什么这样排」，不重复图上的文案。

## 1. 交付物与打开方式

| 文件 | 模块 |
|---|---|
| `inbox.html` | 收件箱 |
| `scheduled.html` | 定时任务 |
| `knowledge.html` | 知识库 |
| `explore.html` | 探索 |
| `modules.css` / `modules.js` | 四屏共用的骨架、组件、三态与标注 |

直接双击用 Chrome 打开即可。为方便逐屏审，每页支持 URL 参数：

- `?mode=default` / `?mode=empty` / `?mode=interact`：直接打开某个状态；
- `?collapse=1`：直接打开 1024 折叠态；
- 页面底部演示条也能切三态、折叠与标注；键盘 `1` `2` `3` 切态、`A` 切标注；
- 折叠态在视口宽度 ≤ 1024 时自动触发，演示条按钮用于手动展示。

## 2. 与主界面共享的部分（不重新发明）

- 44px 横贯顶栏，左段 280 与导航列同底；主区 `--c-bg-canvas` 方角铺满。
- 侧栏 280：品牌行、主操作、一级导航、工作区树、账户行，全部逐值沿用主图。
- 选中态统一为 `--c-selected` 底 + 2px 左竖条 + `--hairline` 内描边；
  一级导航、树行、列表项、集合行、文件行都用同一个信号。
- 页头（一句说明 + 页面级动作）、工具栏、列表-详情两栏，是主界面
  「页头 → 工具条 → 内容」结构的模块化复用。
- 所有颜色、字号、行高、间距、圆角、描边只引用 `tokens.css`；
  四屏与 `modules.css` 中裸色值 0 处、裸字号 0 处。
- 发丝线一律 `var(--hairline)`（0.5px），没有重阴影。
- 空态收起会与「没有数据」矛盾的控件：顶栏计数、侧栏徽标、页头说明与
  页头动作全部隐藏，只留空态自己的文案与动作；这样不会出现
  「3 项待处理」与「暂时没有需要处理的事项」同屏。

## 3. 收件箱 · `inbox.html`

**信息架构**

```
顶栏（标题 + 3 项待处理 + 搜索/更多/面板）
页头（说明 + 全部标记已读）
工具栏（全部 6 / 待处理 3 / 失败 1 / 已完成 2，右侧排序说明）
├ 左列 348：按状态分组的列表（待处理 → 已完成）
└ 右列：详情（状态 chips → 说明 → 事实 → 请求内容 → 决策 → 最近事件）
```

**主任务**：逐条把「等不到人就会卡住」的事项处理掉——批准、回答、查看失败。
所以默认选中第一条待处理项，决策按钮就在详情里，不需要先跳会话。

**关键交互**

- 分类与计数同处工具栏，计数写在标签里，不另设筛选条。
- 列表按状态分组，组头带计数；列表右侧只保留等待时长与状态点。
- 详情的事实区（来源、收到时间、资源、已等待）用两列 `dl`，
  比一行五个 chip 更好扫读。
- 决策区把「批准本次 / 始终允许 / 拒绝」并排，下方一行解释作用范围。
- 底部固定动作条：稍后处理、标记已读、打开会话；键盘提示就地给出。

**三态**

- 默认：待处理 3 + 已完成 2，首条待审批被选中。
- 空态：`inbox.empty` + `inbox.empty.hint`，主动作「打开定时任务」。
- 交互态：批准后该条移入「已完成」并变绿，计数变成待处理 2 / 已完成 3，
  顶栏、分段、组头与侧栏徽标同步；详情切换为「已批准」，给出撤销入口。

**i18n key**：`inbox.title`、`inbox.description`、`inbox.pending.other`、
`inbox.filter.all|pending|failed|done`、`inbox.detail.kind.*`、
`inbox.detail.action.approve|always|reject|later|markRead|open`、
`inbox.detail.source`、`inbox.detail.resources`、`inbox.detail.resolution.once`、
`inbox.empty`、`inbox.empty.hint`、`inbox.empty.action`。

## 4. 定时任务 · `scheduled.html`

**信息架构**

```
顶栏（标题 + 5 个任务）
页头（说明 + 搜索 + 新建定时任务）
工具栏（全部 5 / 运行中 3 / 已暂停 1 / 已完成 1，右侧按下次运行排序）
├ 左列 348：按状态分组的任务列表（运行中 → 已暂停 → 已完成）
└ 右列：详情（名称 + 状态 chips → 说明 → 事实 → 提示词 → 最近输出 → 最近记录）
```

**主任务**：确认「它下次什么时候跑、上一次跑成什么样」，并在不离开列表的情况下启停。

**关键交互**

- 每行一个开关，是唯一的状态操作；开关与行选中互不干扰。
- 行的 meta 固定三段：频率 → 状态 → 下次执行；暂停行的「下次」消失，
  改成「已暂停」，避免出现「暂停却还有下次」的自相矛盾。
- 详情顶部把「运行中 / 已暂停」和「频率」并列为 chip；
  中断状态用 `callout` 解释「恢复后重新计算下次运行」。
- 记录用紧凑三列（时间 / 结果 / 耗时），失败用 `--c-danger` 圆点。
- 新建入口只在页头出现一次，列表里不重复。

**三态**

- 默认：3 个运行中 + 1 暂停 + 1 完成，首条运行中项被选中；详情把
  「最近记录」放在事实之后，首屏就能看到最近三次运行。
- 空态：`scheduled.empty` + 提示「创建后先暂停，确认再启用」。
- 交互态：暂停首条后移入「已暂停」，运行中 3→2、已暂停 1→2，
  开关关闭、行内状态与「下次」同步，详情切换为恢复动作；最近记录仍为
  同样三条，不随状态减少。

**i18n key**：`scheduled.title`、`scheduled.filter.all|active|paused`、
`scheduled.status.active|paused|done`、`scheduled.detail.next`、
`scheduled.detail.directory`、`scheduled.detail.timezone`、`scheduled.detail.runs`、
`scheduled.detail.prompt`、`scheduled.detail.output`、`scheduled.detail.recent`、
`scheduled.detail.pause|resume|delete`、`scheduled.new`、`scheduled.empty`。
「已完成」筛选需要新增 `scheduled.filter.done`；列表内的分组标题直接用
`scheduled.status.done`。

## 5. 知识库 · `knowledge.html`

**信息架构**

```
顶栏（标题 + 2 个知识库）
页头（说明 + 导入 + 新建知识库）
工具栏（全部 2 / 最近导入 2 / 可能无关 1，右侧按更新时间）
├ 集合列 228：知识库列表 + 新建入口
├ 文件列 272：面包屑 + 搜索 + 文件列表
└ 预览列：标题 + 格式 chips + 正文
```

**主任务**：从「哪个知识库」到「哪份文档」再到「正文」，三步内读完；
搜索只作用于当前集合，不跨集合混淆。

**关键交互**

- 三栏是列表-详情的两级展开：集合选中 → 文件列表 → 文件预览。
- 面包屑「产品文档 › 根目录」把当前范围说清楚；搜索框在文件列顶部，
  明确它是集合内搜索。
- 工具栏的「全部文件 / 最近导入 / 可能无关」作用于当前集合的文件，
  「全部文件」显示当前集合的文件总数（126），不是集合数；
  `toolbar-meta` 同时写明「产品文档 · 126 个文件」，避免口径歧义。
- 被导入判定为可能无关的文件在列表右侧有一个警示点；
  预览顶部给出 `callout` 与「保留 / 从知识库移除」，判定可被人工推翻。
- 代码块允许换行，不出现横向裁切；正文列宽 640，长行仍可读。

**三态**

- 默认：产品文档 → 接入指南.md 正文。
- 空态：`knowledge.empty` + `knowledge.empty.hint`，动作是新建与导入。
- 交互态：选中「组件规范.md」，标记为「可能无关」，
  是否保留由用户决定。

**i18n key**：`knowledge.title`、`knowledge.description`、`knowledge.libraries.other`、
`knowledge.files.other`、`knowledge.files.root`、`knowledge.files.search`、
`knowledge.preview.converted`、`knowledge.flags.irrelevant`、
`knowledge.flags.keep`、`knowledge.flags.remove`、`knowledge.import`、
`knowledge.new`、`knowledge.empty`、`knowledge.empty.hint`。
工具栏的「全部 / 最近导入 / 可能无关」需要新增 `knowledge.filter.*`。

## 6. 探索 · `explore.html`

**信息架构**

```
顶栏（标题 + 4 项可安装）
页头（说明 + 搜索 + 刷新）
工具栏（插件 6 / 技能 4 / 已安装 6；分类 chips：全部/开发工具/效率/自动化）
├ 卡片网格（1240 宽两列，折叠态一列）
└ 详情面板 360（图标 + 名称 + 作者 → 说明 → 运行状态 → 功能/版本 → 卸载/切换版本）
```

**主任务**：发现能力 → 确认它提供什么 → 安装或启用。安装动作收口在详情里，
卡片只负责「值不值得点进去」。

**关键交互**

- 「范围」（插件 / 技能 / 已安装）与「分类」分成两层：分段控件是范围，
  chips 是分类，避免把两种筛选画成一个控件。
- 卡片固定四块：图标 + 名称 + 一行描述 + 来源·分类 + 安装状态；
  描述截两行，保证网格等高。
- 详情里「功能」用清单列出 MCP 服务器 / 工具 / 技能 / 图形界面的数量，
  比一段文字更容易判断能力边界。
- 安装是底部浮层（`sheet`）：输入包名或链接，说明取包与解包路径，
  只在主区加遮罩，不盖顶栏和侧栏。

**三态**

- 默认：6 张插件卡片（插件共 6 项、技能 4 项、已安装 6 项），
  其中 2 项已安装、4 项可安装；顶栏写「4 项可安装」，GitHub 集成被选中，
  详情显示运行中。
- 空态：`explore.plugins.empty.title/description` 风格的空态 +
  安装与刷新两个动作。
- 交互态：安装浮层，包名已填，主按钮为「安装」。

**i18n key**：`explore.title`、`explore.description`、`explore.nav.plugins|skills|installed`、
`explore.filter.all`、`explore.plugins.category.developer-tools|productivity|automation`、
`explore.plugins.search.placeholder`、`explore.plugins.refresh`、
`explore.plugins.installed`、`explore.plugins.install`、`explore.plugins.uninstall`、
`explore.plugins.switchVersion`、`explore.plugins.state.active`、
`explore.plugins.detail.features|state|tools|skills|mcp`、
`explore.plugins.install.title|package.placeholder|submit|cancel`、
`explore.plugins.install.bundle.note`、`explore.plugins.empty.title|description`。

## 7. 偏离主界面骨架的地方与理由

1. **顶栏右侧多一枚计数 chip**（如「3 项待处理」「5 个任务」）。
   主图顶栏只放当前会话标题；模块页没有「当前对象」，用计数替代标题位置，
   让顶栏仍然承载定位信息，而不是留空。
2. **页头不再重复模块名**。顶栏已经给出模块名与计数，页头只保留一句说明
   和页面级动作；空态连页头一起收起，避免「顶栏写计数、页面写空」以及
   「页头按钮与空态按钮重复两套」。
3. **列表-详情宽度按模块取不同基准**：收件箱/定时任务 348，
   知识库 228 + 272，探索网格 + 360。不是新语言，而是同一套
   「固定列 + 弹性内容」在不同信息密度下的取值，全部走 `.window` 级变量，
   折叠态只覆盖变量。
4. **知识库用三栏而不是两栏**。集合 → 文件 → 正文是三层包含关系，
   压成两栏会让「当前在哪个集合」只能靠面包屑回忆；三栏各层宽度固定，
   折叠态同步收窄，不出现横向滚动。
5. **探索用卡片网格 + 详情，而不是列表-详情**。插件是「横向比较」的对象
   （来源、分类、是否安装），两列卡片比单列列表更适合扫读；
   详情用右侧固定面板而不是弹窗，避免安装时丢失上下文。
6. **安装用底部浮层**。安装是短表单，不需要整页跳转；浮层只覆盖主区，
   侧栏导航仍可见，符合主图「导航常驻」的取向。
7. **品牌 mark 的渐变用 token 近似**。主图用的是固定品牌色（logo 是独立体系，
   不参与主题 token）；四屏为了满足「无裸色值」的验收口径，改用
   `--p-green-400` / `--p-green-500` / `--p-blue-400` 组成近似渐变。
   视觉上与主图一致，但数值不是品牌方的原始色值。
8. **交互态直接改列表，而不是只换详情**。批准/暂停后就地移动分组并更新
   三处计数（顶栏、分段、组头），让静态图内部自洽；否则审图时会出现
   「详情已批准、列表还在待处理」的矛盾。

## 8. 已知取舍

- 侧栏收件箱徽标取「待处理」语义，并跟随收件箱交互态更新（3→2）；
  主图里的 6 是「全部事项」，两者不在同一屏同时出现。
- 折叠态宽度固定 1024，方便一键展示；真实实现应跟随窗口宽度，
  设计图只证明「56 图标栏 + 模块区不溢出」。
- 演示数据是固定的静态文案，用于说明层级与密度，不代表最终数据量。
- 少数行间距用 1px（账户行两行文字之间），与主图一致，未引入新变量。

## 9. 验收自查

- [x] 四屏可直接打开，`?mode=` / `?collapse=1` 可用；
- [x] 四屏与共享文件裸色值 0、裸字号 0，全部引用 `tokens.css`；
- [x] 骨架、导航选中态、顶栏、账户行与 `main-window.html` 同值；
- [x] 每屏默认 / 空态 / 关键交互态齐全，空态为最终中文文案；
- [x] 列表-详情、搜索、筛选、新建、启停、安装入口在图上可辨认；
- [x] 折叠态四屏均已渲染检查，导航收成图标栏，内容列不溢出；
- [x] 每屏都有 `data-note` 标注层，`A` 可切换。
