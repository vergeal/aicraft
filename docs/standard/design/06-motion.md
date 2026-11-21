# 06 · 动效

## 1. Token

### 实现 B（只有 4 个）

```css
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--transition-duration: 0.2s;
--transition-duration-fast: 0.1s;
--transition-duration-slow: 0.3s;
```

组件实际值：Switch thumb `120ms`、SegmentedControl indicator `160ms`、Tooltip 入场 `150ms`、Pill/Switch 传 `ease`（浏览器默认 `ease`）。

### 实现 A（无集中 token，靠频率收敛）

| 时长 | 出现次数 | 典型用途 |
|---|---|---|
| `75ms` | 107 | 颜色/背景切换 |
| `.1s` | 347 | 悬停、图标 |
| `.12s` | 90 | 小位移 |
| `.15s` | **921** | **默认值**（颜色、透明度、变换） |
| `.16s` | 78 | 面板淡入 |
| `.18s` | 94 | 抽屉 |
| `.2s` | 240 | 展开、位移 |
| `.3s` | 234 | 大面板、跨屏 |
| `.4s` | 84 | 引导页、插画 |

缓动（按频率）：

| 曲线 | 次数 | 名称/感觉 |
|---|---|---|
| `cubic-bezier(.22,1,.36,1)` | 104 | easeOutQuint，快出慢停 |
| `cubic-bezier(.23,1,.32,1)` | 146（两个变体合计） | 同上，微调 |
| `cubic-bezier(.333333,0,.666667,1)` | 78 | 近似 ease-in-out |
| `cubic-bezier(.37,.55,.86,.88)` | 68 | 强减速 |
| `cubic-bezier(.4,0,.2,1)` | 86（合计） | 标准 Material ease-in-out |

## 2. 推荐映射

| 交互 | 时长 | 缓动 | 属性 |
|---|---|---|---|
| 颜色/背景切换（hover） | 100–120ms | `ease` | `background-color`, `color` |
| 图标/微位移 | 120–150ms | `ease` | `transform` |
| 开关 thumb | 120ms | `ease` | `transform` |
| 分段控件指示器 | 160ms | `ease` | `transform` |
| Tooltip / 小浮层入场 | 150ms | `ease-out`（`.22,1,.36,1`） | `opacity`（+ 2px 位移） |
| 菜单/下拉展开 | 160–180ms | `ease-out` | `opacity` + `scale(.98)` |
| 侧栏/抽屉 | 180–240ms | `ease-in-out`（`.4,0,.2,1`） | `transform: translateX` |
| 大面板/页面切换 | 240–300ms | `ease-in-out` | `opacity` |
| 骨架屏闪烁 | 1.5–2s 循环 | `ease-in-out` | `opacity` |

**150ms 是两套系统的事实默认值**（实现 A 921 次；实现 B 的 fast 100ms / default 200ms 之间）。

## 3. 只动 transform 与 opacity

两套系统里所有入场/展开动画都只改 `transform`、`opacity`、`background-color`、`color`。

**明确避免**：

- `height` / `width` 过渡（触发布局，长列表会掉帧）——需要折叠动画时用 `grid-template-rows: 0fr → 1fr` 或 `max-height` + `overflow: hidden`
- `filter` / `backdrop-filter` 的连续变化（GPU 开销大，且 macOS 上会撕裂）
- `box-shadow` 过渡（每帧重绘模糊层）
- `top` / `left` 定位过渡（用 `translate` 代替）

实现 B SegmentedControl 用 `transform: translateX` 移动指示器，配合 `width: calc((100% - 8px - 2px*(n-1))/n)` 预先算宽——**不测量 DOM，纯 CSS 完成**。

## 4. reduced-motion

| | 数量/做法 |
|---|---|
| 实现 B | 50 处 `prefers-reduced-motion: reduce`，5 处 `no-preference`；Tooltip 直接 `animation: none` |
| 实现 A | 同类降级（工具类框架 `motion-reduce:` 变体） |

标准写法：

```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

实现 B 的做法更克制：**只关掉装饰性动画**（Tooltip 淡入、骨架闪烁），保留状态切换的瞬时反馈（颜色直接变），避免"点了没反应"的错觉。

## 5. 悬停能力探测

| 查询 | 实现 B 次数 |
|---|---|
| `@media (hover: hover)` | 304 |
| `@media (hover: none)` | 11 |
| `@media (pointer: coarse)` | 12 |

规则：

```css
/* 只有真正能悬停的设备才给 hover 态 */
@media (hover: hover) {
  .primary:hover:not(:disabled) { background: var(--alias-button-primary-hover); }
}
/* 按下态不受此限制，触摸也需要 */
.ghost:active:not(:disabled) { background: var(--alias-interactive-bg-active); }
```

## 6. 焦点环

| | 做法 |
|---|---|
| 实现 B | `outline: 2px solid var(--focus-ring-color, var(--alias-state-business-primary))`，`outline-offset: 2px`；**仅键盘触发**：`html[data-input-modality='pointer']` 时不显示 |
| 实现 A | ring token + 工具类框架 `ring`/`outline` 类 |

`data-input-modality` 由输入设备切换（第一次 Tab 键 → keyboard，鼠标点击 → pointer）。这样鼠标用户看不到环，键盘用户始终看得到。**比 `:focus-visible` 更可控**（后者在部分浏览器对自定义控件支持不佳）。

## 7. 落地规则

1. 默认 150ms；快反馈 100ms；面板 200ms；不要超过 300ms（引导页除外）。
2. 缓动优先 `cubic-bezier(.22,1,.36,1)`（ease-out），只有成对出现的位移（侧栏收展）用 `ease-in-out`。
3. 只动 `transform` / `opacity` / 颜色；折叠用 `grid-rows`，不要动 height。
4. hover 样式包在 `@media (hover: hover)` 里；active 不包。
5. 降级只关装饰动画，不关状态反馈。
6. 焦点环用 `outline` + `outline-offset`，并按输入设备控制可见性。
