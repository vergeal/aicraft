# 13 · 动效与编排

动效规定"什么变了、多久、按什么顺序"。单个动画的时长不是重点，编排才是。

## 1. 时长与曲线

| 令牌 | 时长 | 曲线 | 用途 |
| --- | --- | --- | --- |
| instant | 85ms | `ease-out` | 悬停背景、边框、颜色 |
| micro | 120ms | `ease` | 图标位移、开关 thumb |
| base | 150ms | `ease-out` | 卡片 hover、按钮按下 |
| fast | 160ms | `ease-out` | 分段指示器、标签切换 |
| enter | 180ms | `ease-out` | 弹窗、Popover 入场 |
| panel | 220ms | `cubic-bezier(.2,0,0,1)` | 侧栏、抽屉 |
| layout | 260ms | `cubic-bezier(.22,1,.36,1)` | 布局转换（首页→会话） |
| page | 300ms | `ease-in-out` | 页面级切换（上限） |

曲线只有三条：`ease`、`ease-out`、`cubic-bezier(.22,1,.36,1)`。禁止弹跳、回弹、Elastic。

## 2. 可动属性白名单

允许：`transform`、`opacity`、`background-color`、`color`、`border-color`、`box-shadow`（仅小面积、单次）、`grid-template-rows`（折叠）。

禁止：`width` / `height`（布局动画除外，且必须用 FLIP 或 grid 技巧；浮层内容尺寸按 §11 的测量写法例外）、`top` / `left`、`filter` / `backdrop-filter`、`margin`、`font-size`。

折叠动画标准写法：

```css
.panel-collapsible {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 220ms cubic-bezier(.2, 0, 0, 1);
}
.panel-collapsible[data-open="true"] { grid-template-rows: 1fr; }
.panel-collapsible > * { overflow: hidden; min-height: 0; }
```

## 3. 场景时序表

| 交互 | 时长 | 曲线 | 属性 | 备注 |
| --- | --- | --- | --- | --- |
| 按钮 hover | 85 | ease-out | background-color | 不位移 |
| 按钮按下 | 85 | ease-out | transform scale(.98) | 仅主按钮 |
| 卡片 hover | 150 | ease-out | transform translateY(-2px) + border-color | 位移 ≤ 2px |
| 输入 focus | 150 | ease-out | outline-color + box-shadow | 不放大、不上浮 |
| 菜单出现 | 160 | ease-out | opacity + translateY(4px→0) | 原点贴触发元素 |
| 菜单消失 | 100 | ease-in | opacity | 消失快于出现 |
| Popover | 160 | ease-out | opacity + scale(.98→1) | 不从 0 缩放 |
| 弹窗进入 | 180 | ease-out | opacity + scale(.98→1) | 遮罩同时 120ms 淡入 |
| 弹窗退出 | 120 | ease-in | opacity | 焦点先归还再移除 |
| 抽屉进入 | 220 | cubic-bezier(.2,0,0,1) | translateX(12px→0) + opacity | 布局由 grid 负责 |
| 侧栏折叠 | 220 | cubic-bezier(.2,0,0,1) | flex-basis | 标签 100ms 淡出 |
| 标签切换 | 160 | ease-out | transform（指示器） | 不重排 |
| 列表选区移动 | 160 | ease-out | transform（共享指示器，见 §10） | 行本身不画选中底色 |
| 浮层内容尺寸变化 | 200 | cubic-bezier(.645,.045,.355,1) | height（例外，见 §11） | 底部锚定，末行不裁切 |
| 页面进入 | 180 | ease-out | opacity + translateY(8px) | 标题不重建 |
| 页面返回 | 160 | ease-in | opacity | 反向不做整页滑动 |
| Toast 进入 | 180 | ease-out | opacity + translateY(8px) | 停留 4s |
| 骨架闪烁 | 1500 | ease-in-out | opacity | 循环 |
| 列表项增删 | 160 | ease-out | opacity + translateY | 删除不做高度动画 |

## 4. 编排原则

### 4.1 一次只讲一件事

同一时刻最多：

- 1 个主要布局动画（宽度、位置、页面转换）。
- 2 个次级动画（淡入、位移）。
- 3 个装饰动画（骨架、呼吸点）。

超过即视为"界面在抖"。

### 4.2 错峰

相关元素一起出现时，使用 30–60ms 的错峰，**不是**每个都延迟：

```
标题        80ms
副标题      130ms
主体        200ms
卡片第一行  320ms
卡片第二行  380ms
页脚        450ms
```

整段入场 ≤ 550ms。再次进入同一页面不重播。

### 4.3 可中断

- 动画由真实状态触发，不允许用 `setTimeout` 模拟业务状态。
- 动画中途状态反转时，从当前 `transform` 继续，不跳回起点。
- 快速重复触发时，动画合并或取消，不排队。
- 关闭弹窗时，若焦点已转移，动画不得抢回焦点。

### 4.4 方向一致

- 进入：从触发源方向进入（菜单从按钮下方，抽屉从右侧）。
- 退出：原路返回，速度更快。
- 同层级切换：交叉淡入淡出，不做左右滑动。

## 5. 状态切换 vs 装饰

| 类型 | 是否动画 | 说明 |
| --- | --- | --- |
| 颜色 / 边框 / 焦点 | 是，85–150ms | 状态反馈必须有 |
| 展开 / 收起 | 是，160–260ms | 用 grid 或 transform |
| 页面进入 | 是，≤ 180ms | 仅内容，不整页 |
| 骨架闪烁 | 是，仅加载中 | 装饰 |
| 空状态插画 | 可选，低频 | 必须可关 |
| 数字变化 | 否 | 直接更新，避免读取困难 |

## 6. 发送到会话的连续过渡

这是本项目最重要的一条编排，禁止跳页：

| 时间 | 动作 |
| --- | --- |
| 0ms | 锁定输入内容，保留原文 |
| 0–100ms | 发送按钮 → loading |
| 60–180ms | 场景卡淡出 |
| 100–240ms | 标题组淡出 |
| 160–320ms | composer 位移到会话底部（transform 260ms） |
| 240–400ms | 第一条用户消息入场 |
| 300ms 起 | Agent 状态出现 |

要求：

- composer 不销毁重建，只切换布局模式（高度 176 → 88，圆角 24 → 20）。
- 每条内容只出现一次，不允许重复渲染造成"闪一下"。

## 7. 降级

```css
@media (prefers-reduced-motion: reduce) {
  /* 关闭位移与缩放，保留 1ms 的状态切换（颜色直接变） */
  .animated { transition-duration: 1ms !important; animation: none !important; }
}
```

规则：

- 只关装饰动画，不关状态反馈（否则用户以为"点了没反应"）。
- 滚动跟随、焦点移动不受影响。
- 应用内设置"减少动态"时，行为与系统一致。

## 8. 性能

- 动画元素尽量使用 `transform` / `opacity`，并加 `will-change` 仅在动画期间。
- 长列表中的 hover 使用 `contain: layout style`。
- 动画期间禁止触发滚动容器的重新测量。
- 1440×900 下掉帧超过 5 帧的动画视为不合格。

## 9. 禁止

- 整页缩放、旋转、3D 翻转。
- 超过 300ms 的界面过渡（引导页除外）。
- 逐字打字标题、卡片飞入、粒子迸发。
- 鼠标跟随光效、视差滚动。
- 用动画掩盖加载延迟（动画结束后仍在等待）。
- 同一个元素同时有多个相互冲突的 transition 属性列表。

## 10. 共享选区指示器（强制）

列表的"当前选中项"由**一个共享图层**表达：高亮块是列表容器内唯一的绝对定位元素，用 `transform: translate3d()` 在行之间移动；行自身保持透明，只保留 `data-active` 这类语义属性。

业界叫法：shared layout / sliding selection indicator（也写作 "magic move" 式高亮）。中文写作「共享选区指示器」。

### 10.1 必须使用

凡是有键盘上下（或左右）移动选中的列表，都用 `@opencode/ui/selection-indicator`：

- Composer 的 `@` / `/` 弹窗、历史弹窗
- 菜单、下拉菜单、上下文菜单（含 Build/Plan 切换、agent 菜单）
- `Select` 组件
- 模型选择、字体选择、项目 / 工作区 / 分支选择、目录建议
- 命令面板、搜索结果列表、Fork 列表、首页会话搜索
- 以上共享组件派生的任何新列表

接入方式：

```tsx
<SelectionIndicator
  container={() => list} // 行所在的定位容器
  selector={'[data-slot="row"][data-active]'} // 当前选中行
  attribute="data-active" // 触发重新测量的语义属性
/>
```

- 容器必须有 `position: relative`（滚动容器或其内容包装层均可），指示器是它的第一个子元素。
- 行的选中背景从行的 CSS / `classList` 中删除；只保留 `data-active`（或其他既有语义属性）供指示器与无障碍使用。
- 指示器圆角必须与行一致：行是 8px 就用 8px，行是方形就用方角。
- 不新增每行各自的 `transition`、`::before` 边条或背景闪烁来替代它。

### 10.2 时长与降级

- `transform`/`width`/`height` 过渡 160ms `ease-out`（`fast` 档），只动 `transform` 与测量出的尺寸，不触发布局。
- 首次出现直接落位，从第二次移动开始动画；列表重新打开时重置。
- 跨过分割线或分组标题时，选中项会短暂消失；指示器保留上一个位置并在选中恢复后继续滑动，不消失、不从角落重新出现。真正失去选中约 160ms 后才隐藏。
- 滚动容器内滚动时重新测量，指示器始终贴在目标行下方。
- `prefers-reduced-motion` 与应用内 `data-motion="reduce"` 下关闭过渡，直接切换。

### 10.3 不适用的场景

| 场景 | 做法 |
| --- | --- |
| 指针连续扫过的区域（侧栏导航、整页会话列表） | 不做过渡，hover 即时切换；不加滑动块 |
| 活动标签页（非选项列表） | 沿用分段指示器，不在本文范围 |
| 行高不一致且会折行的富内容卡片 | 行内过渡，避免指示器尺寸抖动 |

## 11. 浮层内容尺寸过渡（强制）

弹窗、Popover、命令面板的内容随查询或页签增减时，高度要平滑跟随，不能跳变；同时第一行到最后一行的完整可见是硬要求。

### 11.1 写法

- 外层固定 `height` 并加 `transition-[height] duration-[200ms] ease-[cubic-bezier(0.645,0.045,0.355,1)]`。
- 内容自然高度用 `ResizeObserver` 测出后写入外层 `height`，不能给 `height: auto` 做过渡。
- 首帧不写 `height`（保持 `auto`），避免入场时从 0 撑开；内层 `shrink-0`，滚动交给外层或既有 `MenuScroll`。
- 高度上限必须包含浮层自身的上下内边距与搜索框，否则最后一行会被裁切；达到上限后仍保留 `max-height` 作为兜底。
- 需要坐标稳定的列表（如 Composer 历史弹窗）不加大高度过渡，保持既有 `max-height` 行为。

### 11.2 入场

- 底部对齐的浮层（`@` / `/` 弹窗）用 `transform-origin: bottom center`。
- 入场 160ms `ease-out`，只动 `opacity` 与独立的 `scale` 属性（`0.98 → 1`）；不要用 `transform: scale()` 覆盖定位用的 `translate`。
- `prefers-reduced-motion` 与 `data-motion="reduce"` 下取消入场动画，只保留即时状态。

### 11.3 审查

- 内容从 1 行变 20 行、再变回 1 行，高度连续且末行始终完整。
- 切换筛选条件时，浮层不闪白、不重建，滚动位置落在选中行附近。
- 缩放窗口时高度上限同步，内容不被裁切。
